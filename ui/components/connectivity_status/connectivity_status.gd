extends HBoxContainer
## "● READY" / "● OFFLINE" indicator driven by ConfigManager connectivity.

@export var ready_key := "status_ready"

var _dot: StatusDot
var _label: Label


func _init() -> void:
	add_theme_constant_override("separation", 14)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	_dot = StatusDot.new()
	_dot.name = "Dot"
	add_child(_dot)
	_label = Label.new()
	_label.name = "Label"
	add_child(_label)


func _ready() -> void:
	ConfigManager.config_ready.connect(func(_c: Dictionary) -> void: _refresh())
	ConfigManager.connectivity_changed.connect(func(_o: bool) -> void: _refresh())
	_refresh()


func _refresh() -> void:
	apply(ConfigManager.config_loaded, ConfigManager.is_online)


## Ready until a fetch has actually finished and failed, so boot doesn't flash OFFLINE.
func apply(loaded: bool, online: bool) -> void:
	var ready := not loaded or online
	_dot.color = Palette.ACCENT if ready else Palette.WARNING
	_label.theme_type_variation = &"MonoAccent" if ready else &"MonoWarning"
	_label.text = ConfigManager.get_message(ready_key if ready else "status_offline")


func get_text() -> String:
	return _label.text
