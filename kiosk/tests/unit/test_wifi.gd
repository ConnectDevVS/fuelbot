extends TestCase
## Wifi (settings SET-01) against tools/fake_nmcli.py, a fresh instance with its own state.
## The test password SENTINEL3pw must never reach the log (run_tests.sh greps for it).

const DIR := "user://test_wifi"
const OLD_UUID := "0b9e1c2e-0000-4000-8000-000000000001"

var _wifi: Node
var _events: Array = []


func before_each() -> void:
	DirAccess.make_dir_recursive_absolute(DIR)
	for file in DirAccess.get_files_at(DIR):
		DirAccess.remove_absolute(DIR.path_join(file))
	_events.clear()
	_wifi = load("res://autoload/Wifi.gd").new()
	_wifi.auto_configure = false
	_wifi.nmcli_path = ProjectSettings.globalize_path("res://tools/fake_nmcli.py")
	_wifi.fake_state_path = DIR.path_join("state.json")
	_wifi.secret_path = DIR.path_join("wifi_secret.tmp")
	_wifi.report_event = func(event: Dictionary) -> void: _events.append(event)
	add_child(_wifi)
	_write_state({})


func after_each() -> void:
	if is_instance_valid(_wifi):
		_wifi.queue_free()
	await wait_frames(1)


## The sample state with `patch` applied (top-level keys replaced).
func _write_state(patch: Dictionary) -> void:
	var state := {
		"wifi_device": "wlan0", "ethernet": false,
		"networks": [
			{"ssid": "GymStaff", "signal": 82, "security": "WPA2", "password": "staffpass1"},
			{"ssid": "GymGuest", "signal": 64, "security": "", "password": ""},
			{"ssid": "Office-5G", "signal": 41, "security": "WPA1 WPA2", "password": "SENTINEL3pw"},
			{"ssid": "Office-5G", "signal": 20, "security": "WPA1 WPA2", "password": "SENTINEL3pw"},
			{"ssid": "", "signal": 90, "security": "WPA2", "password": "x"},
			{"ssid": "Corp", "signal": 30, "security": "WPA2 802.1X", "password": ""},
		],
		"connections": [{"name": "GymStaff", "uuid": OLD_UUID, "ssid": "GymStaff", "psk": "staffpass1"}],
		"active": OLD_UUID, "delay": null, "fail_next": null, "calls": [],
	}
	state.merge(patch, true)
	var f := FileAccess.open(_wifi.fake_state_path, FileAccess.WRITE)
	f.store_string(JSON.stringify(state))
	f.close()


func _state() -> Dictionary:
	return JSON.parse_string(FileAccess.get_file_as_string(_wifi.fake_state_path))


func _scan() -> Array:
	var done := watch_signal(_wifi, &"scan_finished")
	_wifi.scan()
	await wait_until(done, 10.0)
	return done.args[0]


func _connect(ssid: String, password: String) -> Dictionary:
	var done := watch_signal(_wifi, &"connect_finished")
	_wifi.connect_to(ssid, password)
	await wait_until(done, 15.0)
	return done


# --- Parsing -----------------------------------------------------------------

func test_split_terse_unescapes() -> void:
	assert_eq(_wifi.split_terse(" :a\\:b\\\\c:50:WPA2"), PackedStringArray([" ", "a:b\\c", "50", "WPA2"]), "fields")
	assert_eq(_wifi.split_terse("eth0:ethernet:unavailable:"), PackedStringArray(["eth0", "ethernet", "unavailable", ""]), "empty last field")


func test_security_and_failure_reasons() -> void:
	assert_eq(_wifi.security_kind(""), "open", "empty")
	assert_eq(_wifi.security_kind("--"), "open", "--")
	assert_eq(_wifi.security_kind("WPA2"), "psk", "WPA2")
	assert_eq(_wifi.security_kind("WPA2 WPA3"), "psk", "WPA3")
	assert_eq(_wifi.security_kind("WPA2 802.1X"), "enterprise", "802.1X")
	assert_eq(_wifi.failure_reason("Error: Connection activation failed: Secrets were required, but not provided."), "wrong_password", "secrets")
	assert_eq(_wifi.failure_reason("Error: No network with SSID 'x' found."), "not_found", "no SSID")
	assert_eq(_wifi.failure_reason("Error: Connection activation failed: The Wi-Fi network could not be found."), "not_found", "could not be found")
	assert_eq(_wifi.failure_reason("Error: something else"), "failed", "other")


