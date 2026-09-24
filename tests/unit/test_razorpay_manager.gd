extends TestCase
## RazorpayManager against the mock server on :8788, using a fresh instance with
## test credentials under user://test_rzp/ (never the real autoload or files).

const DIR := "user://test_rzp"
const CREDS := DIR + "/creds.cfg"
const CREATE := "/v1/payments/qr_codes"
const PAYMENTS := "/v1/payments/qr_codes/{qr_id}/payments"
const CLOSE := "/v1/payments/qr_codes/{qr_id}/close"
const ORDER_ID := "01J8Z6Q4M9X3T7C2V5B8N1K4RD"

var rzp: Node


func before_each() -> void:
	await mock_reset()
	DirAccess.make_dir_recursive_absolute(DIR)
	if FileAccess.file_exists(CREDS):
		DirAccess.remove_absolute(CREDS)


func after_each() -> void:
	if is_instance_valid(rzp):
		rzp.queue_free()
	rzp = null


func _make(key_id: String = "mock_key", key_secret: String = "mock_secret") -> Node:
	if key_id != "":
		var cfg := ConfigFile.new()
		cfg.set_value("razorpay", "key_id", key_id)
		cfg.set_value("razorpay", "key_secret", key_secret)
		cfg.save(CREDS)
	rzp = load("res://autoload/RazorpayManager.gd").new()
	rzp.auto_configure = false
	add_child(rzp)
	rzp.base_url = MOCK_ORIGIN
	rzp.credentials_path = CREDS
	rzp.poll_interval_sec = 0.2
	rzp.poll_timeout_sec = 5.0
	rzp.qr_expiry_sec = 180.0
	rzp.request_timeout_sec = 3.0
	rzp.reload_credentials()
	return rzp


func _create() -> void:
	rzp.create_qr(75, ORDER_ID, 42, "Prymor Guava")


func test_not_configured() -> void:
	var before: Dictionary = await mock_state()
	_make("")
	assert_false(rzp.is_configured(), "not configured")
	var failed := watch_signal(rzp, &"qr_create_failed")
	_create()
	assert_true(await wait_until(failed, 1.0), "failed")
	assert_eq(failed.args[0], "not_configured", "reason")
	var after: Dictionary = await mock_state()
	assert_eq(after.request_counts[CREATE], before.request_counts[CREATE], "no request")


func test_live_keys_refused() -> void:
	_make("rzp_live_x", "s")
	assert_eq(rzp.mode(), "live", "mode")
	var failed := watch_signal(rzp, &"qr_create_failed")
	_create()
	assert_true(await wait_until(failed, 1.0), "failed")
	assert_eq(failed.args[0], "live_keys_disallowed", "reason")


func test_modes() -> void:
	_make("rzp_test_x", "s")
	assert_eq(rzp.mode(), "test", "test mode")
	rzp.queue_free()
	_make("mock_key", "mock_secret")
	assert_eq(rzp.mode(), "mock", "mock mode")


func test_happy_path_paid_after_3() -> void:
	await mock_scenario("paid_after_3", PAYMENTS)
	_make()
	var created := watch_signal(rzp, &"qr_created")
	var paid := watch_signal(rzp, &"payment_received")
	_create()
	assert_true(await wait_until(created, 3.0), "qr_created")
	assert_true(FileAccess.file_exists(created.args[1]), "image downloaded")
	assert_true(FileAccess.get_file_as_bytes(created.args[1]).size() > 0, "image non-empty")
	assert_true(await wait_until(paid, 3.0), "payment_received")
	assert_eq(paid.args[0], "pay_MockPay0000001", "payment id")
	assert_eq(paid.args[1], 7500, "amount paise")
	var body: Dictionary = (await mock_state()).last_body[CREATE]
	assert_eq(int(body.payment_amount), 7500, "paise")
	assert_eq(body.notes.order_id, ORDER_ID, "order id in notes")
	assert_eq(body.usage, "single_use", "usage")
	assert_eq(body.type, "upi_qr", "type")
	var ahead: float = float(body.close_by) - Time.get_unix_time_from_system()
	assert_true(absf(ahead - 180.0) <= 5.0, "close_by ~ now + expiry (%d)" % ahead)
	await wait_seconds(0.6)
	assert_eq(paid.count, 1, "captured emitted once")


func test_failed() -> void:
	await mock_scenario("failed", PAYMENTS)
	_make()
	var failed := watch_signal(rzp, &"payment_failed")
	_create()
	assert_true(await wait_until(failed, 3.0), "payment_failed")
	assert_eq(failed.args[0], "failed", "reason")


func test_timeout() -> void:
	_make()
	rzp.poll_timeout_sec = 0.6
	var failed := watch_signal(rzp, &"payment_failed")
	_create()
	assert_true(await wait_until(failed, 3.0), "payment_failed")
	assert_eq(failed.args[0], "timeout", "reason")


func test_transient_poll_error_does_not_fail() -> void:
	await mock_scenario("server_error", PAYMENTS)
	_make()
	var created := watch_signal(rzp, &"qr_created")
	var paid := watch_signal(rzp, &"payment_received")
	var failed := watch_signal(rzp, &"payment_failed")
	_create()
	await wait_until(created, 3.0)
	await wait_seconds(0.5)
	await mock_scenario("paid", PAYMENTS)
	assert_true(await wait_until(paid, 3.0), "recovered to paid")
	assert_false(failed.fired, "never failed")


func test_create_errors() -> void:
	await mock_scenario("bad_request", CREATE)
	_make()
	var failed := watch_signal(rzp, &"qr_create_failed")
	_create()
	assert_true(await wait_until(failed, 3.0), "failed")
	assert_eq(failed.args[0], "http_400", "400")
	await mock_scenario("server_error", CREATE)
	failed.fired = false
	_create()
	assert_true(await wait_until(failed, 3.0), "failed again")
	assert_eq(failed.args[0], "http_500", "500")


func test_close_qr() -> void:
	_make()
	var created := watch_signal(rzp, &"qr_created")
	_create()
	await wait_until(created, 3.0)
	rzp.stop_polling()
	rzp.close_qr()
	assert_eq(rzp.current_qr_id(), "", "cleared")
	await wait_seconds(0.3)
	var count: int = (await mock_state()).request_counts[CLOSE]
	assert_eq(count, 1, "close called")
	rzp.close_qr()
	await wait_seconds(0.3)
	assert_eq(int((await mock_state()).request_counts[CLOSE]), 1, "second close is a no-op")


func test_check_now_after_stop() -> void:
	_make()
	rzp.poll_interval_sec = 60.0
	var created := watch_signal(rzp, &"qr_created")
	var paid := watch_signal(rzp, &"payment_received")
	_create()
	await wait_until(created, 3.0)
	rzp.stop_polling()
	await mock_scenario("paid", PAYMENTS)
	rzp.check_now()
	assert_true(await wait_until(paid, 3.0), "final check finds the payment")


func test_abort_closes_in_flight_create() -> void:
	_make()
	var created := watch_signal(rzp, &"qr_created")
	_create()
	rzp.abort()
	await wait_seconds(0.8)
	assert_false(created.fired, "no qr_created after abort")
	assert_eq(int((await mock_state()).request_counts[CLOSE]), 1, "late QR closed")
