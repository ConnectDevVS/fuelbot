class_name TestCase
extends Node
## Base class for tests. Methods named test_* are run by tests/test_runner.gd.
## Tests may be coroutines (use await). Optional hooks: before_each(), after_each().

var failures: PackedStringArray = []


func fail(msg: String) -> void:
	failures.append(msg)


func assert_true(cond: bool, msg: String = "expected true") -> void:
	if not cond:
		fail(msg)


func assert_false(cond: bool, msg: String = "expected false") -> void:
	if cond:
		fail(msg)


func assert_eq(actual: Variant, expected: Variant, msg: String = "") -> void:
	if typeof(actual) != typeof(expected) or actual != expected:
		fail("%s expected <%s> got <%s>" % [msg, str(expected), str(actual)])


func wait_seconds(sec: float) -> void:
	await get_tree().create_timer(sec).timeout


func wait_frames(n: int) -> void:
	for i in n:
		await get_tree().process_frame


## Starts recording obj.signal_name immediately (not a coroutine). Returns a
## state dict {"fired", "count", "args"} updated on every emission. Pair with
## wait_until() when the trigger happens after the watch is set up.
func watch_signal(obj: Object, signal_name: StringName) -> Dictionary:
	var state := {"fired": false, "count": 0, "args": []}
	var cb := func(a0 = null, a1 = null, a2 = null) -> void:
		state.fired = true
		state.count += 1
		state.args = [a0, a1, a2]
	obj.connect(signal_name, cb)
	return state


## Waits until a watch_signal() state has fired, or timeout. Returns fired.
func wait_until(state: Dictionary, timeout_sec: float) -> bool:
	var deadline := Time.get_ticks_msec() + int(timeout_sec * 1000)
	while not state.fired and Time.get_ticks_msec() < deadline:
		await get_tree().process_frame
	return state.fired


## Waits for obj.signal_name emitted from now on. Returns {"fired", "count", "args"}.
func wait_for_signal(obj: Object, signal_name: StringName, timeout_sec: float) -> Dictionary:
	var state := watch_signal(obj, signal_name)
	await wait_until(state, timeout_sec)
	return state

# --- Mock server helpers (tools/run_tests.sh starts it on :8788) ------------

const MOCK_ORIGIN := "http://127.0.0.1:8788"


func mock_scenario(name: String, path: String = "/fuelbot/config") -> void:
	await _mock_request("/__mock/scenario", HTTPClient.METHOD_POST, JSON.stringify({"path": path, "scenario": name}))


func mock_reset() -> void:
	await _mock_request("/__mock/reset", HTTPClient.METHOD_POST, "{}")


func mock_state() -> Dictionary:
	return await _mock_request("/__mock/state", HTTPClient.METHOD_GET, "")


func _mock_request(path: String, method: int, body: String) -> Dictionary:
	var http := HTTPRequest.new()
	http.timeout = 5
	add_child(http)
	var err := http.request(MOCK_ORIGIN + path, ["Content-Type: application/json"], method, body)
	if err != OK:
		fail("mock request %s failed to start: %d" % [path, err])
		http.queue_free()
		return {}
	var res: Array = await http.request_completed
	http.queue_free()
	if res[0] != HTTPRequest.RESULT_SUCCESS or res[1] != 200:
		fail("mock server unreachable or refused %s (result %d, status %d)" % [path, res[0], res[1]])
		return {}
	var data = JSON.parse_string((res[3] as PackedByteArray).get_string_from_utf8())
	return data if data is Dictionary else {}


# --- Fixtures ----------------------------------------------------------------

const MOCK_CONFIG_DIR := "res://mockserver/responses/config"


## A mock scenario's body, resolved like the mock server does (extends +
## body_patch, {{origin}} -> the test mock), then normalised by ConfigManager.
func load_mock_config(scenario: String = "default") -> Dictionary:
	return ConfigManager.normalise(mock_body_with_origin(scenario))


## A mock scenario's raw body as the test mock would serve it (not normalised).
func mock_body_with_origin(scenario: String) -> Dictionary:
	var text := JSON.stringify(_resolve_mock_body(scenario)).replace("{{origin}}", MOCK_ORIGIN)
	var data = JSON.parse_string(text)
	return data if data is Dictionary else {}


func _resolve_mock_body(scenario: String) -> Dictionary:
	var env = JSON.parse_string(FileAccess.get_file_as_string("%s/%s.json" % [MOCK_CONFIG_DIR, scenario]))
	if not env is Dictionary:
		fail("cannot read mock scenario " + scenario)
		return {}
	if env.has("extends"):
		var parent := _resolve_mock_body(env.extends)
		return _merge(parent, env.get("body_patch", {})) if env.has("body_patch") else parent
	return env.get("body", {})


func _merge(base: Variant, patch: Variant) -> Variant:
	if base is Dictionary and patch is Dictionary:
		var out: Dictionary = base.duplicate(true)
		for key in patch:
			out[key] = _merge(out[key], patch[key]) if out.has(key) else patch[key]
		return out
	if _is_id_list(base) and _is_id_list(patch):
		var out: Array = base.duplicate(true)
		for item in patch:
			var idx := out.find_custom(func(o: Dictionary) -> bool: return o.id == item.id)
			if idx >= 0:
				out[idx] = _merge(out[idx], item)
			else:
				out.append(item)
		return out
	return patch


func _is_id_list(value: Variant) -> bool:
	return value is Array and not value.is_empty() and value.all(
		func(v: Variant) -> bool: return v is Dictionary and v.has("id"))


func find_flavor(config: Dictionary, id: String) -> Dictionary:
	for f in config.flavors:
		if f.id == id:
			return f
	return {}


## Synthetic left click (press + release) at a control's centre via _gui_input.
func click(control: Control) -> void:
	for pressed in [true, false]:
		var ev := InputEventMouseButton.new()
		ev.button_index = MOUSE_BUTTON_LEFT
		ev.pressed = pressed
		ev.position = control.size / 2.0
		control._gui_input(ev)


# --- Autoload state isolation for scene tests --------------------------------

## Snapshot of the real ConfigManager/Nav/OrderState state; restore in after_each.
func snapshot_app_state() -> Dictionary:
	return {
		"config": ConfigManager.current_config.duplicate(true),
		"settings": ConfigManager.local_settings.duplicate(true),
		"remote": ConfigManager.remote_maintenance_enabled,
		"local_faults": ConfigManager.local_faults.duplicate(),
		"emitted_active": ConfigManager._last_emitted_active,
		"emitted_message": ConfigManager._last_emitted_message,
	}


func restore_app_state(snap: Dictionary) -> void:
	ConfigManager.current_config = snap.config
	ConfigManager.local_settings = snap.settings
	ConfigManager.remote_maintenance_enabled = snap.remote
	ConfigManager.local_faults = snap.local_faults
	ConfigManager._last_emitted_active = snap.emitted_active
	ConfigManager._last_emitted_message = snap.emitted_message
	Nav.dry_run = false
	Nav.last_requested = ""
	OrderState.reset()
