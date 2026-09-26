extends TestCase
## ConfigManager against the mock server on :8788. Every test uses a fresh,
## isolated instance under user://test_cm/ — never the real autoload or files.

const DIR := "user://test_cm"
const CACHE := DIR + "/config_cache.json"

var cm: Node


func before_each() -> void:
	await mock_reset()
	DirAccess.make_dir_recursive_absolute(DIR)
	for path in [CACHE, CACHE + ".tmp"]:
		if FileAccess.file_exists(path):
			DirAccess.remove_absolute(path)


func after_each() -> void:
	if is_instance_valid(cm):
		cm.queue_free()
	cm = null


func _make_cm(tenant: String = "t-test", timeout_sec: int = 2) -> Node:
	var tenant_path := DIR + "/tenant_id.txt"
	if tenant == "":
		if FileAccess.file_exists(tenant_path):
			DirAccess.remove_absolute(tenant_path)
	else:
		_write(tenant_path, tenant)
	_write(DIR + "/override.json", JSON.stringify({
		"api": {"base_url": MOCK_ORIGIN + "/fuelbot", "request_timeout_sec": timeout_sec},
	}))
	if is_instance_valid(cm):
		cm.queue_free()
	cm = load("res://autoload/ConfigManager.gd").new()
	cm.auto_boot = false
	cm.tenant_id_path = tenant_path
	cm.cache_path = CACHE
	cm.local_settings_override_path = DIR + "/override.json"
	add_child(cm)
	return cm


func _write(path: String, text: String) -> void:
	var f := FileAccess.open(path, FileAccess.WRITE)
	f.store_string(text)
	f.close()


## Boots and waits for config_ready. Returns true if it fired.
func _boot(instance: Node, timeout_sec: float = 4.0) -> bool:
	var ready := watch_signal(instance, &"config_ready")
	instance.boot()
	return await wait_until(ready, timeout_sec)


func _flavor(id: String) -> Dictionary:
	for f in cm.current_config.flavors:
		if f.id == id:
			return f
	return {}


func test_boot_is_synchronously_usable() -> void:
	_make_cm()
	var ready := watch_signal(cm, &"config_ready")
	cm.boot()
	assert_true(cm.current_config.flavors.size() > 0, "flavors populated before any network result")
	assert_eq(cm.config_source, "default", "source")
	await wait_until(ready, 4.0)


func test_override_merges_into_local_settings() -> void:
	_make_cm()
	await _boot(cm)
	assert_eq(cm.get_api_url(), MOCK_ORIGIN + "/fuelbot/config", "api url")
	assert_eq(cm.get_message("status_ready"), "READY", "messages survive the merge")


func test_no_tenant_means_no_request() -> void:
	var before: Dictionary = await mock_state()
	_make_cm("")
	assert_true(await _boot(cm, 1.0), "config_ready fires without a tenant")
	await wait_seconds(0.3)
	var after: Dictionary = await mock_state()
	assert_eq(after.request_counts, before.request_counts, "no request made")
	assert_eq(cm.config_source, "default", "source")
	assert_false(cm.is_online, "offline")


func test_remote_success_writes_cache_atomically() -> void:
	_make_cm()
	assert_true(await _boot(cm), "config_ready")
	assert_eq(cm.config_source, "remote", "source")
	assert_eq(cm.get_tenant().display_name, "PowerFuel Gym", "tenant")
	assert_true(FileAccess.file_exists(CACHE), "cache written")
	assert_false(FileAccess.file_exists(CACHE + ".tmp"), "no leftover tmp")
	assert_true(cm.is_online, "online")
	var state: Dictionary = await mock_state()
	assert_eq(state.last_tenant["/fuelbot/config"], "t-test", "tenant header sent")


func test_cache_used_when_server_errors() -> void:
	_make_cm()
	await _boot(cm)
	await mock_scenario("server_error")
	_make_cm()
	await _boot(cm)
	assert_eq(cm.config_source, "cache", "source")
	assert_eq(cm.get_tenant().display_name, "PowerFuel Gym", "cached tenant")
	assert_false(cm.is_online, "offline")


func test_corrupt_cache_falls_back_to_default() -> void:
	_write(CACHE, "{broken")
	await mock_scenario("server_error")
	_make_cm()
	await _boot(cm)
	assert_eq(cm.config_source, "default", "source")


func test_invalid_payload_rejected() -> void:
	await mock_scenario("invalid_duplicate_hopper")
	_make_cm()
	await _boot(cm)
	assert_eq(cm.config_source, "default", "source")
	assert_false(FileAccess.file_exists(CACHE), "cache not written")


func test_malformed_json_rejected() -> void:
	await mock_scenario("malformed_json")
	_make_cm()
	await _boot(cm)
	assert_eq(cm.config_source, "default", "source")


func test_timeout_still_emits_ready() -> void:
	await mock_scenario("slow")
	_make_cm("t-test", 2)
	assert_true(await _boot(cm, 4.0), "config_ready within 4 s")
	assert_eq(cm.config_source, "default", "source")


