extends TestCase
## IMG-03: the show order and the in-place swap on the card, details and payment summary.
## Uses the real FlavorImages autoload on its test-runner cache folder; files are written
## straight into it (no network).

const FlavorSelectScene := preload("res://scenes/flavor_select/FlavorSelect.tscn")
const FlavorDetailScene := preload("res://scenes/flavor_detail/FlavorDetail.tscn")
const PaymentScene := preload("res://scenes/payment/Payment.tscn")
const SERVED := "res://mockserver/assets/flavors/"
const GUAVA := "prymor_guava-20260926a.png"
const GUAVA_V2 := "prymor_guava-20260927a.png"

var _snap: Dictionary
var _scene: Node


func before_each() -> void:
	_snap = snapshot_app_state()
	ConfigManager.current_config = load_mock_config("default")
	Nav.dry_run = true
	Nav.last_requested = ""
	OrderState.reset()
	_wipe_cache()


func after_each() -> void:
	if is_instance_valid(_scene):
		_scene.queue_free()
	await wait_frames(1)
	_wipe_cache()
	restore_app_state(_snap)


func _wipe_cache() -> void:
	DirAccess.make_dir_recursive_absolute(FlavorImages.cache_dir)
	for file in DirAccess.get_files_at(FlavorImages.cache_dir):
		DirAccess.remove_absolute(FlavorImages.cache_dir.path_join(file))
	FlavorImages.reload_index()


func _cache(file: String) -> void:
	var f := FileAccess.open(FlavorImages.cache_dir.path_join(file), FileAccess.WRITE)
	f.store_buffer(FileAccess.get_file_as_bytes(SERVED + file))
	f.close()


func _set_index(index: Dictionary) -> void:
	var f := FileAccess.open(FlavorImages.cache_dir.path_join("index.json"), FileAccess.WRITE)
	f.store_string(JSON.stringify(index))
	f.close()
	FlavorImages.reload_index()


func _guava() -> Dictionary:
	return find_flavor(ConfigManager.current_config, "guava")


func test_show_order() -> void:
	var guava := _guava()
	assert_eq(FlavorImages.get_image_source(guava), "bundled", "nothing cached -> bundled")
	assert_true(FlavorImages.get_texture(guava) == load(guava.image), "bundled texture")
	_cache(GUAVA)
	_set_index({"guava": GUAVA})
	var v2 := guava.duplicate()
	v2.image_url = guava.image_url.replace(GUAVA, GUAVA_V2)
	assert_eq(FlavorImages.get_image_source(v2), "previous", "v2 not cached -> previous (v1)")
	assert_eq(FlavorImages.get_texture(v2).get_size(), Vector2(600, 800), "previous texture")
	assert_eq(FlavorImages.get_image_source(guava), "current", "v1 cached -> current")
	var none := {"id": "x", "image_url": v2.image_url, "image": ""}
	assert_eq(FlavorImages.get_image_source(none), "none", "nothing at all -> none")
	assert_true(FlavorImages.get_texture(none) == null, "null texture")
	none.image = "res://does/not/exist.png"
	assert_eq(FlavorImages.get_image_source(none), "none", "a missing bundled file -> none")


func test_card_swaps_in_place() -> void:
	_scene = FlavorSelectScene.instantiate()
	add_child(_scene)
	await wait_frames(1)
	var cards: Array = _scene.get_cards()
	var card: Control = cards[0]
	assert_eq(card.flavor.id, "guava", "first card")
	assert_true(card.get_image_texture() == load(_guava().image), "bundled first")
	_cache(GUAVA)
	FlavorImages.flavor_image_ready.emit("guava")
	assert_true(card.get_image_texture() == FlavorImages.get_texture(_guava()), "swapped to the S3 image")
	assert_eq(card.get_image_texture().get_size(), Vector2(600, 800), "the mock image")
	assert_eq(_scene.get_cards(), cards, "same card instances: no rebuild")


func test_card_ignores_other_flavor() -> void:
	_scene = FlavorSelectScene.instantiate()
	add_child(_scene)
	var card: Control = _scene.get_cards()[0]
	var before: Texture2D = card.get_image_texture()
	_cache(GUAVA)
	FlavorImages.flavor_image_ready.emit("chocolate")
	assert_true(card.get_image_texture() == before, "guava's card unchanged by another flavor's image")


func test_card_placeholder_when_none() -> void:
	var guava := _guava()
	guava.image = ""
	_scene = FlavorSelectScene.instantiate()
	add_child(_scene)
	var card: Control = _scene.get_cards()[0]
	assert_true(card.get_image_texture() == null, "no texture")
	assert_true(card.get_node("Content/ImageArea/Placeholder").visible, "placeholder shown")
	assert_false(card.get_node("Content/ImageArea/Image").visible, "image hidden")
	_cache(GUAVA)
	FlavorImages.flavor_image_ready.emit("guava")
	assert_false(card.get_node("Content/ImageArea/Placeholder").visible, "placeholder gone after download")


func test_details_swaps_in_place() -> void:
	var guava := _guava()
	OrderState.select_flavor(guava)
	OrderState.charged_price = 75
	_scene = FlavorDetailScene.instantiate()
	add_child(_scene)
	assert_true(_scene.get_image_texture() == load(guava.image), "bundled first")
	var name_before: String = _scene.get_name_text()
	_cache(GUAVA)
	FlavorImages.flavor_image_ready.emit("guava")
	assert_true(_scene.get_image_texture() == FlavorImages.get_texture(guava), "swapped")
	assert_eq(_scene.get_name_text(), name_before, "content untouched")
	assert_eq(OrderState.selected_flavor.id, "guava", "selection untouched")
	assert_eq(OrderState.charged_price, 75, "charged price untouched")
	assert_eq(Nav.last_requested, "", "no navigation")


func test_payment_summary_uses_flavor_images() -> void:
	var guava := _guava()
	_cache(GUAVA)
	OrderState.select_flavor(guava)
	OrderState.charged_price = 75
	_scene = PaymentScene.instantiate()   # not added: _ready (QR creation) never runs
	var panel: Control = _scene._build_summary(guava)
	assert_true(_scene.get_image_texture() == FlavorImages.get_texture(guava), "the cached S3 image")
	panel.free()
