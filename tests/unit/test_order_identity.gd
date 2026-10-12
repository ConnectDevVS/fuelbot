extends TestCase

const FlavorDetailScene := preload("res://scenes/flavor_detail/FlavorDetail.tscn")
const COUNTER := "user://test_order/counter.txt"

var _snap: Dictionary
var _counter_path: String
var _scene: Control


func before_each() -> void:
	_snap = snapshot_app_state()
	_counter_path = OrderCounter.counter_path
	DirAccess.make_dir_recursive_absolute("user://test_order")
	if FileAccess.file_exists(COUNTER):
		DirAccess.remove_absolute(COUNTER)
	OrderCounter.counter_path = COUNTER
	ConfigManager.current_config = load_mock_config("default")
	Nav.dry_run = true
	Nav.last_requested = ""


func after_each() -> void:
	if is_instance_valid(_scene):
		_scene.queue_free()
	await wait_frames(1)
	OrderCounter.counter_path = _counter_path
	restore_app_state(_snap)


func test_ulid_shape_and_uniqueness() -> void:
	var seen := {}
	for i in 1000:
		var id := Ulid.generate()
		assert_true(id.length() == 26 and Ulid.is_valid(id), "valid: " + id)
		seen[id] = true
	assert_eq(seen.size(), 1000, "1000 unique ids")


func test_ulid_timestamp_roundtrip_and_vectors() -> void:
	assert_eq(Ulid.timestamp_ms(Ulid.generate(1727170000123)), 1727170000123, "roundtrip")
	assert_true(Ulid.generate(0).begins_with("0000000000"), "time 0")
	assert_true(Ulid.generate(Ulid.MAX_TIME).begins_with("7ZZZZZZZZZ"), "max 48-bit time")


func test_ulid_sorts_by_time() -> void:
	var a := Ulid.generate(1727170000000)
	var b := Ulid.generate(1727170000002)
	assert_true(a < b, "lexicographic order follows time")


func test_ulid_is_valid_rejects() -> void:
	assert_false(Ulid.is_valid("0123"), "length")
	assert_false(Ulid.is_valid("0000000000000000000000000I"), "I not allowed")
	assert_false(Ulid.is_valid("0000000000000000000000000U"), "U not allowed")
	assert_false(Ulid.is_valid("80000000000000000000000000"), "first char > 7")


func test_order_counter() -> void:
	assert_eq(OrderCounter.next(), 1, "first")
	assert_eq(OrderCounter.next(), 2, "second")
	var fresh: Node = load("res://autoload/OrderCounter.gd").new()
	fresh.counter_path = COUNTER
	assert_eq(fresh.next(), 3, "persists across instances")
	fresh.free()
	var f := FileAccess.open(COUNTER, FileAccess.WRITE)
	f.store_string("9999")
	f.close()
	assert_eq(OrderCounter.next(), 9999, "max")
	assert_eq(OrderCounter.next(), 1, "wraps")
	f = FileAccess.open(COUNTER, FileAccess.WRITE)
	f.store_string("garbage")
	f.close()
	assert_eq(OrderCounter.next(), 1, "corrupt resets")


func _proceed_guava() -> void:
	OrderState.select_flavor(find_flavor(ConfigManager.current_config, "guava"))
	_scene = FlavorDetailScene.instantiate()
	add_child(_scene)
	_scene.press_proceed()


func test_proceed_assigns_identity_and_new_order_each_time() -> void:
	_proceed_guava()
	var first_id := OrderState.order_id
	var first_number := OrderState.order_number
	assert_true(Ulid.is_valid(first_id), "valid order id")
	assert_true(first_number > 0, "order number")
	assert_eq(Nav.last_requested, ScenePaths.PAYMENT, "to payment")
	_scene.queue_free()
	await wait_frames(1)
	OrderState.reset()
	_proceed_guava()
	assert_true(OrderState.order_id != first_id, "new id")
	assert_eq(OrderState.order_number, first_number + 1, "next number")


func test_reset_clears_identity() -> void:
	OrderState.order_id = Ulid.generate()
	OrderState.order_number = 5
	OrderState.reset()
	assert_eq(OrderState.order_id, "", "id cleared")
	assert_eq(OrderState.order_number, 0, "number cleared")
