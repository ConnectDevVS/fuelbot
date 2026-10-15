extends PanelContainer
## One drink tile on the listing: image, name, nutrition line, price or SOLD OUT.

signal selected(flavor: Dictionary)

var flavor: Dictionary = {}

var _content: VBoxContainer
var _image: TextureRect
var _placeholder: PanelContainer
var _placeholder_label: Label
var _badge: PanelContainer
var _badge_label: Label
var _name: Label
var _meta: Label
var _price: Label
var _tap: Label
var _pressed := false
var _tween: Tween


func _init() -> void:
	theme_type_variation = &"CardPanel"
	mouse_filter = Control.MOUSE_FILTER_STOP
	custom_minimum_size.y = 424
	size_flags_horizontal = Control.SIZE_EXPAND_FILL

	_content = VBoxContainer.new()
	_content.name = "Content"
	_content.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_content.add_theme_constant_override("separation", 10)
	add_child(_content)

	var image_area := Control.new()
	image_area.name = "ImageArea"
	image_area.custom_minimum_size.y = 160
	image_area.size_flags_vertical = Control.SIZE_EXPAND_FILL
	image_area.clip_contents = true
	image_area.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_content.add_child(image_area)

	_image = TextureRect.new()
	_image.name = "Image"
	_image.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	_image.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	_image.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_image.mouse_filter = Control.MOUSE_FILTER_IGNORE
	image_area.add_child(_image)

	_placeholder = PanelContainer.new()
	_placeholder.name = "Placeholder"
	var ph_box := StyleBoxFlat.new()
	ph_box.bg_color = Palette.SURFACE_RAISED
	ph_box.set_corner_radius_all(Palette.RADIUS_PANEL)
	_placeholder.add_theme_stylebox_override("panel", ph_box)
	_placeholder.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_placeholder.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_placeholder.visible = false
	image_area.add_child(_placeholder)
	_placeholder_label = Label.new()
	_placeholder_label.theme_type_variation = &"LogoText"
	_placeholder_label.add_theme_color_override("font_color", Palette.TEXT_DIM)
	_placeholder_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_placeholder_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_placeholder.add_child(_placeholder_label)

	_badge = PanelContainer.new()
	_badge.name = "Badge"
	_badge.theme_type_variation = &"BadgePanel"
	_badge.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_badge.visible = false
	image_area.add_child(_badge)
	_badge_label = Label.new()
	_badge_label.theme_type_variation = &"BadgeText"
	_badge.add_child(_badge_label)

	_name = Label.new()
	_name.name = "Name"
	_name.theme_type_variation = &"Heading"
	_name.clip_text = true
	_name.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	_content.add_child(_name)

	_meta = Label.new()
	_meta.name = "Meta"
	_meta.theme_type_variation = &"Mono"
	_content.add_child(_meta)

	var row := HBoxContainer.new()
	row.name = "Row"
	row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_content.add_child(row)
	_price = Label.new()
	_price.name = "Price"
	row.add_child(_price)
	var spacer := Control.new()
	spacer.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	spacer.mouse_filter = Control.MOUSE_FILTER_IGNORE
	row.add_child(spacer)
	_tap = Label.new()
	_tap.name = "Tap"
	_tap.theme_type_variation = &"Mono"
	_tap.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	row.add_child(_tap)


func set_flavor(f: Dictionary) -> void:
	flavor = f
	var orderable := ConfigManager.is_orderable(f)
	var badge = f.get("badge")
	theme_type_variation = &"CardPanelPopular" if badge != null and orderable else &"CardPanel"
	_badge.visible = badge != null and orderable
	_badge_label.text = str(badge) if badge != null else ""

	_apply_image()
	_placeholder_label.text = String(ConfigManager.get_tenant().get("logo_text", ""))

	_name.text = String(f.get("name", ""))
	_name.theme_type_variation = &"Heading" if orderable else &"HeadingDim"
	var nutrition: Dictionary = f.get("nutrition", {})
	_meta.visible = nutrition.has("protein_g") and nutrition.has("kcal")
	if _meta.visible:
		_meta.text = ConfigManager.get_message("card_meta", {
			"protein_g": int(nutrition.protein_g), "kcal": int(nutrition.kcal)})

	if orderable:
		_price.theme_type_variation = &"Price"
		_price.text = Fmt.rupees(ConfigManager.get_charge_price(f))
	else:
		_price.theme_type_variation = &"PriceSoldOut"
		_price.text = ConfigManager.get_message("card_sold_out")
	_tap.visible = orderable
	_tap.text = ConfigManager.get_message("card_tap")
	_content.modulate.a = 1.0 if orderable else 0.45
	mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND if orderable else Control.CURSOR_ARROW


func _ready() -> void:
	FlavorImages.flavor_image_ready.connect(_on_flavor_image_ready)


func get_image_texture() -> Texture2D:
	return _image.texture


## Plan §3.14 show order (FlavorImages); the placeholder when there's nothing to show.
func _apply_image() -> void:
	var texture := FlavorImages.get_texture(flavor)
	_image.texture = texture
	_image.visible = texture != null
	_placeholder.visible = texture == null


## A finished download swaps the image in place: no rebuild.
func _on_flavor_image_ready(flavor_id: String) -> void:
	if flavor_id == String(flavor.get("id", "")):
		_apply_image()


func _gui_input(event: InputEvent) -> void:
	if not (event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT):
		return
	if not ConfigManager.is_orderable(flavor):
		return
	if event.pressed:
		_pressed = true
		_animate_scale(0.98)
	elif _pressed:
		_pressed = false
		_animate_scale(1.0)
		if Rect2(Vector2.ZERO, size).has_point(event.position):
			selected.emit(flavor)
	accept_event()


func _animate_scale(target: float) -> void:
	pivot_offset = size / 2.0
	if _tween:
		_tween.kill()
	if not is_inside_tree():
		scale = Vector2(target, target)
		return
	_tween = create_tween()
	_tween.tween_property(self, "scale", Vector2(target, target), 0.08)
