extends VBoxContainer
## Hairline + mono message on the left, connectivity status on the right.

const ConnectivityStatusScene := preload("res://ui/components/connectivity_status/ConnectivityStatus.tscn")

@export var left_key := "listing_footer"
@export var ready_key := "status_machine_ready"
@export var show_status := true

var _left: Label


func _init() -> void:
	add_theme_constant_override("separation", 0)
	mouse_filter = Control.MOUSE_FILTER_IGNORE


func _ready() -> void:
	var line := ColorRect.new()
	line.color = Palette.BORDER
	line.custom_minimum_size.y = 2
	add_child(line)
	var margin := MarginContainer.new()
	for side in ["left", "right"]:
		margin.add_theme_constant_override("margin_" + side, Palette.PAD)
	for side in ["top", "bottom"]:
		margin.add_theme_constant_override("margin_" + side, 36)
	add_child(margin)
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 24)
	margin.add_child(row)
	_left = Label.new()
	_left.name = "Left"
	_left.theme_type_variation = &"MonoMuted"
	_left.add_theme_font_size_override("font_size", 22)
	_left.text = ConfigManager.get_message(left_key)
	row.add_child(_left)
	var spacer := Control.new()
	spacer.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(spacer)
	if show_status:
		var status := ConnectivityStatusScene.instantiate()
		status.name = "Status"
		status.ready_key = ready_key
		row.add_child(status)
