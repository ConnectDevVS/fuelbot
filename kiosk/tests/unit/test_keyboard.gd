extends TestCase
## The on-screen keyboard (settings SET-03).

const KeyboardScene := preload("res://ui/components/keyboard/Keyboard.tscn")

var _kb: OnScreenKeyboard


func before_each() -> void:
	_kb = KeyboardScene.instantiate()
	_kb.size = Vector2(1080, 0)
	add_child(_kb)


func after_each() -> void:
	if is_instance_valid(_kb):
		_kb.queue_free()
	await wait_frames(1)


func _press(id: String) -> void:
	var key := _kb.get_key(id)
	assert_true(key != null, "key '%s' on layer %s" % [id, _kb.get_layer()])
	if key:
		key.pressed.emit()


## Types any printable ASCII character the way a person would: switching layers and shift.
func _type_char(c: String) -> void:
	var lower := c.to_lower()
	var is_letter := lower != c.to_upper()
	var on_letters := is_letter or (c >= "0" and c <= "9") or c == " "
	if on_letters == (_kb.get_layer() == "symbols"):
		_press("layer")
	if c == " ":
		_press("space")
	elif is_letter and c != lower:
		_press("shift")
		_press(c)
	else:
		_press(c)


func _key_event(keycode: Key, unicode: int = 0) -> InputEventKey:
	var ev := InputEventKey.new()
	ev.pressed = true
	ev.keycode = keycode
	ev.unicode = unicode
	return ev


func test_typing_letters_and_digits() -> void:
	var changed := watch_signal(_kb, &"text_changed")
	for c in "wifi2026":
		_press(c)
	assert_eq(_kb.get_text(), "wifi2026", "text")
	assert_eq(changed.count, 8, "text_changed per key")
	assert_eq(_kb.get_layer(), "lower", "starts in lower case")


func test_shift_once_and_caps_lock() -> void:
	_press("shift")
	assert_eq(_kb.get_shift(), "once", "one shift")
	assert_eq(_kb.get_layer(), "upper", "upper case shown")
	_press("G")
	assert_eq(_kb.get_layer(), "lower", "back to lower after one letter")
	_press("y")
	_press("shift")
	_press("shift")
	assert_eq(_kb.get_shift(), "caps", "second tap = caps lock")
	_press("M")
	_press("X")
	assert_eq(_kb.get_layer(), "upper", "caps stays on")
	_press("shift")
	assert_eq(_kb.get_shift(), "off", "third tap = off")
	assert_eq(_kb.get_text(), "GyMX", "text")


func test_every_printable_ascii_character() -> void:
	_kb.max_length = 200   # 95 characters; the 63 limit has its own test
	var all := ""
	for code in range(32, 127):
		all += char(code)
	for c in all:
		_type_char(c)
	assert_eq(_kb.get_text().length(), all.length(), "length")
	assert_eq(_kb.get_text(), all, "all 95 printable ASCII characters")


func test_symbols_layer_and_back() -> void:
	_press("shift")
	_press("layer")
	assert_eq(_kb.get_layer(), "symbols", "symbols")
	assert_true(_kb.get_key("del") != null and _kb.get_key("submit") != null, "DEL and submit on symbols too")
	_press("@")
	_press("layer")
	assert_eq(_kb.get_layer(), "lower", "back to lower case (shift reset)")
	assert_eq(_kb.get_text(), "@", "text")


func test_max_length_and_delete() -> void:
	for i in 70:
		_press("a")
	assert_eq(_kb.get_text().length(), 63, "stops at 63 (WPA maximum)")
	_kb.clear()
	_kb.get_key("del").button_down.emit()
	_kb.get_key("del").button_up.emit()
	assert_eq(_kb.get_text(), "", "DEL on empty does nothing")


func test_held_delete_repeats() -> void:
	for c in "abcdefghij":
		_press(c)
	var del := _kb.get_key("del")
	del.button_down.emit()
	assert_eq(_kb.get_text(), "abcdefghi", "one on press")
	await wait_seconds(0.3)
	assert_eq(_kb.get_text().length(), 9, "no repeat before 0.5 s")
	await wait_seconds(0.45)
	del.button_up.emit()
	var left := _kb.get_text().length()
	assert_true(left < 8, "repeats while held (%d left)" % left)
	await wait_seconds(0.3)
	assert_eq(_kb.get_text().length(), left, "stops on release")


func test_submit_enabled_and_label() -> void:
	var sub := watch_signal(_kb, &"submitted")
	_kb.set_submit_label("Connect")
	assert_eq(_kb.get_key("submit").text, "Connect", "label")
	_kb.set_submit_enabled(false)
	_press("a")
	_kb.get_key("submit").pressed.emit()
	_kb._unhandled_key_input(_key_event(KEY_ENTER))
	assert_eq(sub.count, 0, "disabled: nothing")
	_kb.set_submit_enabled(true)
	_press("layer")   # rebuilt keys keep the label and the state
	assert_eq(_kb.get_key("submit").text, "Connect", "label kept across layers")
	_press("submit")
	assert_eq(sub.count, 1, "submitted")
	assert_eq(sub.args[0], "a", "with the text")


func test_physical_keyboard() -> void:
	_kb._unhandled_key_input(_key_event(KEY_A, "P".unicode_at(0)))
	_kb._unhandled_key_input(_key_event(KEY_1, "!".unicode_at(0)))
	_kb._unhandled_key_input(_key_event(KEY_SPACE, 32))
	_kb._unhandled_key_input(_key_event(KEY_X, "x".unicode_at(0)))
	_kb._unhandled_key_input(_key_event(KEY_BACKSPACE))
	_kb._unhandled_key_input(_key_event(KEY_SHIFT))
	assert_eq(_kb.get_text(), "P! ", "typed, deleted, modifiers ignored")


func test_fits_the_screen() -> void:
	await wait_frames(2)
	var min_size := _kb.get_combined_minimum_size()
	assert_true(min_size.x <= 936.0, "fits inside the page margins, 936 px (min %d)" % min_size.x)
	assert_true(min_size.y <= 1020.0, "leaves 900 px above it (height %d)" % min_size.y)
	for row in _kb.get_children()[0].get_children():
		for key in row.get_children():
			if key is Button:
				assert_true(key.size.y >= 110.0, "key %s tall enough" % key.get_meta("key"))
