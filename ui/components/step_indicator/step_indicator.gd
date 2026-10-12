extends HBoxContainer
## Small tenant logo tile + "STEP n OF m".

@export var step := 1
@export var total := 2

var _logo: Label
var _text: Label


func _init() -> void:
	add_theme_constant_override("separation", 16)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	var tile := PanelContainer.new()
	tile.name = "LogoTile"
	tile.theme_type_variation = &"LogoTileSmall"
	tile.custom_minimum_size = Vector2(54, 54)
	tile.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	add_child(tile)
	_logo = Label.new()
	_logo.theme_type_variation = &"LogoTextSmall"
	_logo.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_logo.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	tile.add_child(_logo)
	_text = Label.new()
	_text.name = "Text"
	_text.theme_type_variation = &"StepText"
	_text.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	add_child(_text)


func _ready() -> void:
	ConfigManager.config_ready.connect(func(_c: Dictionary) -> void: refresh())
	refresh()


func refresh() -> void:
	_logo.text = String(ConfigManager.get_tenant().get("logo_text", ""))
	_text.text = ConfigManager.get_message("step_indicator", {"step": step, "total": total})


func get_text() -> String:
	return _text.text


func get_logo_text() -> String:
	return _logo.text
