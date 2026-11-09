extends TestCase
## The settings screens (SET-04): grid, Wi-Fi list, password page, notices, inactivity.
## The real Wifi autoload is pointed at tools/fake_nmcli.py with its own state, then restored.

const SettingsScene := preload("res://scenes/settings/Settings.tscn")
const DIR := "user://test_settings_screen"
const OLD_UUID := "0b9e1c2e-0000-4000-8000-000000000001"
const PASSWORD := "SENTINEL3pw"

var _snap: Dictionary
var _online: bool
var _scene: Control
var _events: Array = []


func before_each() -> void:
	_snap = snapshot_app_state()
	_online = ConfigManager.is_online
	ConfigManager.is_online = true
	ConfigManager.local_settings.timing.settings_success_return_sec = 0.3
	ConfigManager.local_settings.timing.settings_error_return_sec = 0.3
	ConfigManager.local_settings.timing.settings_inactivity_sec = 30.0
	Nav.dry_run = true
	Nav.last_requested = ""
	DirAccess.make_dir_recursive_absolute(DIR)
	for file in DirAccess.get_files_at(DIR):
		DirAccess.remove_absolute(DIR.path_join(file))
	_events.clear()
	Wifi.nmcli_path = ProjectSettings.globalize_path("res://tools/fake_nmcli.py")
	Wifi.fake_state_path = DIR.path_join("state.json")
	Wifi.secret_path = DIR.path_join("wifi_secret.tmp")
	Wifi.connect_timeout_sec = 5.0
	Wifi.connect_grace_sec = 1.0
	Wifi.report_event = func(event: Dictionary) -> void: _events.append(event)
	Wifi._available = -1
	Wifi._networks = []
	_write_state({})


func after_each() -> void:
	if is_instance_valid(_scene):
		_scene.queue_free()
	await _wifi_idle()
	await wait_frames(1)
	Wifi.nmcli_path = "/nonexistent/nmcli"
	Wifi.fake_state_path = ""
	Wifi.report_event = Callable()
	Wifi._available = -1
	Wifi._networks = []
	Wifi._status = {"kind": "none", "ssid": "", "signal": -1, "available": true}
	Wifi.configure_from_settings()
	Wifi.nmcli_path = "/nonexistent/nmcli"
	Wifi.fake_state_path = ""
	ConfigManager.is_online = _online
	restore_app_state(_snap)


func _write_state(patch: Dictionary) -> void:
	var state := {
		"wifi_device": "wlan0", "ethernet": false,
		"networks": [
			{"ssid": "GymStaff", "signal": 82, "security": "WPA2", "password": "staffpass1"},
			{"ssid": "GymGuest", "signal": 64, "security": "", "password": ""},
			{"ssid": "Office-5G", "signal": 41, "security": "WPA2", "password": PASSWORD},
			{"ssid": "Corp", "signal": 30, "security": "WPA2 802.1X", "password": ""},
		],
		"connections": [{"name": "GymStaff", "uuid": OLD_UUID, "ssid": "GymStaff", "psk": "staffpass1"}],
		"active": OLD_UUID, "delay": null, "fail_next": null, "calls": [],
	}
	state.merge(patch, true)
	var f := FileAccess.open(Wifi.fake_state_path, FileAccess.WRITE)
	f.store_string(JSON.stringify(state))
	f.close()


func _state() -> Dictionary:
	return JSON.parse_string(FileAccess.get_file_as_string(Wifi.fake_state_path))


func _wifi_idle(timeout_sec: float = 10.0) -> void:
	var deadline := Time.get_ticks_msec() + int(timeout_sec * 1000.0)
	await wait_frames(1)
	while Wifi.is_busy() and Time.get_ticks_msec() < deadline:
		await wait_frames(1)


func _wait_for(check: Callable, timeout_sec: float = 10.0) -> bool:
	var deadline := Time.get_ticks_msec() + int(timeout_sec * 1000.0)
	while not check.call() and Time.get_ticks_msec() < deadline:
		await wait_frames(1)
	return check.call()


