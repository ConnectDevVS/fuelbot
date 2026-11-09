extends PanelContainer
## One nutrition figure (big value + small mono label).

var _value: Label
var _label: Label


func _init() -> void:
	theme_type_variation = &"NutritionTilePanel"
	size_flags_horizontal = Control.SIZE_EXPAND_FILL
	size_flags_stretch_ratio = 1.0
	custom_minimum_size.y = 146
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 6)
	add_child(col)
	_value = Label.new()
	_value.name = "Value"
	_value.theme_type_variation = &"NutritionValue"
	col.add_child(_value)
	_label = Label.new()
	_label.name = "Label"
	_label.theme_type_variation = &"NutritionLabel"
	col.add_child(_label)


func set_value(value_text: String, label_text: String, accent: bool) -> void:
	_value.text = value_text
	_value.theme_type_variation = &"NutritionValueAccent" if accent else &"NutritionValue"
	_label.text = label_text


func get_value_text() -> String:
	return _value.text


func get_label_text() -> String:
	return _label.text


func get_value_variation() -> StringName:
	return _value.theme_type_variation
