extends TestCase

const MaintenanceScene := preload("res://scenes/maintenance/Maintenance.tscn")

var _snap: Dictionary
var _scene: Control


func before_each() -> void:
	_snap = snapshot_app_state()
	ConfigManager.remote_maintenance_enabled = false
	ConfigManager.local_hardware_fault_active = false
	ConfigManager._last_emitted_active = false
	Nav.dry_run = true
	Nav.last_requested = ""


func after_each() -> void:
	if is_instance_valid(_scene):
		_scene.queue_free()
	await wait_frames(1)
	restore_app_state(_snap)


func _open() -> Control:
	_scene = MaintenanceScene.instantiate()
	add_child(_scene)
	return _scene


func _remote(scenario: String) -> void:
	var cfg := load_mock_config(scenario)
	ConfigManager.current_config = cfg
	ConfigManager.remote_maintenance_enabled = true
	ConfigManager._last_emitted_active = true


func test_remote_with_message() -> void:
	_remote("maintenance_on")
	_open()
	assert_true(_scene.get_message_text().begins_with("This machine is temporarily unavailable"), "remote message")
	assert_eq(_scene.get_cell_value("diag_flagged_by"), "Remote console · ops@fuelbot", "flagged by")
	assert_true(_scene.is_faults_visible(), "faults visible")
	var lines: PackedStringArray = _scene.get_fault_lines()
	assert_eq(lines.size(), 2, "two faults")
	assert_true(lines[0].begins_with("E-204 · "), "first fault line")
	assert_true(_scene.get_cell_value("diag_flagged_at").contains(" ago"), "flagged-at has ago")


func test_remote_empty_message_uses_default() -> void:
	_remote("maintenance_no_message")
	_open()
	assert_eq(_scene.get_message_text(), ConfigManager.get_message("maintenance_default"), "default message")
	assert_false(_scene.is_faults_visible(), "faults hidden")


func test_local_fault() -> void:
	ConfigManager.set_local_hardware_fault(true)
	_open()
	assert_eq(_scene.get_message_text(), ConfigManager.get_message("maintenance_default"), "default message")
	assert_eq(_scene.get_cell_value("diag_flagged_by"), ConfigManager.get_message("maintenance_local_fault_by"), "flagged by")


func test_flag_clearing_returns_to_idle() -> void:
	ConfigManager.set_local_hardware_fault(true)
	_open()
	ConfigManager.set_local_hardware_fault(false)
	await wait_frames(2)
	assert_eq(Nav.last_requested, ScenePaths.IDLE, "navigated to idle")


func test_static_cells() -> void:
	ConfigManager.set_local_hardware_fault(true)
	_open()
	assert_eq(_scene.get_cell_value("diag_payments"), "DISABLED", "payments")
	assert_true(_scene.get_cell_value("diag_firmware").begins_with("0.1.0 (godot 4."), "firmware")


func test_already_cleared_on_entry_returns_to_idle() -> void:
	_open()
	await wait_frames(2)
	assert_eq(Nav.last_requested, ScenePaths.IDLE, "not in maintenance, so back to idle")


func test_footer_local_vs_remote() -> void:
	ConfigManager.set_local_hardware_fault(true, "HOMING_TIMEOUT")
	_open()
	assert_eq(_scene.get_exit_hint_text(), ConfigManager.get_message("maintenance_exit_hint_local"), "local: comes back by itself")
	ConfigManager.remote_maintenance_enabled = true
	ConfigManager.maintenance_changed.emit(true, "remote")
	assert_eq(_scene.get_exit_hint_text(), ConfigManager.get_message("maintenance_exit_hint"), "remote wins")


func test_long_footer_does_not_widen_page() -> void:
	ConfigManager.local_settings.messages.maintenance_exit_hint_local = "A VERY LONG FOOTER HINT THAT WOULD NEVER FIT ON ONE LINE NEXT TO THE SERVICE PHONE"
	ConfigManager.set_local_hardware_fault(true, "HOMING_TIMEOUT")
	_open()
	await wait_frames(3)
	var hint: Control = _scene._exit_hint
	assert_true(hint.get_global_rect().end.x <= 1080.5, "hint inside the frame (%s)" % hint.get_global_rect())
	assert_true(_scene.size.x <= 1080.5, "page not widened (%s)" % _scene.size)
