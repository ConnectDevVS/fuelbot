extends TestCase

const ChipScene := preload("res://ui/components/chip/Chip.tscn")
const AllergenBannerScene := preload("res://ui/components/allergen_banner/AllergenBanner.tscn")
const NutritionTileScene := preload("res://ui/components/nutrition_tile/NutritionTile.tscn")
const StepIndicatorScene := preload("res://ui/components/step_indicator/StepIndicator.tscn")

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


func test_theme_has_detail_variations() -> void:
	var theme: Theme = load(ProjectSettings.get_setting("gui/theme/custom"))
	var labels: PackedStringArray = theme.get_type_variation_list("Label")
	for v in ["DisplayM", "BodySmall", "SectionLabel", "ChipText", "AllergenCaption", "AllergenText",
			"AllergenIcon", "NutritionValue", "NutritionValueAccent", "NutritionLabel", "StepText", "LogoTextSmall"]:
		assert_true(labels.has(v), "Label variation " + v)
	var panels: PackedStringArray = theme.get_type_variation_list("PanelContainer")
	for v in ["ChipPanel", "AllergenPanel", "AllergenIconPanel", "NutritionTilePanel", "LogoTileSmall"]:
		assert_true(panels.has(v), "Panel variation " + v)
	var buttons: PackedStringArray = theme.get_type_variation_list("Button")
	for v in ["BackPill", "GhostButtonMuted", "PrimaryButtonM"]:
		assert_true(buttons.has(v), "Button variation " + v)


func test_allergen_banner() -> void:
	var banner := _add(AllergenBannerScene.instantiate())
	banner.set_allergens(["Peanuts", "Milk"])
	assert_true(banner.visible, "visible with allergens")
	assert_eq(banner.get_text(), "CONTAINS PEANUTS, MILK", "text")
	banner.set_allergens([])
	assert_false(banner.visible, "hidden when none declared")


func test_nutrition_tile() -> void:
	var tile := _add(NutritionTileScene.instantiate())
	tile.set_value("32g", "PROTEIN", true)
	assert_eq(tile.get_value_variation(), &"NutritionValueAccent", "accent")
	assert_eq(tile.get_value_text(), "32g", "value")
	assert_eq(tile.get_label_text(), "PROTEIN", "label")
	tile.set_value("480", "KCAL", false)
	assert_eq(tile.get_value_variation(), &"NutritionValue", "plain")


func test_step_indicator() -> void:
	var step := _add(StepIndicatorScene.instantiate())
	assert_eq(step.get_text(), "STEP 1 OF 2", "step text")
	assert_eq(step.get_logo_text(), String(ConfigManager.get_tenant().logo_text), "logo")


func test_chip() -> void:
	var chip := _add(ChipScene.instantiate())
	chip.set_text("Banana")
	assert_eq(chip.get_text(), "Banana")


func test_mock_ingredient_data() -> void:
	var cfg := load_mock_config()
	assert_true(find_flavor(cfg, "guava").ingredients.size() >= 8, "guava has 8+ ingredients")
	assert_eq(find_flavor(cfg, "electro").allergens.size(), 0, "electro declares no allergens")
