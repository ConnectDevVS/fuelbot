extends TestCase
## Dispensing screen with the REAL Bridge listening on an ephemeral port; results
## are injected as real UDP datagrams (never binds 4242/4245).

const DispensingScene := preload("res://scenes/dispensing/Dispensing.tscn")
const DispensingScript := preload("res://scenes/dispensing/dispensing.gd")

var _snap: Dictionary
var _scene: Control
var _reply: PacketPeerUDP
var _id := ""


func before_each() -> void:
	_snap = snapshot_app_state()
	ConfigManager.current_config = load_mock_config("default")
	var timing: Dictionary = ConfigManager.local_settings.timing
	timing.dispense_expected_sec = 1.0
	timing.dispense_safety_cap_sec = 1.5
	timing.dispensing_done_return_sec = 0.3
	timing.dispensing_error_return_sec = 0.3
	Nav.dry_run = true
	Nav.last_requested = ""
	OrderState.reset()
	OrderState.select_flavor(find_flavor(ConfigManager.current_config, "guava"))
	OrderState.charged_price = 75
	OrderState.selected_base_id = "water"
	OrderState.order_id = Ulid.generate()
	OrderState.order_number = 42
	OrderState.transaction_id = "pay_Test"
	_id = OrderState.order_id
	Bridge.listen_port = 0
	assert_eq(Bridge.listen(), OK, "bridge listens on a free port")
	_reply = PacketPeerUDP.new()
	_reply.connect_to_host("127.0.0.1", Bridge.get_listen_port())


func after_each() -> void:
	if is_instance_valid(_scene):
		_scene.queue_free()
	await wait_frames(2)
	_reply.close()
	Bridge.configure_from_settings()
	restore_app_state(_snap)


func _open() -> Control:
	_scene = DispensingScene.instantiate()
	add_child(_scene)
	return _scene


func _bridge_says(text: String) -> void:
	_reply.put_packet(text.to_utf8_buffer())
	await wait_seconds(0.15)


func _wait_state(target: int, timeout: float) -> bool:
	var deadline := Time.get_ticks_msec() + int(timeout * 1000)
	while is_instance_valid(_scene) and _scene.get_state() != target and Time.get_ticks_msec() < deadline:
		await get_tree().process_frame
	return is_instance_valid(_scene) and _scene.get_state() == target


func _wait_nav(path: String, timeout: float) -> bool:
	var deadline := Time.get_ticks_msec() + int(timeout * 1000)
	while Nav.last_requested != path and Time.get_ticks_msec() < deadline:
		await get_tree().process_frame
	return Nav.last_requested == path


func test_header_and_meta() -> void:
	_open()
	assert_eq(_scene.get_header_texts(), ["ORDER #0042 · PAID", "UPI · ₹75"], "header")
	assert_eq(_scene.get_meta_text(), "Prymor Guava · 400 ml", "meta")
	assert_eq(_scene.get_title_text(), ConfigManager.get_message("dispensing_title"), "title")


func test_meta_without_volume() -> void:
	OrderState.selected_flavor.erase("volume_ml")
	_open()
	assert_eq(_scene.get_meta_text(), "Prymor Guava", "name only")


func test_blending_progress() -> void:
	_open()
	await wait_seconds(0.5)
	var p: float = _scene.get_progress()
	assert_true(p > 0.3 and p < 0.6, "progress ~0.475 after 0.5 s of 1 s (%f)" % p)
	assert_true(RegEx.create_from_string("^~\\d+ SECONDS$").search(_scene.get_remaining_text()) != null,
		"remaining label '%s'" % _scene.get_remaining_text())
	assert_false(_scene.is_collect_visible(), "no collect hint while blending")
	assert_eq(_scene.get_return_text(), "", "no return countdown while blending")
	assert_eq(_scene.get_badge_mark(), StatusBadge.Mark.CHECK, "check badge")


func test_estimate_progress() -> void:
	assert_eq(DispensingScript.estimate_progress(0.0, 75.0), 0.0, "zero at start")
	assert_true(absf(DispensingScript.estimate_progress(75.0, 75.0) - 0.95) < 0.0001, "0.95 at expected")
	var last := -1.0
	for i in 200:
		var p: float = DispensingScript.estimate_progress(i * 4.0, 75.0)
		assert_true(p >= last, "monotonic at %d s" % (i * 4))
		assert_true(p < 0.99, "never reaches 0.99 before DONE (%f at %d s)" % [p, i * 4])
		last = p
	assert_eq(DispensingScript.estimate_progress(10.0, 0.0), 0.95, "no estimate -> 0.95")


