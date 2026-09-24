extends Node
## Receives the bridge's JSON events on UDP 4246 (devdocs/stories/telemetry/README.md),
## stamps what the bridge can't know, and posts them via a durable ReportQueue.
##   dispense_cycle, machine_fault, machine_ok -> enriched, queued, POSTed
##   bridge_status (heartbeat, every 10 s)     -> machine health only, never posted
## Also takes app-side events via report_event() (e.g. the dispensing safety cap).

signal event_received(event: Dictionary)

const QUEUE_PATH := "user://telemetry_queue.json"
const POSTED_EVENTS := ["dispense_cycle", "machine_fault", "machine_ok"]
const LISTEN_RETRY_SEC := 5.0

var listen_host := "127.0.0.1"
var listen_port := 4246
var queue_path := QUEUE_PATH
var auto_configure := true
var queue: ReportQueue

var _listener := PacketPeerUDP.new()
var _listening := false
var _listen_warned := false
var _next_listen_try_msec := 0


func _ready() -> void:
	if auto_configure:
		configure_from_settings()


func _exit_tree() -> void:
	_listener.close()


func configure_from_settings() -> void:
	var cfg: Dictionary = ConfigManager.local_settings.get("bridge", {})
	listen_host = String(cfg.get("listen_host", "127.0.0.1"))
	listen_port = int(cfg.get("telemetry_port", 4246))
	start_queue()
	listen()


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
			event_received.emit(event)
			continue
		if not kind in POSTED_EVENTS:
			print("[Telemetry] <- ignored event_type '%s'" % kind)
			continue
		print("[Telemetry] <- %s %s" % [kind, event.get("order_id", event.get("fault", event.get("cleared", "")))])
		event_received.emit(event)
		report_event(event, "bridge")
