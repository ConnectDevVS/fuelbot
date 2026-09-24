extends PanelContainer
## Rounded pill showing one ingredient.

var _label: Label


func _init() -> void:
	theme_type_variation = &"ChipPanel"
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	_label = Label.new()
	_label.name = "Text"
	_label.theme_type_variation = &"ChipText"
	add_child(_label)


func set_text(text: String) -> void:
	_label.text = text


func get_text() -> String:
	return _label.text
