extends TestCase


func before_each() -> void:
	Nav.dry_run = true
	Nav.last_requested = ""
	OrderState.reset()


func after_each() -> void:
	Nav.dry_run = false
	Nav.last_requested = ""
	OrderState.reset()


func test_select_flavor_stores_copy() -> void:
	var source := {"id": "guava", "name": "Prymor Guava"}
	OrderState.select_flavor(source)
	source.name = "CHANGED"
	assert_eq(OrderState.selected_flavor.name, "Prymor Guava", "stored a copy")
	assert_true(OrderState.has_selection(), "has selection")


func test_reset_clears_fields_and_emits() -> void:
	OrderState.select_flavor({"id": "guava"})
	OrderState.selected_base_id = "water"
	OrderState.charged_price = 75
	OrderState.transaction_id = "pay_1"
	var reset := watch_signal(OrderState, &"order_reset")
	OrderState.reset()
	assert_true(reset.fired, "order_reset emitted")
	assert_false(OrderState.has_selection(), "selection cleared")
	assert_eq(OrderState.selected_base_id, "", "base cleared")
	assert_eq(OrderState.charged_price, 0, "price cleared")
	assert_eq(OrderState.transaction_id, "", "transaction cleared")


func test_go_idle_in_dry_run() -> void:
	var runner := get_tree().current_scene
	OrderState.select_flavor({"id": "guava"})
	var nav := watch_signal(Nav, &"navigated")
	Nav.go_idle()
	await wait_frames(2)
	assert_eq(Nav.last_requested, ScenePaths.IDLE, "requested idle")
	assert_true(nav.fired, "navigated emitted")
	assert_false(OrderState.has_selection(), "order reset")
	assert_eq(get_tree().current_scene, runner, "scene not changed in dry run")


func test_scene_paths_exist() -> void:
	for path in [ScenePaths.IDLE, ScenePaths.MAINTENANCE]:
		assert_true(ResourceLoader.exists(path), "exists: " + path)
