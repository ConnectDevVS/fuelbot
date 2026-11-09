extends Control
## Settings (docs/stories/settings, SET-04). Opened only from the PIN pad. Three pages swapped
## in place: the grid (one "Network" tile), the Wi-Fi list (connected network on top) and the
## password page (on-screen keyboard). A full-screen notice shows "Connecting…", then success
## for settings_success_return_sec or the error for settings_error_return_sec, then the list.
## Exit or settings_inactivity_sec without a touch returns to idle (never while connecting).
## The password is handed to Wifi and cleared at once; it's never logged.

const KeyboardScene := preload("res://ui/components/keyboard/Keyboard.tscn")
const MIN_PASSWORD := 8
const ERROR_KEYS := {
	"wrong_password": "wifi_error_password", "not_found": "wifi_error_not_found",
	"timeout": "wifi_error_timeout", "unsupported": "wifi_error_unsupported",
	"unavailable": "wifi_error_unavailable",
}

var _page := ""
var _pages := {}                 # name -> Control
var _inactivity: Timer
var _notice_timer: Timer
var _done := false
var _connecting := false
var _scanning := false
var _networks: Array = []
var _target := ""                # the SSID on the password page

# Grid
var _exit: Button
var _tile: Button
var _tile_sub: Label
# List
var _list_back: Button
var _refresh: Button
var _rows: VBoxContainer
var _list_message: Label
# Password
var _pw_back: Button
var _pw_title: Label
var _pw_field: Label
var _pw_toggle: Button
var _keyboard: OnScreenKeyboard
var _show_password := false
# Notice
var _notice: ColorRect
var _notice_icon: NetIcon
var _notice_text: Label


func _ready() -> void:
	_build()
	_inactivity = Timer.new()
	_inactivity.one_shot = true
	_inactivity.wait_time = maxf(ConfigManager.get_timing("settings_inactivity_sec", 60.0), 0.05)
	_inactivity.timeout.connect(_leave)
	add_child(_inactivity)
	_inactivity.start()
	_notice_timer = Timer.new()
	_notice_timer.one_shot = true
	_notice_timer.timeout.connect(_end_notice)
	add_child(_notice_timer)
	Wifi.status_changed.connect(_on_status)
	Wifi.scan_finished.connect(_on_scan)
	Wifi.connect_finished.connect(_on_connected)
	ConfigManager.connectivity_changed.connect(_on_connectivity)
	_show("home")
	Wifi.refresh_status()


func _input(event: InputEvent) -> void:
	if (event is InputEventMouseButton or event is InputEventScreenTouch) and event.pressed \
			and not _connecting:
		_inactivity.start()


# --- For tests ---------------------------------------------------------------

func get_page() -> String:
	return _page


func press_exit() -> void:
	_exit.pressed.emit()


func press_tile() -> void:
	_tile.pressed.emit()


func press_back() -> void:
	(_pw_back if _page == "password" else _list_back).pressed.emit()


func press_refresh() -> void:
	_refresh.pressed.emit()


func get_tile_subtitle() -> String:
	return _tile_sub.text


## The list's rows, top first: {ssid, title, subtitle, tappable, security}.
func get_rows() -> Array:
	var out := []
	for row in _rows.get_children():
		if row.has_meta("row"):
			out.append(row.get_meta("row"))
	return out


func tap_row(ssid: String) -> void:
	for row in _rows.get_children():
		if row is Button and row.get_meta("row").ssid == ssid:
			row.pressed.emit()


func get_list_message() -> String:
	return _list_message.text if _list_message.visible else ""


func get_password_title() -> String:
	return _pw_title.text


func get_password_field() -> String:
	return _pw_field.text


func get_keyboard() -> OnScreenKeyboard:
	return _keyboard


func toggle_show_password() -> void:
	_pw_toggle.pressed.emit()


