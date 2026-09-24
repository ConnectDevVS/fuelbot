extends TestCase
## ReportQueue against the mock's telemetry route on :8788 (fresh queues under user://test_rq/).

const ROUTE := "/fuelbot/telemetry"
const DIR := "user://test_rq"
const UNREACHABLE := "http://127.0.0.1:9/nothing"

var _host: Node
var _path := ""
var _n := 0


func before_each() -> void:
	await mock_reset()
	DirAccess.make_dir_recursive_absolute(DIR)
	_n += 1
	_path = "%s/q%d.json" % [DIR, _n]
	for suffix in ["", ".tmp", ".corrupt"]:
		DirAccess.remove_absolute(_path + suffix)
	_host = Node.new()
	add_child(_host)


func after_each() -> void:
	_host.queue_free()
	await wait_frames(2)


func _queue(url := MOCK_ORIGIN + ROUTE, headers := PackedStringArray(["X-Tenant-Id: t-test"]),
		max_count := 5000) -> ReportQueue:
	return ReportQueue.new(_host, _path, func() -> String: return url,
		func() -> PackedStringArray: return headers, 0.3, max_count, "[TestQueue]")


func _wait_size(q: ReportQueue, n: int, timeout: float) -> bool:
	var deadline := Time.get_ticks_msec() + int(timeout * 1000)
	while q.size() != n and Time.get_ticks_msec() < deadline:
		await get_tree().process_frame
	return q.size() == n


func _count() -> int:
	return int((await mock_state()).request_counts.get(ROUTE, 0))


func _on_disk() -> Array:
	var data = JSON.parse_string(FileAccess.get_file_as_string(_path))
	return data if data is Array else []


func test_persist_before_send() -> void:
	var q := _queue(UNREACHABLE)
	q.enqueue({"id": 1})
	assert_eq(_on_disk(), [{"id": 1.0}], "on disk before any network result")
	var again := _queue(UNREACHABLE)
	assert_eq(again.size(), 1, "a new instance loads it")


func test_delivers_and_removes() -> void:
	var q := _queue()
	var got := watch_signal(q, &"delivered")
	q.enqueue({"id": 1, "event_type": "dispense_cycle"})
	assert_true(await _wait_size(q, 0, 3.0), "delivered")
	assert_true(got.fired, "delivered signal")
	assert_eq(await _count(), 1, "one POST")
	assert_eq(_on_disk(), [], "file emptied")
	assert_eq((await mock_state()).last_body[ROUTE], {"id": 1.0, "event_type": "dispense_cycle"}, "body")


func test_retry_on_500() -> void:
	await mock_scenario("server_error", ROUTE)
	var q := _queue()
	q.enqueue({"id": 7})
	await wait_seconds(0.5)
	assert_eq(q.size(), 1, "kept on 500")
	var failures := await _count()
	assert_true(failures >= 1, "tried")
	await mock_scenario("default", ROUTE)
	assert_true(await _wait_size(q, 0, 2.0), "sent on retry")
	assert_eq((await mock_state()).last_body[ROUTE], {"id": 7.0})


func test_drop_on_400() -> void:
	await mock_scenario("bad_request", ROUTE)
	var q := _queue()
	var dropped := watch_signal(q, &"dropped")
	q.enqueue({"id": 3})
	assert_true(await _wait_size(q, 0, 3.0), "removed")
	assert_eq(dropped.args[1], "rejected_400", "why")


func test_order_preserved() -> void:
	await mock_scenario("server_error", ROUTE)
	var q := _queue()
	var order: Array = []
	q.delivered.connect(func(r: Dictionary) -> void: order.append(int(r.id)))
	for i in [1, 2, 3]:
		q.enqueue({"id": i})
	await wait_seconds(0.3)
	await mock_scenario("default", ROUTE)
	assert_true(await _wait_size(q, 0, 3.0), "all sent")
	assert_eq(order, [1, 2, 3], "oldest first")


func test_overflow() -> void:
	var q := _queue(UNREACHABLE, PackedStringArray(["X-Tenant-Id: t"]), 3)
	var why: Array = []
	q.dropped.connect(func(_r: Dictionary, w: String) -> void: why.append(w))
	for i in range(1, 6):
		q.enqueue({"id": i})
	assert_eq(q.size(), 3, "capped")
	assert_eq(int(q.records()[0].id), 3, "oldest dropped first")
	assert_eq(why, ["overflow", "overflow"], "reported")


func test_corrupt_file() -> void:
	var f := FileAccess.open(_path, FileAccess.WRITE)
	f.store_string("{not json")
	f.close()
	var q := _queue(UNREACHABLE)
	assert_eq(q.size(), 0, "starts empty")
	assert_true(FileAccess.file_exists(_path + ".corrupt"), "kept aside, not deleted")


func test_no_tenant_no_request() -> void:
	var q := _queue(MOCK_ORIGIN + ROUTE, PackedStringArray())
	q.enqueue({"id": 1})
	await wait_seconds(0.5)
	assert_eq(await _count(), 0, "no request without a tenant")
	assert_eq(q.size(), 1, "still queued")
