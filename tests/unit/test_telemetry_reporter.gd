extends TestCase
## The real TelemetryReporter autoload, listening on a free port, with its queue under
## user://test_tel/ and the backend pointed at the mock on :8788.

const DispensingScene := preload("res://scenes/dispensing/Dispensing.tscn")
const ROUTE := "/fuelbot/telemetry"
const QUEUE := "user://test_tel/queue.json"

var _snap: Dictionary
var _tenant := ""
var _sender: PacketPeerUDP
var _order_peer: PacketPeerUDP
var _scene: Control


func before_each() -> void:
	await mock_reset()
	_snap = snapshot_app_state()
	_tenant = ConfigManager.tenant_id
	ConfigManager.tenant_id = "t-test"
	ConfigManager.local_settings.api.base_url = MOCK_ORIGIN + "/fuelbot"
	ConfigManager.local_settings.timing.telemetry_retry_interval_sec = 0.3
	DirAccess.make_dir_recursive_absolute(QUEUE.get_base_dir())
	DirAccess.remove_absolute(QUEUE)
	TelemetryReporter.queue_path = QUEUE
	TelemetryReporter.listen_port = 0
	TelemetryReporter.start_queue()
	assert_eq(TelemetryReporter.listen(), OK, "listens on a free port")
	_sender = PacketPeerUDP.new()
	_sender.connect_to_host("127.0.0.1", TelemetryReporter.get_listen_port())
	_order_peer = PacketPeerUDP.new()
	_order_peer.bind(0, "127.0.0.1")
	Bridge.order_port = _order_peer.get_local_port()
	Bridge.connect_sockets()
	Nav.dry_run = true
	Nav.last_requested = ""


func after_each() -> void:
	if is_instance_valid(_scene):
		_scene.queue_free()
	await wait_frames(2)
	_sender.close()
	_order_peer.close()
	ConfigManager.tenant_id = _tenant
	restore_app_state(_snap)
	TelemetryReporter.queue_path = TelemetryReporter.QUEUE_PATH
	TelemetryReporter.configure_from_settings()
	Bridge.configure_from_settings()


func _send(event: Variant) -> void:
	var text: String = event if event is String else JSON.stringify(event)
	_sender.put_packet(text.to_utf8_buffer())


func _wait_posts(n: int, timeout: float) -> bool:
	var deadline := Time.get_ticks_msec() + int(timeout * 1000)
	while Time.get_ticks_msec() < deadline:
		if int((await mock_state()).request_counts.get(ROUTE, 0)) >= n:
			return true
		await wait_seconds(0.1)
	return false


func _last_body() -> Dictionary:
	return (await mock_state()).last_body[ROUTE]


func test_cycle_event_enriched() -> void:
	var id := Ulid.generate()
	Bridge.send_order_paid(id, 1, "B2", {"transaction_id": "pay_T1", "flavor_id": "guava",
		"base_id": "water", "order_number": 42})
	var stages := [{"stage": "MIX_DONE", "t_offset_ms": 57890}, {"stage": "DONE", "t_offset_ms": 72740}]
	_send({"v": 1, "event_type": "dispense_cycle", "order_id": id, "hopper": 1, "base": 2,
		"result": "DONE", "reason": "", "stages": stages, "fault": null, "duration_ms": 72740})
	assert_true(await _wait_posts(1, 3.0), "posted")
	var body := await _last_body()
	assert_true(Ulid.is_valid(String(body.event_id)), "event_id is a ULID")
	assert_eq(body.tenant_id, "t-test", "tenant")
	assert_true(String(body.timestamp).ends_with("Z") and String(body.timestamp).length() == 20, "UTC timestamp %s" % body.timestamp)
	assert_eq(body.source, "bridge", "source")
	assert_eq([body.transaction_id, body.flavor_id, body.base_id, int(body.order_number)],
		["pay_T1", "guava", "water", 42], "order context")
	assert_eq(body.stages.size(), 2, "stages unchanged")
	assert_eq(int(body.stages[1].t_offset_ms), 72740, "offsets unchanged")


func test_machine_events_posted() -> void:
	_send({"v": 1, "event_type": "machine_fault", "fault": "HOMING_TIMEOUT", "order_id": null})
	assert_true(await _wait_posts(1, 3.0), "posted")
	assert_eq((await _last_body()).event_type, "machine_fault")


func test_heartbeat_not_posted() -> void:
	var got := watch_signal(TelemetryReporter, &"event_received")
	_send({"v": 1, "event_type": "bridge_status", "state": "READY", "serial": true,
		"machine_fault": null, "uptime_s": 5})
	await wait_seconds(0.5)
	assert_true(got.fired, "seen")
	assert_eq(int((await mock_state()).request_counts.get(ROUTE, 0)), 0, "not posted")


func test_bad_json_ignored() -> void:
	_send("{not json")
	_send("[1, 2]")
	_send({"event_type": "surprise"})
	await wait_seconds(0.5)
	assert_eq(int((await mock_state()).request_counts.get(ROUTE, 0)), 0, "nothing posted")
	assert_eq(TelemetryReporter.queue.size(), 0, "nothing queued")


func test_flush_on_boot() -> void:
	var f := FileAccess.open(QUEUE, FileAccess.WRITE)
	f.store_string(JSON.stringify([{"event_type": "machine_ok", "cleared": "HOMING_TIMEOUT", "event_id": "x"}]))
	f.close()
	TelemetryReporter.start_queue()
	assert_true(await _wait_posts(1, 3.0), "queued record posted at start")
	assert_eq((await _last_body()).event_type, "machine_ok")


func test_safety_cap_event() -> void:
	ConfigManager.current_config = load_mock_config("default")
	ConfigManager.local_settings.timing.dispense_safety_cap_sec = 0.4
	ConfigManager.local_settings.timing.dispensing_error_return_sec = 5.0
	OrderState.reset()
	OrderState.select_flavor(find_flavor(ConfigManager.current_config, "guava"))
	OrderState.charged_price = 75
	OrderState.order_id = Ulid.generate()
	OrderState.order_number = 42
	OrderState.transaction_id = "pay_T2"
	var id := OrderState.order_id
	Bridge.send_order_paid(id, 1, "B2", {"transaction_id": "pay_T2", "flavor_id": "guava"})
	_scene = DispensingScene.instantiate()
	add_child(_scene)
	assert_true(await _wait_posts(1, 3.0), "posted")
	var body := await _last_body()
	assert_eq([body.event_type, body.result, body.reason, body.source, body.order_id],
		["dispense_cycle", "NO_RESPONSE", "safety_cap", "app", id], "app-side record")
	assert_eq(body.transaction_id, "pay_T2", "context")