## {"kind": "connecting" | "success" | "error", "text"} or {} when hidden.
func get_notice() -> Dictionary:
	if not _notice.visible:
		return {}
	return {"kind": _notice.get_meta("kind"), "text": _notice_text.text}


# --- Navigation --------------------------------------------------------------

func _show(page: String) -> void:
	_page = page
	for name in _pages:
		_pages[name].visible = name == page
	if page == "list":
		_render_list()


func _leave() -> void:
	if _done:
		return
	_done = true
	Nav.go_idle()


func _open_list() -> void:
	_show("list")
	Wifi.refresh_status()
	_start_scan()


func _start_scan() -> void:
	if not Wifi.is_available():
		_render_list()
		return
	_scanning = true
	_render_list()
	Wifi.scan()


func _open_password(ssid: String) -> void:
	_target = ssid
	_keyboard.clear()
	_show_password = false
	_pw_title.text = ConfigManager.get_message("wifi_password_title", {"ssid": ssid})
	_render_password()
	_show("password")


func _tap_network(net: Dictionary) -> void:
	match String(net.security):
		"psk":
			_open_password(net.ssid)
		"open":
			_connect(net.ssid, "")
		_:
			_notify("error", ConfigManager.get_message("wifi_error_unsupported"))


func _connect(ssid: String, password: String) -> void:
	_connecting = true
	_inactivity.stop()
	_notify("connecting", ConfigManager.get_message("wifi_connecting", {"ssid": ssid}))
	Wifi.connect_to(ssid, password)


func _on_connected(ok: bool, reason: String, ssid: String) -> void:
	if not _connecting:
		return
	_connecting = false
	_inactivity.start()
	if ok:
		_notify("success", ConfigManager.get_message("wifi_success", {"ssid": ssid}))
	else:
		_notify("error", ConfigManager.get_message(ERROR_KEYS.get(reason, "wifi_error_generic")))


func _notify(kind: String, text: String) -> void:
	_notice.set_meta("kind", kind)
	_notice_text.text = text
	match kind:
		"connecting":
			_notice_icon.kind = "spinner"
			_notice_icon.color = Palette.ACCENT
			_notice_text.add_theme_color_override("font_color", Palette.TEXT)
			_notice_timer.stop()
		"success":
			_notice_icon.kind = "tick"
			_notice_icon.color = Palette.SUCCESS
			_notice_text.add_theme_color_override("font_color", Palette.SUCCESS)
			_notice_timer.start(maxf(ConfigManager.get_timing("settings_success_return_sec", 2.0), 0.05))
		_:
			_notice_icon.kind = "cross"
			_notice_icon.color = Palette.WARNING
			_notice_text.add_theme_color_override("font_color", Palette.WARNING)
			_notice_timer.start(maxf(ConfigManager.get_timing("settings_error_return_sec", 3.0), 0.05))
	_notice.visible = true


## After success or an error: hide the notice and show the list, scanned again.
func _end_notice() -> void:
	_notice.visible = false
	_keyboard.clear()
	_open_list()


# --- Wifi signals ------------------------------------------------------------

func _on_status(_status: Dictionary) -> void:
	_render_tile()
	if _page == "list":
		_render_list()


func _on_connectivity(_online: bool) -> void:
	if _page == "list":
		_render_list()


func _on_scan(networks: Array) -> void:
	_scanning = false
	_networks = networks
	if _page == "list":
		_render_list()


# --- Rendering ---------------------------------------------------------------

func _render_tile() -> void:
	var st := Wifi.get_status()
	_tile_sub.text = st.ssid if st.kind == "wifi" else \
		(ConfigManager.get_message("wifi_ethernet") if st.kind == "ethernet" else "")


