extends PanelContainer
## Amber "ALLERGEN WARNING / CONTAINS …" banner. Hidden when nothing is declared:
## the screen never claims a drink is allergen-free.

var _text: Label


func _init() -> void:
	theme_type_variation = &"AllergenPanel"
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 28)
	add_child(row)

	var icon := PanelContainer.new()
	icon.name = "Icon"
	icon.theme_type_variation = &"AllergenIconPanel"
	icon.custom_minimum_size = Vector2(80, 80)
	icon.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	row.add_child(icon)
	var mark := Label.new()
	mark.theme_type_variation = &"AllergenIcon"
	mark.text = "!"
	mark.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	mark.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	icon.add_child(mark)

	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 2)
	col.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	col.alignment = BoxContainer.ALIGNMENT_CENTER
	row.add_child(col)
	var caption := Label.new()
	caption.name = "Caption"
	caption.theme_type_variation = &"AllergenCaption"
	caption.text = ConfigManager.get_message("allergen_caption")
	col.add_child(caption)
	_text = Label.new()
	_text.name = "Text"
	_text.theme_type_variation = &"AllergenText"
	_text.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	col.add_child(_text)


func set_allergens(list: Array) -> void:
	var names: PackedStringArray = []
	for item in list:
		names.append(str(item))
	_text.text = ConfigManager.get_message("allergen_contains", {"list": ", ".join(names).to_upper()})
	visible = not names.is_empty()


func get_text() -> String:
	return _text.text
