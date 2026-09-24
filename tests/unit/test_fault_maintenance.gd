extends TestCase
## Machine faults from the bridge (UDP JSON to the real TelemetryReporter on a free port)
## -> local hardware fault -> idle/maintenance. Auto-clear (telemetry README decision 1).

const IdleScene := preload("res://scenes/idle/Idle.tscn")
const MaintenanceScene := preload("res://scenes/maintenance/Maintenance.tscn")
const DispensingScene := preload("res://scenes/dispensing/Dispensing.tscn")
const QUEUE := "user://test_fault/queue.json"

var _snap: Dictionary
var _scene: Control
var _sender: PacketPeerUDP
var _reply: PacketPeerUDP


func before_each() -> void:
	_snap = snapshot_app_state()
	ConfigManager.remote_maintenance_enabled = false
	ConfigManager.set_local_hardware_fault(false)
	ConfigManager._last_emitted_active = false
	TelemetryReporter._applied_fault = null
	DirAccess.make_dir_recursive_absolute(QUEUE.get_base_dir())
	DirAccess.remove_absolute(QUEUE)
	TelemetryReporter.queue_path = QUEUE   # never touch the real queue
	TelemetryReporter.listen_port = 0
	TelemetryReporter.start_queue()
	assert_eq(TelemetryReporter.listen(), OK, "listens")
	_sender = PacketPeerUDP.new()
	_sender.connect_to_host("127.0.0.1", TelemetryReporter.get_listen_port())
	Bridge.listen_port = 0
	Bridge.listen()
	_reply = PacketPeerUDP.new()
	_reply.connect_to_host("127.0.0.1", Bridge.get_listen_port())
	Nav.dry_run = true
	Nav.last_requested = ""


func after_each() -> void:
	if is_instance_valid(_scene):
		_scene.queue_free()
	await wait_frames(2)
	_sender.close()
	_reply.close()
	TelemetryReporter._applied_fault = null
	restore_app_state(_snap)
	TelemetryReporter.queue_path = TelemetryReporter.QUEUE_PATH
	TelemetryReporter.configure_from_settings()
	Bridge.configure_from_settings()


func _event(event: Dictionary) -> void:
	_sender.put_packet(JSON.stringify(event).to_utf8_buffer())
	await wait_seconds(0.15)


func _fault() -> void:
	await _event({"v": 1, "event_type": "machine_fault", "fault": "HOMING_TIMEOUT", "order_id": null})


func _ok() -> void:
	await _event({"v": 1, "event_type": "machine_ok", "cleared": "HOMING_TIMEOUT"})


func _heartbeat(fault: Variant) -> void:
	await _event({"v": 1, "event_type": "bridge_status", "state": "READY", "serial": true,
		"machine_fault": fault, "uptime_s": 1})


func _open(scene: PackedScene) -> Control:
	_scene = scene.instantiate()
	if _scene.get("video_path_override") != null:
		_scene.video_path_override = "res://nope.ogv"
	add_child(_scene)
	return _scene


func test_machine_fault_enters_maintenance() -> void:
	_open(IdleScene)
	await wait_frames(2)
	await _fault()
	assert_true(ConfigManager.is_in_maintenance(), "in maintenance")
	assert_eq(Nav.last_requested, ScenePaths.MAINTENANCE, "idle redirects")


func test_maintenance_shows_fault() -> void:
	await _fault()
	_open(MaintenanceScene)
	await wait_frames(2)
	assert_eq(_scene.get_fault_lines(), PackedStringArray(["HOMING_TIMEOUT · Carriage did not reach its home position"]))
	assert_eq(_scene.get_cell_value("diag_flagged_by"), ConfigManager.get_message("maintenance_local_fault_by"))
	assert_true(_scene.get_cell_value("diag_flagged_at").contains(" ago"), "flagged-at shows when it happened")


func test_machine_ok_clears() -> void:
	await _fault()
	_open(MaintenanceScene)
	await wait_frames(2)
	Nav.last_requested = ""
	await _ok()
	assert_false(ConfigManager.is_in_maintenance(), "cleared")
	assert_eq(Nav.last_requested, ScenePaths.IDLE, "back to idle by itself")


func test_heartbeat_reconciles() -> void:
	await _fault()
	await _heartbeat(null)   # machine_ok was "lost"; the heartbeat corrects it
	assert_false(ConfigManager.is_in_maintenance(), "cleared by heartbeat")
	TelemetryReporter._applied_fault = null   # as after an app restart
	await _heartbeat("HOMING_TIMEOUT")
	assert_true(ConfigManager.is_in_maintenance(), "set by heartbeat")
	var changes := watch_signal(ConfigManager, &"maintenance_changed")
	await _heartbeat("HOMING_TIMEOUT")
	assert_false(changes.fired, "repeated heartbeats don't churn")


func test_mid_order_not_interrupted() -> void:
	ConfigManager.current_config = load_mock_config("default")
	OrderState.reset()
	OrderState.select_flavor(find_flavor(ConfigManager.current_config, "guava"))
	OrderState.charged_price = 75
	OrderState.order_id = Ulid.generate()
	OrderState.order_number = 42
	OrderState.transaction_id = "pay_T"
	ConfigManager.local_settings.timing.dispensing_done_return_sec = 0.3
	var id := OrderState.order_id
	_open(DispensingScene)
	await wait_frames(2)
	await _event({"v": 1, "event_type": "machine_fault", "fault": "HOMING_TIMEOUT", "order_id": id})
	assert_eq(_scene.get_state(), _scene.State.BLENDING, "the order goes on")
	assert_eq(Nav.last_requested, "", "no navigation mid-order")
	_reply.put_packet(("DONE %s" % id).to_utf8_buffer())
	await wait_seconds(0.15)
	assert_eq(_scene.get_state(), _scene.State.DONE, "the customer still gets the drink")
	await wait_seconds(0.4)
	assert_eq(Nav.last_requested, ScenePaths.IDLE, "returns via idle")
	_scene.queue_free()
	await wait_frames(1)
	_open(IdleScene)
	await wait_frames(2)
	assert_eq(Nav.last_requested, ScenePaths.MAINTENANCE, "then idle -> maintenance")


func test_non_bucket_c_fault_ignored() -> void:
	await _event({"v": 1, "event_type": "machine_fault", "fault": "HOPPER_UNASSIGNED", "order_id": null})
	assert_false(ConfigManager.is_in_maintenance(), "not a maintenance fault")


func test_remote_wins() -> void:
	ConfigManager.current_config = load_mock_config("maintenance_on")
	ConfigManager.remote_maintenance_enabled = true
	await _fault()
	await _ok()
	assert_true(ConfigManager.is_in_maintenance(), "remote still on")
	assert_eq(ConfigManager.get_maintenance_info().source, "remote", "remote message and diagnostics")
