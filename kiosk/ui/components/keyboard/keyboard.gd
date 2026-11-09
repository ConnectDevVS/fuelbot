class_name OnScreenKeyboard
extends PanelContainer
## On-screen keyboard (docs/stories/settings, SET-03): Godot shows a system keyboard only on
## mobile, so the Pi needs its own. Three layers (lower, upper, symbols) cover all printable
## ASCII, which is what Wi-Fi passwords use. It owns the text; the page owns the field showing
## it. A USB keyboard types into the same text. Never log the text.

signal text_changed(text: String)
signal submitted(text: String)

## Row layouts, 10 units wide. One character = a key; "@name" = a special key or a gap.
const LETTERS := [
	["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"],
	["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"],
	["@gap0.5", "a", "s", "d", "f", "g", "h", "j", "k", "l", "@gap0.5"],
	["@shift", "z", "x", "c", "v", "b", "n", "m", "@del"],
	["@layer", "@space", "@submit"],
]
const SYMBOLS := [
	["!", "@", "#", "$", "%", "^", "&", "*", "(", ")"],
	["-", "_", "=", "+", "[", "]", "{", "}", "\\", "|"],
	[";", ":", "'", "\"", ",", ".", "<", ">", "/", "?"],
	["@gap1.5", "`", "~", "@gap5", "@del"],
	["@layer", "@space", "@submit"],
]
const WIDTHS := {"@shift": 1.5, "@del": 1.5, "@layer": 2.0, "@space": 5.0, "@submit": 3.0}
const KEY_HEIGHT := 110
const GAP := 8
const REPEAT_DELAY_SEC := 0.5
const REPEAT_EVERY_SEC := 0.08

var max_length := 63

var _text := ""
var _symbols := false
var _shift := "off"            # "off", "once" (next letter only) or "caps"
var _submit_label := ""
var _submit_enabled := true
var _rows: VBoxContainer
var _repeat: Timer


func _ready() -> void:
	var panel := StyleBoxFlat.new()
	panel.bg_color = Palette.SURFACE
	panel.border_color = Palette.BORDER
	panel.border_width_top = 2
	panel.set_content_margin_all(16)
	add_theme_stylebox_override("panel", panel)
	_rows = VBoxContainer.new()
	_rows.add_theme_constant_override("separation", GAP)
	add_child(_rows)
	_repeat = Timer.new()
	_repeat.one_shot = true
	_repeat.timeout.connect(_on_repeat)
	add_child(_repeat)
	if _submit_label == "":
		_submit_label = ConfigManager.get_message("keyboard_submit")
	_rebuild()


func get_text() -> String:
	return _text


func clear() -> void:
	if _text.is_empty():
		return
	_text = ""
	text_changed.emit(_text)


func set_submit_label(label: String) -> void:
	_submit_label = label
	var key := get_key("submit")
	if key:
		key.text = label


func set_submit_enabled(enabled: bool) -> void:
	_submit_enabled = enabled
	var key := get_key("submit")
	if key:
		key.disabled = not enabled


## "lower", "upper" or "symbols".
func get_layer() -> String:
	return "symbols" if _symbols else ("lower" if _shift == "off" else "upper")


func get_shift() -> String:
	return _shift


## The key on the current layer: a character ("a", "@", " " is "space") or "shift", "del",
## "layer", "space", "submit". Null if it isn't on this layer.
func get_key(id: String) -> Button:
	if _rows == null:
		return null
	for row in _rows.get_children():
		for key in row.get_children():
			if key is Button and key.get_meta("key", "") == id:
				return key
	return null


func _unhandled_key_input(event: InputEvent) -> void:
	if not is_visible_in_tree() or not event.pressed:
		return
	var key := event as InputEventKey
	if key.keycode == KEY_BACKSPACE:
		_delete()
	elif key.keycode == KEY_ENTER or key.keycode == KEY_KP_ENTER:
		_submit()
	elif key.unicode >= 32 and key.unicode < 127:
		_type(char(key.unicode))
	else:
		return
	get_viewport().set_input_as_handled()


