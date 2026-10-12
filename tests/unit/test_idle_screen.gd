extends TestCase

const IdleScene := preload("res://scenes/idle/Idle.tscn")

var _snap: Dictionary
var _scene: Control


func before_each() -> void:
	_snap = snapshot_app_state()
	ConfigManager.current_config = load_mock_config("default")
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


func _open(video_override: String = "") -> Control:
	_scene = IdleScene.instantiate()
	_scene.video_path_override = video_override
	add_child(_scene)
	return _scene


func _release() -> void:
	var ev := InputEventMouseButton.new()
	ev.button_index = MOUSE_BUTTON_LEFT
	ev.pressed = false
	_scene._input(ev)


func test_normal_entry_plays_video() -> void:
	_open()
	await wait_frames(2)
	assert_eq(Nav.last_requested, "", "no navigation")
	assert_true(_scene.video.is_playing(), "video playing")
	assert_false(_scene.is_fallback_visible(), "no fallback")


func test_subline() -> void:
	_open()
	assert_eq(_scene.get_subline_text(),
		"Five shakes on tap. Blended to order in under a minute.\nFrom ₹35.", "subline")


func test_maintenance_at_entry() -> void:
	ConfigManager.set_local_hardware_fault(true)
	_open()
	await wait_frames(2)
	assert_eq(Nav.last_requested, ScenePaths.MAINTENANCE, "redirected")
	assert_false(_scene.video.is_playing(), "video not started")


func test_maintenance_while_open() -> void:
	_open()
	await wait_frames(2)
	ConfigManager.set_local_hardware_fault(true)
	assert_eq(Nav.last_requested, ScenePaths.MAINTENANCE, "redirected")
	assert_false(_scene.video.is_playing(), "video stopped")


func test_tap_debounce_and_single_navigation() -> void:
	ConfigManager.local_settings.timing.attract_tap_debounce_sec = 0.3
	_open()
	var nav := watch_signal(Nav, &"navigated")
	_release()
	assert_eq(Nav.last_requested, "", "tap during debounce ignored")
	await wait_seconds(0.4)
	_release()
	assert_eq(Nav.last_requested, ScenePaths.FLAVOR_SELECT, "tap starts order")
	assert_false(_scene.video.is_playing(), "video stopped on leave")
	_release()
	assert_eq(nav.count, 1, "navigated once")


func test_video_loops_on_finished() -> void:
	_open()
	await wait_frames(2)
	_scene.video.stop()
	_scene.video.finished.emit()
	await wait_frames(1)
	assert_true(_scene.video.is_playing(), "restarted after finished")


func test_missing_video_shows_fallback() -> void:
	_open("res://nope.ogv")
	await wait_frames(2)
	assert_true(_scene.is_fallback_visible(), "fallback visible")


func test_config_ready_updates_subline() -> void:
	_open()
	ConfigManager.current_config = load_mock_config("price_change")
	ConfigManager.config_ready.emit(ConfigManager.current_config)
	assert_eq(_scene.get_subline_text(),
		"Four shakes on tap. Blended to order in under a minute.\nFrom ₹75.", "updated subline")