func _render_list() -> void:
	for row in _rows.get_children():
		_rows.remove_child(row)
		row.queue_free()
	_list_message.visible = false
	if not Wifi.is_available():
		_show_list_message(ConfigManager.get_message("wifi_error_unavailable"))
		return
	var st := Wifi.get_status()
	var server := ConfigManager.get_message("wifi_server_ok" if ConfigManager.is_online else "wifi_server_down")
	var connected := ""
	if st.kind == "ethernet":
		_rows.add_child(_connected_row({"ssid": "", "title": ConfigManager.get_message("wifi_ethernet"),
			"subtitle": server, "tappable": false, "security": ""}, -1))
	elif st.kind == "wifi" and st.ssid != "":
		connected = st.ssid
		var sec := ""
		for net in _networks:
			if net.ssid == connected:
				sec = net.security
		_rows.add_child(_connected_row({"ssid": connected, "title": connected,
			"subtitle": ConfigManager.get_message("wifi_connected") + " · " + server,
			"tappable": false, "security": sec}, st.signal))
	if _scanning:
		_show_list_message(ConfigManager.get_message("wifi_searching"))
	var others := _networks.filter(func(n: Dictionary) -> bool: return n.ssid != connected)
	if others.is_empty() and not _scanning and connected == "":
		_show_list_message(ConfigManager.get_message("wifi_none_found"))
	for net in others:
		_rows.add_child(_network_row(net))


func _show_list_message(text: String) -> void:
	_list_message.text = text
	_list_message.visible = true


func _render_password() -> void:
	var text := _keyboard.get_text()
	_pw_field.text = text if _show_password else "•".repeat(text.length())
	_pw_toggle.text = ConfigManager.get_message("wifi_hide" if _show_password else "wifi_show")
	_keyboard.set_submit_enabled(text.length() >= MIN_PASSWORD)


# --- Layout ------------------------------------------------------------------

func _build() -> void:
	var bg := ColorRect.new()
	bg.color = Palette.BG
	bg.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(bg)
	_pages.home = _build_home()
	_pages.list = _build_list()
	_pages.password = _build_password()
	for page in _pages.values():
		add_child(page)
	_build_notice()


func _page_root() -> VBoxContainer:
	var root := VBoxContainer.new()
	root.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	root.add_theme_constant_override("separation", 0)
	return root


func _margin(child: Control, top: int = 68) -> MarginContainer:
	var m := MarginContainer.new()
	m.add_theme_constant_override("margin_left", Palette.PAD)
	m.add_theme_constant_override("margin_right", Palette.PAD)
	m.add_theme_constant_override("margin_top", top)
	m.add_child(child)
	return m


func _pill(text: String, on_press: Callable) -> Button:
	var b := Button.new()
	b.theme_type_variation = &"BackPill"
	b.text = text
	b.custom_minimum_size = Vector2(196, 96)
	b.focus_mode = Control.FOCUS_NONE
	b.pressed.connect(on_press)
	return b


func _header(left: Control, title_text: String, right: Control) -> HBoxContainer:
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 24)
	if left:
		row.add_child(left)
	var title := Label.new()
	title.theme_type_variation = &"DisplayM"
	title.text = title_text
	title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER if left else HORIZONTAL_ALIGNMENT_LEFT
	row.add_child(title)
	if right:
		row.add_child(right)
	return row


