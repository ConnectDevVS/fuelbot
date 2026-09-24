extends Control
## Dev-only component sheet for screenshot review. Not reachable from the app.

const BrandHeaderScene := preload("res://ui/components/brand_header/BrandHeader.tscn")
const ProductCardScene := preload("res://ui/components/product_card/ProductCard.tscn")
const FooterBarScene := preload("res://ui/components/footer_bar/FooterBar.tscn")
const ChipScene := preload("res://ui/components/chip/Chip.tscn")
const AllergenBannerScene := preload("res://ui/components/allergen_banner/AllergenBanner.tscn")
const NutritionTileScene := preload("res://ui/components/nutrition_tile/NutritionTile.tscn")
const StepIndicatorScene := preload("res://ui/components/step_indicator/StepIndicator.tscn")

const DESIGN_CHIPS := ["Whey protein isolate", "Toned milk", "Peanut butter", "Banana",
	"Rolled oats", "Jaggery", "Cinnamon", "Filtered water"]

const FIXTURES := [
	{"id": "a", "name": "Prymor Guava", "hopper": 1, "actual_price": 90, "offer_price": 75,
		"image": "res://assets/images/flavors/prymor_guava.png", "badge": "POPULAR", "sold_out": false,
		"enabled": true, "nutrition": {"protein_g": 24, "kcal": 210}},
	{"id": "b", "name": "MMN Chocolate", "hopper": 2, "actual_price": 180, "offer_price": null,
		"image": "res://assets/images/flavors/mmn_chocolate.png", "badge": null, "sold_out": false,
		"enabled": true, "nutrition": {"protein_g": 24, "kcal": 310}},
	{"id": "c", "name": "ON Vanilla", "hopper": 3, "actual_price": 140, "offer_price": null,
		"image": "res://assets/images/flavors/on_vanilla.png", "badge": null, "sold_out": true,
		"enabled": true, "nutrition": {"protein_g": 24, "kcal": 240}},
	{"id": "d", "name": "Missing Image", "hopper": 4, "actual_price": 99, "offer_price": null,
		"image": "res://nope.png", "badge": null, "sold_out": false, "enabled": true, "nutrition": {}},
]


func _ready() -> void:
	var bg := ColorRect.new()
	bg.color = Palette.BG
	bg.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(bg)
	var scroll := ScrollContainer.new()
	scroll.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	add_child(scroll)
	var margin := MarginContainer.new()
	margin.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	for side in ["left", "right", "top", "bottom"]:
		margin.add_theme_constant_override("margin_" + side, Palette.PAD)
	scroll.add_child(margin)
	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 32)
	margin.add_child(col)

	_add_details_section(col)

	col.add_child(BrandHeaderScene.instantiate())
	var clock_header := BrandHeaderScene.instantiate()
	clock_header.right_mode = "clock"
	col.add_child(clock_header)

	var grid := GridContainer.new()
	grid.columns = 2
	grid.add_theme_constant_override("h_separation", 28)
	grid.add_theme_constant_override("v_separation", 28)
	col.add_child(grid)
	for f in FIXTURES:
		var card := ProductCardScene.instantiate()
		grid.add_child(card)
		card.set_flavor(f)

	var button := Button.new()
	button.theme_type_variation = &"PrimaryButton"
	button.custom_minimum_size.y = 172
	col.add_child(button)
	var center := CenterContainer.new()
	center.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	center.mouse_filter = Control.MOUSE_FILTER_IGNORE
	button.add_child(center)
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 24)
	center.add_child(row)
	var dot := StatusDot.new()
	dot.color = Palette.ON_ACCENT_FAINT
	dot.diameter = 22
	dot.pulse = true
	row.add_child(dot)
	var cta := Label.new()
	cta.theme_type_variation = &"ButtonText"
	cta.text = ConfigManager.get_message("attract_cta")
	row.add_child(cta)

	col.add_child(FooterBarScene.instantiate())


## Details-page components (DET-01), first so a default screenshot shows them.
func _add_details_section(col: VBoxContainer) -> void:
	var top := HBoxContainer.new()
	col.add_child(top)
	var back := Button.new()
	back.theme_type_variation = &"BackPill"
	back.text = "←  " + ConfigManager.get_message("back")
	back.custom_minimum_size = Vector2(196, 80)
	top.add_child(back)
	var spacer := Control.new()
	spacer.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	top.add_child(spacer)
	top.add_child(StepIndicatorScene.instantiate())

	var banner := AllergenBannerScene.instantiate()
	banner.set_allergens(["Peanuts", "Milk"])
	col.add_child(banner)

	var chips := HFlowContainer.new()
	chips.add_theme_constant_override("h_separation", 18)
	chips.add_theme_constant_override("v_separation", 18)
	col.add_child(chips)
	for text in DESIGN_CHIPS:
		var chip := ChipScene.instantiate()
		chip.set_text(text)
		chips.add_child(chip)

	var tiles := HBoxContainer.new()
	tiles.add_theme_constant_override("separation", 18)
	col.add_child(tiles)
	for spec in [["480", "KCAL", false], ["32g", "PROTEIN", true], ["46g", "CARBS", false], ["14g", "FAT", false]]:
		var tile := NutritionTileScene.instantiate()
		tile.set_value(spec[0], spec[1], spec[2])
		tiles.add_child(tile)
