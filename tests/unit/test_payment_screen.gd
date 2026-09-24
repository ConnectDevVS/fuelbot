extends TestCase
## Payment screen driving the REAL RazorpayManager (pointed at the mock on :8788
## with mock creds) and the REAL Bridge (pointed at ephemeral UDP listeners).

const PaymentScene := preload("res://scenes/payment/Payment.tscn")
const DispensingScene := preload("res://scenes/dispensing/Dispensing.tscn")
const CREDS := "user://test_pay/creds.cfg"
const PAYMENTS := "/v1/payments/qr_codes/{qr_id}/payments"
const CREATE := "/v1/payments/qr_codes"
const CLOSE := "/v1/payments/qr_codes/{qr_id}/close"

var _snap: Dictionary
var _scene: Control
var _sel: PacketPeerUDP
var _res: PacketPeerUDP
var _got: Array = []


func before_each() -> void:
	await mock_reset()
	_snap = snapshot_app_state()
	ConfigManager.current_config = load_mock_config("default")
	ConfigManager.local_settings.timing.payment_error_return_sec = 0.3
	Nav.dry_run = true
	Nav.last_requested = ""
	OrderState.reset()
	OrderState.select_flavor(find_flavor(ConfigManager.current_config, "guava"))
	OrderState.charged_price = 75
	OrderState.selected_base_id = "water"
	OrderState.order_id = Ulid.generate()
	OrderState.order_number = 42
	DirAccess.make_dir_recursive_absolute("user://test_pay")
	_write_creds("mock_key", "mock_secret")
	RazorpayManager.base_url = MOCK_ORIGIN
	RazorpayManager.credentials_path = CREDS
	RazorpayManager.poll_interval_sec = 0.2
	RazorpayManager.poll_timeout_sec = 5.0
	RazorpayManager.qr_expiry_sec = 180.0
	RazorpayManager.reload_credentials()
	_sel = PacketPeerUDP.new()
	_res = PacketPeerUDP.new()
	_sel.bind(0, "127.0.0.1")
	_res.bind(0, "127.0.0.1")
	Bridge.selection_port = _sel.get_local_port()
	Bridge.result_port = _res.get_local_port()
	Bridge.result_gap_sec = 0.2
	Bridge.connect_sockets()
	_got.clear()


func after_each() -> void:
	if is_instance_valid(_scene):
		_scene.queue_free()
	await wait_frames(2)
	RazorpayManager.abort()
	RazorpayManager.configure_from_settings()
	Bridge.configure_from_settings()
	_sel.close()
	_res.close()
	restore_app_state(_snap)


func _write_creds(id: String, secret: String) -> void:
	var cfg := ConfigFile.new()
	cfg.set_value("razorpay", "key_id", id)
	cfg.set_value("razorpay", "key_secret", secret)
	cfg.save(CREDS)


func _open() -> Control:
	_scene = PaymentScene.instantiate()
	add_child(_scene)
	return _scene


func _udp() -> Array:
	for pair in [["sel", _sel], ["res", _res]]:
		var peer: PacketPeerUDP = pair[1]
		while peer.get_available_packet_count() > 0:
			_got.append("%s:%s" % [pair[0], peer.get_packet().get_string_from_utf8()])
	return _got


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


func _count(route: String) -> int:
	return int((await mock_state()).request_counts[route])


func test_header_and_summary() -> void:
	_open()
	assert_eq(_scene.get_order_text(), "ORDER #0042", "order number")
	assert_eq(_scene.get_chip_text(), "MOCK PAYMENTS", "mode chip")


func test_paid_after_3() -> void:
	await mock_scenario("paid_after_3", PAYMENTS)
	_open()
	assert_true(await _wait_state(_scene.State.WAITING, 3.0), "waiting")
	assert_true(_scene.has_qr_texture(), "qr shown")
	assert_true(RegEx.create_from_string("^\\d:\\d\\d$").search(_scene.get_countdown_text()) != null, "countdown")
	assert_true(await _wait_nav(ScenePaths.DISPENSING, 4.0), "dispensing after paid")
	await wait_seconds(0.1)
	assert_eq(_udp(), ["sel:P1", "sel:B2", "res:Y"], "bridge got hopper, base, then Y")
	assert_eq(OrderState.transaction_id, "pay_MockPay0000001", "transaction id")


