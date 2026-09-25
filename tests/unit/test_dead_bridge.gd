extends TestCase
## Dead-bridge watchdog in the real TelemetryReporter (listening on a free port, queue under
## user://test_dead/). Short timings; the watchdog is only on inside these tests.

const QUEUE := "user://test_dead/queue.json"
const MaintenanceScene := preload("res://scenes/maintenance/Maintenance.tscn")

var _snap: Dictionary
var _prev_queue := ""
var _sender: PacketPeerUDP


func before_each() -> void:
	_prev_queue = TelemetryReporter.queue_path
	_snap = snapshot_app_state()
	ConfigManager.remote_maintenance_enabled = false
	ConfigManager.set_local_hardware_fault(false)
	ConfigManager._last_emitted_active = false
	TelemetryReporter._applied_fault = null
	DirAccess.make_dir_recursive_absolute(QUEUE.get_base_dir())
	DirAccess.remove_absolute(QUEUE)
	ConfigManager.local_settings.api.base_url = "http://127.0.0.1:9/fuelbot"   # unreachable: records stay queued
	TelemetryReporter.queue_path = QUEUE
	TelemetryReporter.listen_port = 0
	TelemetryReporter.start_queue()
	assert_eq(TelemetryReporter.listen(), OK, "listens")
	_sender = PacketPeerUDP.new()
	_sender.connect_to_host("127.0.0.1", TelemetryReporter.get_listen_port())
	_watch(0.6, 0.3)


func after_each() -> void:
	TelemetryReporter.require_heartbeat = false
	TelemetryReporter.reset_watchdog()
	_sender.close()
	TelemetryReporter._applied_fault = null
	restore_app_state(_snap)
	TelemetryReporter.queue_path = _prev_queue   # the runner's test queue, never the real one
	TelemetryReporter.configure_from_settings()
	TelemetryReporter.require_heartbeat = false   # the runner keeps it off outside these tests
	TelemetryReporter.reset_watchdog()


func _watch(timeout: float, grace: float) -> void:
	TelemetryReporter.heartbeat_timeout_sec = timeout
	TelemetryReporter.startup_grace_sec = grace
	TelemetryReporter.require_heartbeat = true
	TelemetryReporter.reset_watchdog()


func _send(event: Dictionary) -> void:
	_sender.put_packet(JSON.stringify(event).to_utf8_buffer())


func _heartbeat(fault: Variant = null) -> void:
	_send({"v": 1, "event_type": "bridge_status", "state": "READY", "serial": true,
		"machine_fault": fault, "uptime_s": 1})


func _queued(kind: String) -> Array:
	return TelemetryReporter.queue.records().filter(func(r: Dictionary) -> bool: return r.event_type == kind)


func test_goes_down_without_heartbeat() -> void:
	await wait_seconds(0.5)
	assert_false(TelemetryReporter.is_bridge_down(), "not before the timeout")
	await wait_seconds(0.3)
	assert_true(TelemetryReporter.is_bridge_down(), "down after max(grace, timeout)")
	assert_true(ConfigManager.is_in_maintenance(), "out of service")
	assert_eq(ConfigManager.local_faults.keys(), ["BRIDGE_DOWN"], "fault code")
	var down := _queued("bridge_down")
	assert_eq(down.size(), 1, "one bridge_down record")
	assert_eq(down[0].source, "app", "reported by the app")


func test_not_before_grace() -> void:
	_watch(0.2, 1.0)
	await wait_seconds(0.8)
	assert_false(TelemetryReporter.is_bridge_down(), "grace period")
	await wait_seconds(0.4)
	assert_true(TelemetryReporter.is_bridge_down(), "down once the grace is over")


func test_heartbeats_keep_it_up() -> void:
	for i in 8:
		_heartbeat()
		await wait_seconds(0.2)
	assert_false(TelemetryReporter.is_bridge_down(), "never down")
	assert_false(ConfigManager.is_in_maintenance(), "in service")


func test_recovers_on_heartbeat() -> void:
	await wait_seconds(0.9)
	assert_true(TelemetryReporter.is_bridge_down(), "down")
	_heartbeat()
	await wait_seconds(0.15)
	assert_false(TelemetryReporter.is_bridge_down(), "back up")
	assert_false(ConfigManager.is_in_maintenance(), "back in service by itself")
	var up := _queued("bridge_up")
	assert_eq(up.size(), 1, "one bridge_up record")
	assert_true(int(up[0].down_sec) >= 0, "down_sec reported")


func test_disabled() -> void:
	TelemetryReporter.require_heartbeat = false
	await wait_seconds(1.2)
	assert_false(TelemetryReporter.is_bridge_down(), "never down when disabled")
	assert_false(ConfigManager.is_in_maintenance(), "in service")


func test_overlaps_homing_fault() -> void:
	await wait_seconds(0.9)
	assert_true(TelemetryReporter.is_bridge_down(), "down")
	_heartbeat("HOMING_TIMEOUT")   # the bridge is back, but the board isn't homed
	await wait_seconds(0.15)
	assert_false(TelemetryReporter.is_bridge_down(), "bridge up")
	assert_true(ConfigManager.is_in_maintenance(), "still out of service for homing")
	assert_eq(ConfigManager.local_faults.keys(), ["HOMING_TIMEOUT"], "only the homing fault left")


func test_non_heartbeat_events_dont_count() -> void:
	for i in 5:
		_send({"v": 1, "event_type": "machine_ok", "cleared": "HOMING_TIMEOUT"})
		await wait_seconds(0.2)
	assert_true(TelemetryReporter.is_bridge_down(), "only heartbeats keep the bridge up")


func test_maintenance_shows_bridge_row() -> void:
	Nav.dry_run = true
	_watch(5.0, 0.0)   # long enough to see RESPONDING; shortened below to force an outage
	var scene: Control = MaintenanceScene.instantiate()
	ConfigManager.set_local_hardware_fault(true, "HOMING_TIMEOUT")   # keep the screen up
	add_child(scene)
	await wait_frames(2)
	assert_eq(scene.get_cell_value("diag_bridge"), ConfigManager.get_message("maintenance_bridge_unseen"), "before any heartbeat")
	assert_eq(scene.get_cell_value("diag_bridge_heartbeat"), ConfigManager.get_message("diag_never"), "never")
	_heartbeat()
	await wait_seconds(1.2)   # the screen refreshes live values every second
	assert_eq(scene.get_cell_value("diag_bridge"), ConfigManager.get_message("maintenance_bridge_ok"), "responding")
	assert_true(scene.get_cell_value("diag_bridge_heartbeat").ends_with("ago"), "heartbeat age shown")
	TelemetryReporter.heartbeat_timeout_sec = 0.3   # no more heartbeats: time out
	await wait_seconds(1.2)
	assert_true(TelemetryReporter.is_bridge_down(), "down")
	assert_eq(scene.get_cell_value("diag_bridge"), ConfigManager.get_message("maintenance_bridge_down"), "not responding")
	scene.queue_free()