func test_done() -> void:
	_open()
	await _bridge_says("DONE %s" % _id)
	assert_eq(_scene.get_state(), _scene.State.DONE, "done")
	assert_eq(_scene.get_progress(), 1.0, "full bar")
	assert_true(_scene.is_collect_visible(), "collect hint")
	assert_eq(_scene.get_title_text(), ConfigManager.get_message("dispensing_success"), "title")
	assert_eq(_scene.get_return_text(), "RETURNING TO MENU IN 1S", "return countdown")
	assert_true(await _wait_nav(ScenePaths.IDLE, 1.5), "back to idle")


func test_other_order_ignored() -> void:
	_open()
	await _bridge_says("DONE %s" % Ulid.generate())
	assert_eq(_scene.get_state(), _scene.State.BLENDING, "still blending")


func test_timeout() -> void:
	_open()
	await _bridge_says("TIMEOUT %s deadline" % _id)
	_assert_failed()
	assert_true(await _wait_nav(ScenePaths.IDLE, 1.5), "back to idle")


func test_rejected() -> void:
	_open()
	await _bridge_says("REJECTED %s busy" % _id)
	_assert_failed()
	assert_true(await _wait_nav(ScenePaths.IDLE, 1.5), "back to idle")


func _assert_failed() -> void:
	assert_eq(_scene.get_state(), _scene.State.FAILED, "failed")
	assert_eq(_scene.get_meta_text(), ConfigManager.get_message("dispensing_timeout"), "support message")
	assert_eq(_scene.get_badge_mark(), StatusBadge.Mark.ALERT, "alert badge")
	assert_false(_scene.is_bar_visible(), "no bar")
	assert_false(_scene.is_collect_visible(), "no collect hint")
	assert_eq(_scene.get_return_text(), "RETURNING TO MENU IN 1S", "return countdown")


func test_safety_cap() -> void:
	ConfigManager.local_settings.timing.dispense_safety_cap_sec = 1.0
	_open()
	var t0 := Time.get_ticks_msec()
	assert_true(await _wait_state(_scene.State.FAILED, 2.0), "fails at the cap")
	var took := Time.get_ticks_msec() - t0
	assert_true(took >= 950, "not before the cap (%d ms)" % took)
	assert_eq(_scene.get_meta_text(), ConfigManager.get_message("dispensing_timeout"), "support message")
	assert_true(await _wait_nav(ScenePaths.IDLE, 1.5), "back to idle")


func test_result_before_scene() -> void:
	await _bridge_says("DONE %s" % _id)
	_open()
	assert_eq(_scene.get_state(), _scene.State.DONE, "cached result acted on at once")


func test_late_result_ignored() -> void:
	_open()
	await _bridge_says("TIMEOUT %s serial_lost" % _id)
	await _bridge_says("DONE %s" % _id)
	assert_eq(_scene.get_state(), _scene.State.FAILED, "first outcome stands")


func test_no_transaction_goes_idle() -> void:
	OrderState.transaction_id = ""
	_open()
	await wait_frames(2)
	assert_eq(Nav.last_requested, ScenePaths.IDLE, "guarded")


func test_ignores_maintenance() -> void:
	_open()
	ConfigManager.remote_maintenance_enabled = true
	ConfigManager.maintenance_changed.emit(true, "down")
	await wait_seconds(0.3)
	assert_eq(Nav.last_requested, "", "no navigation while blending")
	assert_eq(_scene.get_state(), _scene.State.BLENDING, "still blending")


func test_layout_fits() -> void:
	_open()
	await _bridge_says("DONE %s" % _id)
	await wait_frames(3)
	var frame := Rect2(Vector2.ZERO, Vector2(1080, 1920))
	for c in _scene.get_layout_controls():
		var control: Control = c
		if control.is_visible_in_tree():
			assert_true(frame.encloses(control.get_global_rect()), "%s on screen (%s)" % [
				control.get_class(), control.get_global_rect()])
	assert_eq(_scene.get_title_line_count(), 2, "title is 2 lines")
	assert_eq(_scene.get_bar_size(), Vector2(762, 28), "bar size")
	assert_true(_scene.get_collect_size().x > 500, "collect hint laid out (%s)" % _scene.get_collect_size())
