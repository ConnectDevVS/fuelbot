extends TestCase

const LOCAL_SETTINGS := "res://config/local_settings.json"
const DEFAULT_CONFIG := "res://config/default_config.json"
const MOCK_DEFAULT := "res://mockserver/responses/config/default.json"


func _parse(path: String) -> Variant:
	return JSON.parse_string(FileAccess.get_file_as_string(path))


func test_local_settings_parses_and_has_sections() -> void:
	var s = _parse(LOCAL_SETTINGS)
	assert_true(s is Dictionary, "local_settings is a Dictionary")
	for key in ["api", "messages", "timing"]:
		assert_true(s.get(key) is Dictionary, "%s is a Dictionary" % key)


func test_every_timing_value_is_positive_number() -> void:
	var timing: Dictionary = _parse(LOCAL_SETTINGS).timing
	for key in timing:
		var v = timing[key]
		assert_true((v is float or v is int) and v > 0, "timing.%s positive" % key)


func test_default_config_hoppers_unique_within_1_to_6() -> void:
	var seen := {}
	for f in _parse(DEFAULT_CONFIG).flavors:
		var h := int(f.hopper)
		assert_true(h >= 1 and h <= 6, "%s hopper in range" % f.id)
		assert_false(seen.has(h), "hopper %d unique" % h)
		seen[h] = true


func test_default_config_images_exist() -> void:
	for f in _parse(DEFAULT_CONFIG).flavors:
		assert_true(ResourceLoader.exists(f.image), "image exists: %s" % f.image)


func test_idle_video_exists() -> void:
	var path := "res://assets/video/idle_ad_default.ogv"
	assert_true(ResourceLoader.exists(path) or FileAccess.file_exists(path), "idle video exists")


func test_mock_default_images_exist() -> void:
	if not FileAccess.file_exists(MOCK_DEFAULT):
		print("    (skipped: mock server not present)")
		return
	for f in _parse(MOCK_DEFAULT).body.flavors:
		assert_true(ResourceLoader.exists(f.image), "mock image exists: %s" % f.image)


func test_mock_default_image_urls() -> void:
	var CM := load("res://autoload/ConfigManager.gd")
	for f in mock_body_with_origin("default").flavors:
		assert_true(CM.is_valid_image_url(f.get("image_url", "")), "%s image_url valid" % f.id)
		assert_true(ResourceLoader.exists(f.image), "%s bundled fallback exists" % f.id)


func test_image_scenarios_validate() -> void:
	var CM := load("res://autoload/ConfigManager.gd")
	for scenario in ["default", "images_v2", "images_broken"]:
		var errors: PackedStringArray = CM.validate_config(mock_body_with_origin(scenario))
		assert_true(errors.is_empty(), "%s valid: %s" % [scenario, "; ".join(errors)])


func test_hopper_shuffle_scenario_is_valid() -> void:
	var cfg := load_mock_config("hopper_shuffle")
	var ConfigManagerScript := load("res://autoload/ConfigManager.gd")
	assert_true(ConfigManagerScript.validate_config(cfg).is_empty(), "valid: hoppers still unique")
	assert_eq(cfg.flavors[0].id, "guava", "guava is still the first card")
	assert_eq(int(find_flavor(cfg, "guava").hopper), 3, "but on hopper 3")
