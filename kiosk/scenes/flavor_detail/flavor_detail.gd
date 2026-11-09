extends Control
## Ingredients & Allergens (PDF page 3): what's in the selected drink, then Back or
## Proceed to Pay. Deliberately does NOT check maintenance: idle is the only
## enforcement point.

const StepIndicatorScene := preload("res://ui/components/step_indicator/StepIndicator.tscn")
const AllergenBannerScene := preload("res://ui/components/allergen_banner/AllergenBanner.tscn")
const ChipScene := preload("res://ui/components/chip/Chip.tscn")
const NutritionTileScene := preload("res://ui/components/nutrition_tile/NutritionTile.tscn")

const NUTRITION := [
	# [key, label message key, grams?, accent?]
	["kcal", "nutrition_kcal", false, false],
	["protein_g", "nutrition_protein", true, true],
	["carbs_g", "nutrition_carbs", true, false],
	["fat_g", "nutrition_fat", true, false],
]

var _flavor: Dictionary = {}
var _image: TextureRect
var _placeholder: Label
var _name: Label
var _description: Label
var _price: Label
var _banner_section: VBoxContainer
var _banner: PanelContainer
var _ingredients_section: VBoxContainer
var _chips: HFlowContainer
var _nutrition_section: VBoxContainer
var _tiles: Array[Node] = []
var _back_top: Button
var _back_bottom: Button
var _proceed_button: Button
var _inactivity: Timer


func _ready() -> void:
	if not OrderState.has_selection():
		Nav.go_idle.call_deferred()
		return
	_build()
	_render(OrderState.selected_flavor)
	ConfigManager.config_ready.connect(_on_config_ready)
	FlavorImages.flavor_image_ready.connect(_on_flavor_image_ready)
	_inactivity = Timer.new()
	_inactivity.one_shot = true
	_inactivity.wait_time = maxf(ConfigManager.get_timing("detail_screen_inactivity_sec", 60.0), 0.05)
	_inactivity.timeout.connect(Nav.go_idle)
	add_child(_inactivity)
	_inactivity.start()


func _input(event: InputEvent) -> void:
	var touched: bool = (event is InputEventMouseButton and event.pressed) \
		or event is InputEventScreenTouch or event is InputEventScreenDrag
	if touched and _inactivity:
		_inactivity.start()


func _render(flavor: Dictionary) -> void:
	_flavor = flavor
	_apply_image()
	_placeholder.text = String(ConfigManager.get_tenant().get("logo_text", ""))

	_name.text = String(flavor.get("name", ""))
	var parts: PackedStringArray = []
	if String(flavor.get("description", "")) != "":
		parts.append(flavor.description)
	if int(flavor.get("volume_ml", 0)) > 0:
		parts.append(ConfigManager.get_message("detail_volume", {"volume_ml": int(flavor.volume_ml)}))
	_description.text = " ".join(parts)
	_description.visible = not parts.is_empty()
	var price := Fmt.rupees(ConfigManager.get_charge_price(flavor))
	_price.text = price
	_proceed_button.text = ConfigManager.get_message("proceed_to_pay", {"price": price})
	_proceed_button.disabled = _default_base_id() == ""

	var allergens: Array = flavor.get("allergens", [])
	_banner.set_allergens(allergens)
	_banner_section.visible = not allergens.is_empty()

	for chip in _chips.get_children():
		_chips.remove_child(chip)
		chip.queue_free()
	var ingredients: Array = flavor.get("ingredients", [])
	for ingredient in ingredients:
		var chip := ChipScene.instantiate()
		chip.set_text(str(ingredient))
		_chips.add_child(chip)
	_ingredients_section.visible = not ingredients.is_empty()

	var nutrition: Dictionary = flavor.get("nutrition", {})
	_nutrition_section.visible = not nutrition.is_empty()
	for i in NUTRITION.size():
		var spec: Array = NUTRITION[i]
		var value := ConfigManager.get_message("nutrition_missing")
		if nutrition.has(spec[0]) and nutrition[spec[0]] != null:
			var n := int(nutrition[spec[0]])
			value = ConfigManager.get_message("nutrition_grams", {"value": n}) if spec[2] else str(n)
		_tiles[i].set_value(value, ConfigManager.get_message(spec[1]), spec[3])


func get_image_texture() -> Texture2D:
	return _image.texture