func _build_home() -> Control:
	var root := _page_root()
	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 72)
	root.add_child(_margin(col))
	_exit = _pill(ConfigManager.get_message("settings_exit"), _leave)
	col.add_child(_header(null, ConfigManager.get_message("settings_title"), _exit))

	var grid := GridContainer.new()
	grid.name = "Tiles"
	grid.columns = 2
	grid.add_theme_constant_override("h_separation", 48)
	grid.add_theme_constant_override("v_separation", 48)
	col.add_child(grid)
	_tile = Button.new()
	_tile.name = "NetworkTile"
	_tile.theme_type_variation = &"GhostButton"
	_tile.custom_minimum_size = Vector2(420, 420)
	_tile.focus_mode = Control.FOCUS_NONE
	_tile.pressed.connect(_open_list)
	grid.add_child(_tile)
	var center := CenterContainer.new()
	center.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	center.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_tile.add_child(center)
	var inner := VBoxContainer.new()
	inner.add_theme_constant_override("separation", 20)
	inner.mouse_filter = Control.MOUSE_FILTER_IGNORE
	center.add_child(inner)
	var icon := NetIcon.new()
	icon.kind = "wifi"
	icon.side = 160
	icon.color = Palette.ACCENT
	icon.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	inner.add_child(icon)
	var label := _label(&"DisplayS", ConfigManager.get_message("settings_tile_network"))
	label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	inner.add_child(label)
	_tile_sub = _label(&"MonoMuted", "")
	_tile_sub.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_tile_sub.custom_minimum_size = Vector2(360, 0)
	_tile_sub.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	inner.add_child(_tile_sub)
	return root


func _build_list() -> Control:
	var root := _page_root()
	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 40)
	col.size_flags_vertical = Control.SIZE_EXPAND_FILL
	var m := _margin(col)
	m.size_flags_vertical = Control.SIZE_EXPAND_FILL
	m.add_theme_constant_override("margin_bottom", 72)
	root.add_child(m)
	_list_back = _pill("←  " + ConfigManager.get_message("back"), _show.bind("home"))
	_refresh = _pill(ConfigManager.get_message("wifi_refresh"), _start_scan)
	col.add_child(_header(_list_back, ConfigManager.get_message("wifi_title"), _refresh))
	var scroll := ScrollContainer.new()
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	col.add_child(scroll)
	var inner := VBoxContainer.new()
	inner.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	inner.add_theme_constant_override("separation", 20)
	scroll.add_child(inner)
	_rows = VBoxContainer.new()
	_rows.add_theme_constant_override("separation", 20)
	inner.add_child(_rows)
	_list_message = _label(&"MonoMuted", "")   # under the rows: searching, none found
	_list_message.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	inner.add_child(_list_message)
	return root


func _build_password() -> Control:
	var root := _page_root()
	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 48)
	root.add_child(_margin(col))
	_pw_back = _pill("←  " + ConfigManager.get_message("back"), _show.bind("list"))
	var top := HBoxContainer.new()
	top.add_child(_pw_back)
	col.add_child(top)
	_pw_title = _label(&"DisplayS", "")
	_pw_title.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	col.add_child(_pw_title)
	var field := PanelContainer.new()
	field.theme_type_variation = &"DiagPanel"
	field.custom_minimum_size.y = 140
	col.add_child(field)
	var field_row := HBoxContainer.new()
	field_row.add_theme_constant_override("separation", 24)
	var field_margin := MarginContainer.new()
	for side in ["left", "right"]:
		field_margin.add_theme_constant_override("margin_" + side, 32)
	field_margin.add_child(field_row)
	field.add_child(field_margin)
	_pw_field = _label(&"Heading", "")
	_pw_field.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_pw_field.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_pw_field.clip_text = true
	field_row.add_child(_pw_field)
	_pw_toggle = Button.new()
	_pw_toggle.theme_type_variation = &"GhostButtonMuted"
	_pw_toggle.custom_minimum_size = Vector2(160, 96)
	_pw_toggle.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	_pw_toggle.focus_mode = Control.FOCUS_NONE
	_pw_toggle.pressed.connect(func() -> void:
		_show_password = not _show_password
		_render_password())
	field_row.add_child(_pw_toggle)

	var spacer := Control.new()
	spacer.size_flags_vertical = Control.SIZE_EXPAND_FILL
	root.add_child(spacer)
	_keyboard = KeyboardScene.instantiate()
	root.add_child(_keyboard)
	_keyboard.set_submit_label(ConfigManager.get_message("wifi_connect"))
	_keyboard.text_changed.connect(func(_t: String) -> void: _render_password())
	_keyboard.submitted.connect(func(text: String) -> void:
		_keyboard.clear()
		_connect(_target, text))
	return root


