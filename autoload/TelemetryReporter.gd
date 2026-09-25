extends Node
## Receives the bridge's JSON events on UDP 4246 (devdocs/stories/telemetry/README.md),
## stamps what the bridge can't know, and posts them via a durable ReportQueue.
##   dispense_cycle, machine_fault, machine_ok -> enriched, queued, POSTed
##   bridge_status (heartbeat, every 10 s)     -> machine health only, never posted
## Also takes app-side events via report_event() (e.g. the dispensing safety cap).
## Dead-bridge watchdog (sales SAL-02): no heartbeat for heartbeat_timeout_sec (after a
## startup grace) -> local fault BRIDGE_DOWN (out of service), cleared by the next heartbeat.

signal event_received(event: Dictionary)

const QUEUE_PATH := "user://telemetry_queue.json"
const POSTED_EVENTS := ["dispense_cycle", "machine_fault", "machine_ok"]
const LISTEN_RETRY_SEC := 5.0
## Machine faults that take the machine out of service (plan §3.10 Bucket C). They
## auto-clear when the board homes again (telemetry README decision 1).
const LOCAL_MAINTENANCE_FAULTS := ["HOMING_TIMEOUT"]
const BRIDGE_DOWN := "BRIDGE_DOWN"

var listen_host := "127.0.0.1"
var listen_port := 4246
var queue_path := QUEUE_PATH
var auto_configure := true
var queue: ReportQueue
var require_heartbeat := true
var heartbeat_timeout_sec := 30.0
var startup_grace_sec := 60.0

var _listener := PacketPeerUDP.new()
var _listening := false
var _listen_warned := false
var _next_listen_try_msec := 0
var _applied_fault: Variant = null   # last homing value pushed to ConfigManager (heartbeats don't churn)
var _watch_started_msec := 0
var _last_heartbeat_msec := -1
var _bridge_down_since_msec := -1        # -1 = the bridge is considered up


func _ready() -> void:
	if auto_configure:
		configure_from_settings()


func _exit_tree() -> void:
	_listener.close()


func configure_from_settings() -> void:
	var cfg: Dictionary = ConfigManager.local_settings.get("bridge", {})
	listen_host = String(cfg.get("listen_host", "127.0.0.1"))
	listen_port = int(cfg.get("telemetry_port", 4246))
	require_heartbeat = bool(cfg.get("require_heartbeat", true))
	heartbeat_timeout_sec = ConfigManager.get_timing("bridge_heartbeat_timeout_sec", 30.0)
	startup_grace_sec = ConfigManager.get_timing("bridge_startup_grace_sec", 60.0)
	start_queue()
	listen()
	reset_watchdog()


## Restarts the dead-bridge watchdog (grace period from now) and clears BRIDGE_DOWN.
func reset_watchdog() -> void:
	_watch_started_msec = Time.get_ticks_msec()
	_last_heartbeat_msec = -1
	if _bridge_down_since_msec >= 0:
		_bridge_down_since_msec = -1
		ConfigManager.set_local_hardware_fault(false, BRIDGE_DOWN)


func is_bridge_down() -> bool:
	return _bridge_down_since_msec >= 0


## (Re)creates the queue from queue_path and flushes whatever is on disk (flush-on-boot).
func start_queue() -> void:
	if queue:
		for child in get_children():
			child.queue_free()
	queue = ReportQueue.new(self, queue_path,
		func() -> String: return ConfigManager.get_api_endpoint("telemetry_path"),
		func() -> PackedStringArray: return ConfigManager.get_backend_headers(),
		ConfigManager.get_timing("telemetry_retry_interval_sec", 60.0), 5000, "[Telemetry]")
	queue.flush.call_deferred()


## (Re)binds the event listener. listen_port 0 picks a free port (tests).
func listen() -> Error:
	_listener.close()
	_listening = false
	var err := _listener.bind(listen_port, listen_host)
	if err == OK:
		_listening = true
		_listen_warned = false
		print("[Telemetry] listening on %s:%d" % [listen_host, _listener.get_local_port()])
	elif not _listen_warned:
		_listen_warned = true
		push_warning("[Telemetry] can't listen on %s:%d (%s); retrying every %ds" % [
			listen_host, listen_port, error_string(err), int(LISTEN_RETRY_SEC)])
	_next_listen_try_msec = Time.get_ticks_msec() + int(LISTEN_RETRY_SEC * 1000)
	return err