## Plan §3.14 show order (FlavorImages); the placeholder when there's nothing to show.
func _apply_image() -> void:
	var texture := FlavorImages.get_texture(_flavor)
	_image.texture = texture
	_image.visible = texture != null
	_placeholder.visible = texture == null


## A finished download swaps the image in place: no re-render, the order is untouched.
func _on_flavor_image_ready(flavor_id: String) -> void:
	if flavor_id == String(_flavor.get("id", "")):
		_apply_image()


func _on_config_ready(_config: Dictionary) -> void:
	var id: String = _flavor.get("id", "")
	for f in ConfigManager.get_flavors():
		if f.id == id and ConfigManager.is_orderable(f):
			OrderState.select_flavor(f)
			_render(f)
			return
	_back()


func _back() -> void:
	OrderState.reset()
	Nav.go(ScenePaths.FLAVOR_SELECT)


## Proceed to Pay is the order commitment point: price and base are fixed here
## (the design has no base step) and the payment screen reads them.
func _proceed() -> void:
	var flavor := OrderState.selected_flavor
	if not ConfigManager.is_orderable(flavor):
		_back()
		return
	var base_id := _default_base_id()
	if base_id == "":
		return
	_proceed_button.disabled = true
	OrderState.charged_price = ConfigManager.get_charge_price(flavor)
	OrderState.selected_base_id = base_id
	OrderState.order_id = Ulid.generate()
	OrderState.order_number = OrderCounter.next()
	Nav.go(ScenePaths.PAYMENT)


func _default_base_id() -> String:
	for base in ConfigManager.current_config.get("bases", []):
		if base.get("enabled", false):
			return String(base.get("id", ""))
	return ""


# --- Test/introspection helpers ----------------------------------------------

func get_name_text() -> String:
	return _name.text if _name else ""


func get_description_text() -> String:
	return _description.text


func get_price_text() -> String:
	return _price.text


func get_proceed_text() -> String:
	return _proceed_button.text


func get_chip_texts() -> PackedStringArray:
	var out: PackedStringArray = []
	for chip in _chips.get_children():
		out.append(chip.get_text())
	return out


func is_banner_visible() -> bool:
	return _banner_section.visible


func get_banner_text() -> String:
	return _banner.get_text()


func is_ingredients_visible() -> bool:
	return _ingredients_section.visible


func is_nutrition_visible() -> bool:
	return _nutrition_section.visible


func get_tile_texts() -> Array:
	return _tiles.map(func(t: Node) -> Array: return [t.get_value_text(), t.get_label_text()])


func get_tile(index: int) -> Node:
	return _tiles[index]


func get_name_label() -> Label:
	return _name


func press_back_top() -> void:
	_back_top.pressed.emit()


func press_back_bottom() -> void:
	_back_bottom.pressed.emit()


func press_proceed() -> void:
	if not _proceed_button.disabled:
		_proceed_button.pressed.emit()


func is_proceed_disabled() -> bool:
	return _proceed_button.disabled


# --- Layout ------------------------------------------------------------------