func _open() -> Control:
	_scene = SettingsScene.instantiate()
	add_child(_scene)
	await _wifi_idle()
	return _scene


func _open_list() -> void:
	await _open()
	_scene.press_tile()
	await _wifi_idle()


func _type(text: String) -> void:
	var kb: OnScreenKeyboard = _scene.get_keyboard()
	for c in text:
		kb._type(c)


func _submit() -> void:
	_scene.get_keyboard().get_key("submit").pressed.emit()


func _ssids() -> Array:
	return _scene.get_rows().map(func(r: Dictionary) -> String: return r.ssid)


# --- Grid --------------------------------------------------------------------

func test_grid_has_the_network_tile() -> void:
	await _open()
	assert_eq(_scene.get_page(), "home", "the grid")
	assert_eq(_scene.get_tile_subtitle(), "GymStaff", "the tile shows the current network")
	_scene.press_tile()
	assert_eq(_scene.get_page(), "list", "Network → the list")
	_scene.press_back()
	assert_eq(_scene.get_page(), "home", "Back → the grid")
	_scene.press_exit()
	assert_eq(Nav.last_requested, ScenePaths.IDLE, "Exit → idle")


func test_tile_on_cable() -> void:
	_write_state({"ethernet": true})
	await _open()
	assert_eq(_scene.get_tile_subtitle(), ConfigManager.get_message("wifi_ethernet"), "cable")


# --- List --------------------------------------------------------------------

func test_list_connected_on_top() -> void:
	await _open_list()
	var rows: Array = _scene.get_rows()
	assert_eq(_ssids(), ["GymStaff", "GymGuest", "Office-5G", "Corp"], "connected first, then by signal")
	assert_false(rows[0].tappable, "the connected row isn't tappable")
	assert_eq(rows[0].subtitle, "%s · %s" % [ConfigManager.get_message("wifi_connected"),
		ConfigManager.get_message("wifi_server_ok")], "connected, server reachable")
	assert_true(rows[1].tappable and rows[2].tappable and rows[3].tappable, "the others are")
	assert_eq(_scene.get_list_message(), "", "no message once scanned")
	ConfigManager.is_online = false
	ConfigManager.connectivity_changed.emit(false)
	assert_true(_scene.get_rows()[0].subtitle.ends_with(ConfigManager.get_message("wifi_server_down")),
		"the server line follows connectivity")


func test_list_on_cable_and_none_found() -> void:
	_write_state({"ethernet": true, "networks": [], "active": null})
	await _open_list()
	var rows: Array = _scene.get_rows()
	assert_eq(rows.size(), 1, "just the cable row")
	assert_eq(rows[0].title, ConfigManager.get_message("wifi_ethernet"), "cable")
	_scene.press_back()
	_write_state({"networks": [], "active": null})
	_scene.press_tile()
	await _wifi_idle()
	assert_eq(_scene.get_rows(), [], "no rows")
	assert_eq(_scene.get_list_message(), ConfigManager.get_message("wifi_none_found"), "none found")


func test_searching_message_while_scanning() -> void:
	_write_state({"delay": {"sec": 1.0, "on": "yes", "times": 1}})
	await _open()
	_scene.press_tile()
	await wait_frames(2)
	assert_eq(_scene.get_list_message(), ConfigManager.get_message("wifi_searching"), "searching")
	await _wifi_idle()
	assert_eq(_scene.get_list_message(), "", "gone after the scan")


func test_failed_scan_is_not_none_found() -> void:
	_write_state({"fail_next": {"code": 4, "stderr": "Error: Not authorized to control networking.", "on": "yes"}})
	await _open_list()
	assert_eq(_scene.get_list_message(), ConfigManager.get_message("wifi_error_permission"), "permission")
	assert_eq(_ssids(), ["GymStaff"], "the connected row still shows")
	_write_state({"fail_next": {"code": 8, "stderr": "Error: NetworkManager is not running.", "on": "yes"}})
	_scene.press_refresh()
	await _wifi_idle()
	assert_eq(_scene.get_list_message(), ConfigManager.get_message("wifi_error_scan"), "other failures")
	_scene.press_refresh()
	await _wifi_idle()
	assert_eq(_scene.get_list_message(), "", "cleared by a good scan")
	assert_eq(_ssids().size(), 4, "the list")