# --- Status and scan ---------------------------------------------------------

func test_status_wifi() -> void:
	var changed := watch_signal(_wifi, &"status_changed")
	_wifi.refresh_status()
	assert_true(await wait_until(changed, 10.0), "status_changed")
	assert_eq(_wifi.get_status(), {"kind": "wifi", "ssid": "GymStaff", "signal": 82, "available": true}, "wifi")


func test_status_ethernet_wins_and_none() -> void:
	_write_state({"ethernet": true})
	var changed := watch_signal(_wifi, &"status_changed")
	_wifi.refresh_status()
	await wait_until(changed, 10.0)
	assert_eq(_wifi.get_status().kind, "ethernet", "ethernet wins over wifi")
	_write_state({"active": null})
	changed = watch_signal(_wifi, &"status_changed")
	_wifi.refresh_status()
	await wait_until(changed, 10.0)
	assert_eq(_wifi.get_status(), {"kind": "none", "ssid": "", "signal": -1, "available": true}, "nothing connected")


func test_missing_nmcli_is_unavailable() -> void:
	_wifi.nmcli_path = "/nonexistent/nmcli"
	var changed := watch_signal(_wifi, &"status_changed")
	_wifi.refresh_status()
	await wait_until(changed, 5.0)
	assert_false(_wifi.is_available(), "unavailable")
	assert_false(_wifi.get_status().available, "status says so")
	assert_eq(await _scan(), [], "empty scan")
	assert_eq(_wifi.last_error, "unavailable", "reason")
	var res := await _connect("GymGuest", "")
	assert_eq(res.args, [false, "unavailable", "GymGuest"], "connect unavailable")
	assert_eq(_events, [], "no audit event for a machine without nmcli")


func test_scan_dedupes_hides_and_sorts() -> void:
	var nets: Array = await _scan()
	var ssids := nets.map(func(n: Dictionary) -> String: return n.ssid)
	assert_eq(ssids, ["GymStaff", "GymGuest", "Office-5G", "Corp"], "in use first, then by signal; hidden and duplicates out")
	assert_eq(nets[0].in_use, true, "in use")
	assert_eq(nets[2].signal, 41, "the strongest Office-5G")
	assert_eq(nets.map(func(n: Dictionary) -> String: return n.security), ["psk", "open", "psk", "enterprise"], "security")


func test_scan_does_not_block_the_main_thread() -> void:
	_write_state({"delay": {"sec": 1.0, "on": "list", "times": 1}})
	var frames := [0]
	var count := func() -> void: frames[0] += 1
	get_tree().process_frame.connect(count)
	var nets: Array = await _scan()
	get_tree().process_frame.disconnect(count)
	assert_eq(nets.size(), 4, "scan finished")
	assert_true(frames[0] > 20, "frames kept coming during a 1 s scan (%d)" % frames[0])


func test_scan_timeout_kills_nmcli() -> void:
	_wifi.scan_timeout_sec = 0.3
	_write_state({"delay": {"sec": 5.0, "on": "list", "times": 1}})
	var start := Time.get_ticks_msec()
	assert_eq(await _scan(), [], "no networks")
	assert_eq(_wifi.last_error, "timeout", "timeout")
	assert_true(Time.get_ticks_msec() - start < 2500, "killed, not waited out")


# --- Connect -----------------------------------------------------------------

func test_connect_success() -> void:
	await _scan()
	var res := await _connect("Office-5G", "SENTINEL3pw")
	assert_eq(res.args, [true, "", "Office-5G"], "connected")
	assert_eq(res.count, 1, "emitted once")
	var state := _state()
	var profiles: Array = state.connections.filter(func(c: Dictionary) -> bool: return c.ssid == "Office-5G")
	assert_eq(profiles.size(), 1, "one profile")
	assert_eq(state.active, profiles[0].uuid, "it's active")
	assert_eq(profiles[0].psk, "SENTINEL3pw", "the password was saved with the profile")
	assert_eq(_wifi.get_status().ssid, "Office-5G", "status updated")
	assert_eq(_events, [{"event_type": "wifi_connected", "ssid": "Office-5G", "signal": 41}], "audit event")
	assert_false(FileAccess.file_exists(_wifi.secret_path), "passwd-file deleted")