func _build_notice() -> void:
	_notice = ColorRect.new()
	_notice.name = "Notice"
	_notice.color = Palette.BG
	_notice.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_notice.mouse_filter = Control.MOUSE_FILTER_STOP   # blocks input while it shows
	_notice.visible = false
	_notice.set_meta("kind", "")
	add_child(_notice)
	var center := CenterContainer.new()
	center.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	center.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_notice.add_child(center)
	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 56)
	center.add_child(col)
	_notice_icon = NetIcon.new()
	_notice_icon.side = 200
	_notice_icon.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	col.add_child(_notice_icon)
	_notice_text = _label(&"DisplayS", "")
	_notice_text.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_notice_text.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_notice_text.custom_minimum_size.x = 900
	col.add_child(_notice_text)


## A network row: a 140 px button (name, signal bars, lock if secured).
func _network_row(net: Dictionary) -> Button:
	var b := Button.new()
	b.theme_type_variation = &"GhostButton"
	b.custom_minimum_size.y = 140
	b.focus_mode = Control.FOCUS_NONE
	b.set_meta("row", {"ssid": net.ssid, "title": net.ssid, "subtitle": "", "tappable": true,
		"security": net.security})
	b.pressed.connect(_tap_network.bind(net))
	_fill_row(b, net.ssid, "", net.signal, net.security, false)
	return b


## The connected row (or "Connected by cable"): not tappable, accent.
func _connected_row(meta: Dictionary, signal_pct: int) -> PanelContainer:
	var p := PanelContainer.new()
	var box := StyleBoxFlat.new()
	box.bg_color = Palette.SURFACE_RAISED
	box.border_color = Palette.ACCENT
	box.set_border_width_all(2)
	box.set_corner_radius_all(24)
	p.add_theme_stylebox_override("panel", box)
	p.custom_minimum_size.y = 160
	p.set_meta("row", meta)
	_fill_row(p, meta.title, meta.subtitle, signal_pct, meta.security, true)
	return p


func _fill_row(parent: Control, title: String, subtitle: String, signal_pct: int, security: String,
		connected: bool) -> void:
	var m := MarginContainer.new()
	m.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	m.mouse_filter = Control.MOUSE_FILTER_IGNORE
	for side in ["left", "right"]:
		m.add_theme_constant_override("margin_" + side, 32)
	parent.add_child(m)
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 24)
	row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	m.add_child(row)
	if connected:
		var tick := NetIcon.new()
		tick.kind = "tick" if security != "" or signal_pct >= 0 else "wifi"
		tick.color = Palette.ACCENT
		tick.side = 44
		row.add_child(tick)
	var texts := VBoxContainer.new()
	texts.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	texts.alignment = BoxContainer.ALIGNMENT_CENTER
	texts.mouse_filter = Control.MOUSE_FILTER_IGNORE
	row.add_child(texts)
	var name_label := _label(&"Heading", title)
	name_label.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	if connected:
		name_label.add_theme_color_override("font_color", Palette.ACCENT)
	texts.add_child(name_label)
	if subtitle != "":
		var sub := _label(&"MonoMuted", subtitle)
		sub.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		texts.add_child(sub)
	if signal_pct >= 0:
		var bars := NetIcon.new()
		bars.kind = "bars"
		bars.level = NetIcon.bars_for(signal_pct)
		bars.side = 48
		bars.color = Palette.ACCENT if connected else Palette.TEXT
		row.add_child(bars)
	if security == "psk" or security == "enterprise":
		var lock := NetIcon.new()
		lock.kind = "lock"
		lock.side = 40
		lock.color = Palette.TEXT_MUTED
		row.add_child(lock)


func _label(variation: StringName, text: String) -> Label:
	var l := Label.new()
	l.theme_type_variation = variation
	l.text = text
	l.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return l
