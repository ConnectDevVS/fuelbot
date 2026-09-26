extends TestCase
## The test process boots sandboxed: every autoload's machine state is under user://sandbox/,
## so a test run never fetches, posts or writes anything of the developer's.

const CM_SCRIPT := "res://autoload/ConfigManager.gd"


func test_test_run_is_sandboxed() -> void:
	assert_true(ConfigManager.is_sandbox_run(), "detected from the TestRunner main scene")
	assert_true(ConfigManager.sandboxed, "ConfigManager sandboxed")


func test_autoload_paths_are_in_the_sandbox() -> void:
	var paths := {
		"tenant": ConfigManager.tenant_id_path,
		"machine": ConfigManager.machine_id_path,
		"config cache": ConfigManager.cache_path,
		"override": ConfigManager.local_settings_override_path,
		"order counter": OrderCounter.counter_path,
		"qr image": RazorpayManager.image_path,
	}
	for label in paths:
		assert_true(String(paths[label]).begins_with("user://sandbox/"), "%s: %s" % [label, paths[label]])


func test_no_tenant_and_bundled_settings() -> void:
	# The runner re-points api.base_url itself; the dev override's other keys never load.
	assert_false(FileAccess.file_exists(ConfigManager.tenant_id_path), "no sandbox tenant file")
	assert_eq(ConfigManager.config_source, "default", "bundled catalog, not the developer's cache")


func test_user_path_mapping() -> void:
	var cm: Node = load(CM_SCRIPT).new()
	cm.sandboxed = true
	assert_eq(cm.user_path("user://order_counter.txt"), "user://sandbox/order_counter.txt", "file")
	assert_eq(cm.user_path("user://image_cache"), "user://sandbox/image_cache", "folder")
	assert_eq(cm.user_path("user://sandbox/x.json"), "user://sandbox/x.json", "already mapped")
	assert_eq(cm.user_path("res://config/a.json"), "res://config/a.json", "not user://")
	cm.sandboxed = false
	assert_eq(cm.user_path("user://order_counter.txt"), "user://order_counter.txt", "not sandboxed")
	cm.free()