func _build() -> void:
	var bg := ColorRect.new()
	bg.color = Palette.BG
	bg.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	bg.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(bg)

	var root := VBoxContainer.new()
	root.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	root.add_theme_constant_override("separation", 0)
	add_child(root)

	var body := _margin(Palette.PAD, 48, 0)
	body.size_flags_vertical = Control.SIZE_EXPAND_FILL
	root.add_child(body)
	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 0)
	body.add_child(col)

	var top := HBoxContainer.new()
	top.name = "TopRow"
	col.add_child(top)
	_back_top = Button.new()
	_back_top.name = "BackPill"
	_back_top.theme_type_variation = &"BackPill"
	_back_top.text = "←  " + ConfigManager.get_message("back")
	_back_top.custom_minimum_size = Vector2(196, 80)
	_back_top.focus_mode = Control.FOCUS_NONE
	_back_top.pressed.connect(_back)
	top.add_child(_back_top)
	top.add_child(_expander())
	var step := StepIndicatorScene.instantiate()
	step.step = 1
	step.total = 2
	top.add_child(step)

	col.add_child(_gap(36))
	var hero := HBoxContainer.new()
	hero.name = "HeroRow"
	hero.add_theme_constant_override("separation", 40)
	col.add_child(hero)
	var image_area := Control.new()
	image_area.custom_minimum_size = Vector2(340, 326)
	image_area.clip_contents = true
	hero.add_child(image_area)
	_image = TextureRect.new()
	_image.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	_image.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	_image.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	image_area.add_child(_image)
	_placeholder = Label.new()
	_placeholder.theme_type_variation = &"LogoText"
	_placeholder.add_theme_color_override("font_color", Palette.TEXT_DIM)
	_placeholder.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_placeholder.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_placeholder.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	image_area.add_child(_placeholder)
	var info := VBoxContainer.new()
	info.add_theme_constant_override("separation", 18)
	info.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	info.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	hero.add_child(info)
	_name = Label.new()
	_name.name = "Name"
	_name.theme_type_variation = &"DisplayM"
	_name.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_name.max_lines_visible = 3
	_name.custom_minimum_size.x = 100
	info.add_child(_name)
	_description = Label.new()
	_description.name = "Description"
	_description.theme_type_variation = &"BodySmall"
	_description.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_description.custom_minimum_size.x = 100
	info.add_child(_description)
	_price = Label.new()
	_price.name = "Price"
	_price.theme_type_variation = &"Price"
	info.add_child(_price)

	_banner_section = _section(col, "BannerSection", 52)
	_banner = AllergenBannerScene.instantiate()
	_banner_section.add_child(_banner)

	_ingredients_section = _section(col, "IngredientsSection", 50)
	_ingredients_section.add_child(_section_label("detail_ingredients"))
	_ingredients_section.add_child(_gap(20))
	_chips = HFlowContainer.new()
	_chips.name = "Chips"
	_chips.add_theme_constant_override("h_separation", 18)
	_chips.add_theme_constant_override("v_separation", 18)
	_ingredients_section.add_child(_chips)

	_nutrition_section = _section(col, "NutritionSection", 58)
	_nutrition_section.add_child(_section_label("detail_nutrition"))
	_nutrition_section.add_child(_gap(20))
	var tiles := HBoxContainer.new()
	tiles.add_theme_constant_override("separation", 18)
	_nutrition_section.add_child(tiles)
	for i in NUTRITION.size():
		var tile := NutritionTileScene.instantiate()
		tiles.add_child(tile)
		_tiles.append(tile)

	var line := ColorRect.new()
	line.color = Palette.BORDER
	line.custom_minimum_size.y = 2
	root.add_child(line)
	var bar := _margin(Palette.PAD, 38, 52)
	root.add_child(bar)
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 24)
	bar.add_child(row)
	_back_bottom = Button.new()
	_back_bottom.name = "BackButton"
	_back_bottom.theme_type_variation = &"GhostButtonMuted"
	_back_bottom.text = ConfigManager.get_message("back")
	_back_bottom.custom_minimum_size = Vector2(284, 130)
	_back_bottom.focus_mode = Control.FOCUS_NONE
	_back_bottom.pressed.connect(_back)
	row.add_child(_back_bottom)
	_proceed_button = Button.new()
	_proceed_button.name = "ProceedButton"
	_proceed_button.theme_type_variation = &"PrimaryButtonM"
	_proceed_button.custom_minimum_size.y = 130
	_proceed_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_proceed_button.focus_mode = Control.FOCUS_NONE
	_proceed_button.pressed.connect(_proceed)
	row.add_child(_proceed_button)


## A VBox whose leading gap collapses with it when hidden.
func _section(parent: Container, section_name: String, gap: int) -> VBoxContainer:
	var section := VBoxContainer.new()
	section.name = section_name
	section.add_theme_constant_override("separation", 0)
	section.add_child(_gap(gap))
	parent.add_child(section)
	return section


func _section_label(key: String) -> Label:
	var l := Label.new()
	l.theme_type_variation = &"SectionLabel"
	l.text = ConfigManager.get_message(key)
	return l


func _margin(side: int, top: int, bottom: int) -> MarginContainer:
	var m := MarginContainer.new()
	m.add_theme_constant_override("margin_left", side)
	m.add_theme_constant_override("margin_right", side)
	m.add_theme_constant_override("margin_top", top)
	m.add_theme_constant_override("margin_bottom", bottom)
	return m


func _gap(height: int) -> Control:
	var c := Control.new()
	c.custom_minimum_size.y = height
	c.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return c


func _expander() -> Control:
	var c := Control.new()
	c.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	return c