func test_connect_not_authorized_message() -> void:
	await _open_list()
	_write_state({"fail_next": {"code": 4, "stderr": "Error: Insufficient privileges.", "on": "add"}})
	_scene.tap_row("GymGuest")
	assert_true(await _wait_for(func() -> bool: return _scene.get_notice().get("kind", "") == "error"), "error")
	assert_eq(_scene.get_notice().text, ConfigManager.get_message("wifi_error_permission"), "permission")


func test_unavailable() -> void:
	Wifi.nmcli_path = "/nonexistent/nmcli"
	await _open_list()
	assert_eq(_scene.get_rows(), [], "no list")
	assert_eq(_scene.get_list_message(), ConfigManager.get_message("wifi_error_unavailable"), "unavailable")


# --- Password and connecting -------------------------------------------------

func test_password_page() -> void:
	await _open_list()
	_scene.tap_row("Office-5G")
	assert_eq(_scene.get_page(), "password", "password page")
	assert_eq(_scene.get_password_title(), ConfigManager.get_message("wifi_password_title", {"ssid": "Office-5G"}), "title")
	var submit: Button = _scene.get_keyboard().get_key("submit")
	assert_eq(submit.text, ConfigManager.get_message("wifi_connect"), "Connect")
	_type("1234567")
	assert_true(_scene.get_keyboard().get_key("submit").disabled, "disabled under 8 characters")
	_type("8")
	assert_false(_scene.get_keyboard().get_key("submit").disabled, "enabled at 8")
	assert_eq(_scene.get_password_field(), "••••••••", "masked")
	_scene.toggle_show_password()
	assert_eq(_scene.get_password_field(), "12345678", "shown")
	_scene.toggle_show_password()
	assert_eq(_scene.get_password_field(), "••••••••", "hidden again")
	_scene.press_back()
	assert_eq(_scene.get_page(), "list", "Back → the list")
	_scene.tap_row("Office-5G")
	assert_eq(_scene.get_password_field(), "", "the text was cleared")


func test_right_password() -> void:
	await _open_list()
	_scene.tap_row("Office-5G")
	_type(PASSWORD)
	_submit()
	assert_eq(_scene.get_notice().kind, "connecting", "Connecting…")
	assert_eq(_scene.get_keyboard().get_text(), "", "the keyboard let go of the password")
	assert_true(await _wait_for(func() -> bool: return _scene.get_notice().get("kind", "") == "success"), "success")
	assert_eq(_scene.get_notice().text, ConfigManager.get_message("wifi_success", {"ssid": "Office-5G"}), "message")
	assert_true(await _wait_for(func() -> bool: return _scene.get_notice().is_empty()), "hides itself")
	assert_eq(_scene.get_page(), "list", "back on the list")
	await _wifi_idle()
	assert_eq(_ssids()[0], "Office-5G", "the new network on top")
	assert_false(_scene.get_rows()[0].tappable, "as the connected row")


func test_wrong_password_error_then_list() -> void:
	await _open_list()
	_scene.tap_row("Office-5G")
	_type("wrongpass1")
	_submit()
	assert_true(await _wait_for(func() -> bool: return _scene.get_notice().get("kind", "") == "error"), "error")
	assert_eq(_scene.get_notice().text, ConfigManager.get_message("wifi_error_password"), "wrong password")
	var shown := Time.get_ticks_msec()
	assert_true(await _wait_for(func() -> bool: return _scene.get_notice().is_empty()), "hides itself")
	assert_true(Time.get_ticks_msec() - shown >= 250, "after settings_error_return_sec")
	assert_eq(_scene.get_page(), "list", "the list")
	await _wifi_idle()
	assert_eq(_ssids()[0], "GymStaff", "still on the old network")
	assert_eq(_state().active, OLD_UUID, "rolled back")


