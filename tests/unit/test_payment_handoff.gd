extends TestCase

const FlavorDetailScene := preload("res://scenes/flavor_detail/FlavorDetail.tscn")
const PaymentScene := preload("res://scenes/payment/Payment.tscn")

var _snap: Dictionary
var _scene: Control


func before_each() -> void:
	_snap = snapshot_app_state()
	ConfigManager.current_config = load_mock_config("default")
	Nav.dry_run = true
	Nav.last_requested = ""
	OrderState.reset()


func after_each() -> void:
	if is_instance_valid(_scene):
		_scene.queue_free()
	await wait_frames(1)
	restore_app_state(_snap)


func _details(id: String) -> Control:
	OrderState.select_flavor(find_flavor(ConfigManager.current_config, id))
	_scene = FlavorDetailScene.instantiate()
	add_child(_scene)
	return _scene


func test_proceed_commits_offer_price_and_base() -> void:
	_details("guava")
	_scene.press_proceed()
	assert_eq(OrderState.charged_price, 75, "charged price")
	assert_eq(OrderState.selected_base_id, "water", "base")
	assert_eq(Nav.last_requested, ScenePaths.PAYMENT, "to payment")


func test_proceed_commits_actual_price() -> void:
	_details("chocolate")
	_scene.press_proceed()
	assert_eq(OrderState.charged_price, 180, "no offer, actual price")


func test_double_tap_navigates_once() -> void:
	_details("guava")
	var nav := watch_signal(Nav, &"navigated")
	_scene.press_proceed()
	_scene.press_proceed()
	assert_eq(nav.count, 1, "navigated once")


func test_unorderable_after_refresh_goes_back() -> void:
	_details("guava")
	var cfg: Dictionary = ConfigManager.current_config.duplicate(true)
	find_flavor(cfg, "guava").sold_out = true
	ConfigManager.current_config = cfg
	ConfigManager.config_ready.emit(cfg)
	assert_eq(Nav.last_requested, ScenePaths.FLAVOR_SELECT, "back to listing, not payment")
	assert_eq(OrderState.charged_price, 0, "nothing committed")


func test_no_enabled_base_disables_proceed() -> void:
	for base in ConfigManager.current_config.bases:
		base.enabled = false
	_details("guava")
	assert_true(_scene.is_proceed_disabled(), "proceed disabled")
	_scene.press_proceed()
	assert_eq(Nav.last_requested, "", "no navigation")


func test_payment_stub_shows_committed_order() -> void:
	OrderState.select_flavor(find_flavor(ConfigManager.current_config, "guava"))
	OrderState.charged_price = 75
	_scene = PaymentScene.instantiate()
	add_child(_scene)
	assert_eq(_scene.get_name_text(), "Prymor Guava", "flavor name")
	assert_eq(_scene.get_price_text(), "₹75", "amount")
	_scene.press_cancel()
	assert_eq(Nav.last_requested, ScenePaths.IDLE, "cancel goes idle")
	assert_false(OrderState.has_selection(), "order cleared")


func test_payment_stub_without_order_goes_idle() -> void:
	_scene = PaymentScene.instantiate()
	add_child(_scene)
	await wait_frames(2)
	assert_eq(Nav.last_requested, ScenePaths.IDLE, "no committed order")