func test_failed_payment() -> void:
	await mock_scenario("failed", PAYMENTS)
	_open()
	assert_true(await _wait_state(_scene.State.FAILED, 3.0), "failed state")
	assert_true(await _wait_nav(ScenePaths.IDLE, 2.0), "back to idle")
	await wait_seconds(0.2)
	assert_eq(_udp(), ["res:X"], "X only")
	assert_eq(await _count(CLOSE), 1, "QR closed")


func test_countdown_expiry() -> void:
	RazorpayManager.qr_expiry_sec = 1.0
	_open()
	assert_true(await _wait_state(_scene.State.EXPIRED, 4.0), "expired")
	assert_eq(_scene.get_countdown_text(), "0:00", "countdown at zero")
	assert_true(await _wait_nav(ScenePaths.IDLE, 2.0), "back to idle")
	await wait_seconds(0.2)
	assert_eq(_udp(), ["res:X"], "X only")
	assert_eq(await _count(CLOSE), 1, "QR closed")


func test_cancel_while_pending() -> void:
	_open()
	assert_true(await _wait_state(_scene.State.WAITING, 3.0), "waiting")
	var t0 := Time.get_ticks_msec()
	_scene.press_cancel()
	assert_true(await _wait_nav(ScenePaths.IDLE, 3.0), "idle")
	assert_true(Time.get_ticks_msec() - t0 < 2000, "cancel does not wait the full final-check timeout")
	await wait_seconds(0.2)
	assert_eq(_udp(), ["res:X"], "X, no Y")
	assert_eq(await _count(CLOSE), 1, "QR closed")


func test_cancel_race_pays_instead() -> void:
	RazorpayManager.poll_interval_sec = 60.0
	_open()
	assert_true(await _wait_state(_scene.State.WAITING, 3.0), "waiting")
	await mock_scenario("paid", PAYMENTS)
	_scene.press_cancel()
	assert_true(await _wait_nav(ScenePaths.DISPENSING, 4.0), "paid during cancel -> dispense")
	await wait_seconds(0.1)
	assert_eq(_udp(), ["sel:P1", "sel:B2", "res:Y"], "Y sent, no X")


func test_create_server_error() -> void:
	await mock_scenario("server_error", CREATE)
	_open()
	assert_true(await _wait_state(_scene.State.FAILED, 3.0), "failed")
	assert_eq(_scene.get_qr_message(), ConfigManager.get_message("payment_failed"), "message")
	await wait_seconds(0.2)
	assert_false(_udp().has("res:Y"), "no Y")


func test_no_credentials() -> void:
	DirAccess.remove_absolute(CREDS)
	RazorpayManager.reload_credentials()
	_open()
	assert_true(await _wait_state(_scene.State.FAILED, 2.0), "failed")
	assert_eq(_scene.get_qr_message(), ConfigManager.get_message("payment_unavailable"), "unavailable message")


func test_guard_without_order_id() -> void:
	OrderState.order_id = ""
	_open()
	await wait_frames(2)
	assert_eq(Nav.last_requested, ScenePaths.IDLE, "guarded")


func test_leaving_stops_polling() -> void:
	_open()
	assert_true(await _wait_state(_scene.State.WAITING, 3.0), "waiting")
	_scene.queue_free()
	await wait_frames(2)
	var before := await _count(PAYMENTS)
	await wait_seconds(0.6)
	assert_eq(await _count(PAYMENTS), before, "no polls after leaving")
	assert_eq(await _count(CLOSE), 1, "QR closed on leave")


func test_dispensing_stub() -> void:
	OrderState.transaction_id = "pay_X"
	ConfigManager.local_settings.timing.dispensing_stub_return_sec = 0.3
	_scene = DispensingScene.instantiate()
	add_child(_scene)
	assert_eq(_scene.get_name_text(), "Prymor Guava", "name")
	assert_eq(_scene.get_order_text(), "ORDER #0042", "order")
	assert_true(await _wait_nav(ScenePaths.IDLE, 1.5), "returns to idle")


func test_dispensing_stub_without_payment() -> void:
	_scene = DispensingScene.instantiate()
	add_child(_scene)
	await wait_frames(2)
	assert_eq(Nav.last_requested, ScenePaths.IDLE, "guarded")
