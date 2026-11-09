extends TestCase
## The PIN pad (SET-02) and the settings placeholder's exits. The PIN typed here, 918273,
## must never reach the log (run_tests.sh greps for it) or a telemetry event.

const PinScene := preload("res://scenes/settings_pin/SettingsPin.tscn")
const SettingsScene := preload("res://scenes/settings/Settings.tscn")
const DIR := "user://test_settings_pin_screen"
const PIN := "918273"

var _snap: Dictionary
var _scene: Control
var _store: PinStore
var _events: Array = []


func before_each() -> void:
	_snap = snapshot_app_state()
	ConfigManager.local_settings.timing.settings_error_return_sec = 0.3
	ConfigManager.local_settings.timing.settings_pin_inactivity_sec = 30.0
	ConfigManager.local_settings.timing.settings_inactivity_sec = 30.0
	Nav.dry_run = true
	Nav.last_requested = ""
	DirAccess.make_dir_recursive_absolute(DIR)
	for file in DirAccess.get_files_at(DIR):
		DirAccess.remove_absolute(DIR.path_join(file))
	_store = _new_store()
	var f := FileAccess.open(_store.pin_path, FileAccess.WRITE)
	f.store_string(PinStore.make_record(PIN))
	f.close()
	_events.clear()


func after_each() -> void:
	if is_instance_valid(_scene):
		_scene.queue_free()
	await wait_frames(1)
	restore_app_state(_snap)


func _new_store() -> PinStore:
	var store := PinStore.new()
	store.pin_path = DIR.path_join("settings_pin.txt")
	store.lock_path = DIR.path_join("settings_pin_lock.json")
	store.fake_now = 1000.0
	return store


func _open(store: PinStore = _store) -> Control:
	if is_instance_valid(_scene):
		_scene.queue_free()
	_scene = PinScene.instantiate()
	_scene.store = store
	_scene.report_event = func(event: Dictionary) -> void: _events.append(event)
	add_child(_scene)
	return _scene


func _type(pin: String) -> void:
	for digit in pin:
		_scene.press_digit(digit)


func _event_types() -> Array:
	return _events.map(func(e: Dictionary) -> String: return e.event_type)


func test_right_pin_opens_settings() -> void:
	_open()
	assert_true(_scene.is_keypad_enabled(), "keypad ready")
	for digit in PIN:   # through the real buttons
		_scene.get_key(digit).pressed.emit()
	assert_eq(Nav.last_requested, ScenePaths.SETTINGS, "settings")
	assert_eq(_event_types(), ["settings_opened"], "audit event")


func test_wrong_pin_message_for_three_seconds() -> void:
	_open()
	_type("111111")
	assert_eq(_scene.get_message_text(), ConfigManager.get_message("settings_pin_wrong"), "wrong")
	assert_eq(_scene.get_typed_length(), 0, "dots cleared")
	assert_eq(Nav.last_requested, "", "stays")
	assert_eq(_events, [{"event_type": "settings_pin_failed", "attempt": 1}], "audit event")
	await wait_seconds(0.4)
	assert_eq(_scene.get_message_text(), "", "hidden after settings_error_return_sec")


func test_typing_hides_the_message_and_delete() -> void:
	_open()
	_type("111111")
	_scene.press_digit("9")
	assert_eq(_scene.get_message_text(), "", "typing hides 'Wrong PIN'")
	_scene.press_digit("1")
	_scene.press_delete()
	assert_eq(_scene.get_typed_length(), 1, "DEL removes one")
	_scene.press_delete()
	_scene.press_delete()
	assert_eq(_scene.get_typed_length(), 0, "DEL on empty does nothing")
	_type(PIN)
	assert_eq(Nav.last_requested, ScenePaths.SETTINGS, "right PIN after a delete")


func test_five_wrong_lock_the_pad_across_a_restart() -> void:
	_open()
	for i in 5:
		_type("000000")
	assert_false(_scene.is_keypad_enabled(), "keys disabled")
	assert_eq(_scene.get_message_text(), ConfigManager.get_message("settings_pin_locked", {"minutes": 5}), "5 min")
	assert_eq(_event_types(), ["settings_pin_failed", "settings_pin_failed", "settings_pin_failed",
		"settings_pin_failed", "settings_pin_failed", "settings_locked"], "five failures, one lock")
	_type(PIN)
	assert_eq(Nav.last_requested, "", "the keypad ignores digits while locked")

	_events.clear()
	var restarted := _new_store()
	restarted.fake_now = 1100.0
	_open(restarted)
	assert_false(_scene.is_keypad_enabled(), "still locked after a restart")
	assert_eq(_scene.get_message_text(), ConfigManager.get_message("settings_pin_locked", {"minutes": 4}), "4 min left")
	restarted.fake_now = 1301.0
	await wait_seconds(1.2)
	assert_true(_scene.is_keypad_enabled(), "unlocked when the lock ends")
	assert_eq(_scene.get_message_text(), "", "message cleared")
	_type(PIN)
	assert_eq(Nav.last_requested, ScenePaths.SETTINGS, "right PIN after the lock")
	assert_eq(_event_types(), ["settings_opened"], "no lock event repeated")


func test_not_set_up() -> void:
	DirAccess.remove_absolute(_store.pin_path)
	_open()
	assert_false(_scene.is_keypad_enabled(), "keys disabled on entry")
	assert_eq(_scene.get_message_text(), ConfigManager.get_message("settings_pin_not_set"), "not set up")


func test_back_and_inactivity_return_to_idle() -> void:
	_open()
	_scene.press_back()
	assert_eq(Nav.last_requested, ScenePaths.IDLE, "Back")
	Nav.last_requested = ""
	ConfigManager.local_settings.timing.settings_pin_inactivity_sec = 0.3
	_open()
	await wait_seconds(0.45)
	assert_eq(Nav.last_requested, ScenePaths.IDLE, "inactivity")


func test_the_pin_never_reaches_an_event() -> void:
	_open()
	_type(PIN.reverse())
	_type(PIN)
	for event in _events:
		assert_false(JSON.stringify(event).contains(PIN), "no PIN in %s" % event.event_type)
		assert_false(JSON.stringify(event).contains(PIN.reverse()), "no typed digits in %s" % event.event_type)


func test_settings_placeholder_exits() -> void:
	_scene = SettingsScene.instantiate()
	add_child(_scene)
	_scene.press_exit()
	assert_eq(Nav.last_requested, ScenePaths.IDLE, "Exit")
	_scene.queue_free()
	Nav.last_requested = ""
	ConfigManager.local_settings.timing.settings_inactivity_sec = 0.3
	_scene = SettingsScene.instantiate()
	add_child(_scene)
	await wait_seconds(0.45)
	assert_eq(Nav.last_requested, ScenePaths.IDLE, "inactivity")
