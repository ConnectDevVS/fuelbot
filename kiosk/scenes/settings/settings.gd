extends Control
## Settings (docs/stories/settings). Opened only from the PIN pad. SET-02 placeholder: the
## title and Exit; SET-04 adds the grid, the Wi-Fi list and the password page.
## Exit or settings_inactivity_sec without a touch returns to idle.

var _exit: Button
var _inactivity: Timer
var _done := false


func _ready() -> void:
	_build()
	_inactivity = Timer.new()
	_inactivity.one_shot = true
	_inactivity.wait_time = maxf(ConfigManager.get_timing("settings_inactivity_sec", 60.0), 0.05)
	_inactivity.timeout.connect(_leave)
	add_child(_inactivity)
	_inactivity.start()


func _input(event: InputEvent) -> void:
	if (event is InputEventMouseButton or event is InputEventScreenTouch) and event.pressed:
		_inactivity.start()


func press_exit() -> void:
	_exit.pressed.emit()


func _leave() -> void:
	if _done:
		return
	_done = true
	Nav.go_idle()


func _build() -> void:
	var bg := ColorRect.new()
	bg.color = Palette.BG
	bg.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(bg)

	var margin := MarginContainer.new()
	margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	margin.add_theme_constant_override("margin_left", Palette.PAD)
	margin.add_theme_constant_override("margin_right", Palette.PAD)
	margin.add_theme_constant_override("margin_top", 68)
	add_child(margin)
	var top := HBoxContainer.new()
	top.size_flags_vertical = Control.SIZE_SHRINK_BEGIN
	margin.add_child(top)
	var title := Label.new()
	title.theme_type_variation = &"DisplayM"
	title.text = ConfigManager.get_message("settings_title")
	title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	top.add_child(title)
	_exit = Button.new()
	_exit.name = "Exit"
	_exit.theme_type_variation = &"BackPill"
	_exit.text = ConfigManager.get_message("settings_exit")
	_exit.custom_minimum_size = Vector2(196, 96)
	_exit.focus_mode = Control.FOCUS_NONE
	_exit.pressed.connect(_leave)
	top.add_child(_exit)