func test_price_change_applies_on_boot() -> void:
	await mock_scenario("price_change")
	_make_cm()
	await _boot(cm)
	assert_eq(cm.get_charge_price(_flavor("chocolate")), 199, "chocolate price")
	var ids: Array = cm.get_flavors().map(func(f: Dictionary) -> String: return f.id)
	assert_false(ids.has("electro"), "electro hidden")


func test_charge_price_rule() -> void:
	_make_cm()
	await _boot(cm)
	assert_eq(cm.get_charge_price(_flavor("guava")), 75, "offer price wins")
	assert_eq(cm.get_charge_price(_flavor("chocolate")), 180, "actual price when no offer")


func test_sold_out_listed_but_not_orderable() -> void:
	_make_cm()
	await _boot(cm)
	var vanilla := _flavor("vanilla")
	var ids: Array = cm.get_flavors().map(func(f: Dictionary) -> String: return f.id)
	assert_true(ids.has("vanilla"), "sold-out flavor still listed")
	assert_false(cm.is_orderable(vanilla), "sold out not orderable")
	assert_eq(cm.get_min_charge_price(), 35, "min price over orderable")
	assert_eq(cm.get_flavor_by_hopper(6).get("id"), "coffee", "hopper 6 lookup")


func test_validate_config_rules() -> void:
	_make_cm()
	var base := {"flavors": [
		{"id": "a", "name": "A", "hopper": 1, "actual_price": 10, "offer_price": null, "image": "x", "enabled": true},
	], "bases": []}
	assert_true(cm.validate_config(base).is_empty(), "base config valid")
	var cases := {
		"hopper 0": {"hopper": 0}, "hopper 7": {"hopper": 7}, "hopper 2.5": {"hopper": 2.5},
		"missing image": {"image": ""}, "price 0": {"actual_price": 0},
	}
	for label in cases:
		var bad: Dictionary = base.duplicate(true)
		bad.flavors[0].merge(cases[label], true)
		assert_false(cm.validate_config(bad).is_empty(), label + " rejected")
	var six: Dictionary = base.duplicate(true)
	six.flavors[0].hopper = 6
	assert_true(cm.validate_config(six).is_empty(), "hopper 6 accepted")
	var dup: Dictionary = base.duplicate(true)
	dup.flavors.append({"id": "b", "name": "B", "hopper": 1, "actual_price": 10, "image": "y", "enabled": true})
	assert_false(cm.validate_config(dup).is_empty(), "duplicate enabled hopper rejected")
	dup.flavors[1].enabled = false
	assert_true(cm.validate_config(dup).is_empty(), "duplicate hopper on disabled flavor accepted")


func _one_flavor(fields: Dictionary) -> Dictionary:
	var f := {"id": "a", "name": "A", "hopper": 1, "actual_price": 10, "offer_price": null, "enabled": true}
	f.merge(fields, true)
	return {"flavors": [f], "bases": []}


func test_validate_image_or_image_url() -> void:
	var CM := load("res://autoload/ConfigManager.gd")
	var https := "https://b.s3.ap-south-1.amazonaws.com/m/flavors/a-20260926a.png"
	assert_true(CM.validate_config(_one_flavor({"image": "res://x.png"})).is_empty(), "image only")
	assert_true(CM.validate_config(_one_flavor({"image_url": https})).is_empty(), "image_url only")
	assert_true(CM.validate_config(_one_flavor({"image_url": null, "image": "res://x.png"})).is_empty(),
		"null image_url + image")
	assert_false(CM.validate_config(_one_flavor({"image": "", "image_url": ""})).is_empty(), "both empty")
	assert_false(CM.validate_config(_one_flavor({})).is_empty(), "neither present")
	assert_false(CM.validate_config(_one_flavor({"image_url": 5, "image": "res://x.png"})).is_empty(),
		"non-string image_url")


func test_validate_image_url_scheme() -> void:
	var CM := load("res://autoload/ConfigManager.gd")
	for url in ["http://127.0.0.1:8787/__mock/assets/flavors/a.png", "http://localhost/a.png",
			"https://x.s3.amazonaws.com/a.png"]:
		assert_true(CM.validate_config(_one_flavor({"image_url": url})).is_empty(), "accepted: " + url)
	for url in ["http://example.com/a.png", "ftp://x.com/a.png", "https://x.com/", "https://x.com",
			"https://x.com/a/.hidden", "https:///a.png", "x.png"]:
		assert_false(CM.validate_config(_one_flavor({"image_url": url, "image": "res://x.png"})).is_empty(),
			"rejected: " + url)


func test_image_file_name() -> void:
	var CM := load("res://autoload/ConfigManager.gd")
	var cases := {
		"https://b.s3.ap-south-1.amazonaws.com/m-042/flavors/prymor_guava-20260926a.png?X-Amz-Signature=ab":
			"prymor_guava-20260926a.png",
		"https://cdn.example.com/a/b%20c.webp": "b c.webp",
		"https://cdn.example.com/a/x.png#frag": "x.png",
		"https://cdn.example.com/a/": "",
		"https://cdn.example.com": "",
		"https://cdn.example.com/a/..": "",
		"https://cdn.example.com/a%2Fb.png": "",
		"": "",
	}
	for url in cases:
		assert_eq(CM.image_file_name(url), cases[url], url)