func test_open_network_skips_the_password() -> void:
	await _open_list()
	_scene.tap_row("GymGuest")
	assert_eq(_scene.get_page(), "list", "no password page")
	assert_eq(_scene.get_notice().kind, "connecting", "connecting at once")
	assert_true(await _wait_for(func() -> bool: return _scene.get_notice().get("kind", "") == "success"), "success")


func test_enterprise_unsupported() -> void:
	await _open_list()
	_scene.tap_row("Corp")
	assert_eq(_scene.get_notice(), {"kind": "error", "text": ConfigManager.get_message("wifi_error_unsupported")}, "unsupported")
	assert_true(await _wait_for(func() -> bool: return _scene.get_notice().is_empty()), "hides itself")
	assert_eq(_scene.get_page(), "list", "the list")


func test_not_found_and_timeout_messages() -> void:
	await _open_list()
	var nets: Array = _state().networks
	_write_state({"networks": nets.filter(func(n: Dictionary) -> bool: return n.ssid != "Office-5G")})
	_scene.tap_row("Office-5G")
	_type(PASSWORD)
	_submit()
	assert_true(await _wait_for(func() -> bool: return _scene.get_notice().get("kind", "") == "error"), "error")
	assert_eq(_scene.get_notice().text, ConfigManager.get_message("wifi_error_not_found"), "not found")
	await _wait_for(func() -> bool: return _scene.get_notice().is_empty())
	await _wifi_idle()

	_write_state({"delay": {"sec": 5.0, "on": "up", "times": 1}})
	Wifi.connect_timeout_sec = 0.3
	Wifi.connect_grace_sec = 0.2
	_scene.tap_row("Office-5G")
	_type(PASSWORD)
	_submit()
	assert_true(await _wait_for(func() -> bool: return _scene.get_notice().get("kind", "") == "error"), "error")
	assert_eq(_scene.get_notice().text, ConfigManager.get_message("wifi_error_timeout"), "timeout")


# --- Inactivity --------------------------------------------------------------

func test_inactivity_returns_to_idle_but_not_while_connecting() -> void:
	ConfigManager.local_settings.timing.settings_inactivity_sec = 0.5
	_write_state({"delay": {"sec": 1.5, "on": "up", "times": 1}})
	await _open_list()
	_scene.tap_row("GymGuest")
	await wait_seconds(1.0)
	assert_eq(Nav.last_requested, "", "no return while connecting")
	assert_true(await _wait_for(func() -> bool: return Nav.last_requested == ScenePaths.IDLE, 5.0),
		"returns once it's quiet again")


# --- Layout ------------------------------------------------------------------

func test_layout_fits() -> void:
	await _open_list()
	await wait_frames(2)
	for row in _scene.find_children("*", "Button", true, false):
		if row.has_meta("row") and row.is_visible_in_tree():
			assert_true(row.get_global_rect().end.x <= 1080.0 - Palette.PAD + 1.0, "row inside the margin")
			assert_true(row.size.y >= 140.0, "row tall enough")
	_scene.tap_row("Office-5G")
	await wait_frames(2)
	var kb: OnScreenKeyboard = _scene.get_keyboard()
	var field_bottom := 0.0
	for panel in _scene.find_children("*", "PanelContainer", true, false):
		if panel.theme_type_variation == &"DiagPanel" and panel.is_visible_in_tree():
			field_bottom = panel.get_global_rect().end.y
	assert_true(field_bottom > 0.0, "the field is shown")
	assert_true(kb.get_global_rect().position.y > field_bottom, "the keyboard is below the field")
	assert_true(kb.get_global_rect().end.y <= 1920.5, "the keyboard is on screen")
	assert_true(kb.get_global_rect().size.x >= 1079.0, "full width")
