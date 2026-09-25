extends TestCase
## SalesReporter end to end inside the app: the dispensing screen gets a real result over
## UDP (Bridge on a free port) and the sale is POSTed to the mock on :8788.

const DispensingScene := preload("res://scenes/dispensing/Dispensing.tscn")
const ROUTE := "/fuelbot/sales"
const QUEUE := "user://test_sales/queue.json"

var _snap: Dictionary
var _tenant := ""
var _prev_queue := ""
var _scene: Control
var _reply: PacketPeerUDP
var _id := ""


func before_each() -> void:
	await mock_reset()
	_snap = snapshot_app_state()
	_tenant = ConfigManager.tenant_id
	ConfigManager.tenant_id = "t-test"
	ConfigManager.local_settings.api.base_url = MOCK_ORIGIN + "/fuelbot"
	var timing: Dictionary = ConfigManager.local_settings.timing
	timing.sale_report_retry_interval_sec = 0.3
	timing.dispense_safety_cap_sec = 0.4
	timing.dispensing_done_return_sec = 5.0    # stay on the screen: the return resets OrderState
	timing.dispensing_error_return_sec = 5.0
	_prev_queue = SalesReporter.queue_path
	DirAccess.make_dir_recursive_absolute(QUEUE.get_base_dir())
	DirAccess.remove_absolute(QUEUE)
	SalesReporter.queue_path = QUEUE
	SalesReporter.start_queue()
	ConfigManager.current_config = load_mock_config("default")
	Nav.dry_run = true
	Nav.last_requested = ""
	OrderState.reset()
	OrderState.select_flavor(find_flavor(ConfigManager.current_config, "guava"))
	OrderState.charged_price = 75
	OrderState.selected_base_id = "water"
	OrderState.order_id = Ulid.generate()
	OrderState.order_number = 42
	OrderState.transaction_id = "pay_Sale1"
	_id = OrderState.order_id
	Bridge.listen_port = 0
	Bridge.listen()
	_reply = PacketPeerUDP.new()
	_reply.connect_to_host("127.0.0.1", Bridge.get_listen_port())


func after_each() -> void:
	if is_instance_valid(_scene):
		_scene.queue_free()
	await wait_frames(2)
	_reply.close()
	ConfigManager.tenant_id = _tenant
	restore_app_state(_snap)
	SalesReporter.queue_path = _prev_queue   # the runner's test queue, never the real one
	SalesReporter.start_queue()
	Bridge.configure_from_settings()


func _open() -> void:
	_scene = DispensingScene.instantiate()
	add_child(_scene)
	await wait_frames(2)


func _bridge_says(text: String) -> void:
	_reply.put_packet(text.to_utf8_buffer())
	await wait_seconds(0.15)


func _posts() -> int:
	return int((await mock_state()).request_counts.get(ROUTE, 0))


func _wait_posts(n: int, timeout: float) -> bool:
	var deadline := Time.get_ticks_msec() + int(timeout * 1000)
	while Time.get_ticks_msec() < deadline:
		if await _posts() >= n:
			return true
		await wait_seconds(0.1)
	return false


func _body() -> Dictionary:
	return (await mock_state()).last_body[ROUTE]


func test_done_reports_success() -> void:
	await _open()
	await _bridge_says("DONE %s" % _id)
	assert_true(await _wait_posts(1, 3.0), "posted")
	var b := await _body()
	assert_eq([b.order_id, int(b.order_number), b.transaction_id, b.flavor_id, int(b.hopper), b.base_id],
		[_id, 42, "pay_Sale1", "guava", 1, "water"], "order identity")
	assert_eq([int(b.actual_price), int(b.offer_price), int(b.charged_price), b.currency, b.payment_method],
		[90, 75, 75, "INR", "upi"], "money")
	assert_eq([b.dispensing_result, b.dispensing_reason], ["success", ""], "outcome")
	assert_eq(b.tenant_id, "t-test", "tenant")
	assert_true(String(b.timestamp).ends_with("Z") and String(b.timestamp).length() == 20, "UTC timestamp")
	await wait_seconds(0.5)
	assert_eq(await _posts(), 1, "exactly one POST")


func test_timeout_reports_timeout() -> void:
	await _open()
	await _bridge_says("TIMEOUT %s deadline" % _id)
	assert_true(await _wait_posts(1, 3.0), "posted")
	var b := await _body()
	assert_eq([b.dispensing_result, b.dispensing_reason], ["timeout", "deadline"])


func test_rejected_reports_rejected() -> void:
	await _open()
	await _bridge_says("REJECTED %s machine_fault" % _id)
	assert_true(await _wait_posts(1, 3.0), "posted")
	var b := await _body()
	assert_eq([b.dispensing_result, b.dispensing_reason], ["rejected", "machine_fault"])


func test_safety_cap_reports_no_response() -> void:
	await _open()
	assert_true(await _wait_posts(1, 3.0), "posted after the cap")
	var b := await _body()
	assert_eq([b.dispensing_result, b.dispensing_reason, b.order_id], ["no_response", "safety_cap", _id])


func test_once_per_order() -> void:
	await _open()
	await _bridge_says("TIMEOUT %s deadline" % _id)
	await _bridge_says("DONE %s" % _id)
	assert_false(SalesReporter.report_sale(SalesReporter.sale_from_order_state("success", "")), "repeat refused")
	await wait_seconds(0.6)
	assert_eq(await _posts(), 1, "one sale for the order")
	assert_eq((await _body()).dispensing_result, "timeout", "the first outcome stands")


func test_offline_then_flush() -> void:
	await mock_scenario("server_error", ROUTE)
	await _open()
	await _bridge_says("DONE %s" % _id)
	await wait_seconds(0.5)
	assert_eq(SalesReporter.queue.size(), 1, "kept while the backend fails")
	var on_disk = JSON.parse_string(FileAccess.get_file_as_string(QUEUE))
	assert_true(on_disk is Array and on_disk.size() == 1 and on_disk[0].order_id == _id, "in the queue file")
	await mock_scenario("default", ROUTE)
	var deadline := Time.get_ticks_msec() + 3000
	while SalesReporter.queue.size() > 0 and Time.get_ticks_msec() < deadline:
		await get_tree().process_frame
	assert_eq(SalesReporter.queue.size(), 0, "flushed once the backend is back")
	var count := await _posts()
	await wait_seconds(1.0)
	assert_eq(await _posts(), count, "no duplicate after further retry intervals")
	assert_eq((await _body()).order_id, _id, "the queued sale")


func test_prices_from_order() -> void:
	find_flavor(ConfigManager.current_config, "guava").actual_price = 999   # catalog changes after Proceed
	await _open()
	await _bridge_says("DONE %s" % _id)
	assert_true(await _wait_posts(1, 3.0), "posted")
	var b := await _body()
	assert_eq([int(b.actual_price), int(b.charged_price)], [90, 75], "committed prices, not the live catalog")
