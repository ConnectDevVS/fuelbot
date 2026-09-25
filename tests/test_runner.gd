extends Node
## Discovers res://tests/unit/test_*.gd and runs every test_* method.
## Usage: godot --headless --path . res://tests/TestRunner.tscn -- [--filter=substr]

const TEST_DIR := "res://tests/unit"
const WATCHDOG_SEC := 180.0
const TEST_API := "http://127.0.0.1:8788/fuelbot"   # run_tests.sh's mock
const TEST_QUEUE := "user://test_runner/telemetry_queue.json"
const TEST_SALES_QUEUE := "user://test_runner/sales_queue.json"

var _filter := ""


func _ready() -> void:
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--filter="):
			_filter = arg.trim_prefix("--filter=")
	var watchdog := Timer.new()
	watchdog.one_shot = true
	watchdog.wait_time = WATCHDOG_SEC
	watchdog.timeout.connect(func() -> void:
		print("TEST RUN TIMED OUT")
		get_tree().quit(2))
	add_child(watchdog)
	watchdog.start()
	_isolate_app()

	_run.call_deferred()


## Tests must never touch the developer's environment: the dev override (loaded at boot)
## points the backend at the dev mock (:8787) and the reporters at the real user:// queues.
func _isolate_app() -> void:
	ConfigManager.local_settings.api.base_url = TEST_API
	DirAccess.make_dir_recursive_absolute(TEST_QUEUE.get_base_dir())
	DirAccess.remove_absolute(TEST_QUEUE)
	TelemetryReporter.queue_path = TEST_QUEUE
	TelemetryReporter.start_queue()
	DirAccess.remove_absolute(TEST_SALES_QUEUE)
	SalesReporter.queue_path = TEST_SALES_QUEUE
	SalesReporter.start_queue()
	# No bridge runs during tests: without this the dead-bridge watchdog (SAL-02) would
	# take the test process out of service mid-run. Its own tests switch it back on.
	ConfigManager.local_settings.get("bridge", {})["require_heartbeat"] = false
	TelemetryReporter.require_heartbeat = false
	TelemetryReporter.reset_watchdog()


func _test_files() -> PackedStringArray:
	var files: PackedStringArray = []
	for f in DirAccess.get_files_at(TEST_DIR):
		var name := f.trim_suffix(".remap")
		if name.begins_with("test_") and name.ends_with(".gd") and not files.has(name):
			files.append(name)
	files.sort()
	return files


func _run() -> void:
	var total := 0
	var failed := 0
	for file in _test_files():
		var path := TEST_DIR.path_join(file)
		var script: Script = load(path)
		var file_matches := _filter == "" or file.contains(_filter)
		var methods: Array[String] = []
		for m in script.get_script_method_list():
			var mname: String = m.name
			if mname.begins_with("test_") and not methods.has(mname):
				if file_matches or mname.contains(_filter):
					methods.append(mname)
		if methods.is_empty():
			continue
		print(file)
		var t: TestCase = script.new()
		add_child(t)
		for mname in methods:
			total += 1
			t.failures.clear()
			if t.has_method("before_each"):
				await t.before_each()
			await t.call(mname)
			if t.has_method("after_each"):
				await t.after_each()
			if t.failures.is_empty():
				print("  PASS %s::%s" % [file, mname])
			else:
				failed += 1
				print("  FAIL %s::%s — %s" % [file, mname, "; ".join(t.failures)])
		t.queue_free()
		await get_tree().process_frame
	if failed == 0:
		print("ALL TESTS PASSED (%d)" % total)
		get_tree().quit(0)
	else:
		print("TESTS FAILED: %d of %d" % [failed, total])
		get_tree().quit(1)
