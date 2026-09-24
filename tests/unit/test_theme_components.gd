extends TestCase

const ProductCardScene := preload("res://ui/components/product_card/ProductCard.tscn")
const BrandHeaderScene := preload("res://ui/components/brand_header/BrandHeader.tscn")
const ConnectivityScene := preload("res://ui/components/connectivity_status/ConnectivityStatus.tscn")

var _nodes: Array[Node] = []


func after_each() -> void:
	for n in _nodes:
		if is_instance_valid(n):
			n.queue_free()
	_nodes.clear()


func _add(node: Node) -> Node:
	add_child(node)
	_nodes.append(node)
	return node


func _card(flavor: Dictionary) -> Control:
	var card: Control = _add(ProductCardScene.instantiate())
	card.size = Vector2(460, 424)
	card.set_flavor(flavor)
	return card


func test_theme_has_all_variations() -> void:
	var theme = load(ProjectSettings.get_setting("gui/theme/custom"))
	assert_true(theme is Theme, "custom theme loads")
	var labels: PackedStringArray = theme.get_type_variation_list("Label")
	for v in ["DisplayXL", "DisplayL", "Heading", "HeadingDim", "Body", "BodyStrong", "Mono",
			"MonoMuted", "MonoAccent", "MonoWarning", "MonoValue", "Clock", "Price", "PriceSoldOut",
			"LogoText", "BadgeText"]:
		assert_true(labels.has(v), "Label variation " + v)


func test_font_axes_use_integer_tags() -> void:
	var ts := TextServerManager.get_primary_interface()
	var display: FontVariation = load("res://assets/theme/fonts/display_900.tres")
	assert_eq(display.variation_opentype.get(ts.name_to_tag("wght")), 900, "display weight")
	var mono: FontVariation = load("res://assets/theme/fonts/mono_500.tres")
	assert_eq(mono.fallbacks.size(), 1, "mono has Archivo fallback")


func test_sold_out_card() -> void:
	var card := _card(find_flavor(load_mock_config(), "vanilla"))
	var sel := watch_signal(card, &"selected")
	assert_eq(card.get_node("Content/Row/Price").text, "SOLD OUT", "price label")
	assert_false(card.get_node("Content/Row/Tap").visible, "tap hidden")
	click(card)
	assert_false(sel.fired, "sold out never emits")


func test_popular_card() -> void:
	var card := _card(find_flavor(load_mock_config(), "guava"))
	var sel := watch_signal(card, &"selected")
	var badge: Control = card.get_node("Content/ImageArea/Badge")
	assert_true(badge.visible, "badge visible")
	assert_eq(badge.get_child(0).text, "POPULAR", "badge text")
	assert_eq(card.theme_type_variation, &"CardPanelPopular", "popular panel")
	assert_eq(card.get_node("Content/Row/Price").text, "₹75", "offer price")
	click(card)
	assert_true(sel.fired, "selected emitted")
	assert_eq(sel.args[0].id, "guava", "selected flavor")


func test_missing_nutrition_and_image() -> void:
	var f := find_flavor(load_mock_config(), "chocolate")
	f.nutrition = {}
	f.image = "res://does/not/exist.png"
	var card := _card(f)
	assert_false(card.get_node("Content/Meta").visible, "meta hidden")
	assert_true(card.get_node("Content/ImageArea/Placeholder").visible, "placeholder shown")


func test_brand_header_clock() -> void:
	var header := BrandHeaderScene.instantiate()
	header.right_mode = "clock"
	_add(header)
	var re := RegEx.create_from_string("^\\d\\d:\\d\\d (AM|PM)$")
	assert_true(re.search(header.get_clock_text()) != null, "clock format: " + header.get_clock_text())


func test_connectivity_status() -> void:
	var status := _add(ConnectivityScene.instantiate())
	status.apply(false, false)
	assert_eq(status.get_text(), "READY", "before first fetch")
	status.apply(true, false)
	assert_eq(status.get_text(), "OFFLINE", "fetch failed")
	status.apply(true, true)
	assert_eq(status.get_text(), "READY", "online")
