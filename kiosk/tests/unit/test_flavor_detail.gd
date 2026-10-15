extends TestCase

const FlavorDetailScene := preload("res://scenes/flavor_detail/FlavorDetail.tscn")

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


func _open_with(flavor: Dictionary) -> Control:
	if not flavor.is_empty():
		OrderState.select_flavor(flavor)
	_scene = FlavorDetailScene.instantiate()
	add_child(_scene)
	return _scene


func _open(id: String) -> Control:
	return _open_with(find_flavor(ConfigManager.current_config, id))


func test_guava_full_content() -> void:
	_open("guava")
	assert_eq(_scene.get_name_text(), "Prymor Guava", "name")
	assert_true(_scene.get_description_text().ends_with("400 ml."), "description + volume")
	assert_eq(_scene.get_price_text(), "₹75", "offer price")
	assert_true(_scene.is_banner_visible(), "banner visible")
	assert_eq(_scene.get_banner_text(), "CONTAINS MILK, SOY", "banner text")
	var chips: PackedStringArray = _scene.get_chip_texts()
	assert_true(chips.size() >= 8, "8+ chips")
	assert_eq(chips[0], "Whey protein isolate", "first chip")
	assert_eq(_scene.get_tile_texts(), [["210", "KCAL"], ["24g", "PROTEIN"], ["12g", "CARBS"], ["2g", "FAT"]], "tiles")
	assert_eq(_scene.get_tile(1).get_value_variation(), &"NutritionValueAccent", "protein accent")
	assert_eq(_scene.get_proceed_text(), "Proceed to Pay  ₹75", "proceed text")


func test_electro_hides_banner() -> void:
	_open("electro")
	assert_false(_scene.is_banner_visible(), "no allergens declared, no banner")
	assert_true(_scene.is_ingredients_visible(), "ingredients still shown")


func test_bundled_config_has_no_nutrition_section() -> void:
	var bundled = JSON.parse_string(FileAccess.get_file_as_string("res://config/default_config.json"))
	ConfigManager.current_config = ConfigManager.normalise(bundled)
	_open("guava")
	assert_false(_scene.is_nutrition_visible(), "nutrition hidden")
	assert_true(_scene.is_ingredients_visible(), "ingredients shown")
	assert_true(_scene.is_banner_visible(), "banner shown")


func test_partial_nutrition() -> void:
	var f := find_flavor(ConfigManager.current_config, "guava")
	f.nutrition = {"kcal": 100}
	_open_with(f)
	assert_eq(_scene.get_tile_texts(), [["100", "KCAL"], ["—", "PROTEIN"], ["—", "CARBS"], ["—", "FAT"]], "missing tiles show dash")


func test_empty_ingredients_hides_section() -> void:
	var f := find_flavor(ConfigManager.current_config, "guava")
	f.ingredients = []
	_open_with(f)
	assert_false(_scene.is_ingredients_visible(), "ingredients hidden")


func test_back_top_and_bottom() -> void:
	_open("guava")
	_scene.press_back_top()
	assert_false(OrderState.has_selection(), "top back clears selection")
	assert_eq(Nav.last_requested, ScenePaths.FLAVOR_SELECT, "top back to listing")
	_scene.queue_free()
	await wait_frames(1)
	Nav.last_requested = ""
	_open("guava")
	_scene.press_back_bottom()
	assert_false(OrderState.has_selection(), "bottom back clears selection")
	assert_eq(Nav.last_requested, ScenePaths.FLAVOR_SELECT, "bottom back to listing")


func test_no_selection_goes_idle() -> void:
	_open_with({})
	await wait_frames(2)
	assert_eq(Nav.last_requested, ScenePaths.IDLE, "no selection goes idle")


func test_inactivity() -> void:
	ConfigManager.local_settings.timing.detail_screen_inactivity_sec = 0.3
	_open("guava")
	await wait_seconds(0.2)
	var ev := InputEventMouseButton.new()
	ev.button_index = MOUSE_BUTTON_LEFT
	ev.pressed = true
	_scene._input(ev)
	await wait_seconds(0.2)
	assert_eq(Nav.last_requested, "", "input postponed the timeout")
	await wait_seconds(0.35)
	assert_eq(Nav.last_requested, ScenePaths.IDLE, "idle after full timeout")


func test_refresh_updates_price() -> void:
	_open("guava")
	var cfg: Dictionary = ConfigManager.current_config.duplicate(true)
	find_flavor(cfg, "guava").offer_price = 70
	ConfigManager.current_config = cfg
	ConfigManager.config_ready.emit(cfg)
	assert_eq(_scene.get_price_text(), "₹70", "price refreshed")
	assert_eq(_scene.get_proceed_text(), "Proceed to Pay  ₹70", "proceed refreshed")
	assert_eq(OrderState.selected_flavor.offer_price, 70, "order state refreshed")


func test_refresh_flavor_gone() -> void:
	_open("electro")
	ConfigManager.current_config = load_mock_config("price_change")
	ConfigManager.config_ready.emit(ConfigManager.current_config)
	assert_eq(Nav.last_requested, ScenePaths.FLAVOR_SELECT, "back to listing")
	assert_false(OrderState.has_selection(), "selection cleared")


func test_long_name_max_three_lines() -> void:
	var f := find_flavor(ConfigManager.current_config, "cookie")
	f.name = "Cookies & Cream Protein Deluxe Extra Large Edition"
	_open_with(f)
	await wait_frames(2)
	var label: Label = _scene.get_name_label()
	assert_true(label.get_visible_line_count() <= 3, "at most 3 visible lines (%d)" % label.get_visible_line_count())
	assert_true(label.size.y <= 3 * 76 + 40, "name height bounded (%d)" % label.size.y)