func test_normalise_image_defaults() -> void:
	_make_cm()
	var cfg: Dictionary = cm.normalise({"flavors": [{"id": "a", "image": null}, {"id": "b"}]})
	for f in cfg.flavors:
		assert_eq(f.image, "", "%s image" % f.id)
		assert_eq(f.image_url, "", "%s image_url" % f.id)


func test_poll_flips_maintenance_without_touching_catalog() -> void:
	_make_cm()
	await _boot(cm)
	cm.current_config.flavors[0].name = "SENTINEL"
	await mock_scenario("maintenance_on")
	var res := watch_signal(cm, &"maintenance_changed")
	assert_true(cm.refresh_maintenance_now(), "poll started")
	assert_true(await wait_until(res, 4.0), "maintenance_changed fired")
	assert_eq(res.args[0], true, "enabled")
	assert_true(String(res.args[1]).begins_with("This machine is temporarily unavailable"), "remote message")
	assert_eq(cm.current_config.flavors[0].name, "SENTINEL", "catalog untouched by poll")
	assert_eq(cm.get_maintenance_info().faults.size(), 2, "faults")


func test_maintenance_signal_not_repeated() -> void:
	_make_cm()
	await _boot(cm)
	await mock_scenario("maintenance_on")
	var count := [0]
	cm.maintenance_changed.connect(func(_e: bool, _m: String) -> void: count[0] += 1)
	for i in 2:
		cm.refresh_maintenance_now()
		while cm._poll_in_flight:
			await get_tree().process_frame
	assert_eq(count[0], 1, "emitted once")


func test_empty_remote_message_uses_default() -> void:
	await mock_scenario("maintenance_no_message")
	_make_cm()
	await _boot(cm)
	assert_true(cm.is_in_maintenance(), "in maintenance")
	assert_eq(cm.get_maintenance_info().message, cm.get_message("maintenance_default"), "default message")


func test_local_fault_composes() -> void:
	_make_cm()
	await _boot(cm)
	var res := watch_signal(cm, &"maintenance_changed")
	cm.set_local_hardware_fault(true)
	assert_eq(res.count, 1, "emitted on set")
	assert_eq(res.args[0], true, "enabled")
	assert_eq(res.args[1], cm.get_message("maintenance_default"), "local uses default message")
	assert_eq(cm.get_maintenance_info().source, "local", "source")
	cm.set_local_hardware_fault(false)
	assert_eq(res.count, 2, "emitted on clear")
	assert_eq(res.args[0], false, "cleared")


func test_local_fault_code_in_maintenance_info() -> void:
	_make_cm()
	cm._load_local_settings()   # auto_boot is off: messages aren't loaded until boot()
	cm.set_local_hardware_fault(true, "HOMING_TIMEOUT")
	var info: Dictionary = cm.get_maintenance_info()
	assert_eq(info.source, "local", "local source")
	assert_eq(info.faults, [{"code": "HOMING_TIMEOUT", "description": "Carriage did not reach its home position"}])
	cm.set_local_hardware_fault(true, "SOMETHING_NEW")
	assert_eq(cm.get_maintenance_info().faults[1].description, "Hardware fault", "unknown code falls back")
	cm.set_local_hardware_fault(false)
	assert_eq(cm.local_faults, {}, "cleared with the flag")
	assert_false(cm.is_in_maintenance(), "out of maintenance")


func test_local_faults_are_a_set() -> void:
	_make_cm()
	cm._load_local_settings()
	var changes := watch_signal(cm, &"maintenance_changed")
	cm.set_local_hardware_fault(true, "HOMING_TIMEOUT")
	cm.set_local_hardware_fault(true, "BRIDGE_DOWN")
	assert_eq(changes.count, 2, "a second fault re-renders maintenance")
	assert_eq(cm.get_maintenance_info().faults.map(func(f: Dictionary) -> String: return f.code),
		["HOMING_TIMEOUT", "BRIDGE_DOWN"], "both listed, oldest first")
	cm.set_local_hardware_fault(true, "HOMING_TIMEOUT")
	assert_eq(changes.count, 2, "re-setting an active fault changes nothing")
	cm.set_local_hardware_fault(false, "HOMING_TIMEOUT")
	assert_true(cm.is_in_maintenance(), "still out of service for BRIDGE_DOWN")
	assert_eq(cm.local_faults.keys(), ["BRIDGE_DOWN"], "only homing cleared")
	cm.set_local_hardware_fault(false, "BRIDGE_DOWN")
	assert_false(cm.is_in_maintenance(), "back in service")
	cm.set_local_hardware_fault(true, "HOMING_TIMEOUT")
	cm.set_local_hardware_fault(true, "BRIDGE_DOWN")
	cm.set_local_hardware_fault(false)
	assert_eq(cm.local_faults, {}, "false without a code clears all")
