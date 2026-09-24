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


## Waits for obj.signal_name or until timeout. Returns {"fired": bool, "args": Array}.
func wait_for_signal(obj: Object, signal_name: StringName, timeout_sec: float) -> Dictionary:
	var state := {"fired": false, "args": []}
	var cb := func(a0 = null, a1 = null, a2 = null) -> void:
		state.fired = true
		state.args = [a0, a1, a2]
	obj.connect(signal_name, cb, CONNECT_ONE_SHOT)
	var deadline := Time.get_ticks_msec() + int(timeout_sec * 1000)
	while not state.fired and Time.get_ticks_msec() < deadline:
		await get_tree().process_frame
	if not state.fired and obj.is_connected(signal_name, cb):
		obj.disconnect(signal_name, cb)
	return state