func test_open_network_needs_no_password_file() -> void:
	await _scan()
	var res := await _connect("GymGuest", "")
	assert_eq(res.args[0], true, "connected")
	var calls: Array = _state().calls
	assert_false(JSON.stringify(calls).contains("passwd-file"), "no passwd-file for an open network")


func test_retyping_replaces_the_saved_profile() -> void:
	await _scan()
	await _connect("Office-5G", "SENTINEL3pw")
	await _connect("GymStaff", "staffpass1")
	var res := await _connect("Office-5G", "SENTINEL3pw")
	assert_eq(res.args[0], true, "connected again")
	var profiles: Array = _state().connections.filter(func(c: Dictionary) -> bool: return c.ssid == "Office-5G")
	assert_eq(profiles.size(), 1, "still one profile")


func test_wrong_password_rolls_back() -> void:
	await _scan()
	var res := await _connect("Office-5G", "wrongpass1")
	assert_eq(res.args, [false, "wrong_password", "Office-5G"], "wrong password")
	var state := _state()
	assert_eq(state.active, OLD_UUID, "the old network is back")
	assert_eq(state.connections.filter(func(c: Dictionary) -> bool: return c.ssid == "Office-5G").size(), 0,
		"the failed profile is gone")
	assert_eq(_events, [{"event_type": "wifi_connect_failed", "ssid": "Office-5G", "reason": "wrong_password"}], "audit event")
	assert_false(FileAccess.file_exists(_wifi.secret_path), "passwd-file deleted")


func test_not_found() -> void:
	var res := await _connect("FarAway", "password1")
	assert_eq(res.args, [false, "not_found", "FarAway"], "not found")
	assert_eq(_state().active, OLD_UUID, "the old network is back")


func test_connect_timeout() -> void:
	await _scan()
	_wifi.connect_timeout_sec = 0.3
	_wifi.connect_grace_sec = 0.2
	_write_state({"delay": {"sec": 5.0, "on": "up", "times": 1}})
	var start := Time.get_ticks_msec()
	var res := await _connect("Office-5G", "SENTINEL3pw")
	assert_eq(res.args, [false, "timeout", "Office-5G"], "timeout")
	assert_true(Time.get_ticks_msec() - start < 4000, "killed, not waited out")
	assert_false(FileAccess.file_exists(_wifi.secret_path), "passwd-file deleted after a timeout too")
	assert_eq(_state().active, OLD_UUID, "rolled back")


func test_enterprise_is_unsupported() -> void:
	await _scan()
	var before: int = _state().calls.size()
	var res := await _connect("Corp", "")
	assert_eq(res.args, [false, "unsupported", "Corp"], "unsupported")
	assert_eq(_state().calls.size(), before, "nmcli not called")


func test_second_connect_is_busy() -> void:
	await _scan()
	var results := []
	_wifi.connect_finished.connect(func(ok: bool, reason: String, ssid: String) -> void:
		results.append([ok, reason, ssid]))
	_wifi.connect_to("GymGuest", "")
	_wifi.connect_to("Office-5G", "SENTINEL3pw")
	assert_eq(results, [[false, "busy", "Office-5G"]], "busy at once")
	var deadline := Time.get_ticks_msec() + 10000
	while results.size() < 2 and Time.get_ticks_msec() < deadline:
		await wait_frames(1)
	assert_eq(results.size(), 2, "the first one finished")
	assert_eq(results[1], [true, "", "GymGuest"], "the first one connected")


func test_password_never_leaks() -> void:
	await _scan()
	await _connect("Office-5G", "SENTINEL3pw")
	await _connect("Office-5G", "SENTINEL3pw-wrong")
	assert_false(JSON.stringify(_state().calls).contains("SENTINEL"), "not in nmcli's arguments")
	assert_false(JSON.stringify(_events).contains("SENTINEL"), "not in telemetry")
	assert_false(FileAccess.file_exists(_wifi.secret_path), "no passwd-file left")
