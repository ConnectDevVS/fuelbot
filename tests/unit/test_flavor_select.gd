extends TestCase

const FlavorSelectScene := preload("res://scenes/flavor_select/FlavorSelect.tscn")
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


func _open(scene: PackedScene = FlavorSelectScene) -> Control:
	_scene = scene.instantiate()
	add_child(_scene)
	return _scene


func _card(id: String) -> Control:
	for card in _scene.get_cards():
		if card.flavor.id == id:
			return card
	return null


func test_six_cards_in_two_columns() -> void:
	_open()
	await wait_frames(2)
	var cards: Array = _scene.get_cards()
	assert_eq(cards.size(), 6, "card count")
	assert_eq(_scene._grid.columns, 2, "columns")
	assert_eq(cards[0].flavor.id, "guava", "config order")
	assert_eq(cards[0].theme_type_variation, &"CardPanelPopular", "popular card")
	assert_eq(cards[3].get_node("Content/Row/Price").text, "SOLD OUT", "vanilla sold out")
	var scroll: ScrollContainer = _scene._scroll
	assert_true(_scene._grid.size.y <= scroll.size.y + 1, "six cards fit without scrolling (%d <= %d)" % [_scene._grid.size.y, scroll.size.y])


func test_tap_orderable_card() -> void:
	_open()
	click(_card("guava"))
	assert_eq(OrderState.selected_flavor.get("id"), "guava", "selection stored")
	assert_eq(Nav.last_requested, ScenePaths.FLAVOR_DETAIL, "navigated to detail")


func test_tap_sold_out_card_does_nothing() -> void:
	_open()
	click(_card("vanilla"))
	assert_eq(Nav.last_requested, "", "no navigation")
	assert_false(OrderState.has_selection(), "no selection")


func test_price_change_config() -> void:
	ConfigManager.current_config = load_mock_config("price_change")
	_open()
	assert_eq(_scene.get_cards().size(), 5, "electro hidden")
	assert_eq(_card("chocolate").get_node("Content/Row/Price").text, "₹199", "new price")


func test_config_ready_rebuilds() -> void:
	_open()
	ConfigManager.current_config = load_mock_config("price_change")
	ConfigManager.config_ready.emit(ConfigManager.current_config)
	await wait_frames(1)
	assert_eq(_scene.get_cards().size(), 5, "rebuilt on config_ready")


func test_inactivity_returns_to_idle() -> void:
	ConfigManager.local_settings.timing.flavor_screen_inactivity_sec = 0.3
	OrderState.select_flavor({"id": "x"})
	_open()
	await wait_seconds(0.6)
	assert_eq(Nav.last_requested, ScenePaths.IDLE, "went idle")
	assert_false(OrderState.has_selection(), "order reset")


func test_input_resets_inactivity() -> void:
	ConfigManager.local_settings.timing.flavor_screen_inactivity_sec = 0.5
	_open()
	await wait_seconds(0.3)
	var ev := InputEventMouseButton.new()
	ev.button_index = MOUSE_BUTTON_LEFT
	ev.pressed = true
	_scene._input(ev)
	await wait_seconds(0.35)
	assert_eq(Nav.last_requested, "", "timer was reset")
	await wait_seconds(0.45)
	assert_eq(Nav.last_requested, ScenePaths.IDLE, "idle after full timeout")


func test_empty_catalog() -> void:
	var cfg := load_mock_config("default")
	for f in cfg.flavors:
		f.enabled = false
	ConfigManager.current_config = cfg
	_open()
	assert_eq(_scene.get_cards().size(), 0, "no cards")
	assert_true(_scene._empty.visible, "empty label visible")


func test_detail_stub_with_selection() -> void:
	OrderState.select_flavor(find_flavor(ConfigManager.current_config, "guava"))
	_open(FlavorDetailScene)
	assert_eq(_scene.get_name_text(), "Prymor Guava", "name shown")
	_scene.press_back()
	assert_eq(Nav.last_requested, ScenePaths.FLAVOR_SELECT, "back to listing")


func test_detail_stub_without_selection() -> void:
	_open(FlavorDetailScene)
	await wait_frames(2)
	assert_eq(Nav.last_requested, ScenePaths.IDLE, "no selection goes idle")