func get_listen_port() -> int:
	return _listener.get_local_port() if _listening else 0


## Stamps event_id / tenant_id / timestamp / source (+ order context for a cycle) and queues it.
func report_event(event: Dictionary, source := "app") -> void:
	var record := event.duplicate(true)
	record["event_id"] = Ulid.generate()
	record["tenant_id"] = ConfigManager.tenant_id
	record["timestamp"] = Time.get_datetime_string_from_system(true) + "Z"  # Godot omits the Z
	record["source"] = source
	if record.get("event_type") == "dispense_cycle":
		var context := Bridge.get_order_context(String(record.get("order_id", "")))
		for key in ["transaction_id", "flavor_id", "base_id", "order_number"]:
			record[key] = context.get(key, record.get(key))
	queue.enqueue(record)


func _process(_delta: float) -> void:
	_check_bridge()
	if not _listening:
		if Time.get_ticks_msec() >= _next_listen_try_msec:
			listen()
		return
	while _listener.get_available_packet_count() > 0:
		var text := _listener.get_packet().get_string_from_utf8()
		var event = JSON.parse_string(text)
		if not (event is Dictionary):
			print("[Telemetry] <- ignored non-JSON '%s'" % text.left(80).c_escape())
			continue
		var kind := String(event.get("event_type", ""))
		if kind == "bridge_status":
			_on_heartbeat()
			event_received.emit(event)
			_apply_health(event.get("machine_fault"))
			continue
		if not kind in POSTED_EVENTS:
			print("[Telemetry] <- ignored event_type '%s'" % kind)
			continue
		print("[Telemetry] <- %s %s" % [kind, event.get("order_id", event.get("fault", event.get("cleared", "")))])
		event_received.emit(event)
		report_event(event, "bridge")
		if kind == "machine_fault":
			_apply_health(event.get("fault"))
		elif kind == "machine_ok":
			_apply_health(null)


func _check_bridge() -> void:
	if not require_heartbeat:
		if _bridge_down_since_msec >= 0:
			reset_watchdog()
		return
	var now := Time.get_ticks_msec()
	if _bridge_down_since_msec >= 0 or now - _watch_started_msec < int(startup_grace_sec * 1000):
		return
	var last := maxi(_last_heartbeat_msec, _watch_started_msec)
	if now - last < int(heartbeat_timeout_sec * 1000):
		return
	_bridge_down_since_msec = now
	var silent := (now - last) / 1000.0
	push_warning("[Telemetry] no bridge heartbeat for %.0f s: out of service until it returns" % silent)
	ConfigManager.set_local_hardware_fault(true, BRIDGE_DOWN)
	report_event({"v": 1, "event_type": "bridge_down", "silent_sec": int(round(silent))}, "app")


func _on_heartbeat() -> void:
	var now := Time.get_ticks_msec()
	_last_heartbeat_msec = now
	if _bridge_down_since_msec < 0:
		return
	var down := (now - _bridge_down_since_msec) / 1000.0
	_bridge_down_since_msec = -1
	print("[Telemetry] bridge heartbeat is back after %.0f s: clearing BRIDGE_DOWN" % down)
	ConfigManager.set_local_hardware_fault(false, BRIDGE_DOWN)
	report_event({"v": 1, "event_type": "bridge_up", "down_sec": int(round(down))}, "app")


## fault: a code, or null for "healthy". Only Bucket C codes change maintenance;
## ConfigManager is only called when the value actually changes.
func _apply_health(fault: Variant) -> void:
	var code: Variant = fault if fault is String and fault != "" else null
	if code != null and not code in LOCAL_MAINTENANCE_FAULTS:
		print("[Telemetry] machine fault %s: logged only (not a maintenance fault)" % code)
		code = null
	if code == _applied_fault:
		return
	_applied_fault = code
	if code == null:
		print("[Telemetry] machine healthy: clearing the homing fault")
		for known in LOCAL_MAINTENANCE_FAULTS:   # only our own codes, never e.g. BRIDGE_DOWN
			ConfigManager.set_local_hardware_fault(false, known)
	else:
		push_warning("[Telemetry] machine fault %s: out of service until the board homes" % code)
		ConfigManager.set_local_hardware_fault(true, code)
