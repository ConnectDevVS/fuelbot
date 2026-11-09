extends TestCase
## The hidden settings entry (SET-02): SettingsHold on its own, then on idle and maintenance.

const IdleScene := preload("res://scenes/idle/Idle.tscn")
const MaintenanceScene := preload("res://scenes/maintenance/Maintenance.tscn")
const CORNER := Vector2(60, 60)

var _snap: Dictionary
var _node: Node
var _hold: SettingsHold


func before_each() -> void:
	_snap = snapshot_app_state()
	ConfigManager.local_settings.timing.settings_hold_sec = 0.3
	ConfigManager.local_settings.timing.attract_tap_debounce_sec = 0.0
	ConfigManager.current_config = load_mock_config("default")
	ConfigManager.remote_maintenance_enabled = false
	ConfigManager.local_hardware_fault_active = false
	ConfigManager._last_emitted_active = false
	Nav.dry_run = true
	Nav.last_requested = ""


func after_each() -> void:
	if is_instance_valid(_node):
		_node.queue_free()
	await wait_frames(1)
	restore_app_state(_snap)


func _button(pressed: bool, pos: Vector2) -> InputEventMouseButton:
	var ev := InputEventMouseButton.new()
	ev.button_index = MOUSE_BUTTON_LEFT
	ev.pressed = pressed
	ev.position = pos
	return ev


func _touch(pressed: bool, pos: Vector2) -> InputEventScreenTouch:
	var ev := InputEventScreenTouch.new()
	ev.pressed = pressed
	ev.position = pos
	return ev


func _motion(pos: Vector2) -> InputEventMouseMotion:
	var ev := InputEventMouseMotion.new()
	ev.position = pos
	return ev


func _open_hold() -> SettingsHold:
	_hold = SettingsHold.new()
	_node = _hold
	add_child(_hold)
	return _hold


# --- SettingsHold ------------------------------------------------------------

func test_settings_come_from_local_settings() -> void:
	_open_hold()
	assert_eq(_hold.hold_sec, 0.3, "hold time from timing")
	assert_eq(_hold.zone_px, 200.0, "zone from settings.hold_zone_px")


func test_hold_in_the_corner_triggers() -> void:
	_open_hold()
	var fired := watch_signal(_hold, &"triggered")
	assert_false(_hold.feed(_button(true, CORNER)), "the press isn't claimed")
	await wait_seconds(0.15)
	assert_eq(fired.count, 0, "not before the hold time")
	await wait_seconds(0.3)
	assert_eq(fired.count, 1, "triggered while still down")
	assert_true(_hold.feed(_button(false, CORNER)), "its release is claimed")
	assert_eq(fired.count, 1, "once")


func test_short_tap_is_an_ordinary_tap() -> void:
	_open_hold()
	var fired := watch_signal(_hold, &"triggered")
	_hold.feed(_button(true, CORNER))
	await wait_seconds(0.1)
	assert_false(_hold.feed(_button(false, CORNER)), "release not claimed")
	await wait_seconds(0.3)
	assert_eq(fired.count, 0, "no trigger")


func test_outside_or_moving_out_doesnt_trigger() -> void:
	_open_hold()
	var fired := watch_signal(_hold, &"triggered")
	_hold.feed(_button(true, Vector2(260, 60)))
	await wait_seconds(0.4)
	assert_eq(fired.count, 0, "press outside the square")
	_hold.feed(_button(false, Vector2(260, 60)))
	_hold.feed(_button(true, CORNER))
	_hold.feed(_motion(Vector2(400, 400)))
	await wait_seconds(0.4)
	assert_eq(fired.count, 0, "moved out of the square")


func test_touch_with_emulated_mouse() -> void:
	_open_hold()
	var fired := watch_signal(_hold, &"triggered")
	_hold.feed(_touch(true, CORNER))
	_hold.feed(_button(true, CORNER))   # Godot's mouse emulation of the same touch
	await wait_seconds(0.4)
	assert_eq(fired.count, 1, "one trigger")
	assert_true(_hold.feed(_touch(false, CORNER)), "touch release claimed")
	assert_true(_hold.feed(_button(false, CORNER)), "emulated release claimed")
	_hold.feed(_button(true, CORNER))
	assert_false(_hold.feed(_button(false, CORNER)), "a new tap starts fresh")


# --- On idle and maintenance -------------------------------------------------

func test_idle_hold_opens_the_pin_pad_without_an_order() -> void:
	_node = IdleScene.instantiate()
	add_child(_node)
	var nav := watch_signal(Nav, &"navigated")
	_node._input(_button(true, CORNER))
	await wait_seconds(0.45)
	assert_eq(Nav.last_requested, ScenePaths.SETTINGS_PIN, "PIN pad")
	_node._input(_button(false, CORNER))
	assert_eq(Nav.last_requested, ScenePaths.SETTINGS_PIN, "the release didn't start an order")
	assert_eq(nav.count, 1, "navigated once")
	assert_false(_node.video.is_playing(), "video stopped on leave")


func test_idle_short_tap_in_the_corner_starts_an_order() -> void:
	_node = IdleScene.instantiate()
	add_child(_node)
	_node._input(_button(true, CORNER))
	_node._input(_button(false, CORNER))
	assert_eq(Nav.last_requested, ScenePaths.FLAVOR_SELECT, "an ordinary tap")
	await wait_seconds(0.4)
	assert_eq(Nav.last_requested, ScenePaths.FLAVOR_SELECT, "no late trigger")


func test_maintenance_hold_opens_the_pin_pad() -> void:
	ConfigManager.current_config = load_mock_config("maintenance_on")
	ConfigManager.remote_maintenance_enabled = true
	ConfigManager._last_emitted_active = true
	_node = MaintenanceScene.instantiate()
	add_child(_node)
	_node._input(_button(true, Vector2(540, 960)))
	_node._input(_button(false, Vector2(540, 960)))
	await wait_seconds(0.1)
	assert_eq(Nav.last_requested, "", "a tap does nothing")
	_node._input(_button(true, CORNER))
	await wait_seconds(0.45)
	assert_eq(Nav.last_requested, ScenePaths.SETTINGS_PIN, "PIN pad")
