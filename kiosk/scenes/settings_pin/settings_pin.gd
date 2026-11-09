extends Control
## PIN pad in front of settings (docs/stories/settings, SET-02). Unbranded, like maintenance.
## The 6th digit submits. Checked on the machine only (PinStore), so it works offline.
## Back or settings_pin_inactivity_sec without a touch returns to idle.

var store: PinStore          # tests inject one; otherwise PinStore.from_settings()
var report_event: Callable   # tests capture events; otherwise TelemetryReporter.report_event

var _typed := ""
var _done := false
var _dots: Array[StatusDot] = []
var _keys: Array[Button] = []
var _message: Label
var _back: Button
var _message_timer: Timer
var _inactivity: Timer


func _ready() -> void:
	if store == null:
		store = PinStore.from_settings()
	if not report_event.is_valid():
		report_event = TelemetryReporter.report_event
	_build()
	_message_timer = Timer.new()
	_message_timer.one_shot = true
	_message_timer.timeout.connect(_refresh)
	add_child(_message_timer)
	_inactivity = Timer.new()
	_inactivity.one_shot = true
	_inactivity.wait_time = maxf(ConfigManager.get_timing("settings_pin_inactivity_sec", 30.0), 0.05)
	_inactivity.timeout.connect(_leave)
	add_child(_inactivity)
	_inactivity.start()
	var lock_tick := Timer.new()   # the minutes left, and unlocking when the lock ends
	lock_tick.wait_time = 1.0
	lock_tick.autostart = true
	lock_tick.timeout.connect(func() -> void: if _message_timer.is_stopped(): _refresh())
	add_child(lock_tick)
	_refresh()


func _input(event: InputEvent) -> void:
	if (event is InputEventMouseButton or event is InputEventScreenTouch) and event.pressed:
		_inactivity.start()


# --- For tests ---------------------------------------------------------------

func press_digit(digit: String) -> void:
	_on_digit(digit)


func press_delete() -> void:
	_on_delete()


func press_back() -> void:
	_back.pressed.emit()


func get_key(label: String) -> Button:
	for key in _keys:
		if key.text == label:
			return key
	return null


func get_typed_length() -> int:
	return _typed.length()


func get_message_text() -> String:
	return _message.text


func is_keypad_enabled() -> bool:
	return not _keys[0].disabled


# --- Behaviour ---------------------------------------------------------------

func _on_digit(digit: String) -> void:
	_inactivity.start()
	if _done or not is_keypad_enabled() or _typed.length() >= store.pin_length:
		return
	if not _message_timer.is_stopped():   # typing again hides "Wrong PIN"
		_message_timer.stop()
		_message.text = ""
	_typed += digit
	_render_dots()
	if _typed.length() == store.pin_length:
		_submit()


func _on_delete() -> void:
	_inactivity.start()
	if _typed.is_empty():
		return
	_typed = _typed.left(-1)
	_render_dots()


func _submit() -> void:
	var result := store.check(_typed)
	_typed = ""
	_render_dots()
	match result:
		"ok":
			_done = true
			report_event.call({"event_type": "settings_opened"})
			Nav.go(ScenePaths.SETTINGS)
		"wrong":
			report_event.call({"event_type": "settings_pin_failed", "attempt": store.last_attempt})
			_message.text = ConfigManager.get_message("settings_pin_wrong")
			_message_timer.start(maxf(ConfigManager.get_timing("settings_error_return_sec", 3.0), 0.05))
		"locked":
			if store.last_attempt > 0:   # this attempt started the lock
				report_event.call({"event_type": "settings_pin_failed", "attempt": store.last_attempt})
				report_event.call({"event_type": "settings_locked"})
			_refresh()
		_:
			_refresh()


## Keys and message from the store: not set up, locked (minutes left) or ready.
func _refresh() -> void:
	var enabled := true
	if not store.is_set():
		_message.text = ConfigManager.get_message("settings_pin_not_set")
		enabled = false
	elif store.locked_seconds_left() > 0:
		_message.text = ConfigManager.get_message("settings_pin_locked",
			{"minutes": ceili(store.locked_seconds_left() / 60.0)})
		enabled = false
	else:
		_message.text = ""
	for key in _keys:
		key.disabled = not enabled
		key.modulate.a = 1.0 if enabled else 0.35   # the theme's disabled style looks enabled


func _leave() -> void:
	if _done:
		return
	_done = true
	Nav.go_idle()


func _render_dots() -> void:
	for i in _dots.size():
		_dots[i].color = Palette.ACCENT if i < _typed.length() else Palette.BORDER


# --- Layout ------------------------------------------------------------------

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
	margin.add_theme_constant_override("margin_bottom", 96)
	add_child(margin)
	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 0)
	margin.add_child(col)

	var top := HBoxContainer.new()
	col.add_child(top)
	_back = Button.new()
	_back.name = "Back"
	_back.theme_type_variation = &"BackPill"
	_back.text = "←  " + ConfigManager.get_message("back")
	_back.custom_minimum_size = Vector2(196, 96)
	_back.focus_mode = Control.FOCUS_NONE
	_back.pressed.connect(_leave)
	top.add_child(_back)

	col.add_child(_gap(160))
	var title := Label.new()
	title.theme_type_variation = &"DisplayM"
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	title.text = ConfigManager.get_message("settings_pin_title")
	col.add_child(title)

	col.add_child(_gap(56))
	var dots := HBoxContainer.new()
	dots.name = "Dots"
	dots.alignment = BoxContainer.ALIGNMENT_CENTER
	dots.add_theme_constant_override("separation", 36)
	col.add_child(dots)
	for i in store.pin_length:
		var dot := StatusDot.new()
		dot.diameter = 36
		dot.color = Palette.BORDER
		dots.add_child(dot)
		_dots.append(dot)

	col.add_child(_gap(40))
	_message = Label.new()
	_message.name = "Message"
	_message.theme_type_variation = &"MonoWarning"
	_message.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_message.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_message.custom_minimum_size.y = 96
	col.add_child(_message)

	col.add_child(_gap(56))
	var center := CenterContainer.new()
	col.add_child(center)
	var grid := GridContainer.new()
	grid.name = "Keypad"
	grid.columns = 3
	grid.add_theme_constant_override("h_separation", 32)
	grid.add_theme_constant_override("v_separation", 32)
	center.add_child(grid)
	for label in ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "DEL"]:
		if label == "":
			grid.add_child(Control.new())
			continue
		var key := Button.new()
		key.theme_type_variation = &"GhostButton"
		key.custom_minimum_size = Vector2(240, 180)
		key.focus_mode = Control.FOCUS_NONE
		if label == "DEL":
			key.text = ConfigManager.get_message("settings_pin_delete")
			key.pressed.connect(_on_delete)
		else:
			key.text = label
			key.add_theme_font_size_override("font_size", 72)
			key.pressed.connect(_on_digit.bind(label))
		grid.add_child(key)
		_keys.append(key)


func _gap(height: int) -> Control:
	var c := Control.new()
	c.custom_minimum_size.y = height
	return c