# --- Behaviour ---------------------------------------------------------------

func _type(c: String) -> void:
	if _text.length() >= max_length:
		return
	_text += c
	text_changed.emit(_text)
	if _shift == "once" and not _symbols:
		_shift = "off"
		_rebuild()


func _delete() -> void:
	if _text.is_empty():
		return
	_text = _text.left(-1)
	text_changed.emit(_text)


func _submit() -> void:
	if _submit_enabled:
		submitted.emit(_text)


func _on_shift() -> void:
	_shift = {"off": "once", "once": "caps", "caps": "off"}[_shift]
	_rebuild()


func _on_layer() -> void:
	_symbols = not _symbols
	_shift = "off"
	_rebuild()


func _on_delete_down() -> void:
	_delete()
	_repeat.start(REPEAT_DELAY_SEC)


func _on_delete_up() -> void:
	_repeat.stop()


func _on_repeat() -> void:
	_delete()
	_repeat.start(REPEAT_EVERY_SEC)


# --- Layout ------------------------------------------------------------------

func _rebuild() -> void:
	_repeat.stop()
	for row in _rows.get_children():
		_rows.remove_child(row)
		row.queue_free()
	var upper := _shift != "off"
	for spec in (SYMBOLS if _symbols else LETTERS):
		var row := HBoxContainer.new()
		row.add_theme_constant_override("separation", GAP)
		_rows.add_child(row)
		for item in spec:
			row.add_child(_make(item, upper))


func _make(item: String, upper: bool) -> Control:
	if item.begins_with("@gap"):
		var gap := Control.new()
		gap.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		gap.size_flags_stretch_ratio = float(item.trim_prefix("@gap"))
		gap.mouse_filter = Control.MOUSE_FILTER_IGNORE
		return gap
	var key := Button.new()
	key.theme_type_variation = &"GhostButton"
	key.custom_minimum_size = Vector2(0, KEY_HEIGHT)
	key.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	key.size_flags_stretch_ratio = WIDTHS.get(item, 1.0)
	key.focus_mode = Control.FOCUS_NONE
	key.clip_text = true
	match item if item.length() > 1 else "":
		"@shift":
			key.set_meta("key", "shift")
			key.text = "⇧"   # only JetBrains Mono has it
			key.add_theme_font_override("font", get_theme_font("font", &"Mono"))
			key.add_theme_font_size_override("font_size", 48)
			if _shift == "caps":
				key.theme_type_variation = &"PrimaryButtonM"
			elif _shift == "once":
				key.add_theme_color_override("font_color", Palette.ACCENT)
				key.add_theme_color_override("font_pressed_color", Palette.ACCENT)
			key.pressed.connect(_on_shift)
		"@del":
			key.set_meta("key", "del")
			key.text = ConfigManager.get_message("keyboard_delete")
			key.add_theme_font_size_override("font_size", 32)
			key.button_down.connect(_on_delete_down)
			key.button_up.connect(_on_delete_up)
		"@layer":
			key.set_meta("key", "layer")
			key.text = ConfigManager.get_message("keyboard_letters" if _symbols else "keyboard_symbols")
			key.add_theme_font_size_override("font_size", 32)
			key.pressed.connect(_on_layer)
		"@space":
			key.set_meta("key", "space")
			key.text = ConfigManager.get_message("keyboard_space")
			key.add_theme_font_size_override("font_size", 32)
			key.pressed.connect(_type.bind(" "))
		"@submit":
			key.set_meta("key", "submit")
			key.theme_type_variation = &"PrimaryButtonM"
			key.text = _submit_label
			key.disabled = not _submit_enabled
			key.pressed.connect(_submit)
		_:
			var c := item.to_upper() if upper else item
			key.set_meta("key", c)
			key.text = c
			key.add_theme_font_size_override("font_size", 44)
			key.pressed.connect(_type.bind(c))
	return key
