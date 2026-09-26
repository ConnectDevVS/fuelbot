extends TestCase
## FlavorImages (IMG-02) against the mock on :8788. Every test uses a fresh instance with
## its own folder under user://test_images/ — never the autoload's cache.

const DIR := "user://test_images"
const ASSETS := MOCK_ORIGIN + "/__mock/assets/flavors/"
const SERVED := "res://mockserver/assets/flavors/"
const GUAVA := "prymor_guava-20260926a.png"
const GUAVA_V2 := "prymor_guava-20260927a.png"
const CHOC := "mmn_chocolate-20260926a.png"
const COOKIE := "prymor_cookie-20260926a.png"
const MISSING := "mmn_chocolate-20260926z.png"

var fi: Node
var reports: Array = []
var failures_seen: Array = []


func before_each() -> void:
	await mock_reset()
	reports = []
	failures_seen = []


func after_each() -> void:
	if is_instance_valid(fi):
		fi.queue_free()
	fi = null


func _make(sub: String, wipe := true) -> Node:
	var dir := DIR.path_join(sub)
	if wipe:
		_wipe(dir)
	if is_instance_valid(fi):
		fi.queue_free()
	fi = load("res://autoload/FlavorImages.gd").new()
	fi.auto_configure = false
	fi.auto_sync = false
	add_child(fi)
	fi.cache_dir = dir
	fi.download_timeout_sec = 3.0
	fi.report_failure = func(e: Dictionary) -> void: reports.append(e)
	fi.download_failed.connect(func(id: String, file: String, reason: String) -> void:
		failures_seen.append([id, file, reason]))
	fi.reload_index()
	return fi


func _wipe(dir: String) -> void:
	DirAccess.make_dir_recursive_absolute(dir)
	for file in DirAccess.get_files_at(dir):
		DirAccess.remove_absolute(dir.path_join(file))


func _flavor(id: String, file: String, enabled := true) -> Dictionary:
	return {"id": id, "enabled": enabled, "image_url": ASSETS + file, "image": ""}


## Runs one pass; returns its ok flag (false also on timeout).
func _sync(flavors: Array, cleanup := true) -> bool:
	var done := watch_signal(fi, &"pass_finished")
	fi.sync(flavors, cleanup)
	if not await wait_until(done, 10.0):
		fail("pass did not finish")
		return false
	return done.args[0]


## The mock's asset_counts with int values (JSON numbers arrive as floats).
func _counts() -> Dictionary:
	var out := {}
	var counts: Dictionary = (await mock_state()).get("asset_counts", {})
	for key in counts:
		out[key] = int(counts[key])
	return out


func _cached(file: String) -> bool:
	return FileAccess.file_exists(fi.cache_dir.path_join(file))


func _index() -> Dictionary:
	var data = JSON.parse_string(FileAccess.get_file_as_string(fi.cache_dir.path_join("index.json")))
	return data if data is Dictionary else {}


func test_downloads_each_once() -> void:
	_make("once")
	var ready := []
	fi.flavor_image_ready.connect(func(id: String) -> void: ready.append(id))
	var flavors := [_flavor("guava", GUAVA), _flavor("chocolate", CHOC)]
	assert_true(await _sync(flavors), "pass ok")
	assert_true(_cached(GUAVA) and _cached(CHOC), "both cached")
	assert_eq(_index(), {"guava": GUAVA, "chocolate": CHOC}, "index")
	assert_eq(ready, ["guava", "chocolate"], "flavor_image_ready for each")
	assert_true(await _sync(flavors), "second pass ok")
	var counts := await _counts()
	assert_eq(int(counts.get("flavors/" + GUAVA, 0)), 1, "guava downloaded once")
	assert_eq(int(counts.get("flavors/" + CHOC, 0)), 1, "chocolate downloaded once")


func test_restart_downloads_nothing() -> void:
	_make("restart")
	var flavors := [_flavor("guava", GUAVA), _flavor("chocolate", CHOC)]
	await _sync(flavors)
	await mock_reset()
	_make("restart", false)
	assert_eq(fi.missing_count(), 0, "nothing missing before the pass")  # no catalog yet
	assert_true(await _sync(flavors), "pass ok")
	assert_eq(await _counts(), {}, "no asset requests after a restart")


func test_changed_name_downloads_only_that() -> void:
	_make("changed")
	await _sync([_flavor("guava", GUAVA), _flavor("chocolate", CHOC)])
	await mock_reset()
	assert_true(await _sync([_flavor("guava", GUAVA_V2), _flavor("chocolate", CHOC)]), "pass ok")
	assert_eq(await _counts(), {"flavors/" + GUAVA_V2: 1}, "only v2 requested")
	assert_eq(_index().get("guava"), GUAVA_V2, "index -> v2")
	assert_false(_cached(GUAVA), "v1 cleaned up after the successful pass")


func test_query_string_ignored() -> void:
	_make("query")
	var a := _flavor("guava", GUAVA + "?delay_ms=1")
	var b := _flavor("guava", GUAVA + "?sig=abc")
	await _sync([a])
	await _sync([b])
	assert_eq(await _counts(), {"flavors/" + GUAVA: 1}, "one download despite a new query string")
	assert_true(_cached(GUAVA), "cached under the bare file name")


func test_padded_image_is_trimmed() -> void:
	_make("trim")
	assert_true(await _sync([_flavor("cookie", COOKIE)]), "pass ok")
	var image: Image = fi.decode(FileAccess.get_file_as_bytes(fi.cache_dir.path_join(COOKIE)))
	assert_true(image != null, "cached file decodes")
	if image:
		assert_eq(image.get_size(), Vector2i(300, 400), "trimmed from 1600x2000")


func test_untrimmed_bytes_kept() -> void:
	_make("bytes")
	await _sync([_flavor("guava", GUAVA)])
	assert_eq(FileAccess.get_file_as_bytes(fi.cache_dir.path_join(GUAVA)),
		FileAccess.get_file_as_bytes(SERVED + GUAVA), "tightly framed image stored as served")


func test_decode_formats() -> void:
	var FI := load("res://autoload/FlavorImages.gd")
	var img := Image.create(40, 30, false, Image.FORMAT_RGBA8)
	img.fill(Color(0, 0, 0, 0))
	img.fill_rect(Rect2i(10, 5, 12, 20), Color(1, 0.5, 0, 1))
	for pair in [["png", img.save_png_to_buffer()], ["jpg", img.save_jpg_to_buffer()],
			["webp", img.save_webp_to_buffer(false)]]:
		var decoded: Image = FI.decode(pair[1])
		assert_true(decoded != null, "%s decodes" % pair[0])
		if decoded:
			assert_eq(decoded.get_size(), Vector2i(40, 30), "%s size" % pair[0])
	var webp: Image = FI.decode(img.save_webp_to_buffer(false))
	if webp:
		assert_eq(FI.trim_transparent(webp).get_size(), Vector2i(12, 20), "webp trims")
	var jpg: Image = FI.decode(img.save_jpg_to_buffer())
	if jpg:
		assert_eq(FI.trim_transparent(jpg), jpg, "jpeg (no alpha) is never trimmed")
	assert_true(FI.decode("not an image".to_utf8_buffer()) == null, "junk -> null")
	assert_true(FI.decode(PackedByteArray()) == null, "empty -> null")
	var blank := Image.create(8, 8, false, Image.FORMAT_RGBA8)
	assert_true(FI.trim_transparent(blank).is_empty(), "fully transparent -> empty")
	assert_eq(FI.png_size(img.save_png_to_buffer()), Vector2i(40, 30), "png header size")


func test_404_corrupt_too_wide_rejected() -> void:
	_make("broken")
	var ok := await _sync([_flavor("chocolate", MISSING), _flavor("electro", "broken-20260926a.png"),
		_flavor("vanilla", "too_wide-20260926a.png")])
	assert_false(ok, "pass not ok")
	var reasons := {}
	for f in failures_seen:
		reasons[f[0]] = f[2]
	assert_eq(reasons, {"chocolate": "http_404", "electro": "not_an_image", "vanilla": "too_large_px"}, "reasons")
	assert_eq(DirAccess.get_files_at(fi.cache_dir).size(), 0, "no files and no .tmp left")


func test_too_many_bytes() -> void:
	_make("bytes_limit")
	fi.max_bytes = 1000
	assert_false(await _sync([_flavor("guava", GUAVA)]), "pass not ok")
	assert_eq(failures_seen.map(func(f: Array) -> String: return f[2]), ["too_large_bytes"], "reason")
	assert_false(_cached(GUAVA), "not cached")


func test_unreachable() -> void:
	var server := TCPServer.new()
	server.listen(0, "127.0.0.1")
	var port := server.get_local_port()
	server.stop()
	_make("unreachable")
	var f := {"id": "guava", "enabled": true, "image_url": "http://127.0.0.1:%d/%s" % [port, GUAVA]}
	assert_false(await _sync([f]), "pass not ok")
	assert_eq(failures_seen.map(func(x: Array) -> String: return x[2]), ["unreachable"], "reason")


func test_failure_reported_once() -> void:
	_make("report_once")
	var flavors := [_flavor("chocolate", MISSING)]
	await _sync(flavors)
	await _sync(flavors)
	assert_eq(failures_seen.size(), 2, "download_failed each pass")
	assert_eq(reports.size(), 1, "reported once per file name + reason")
	if reports.size() == 1:
		assert_eq(reports[0], {"v": 1, "event_type": "image_download_failed", "flavor_id": "chocolate",
			"file_name": MISSING, "reason": "http_404"}, "event (no URL)")


func test_failure_event_via_telemetry() -> void:
	_make("telemetry")
	fi.report_failure = fi._report_to_telemetry
	var delivered := watch_signal(TelemetryReporter.queue, &"delivered")
	await _sync([_flavor("chocolate", MISSING)])
	var record := {}
	for r in TelemetryReporter.queue.records():
		if r.get("event_type") == "image_download_failed" and r.get("file_name") == MISSING:
			record = r
	if record.is_empty() and await wait_until(delivered, 3.0):
		record = delivered.args[0]
	assert_eq(record.get("event_type"), "image_download_failed", "queued via TelemetryReporter")
	assert_eq(record.get("source"), "app", "source")
	assert_eq(record.get("reason"), "http_404", "reason")
	assert_true(String(record.get("timestamp", "")).ends_with("Z"), "stamped")


func test_no_tenant_header() -> void:
	_make("tenant")
	await _sync([_flavor("guava", GUAVA)])
	var state := await mock_state()
	assert_eq(int(state.asset_counts.get("flavors/" + GUAVA, 0)), 1, "downloaded")
	assert_eq(state.get("asset_last_tenant"), null, "no X-Tenant-Id on the image GET")


func test_cleanup_after_success() -> void:
	_make("cleanup")
	for file in ["old-20250101a.png", "stale.tmp"]:
		var f := FileAccess.open(fi.cache_dir.path_join(file), FileAccess.WRITE)
		f.store_string("x")
		f.close()
	var f := FileAccess.open(fi.cache_dir.path_join("index.json"), FileAccess.WRITE)
	f.store_string(JSON.stringify({"gone": "old-20250101a.png"}))
	f.close()
	fi.reload_index()
	assert_true(await _sync([_flavor("guava", GUAVA)]), "pass ok")
	assert_false(_cached("old-20250101a.png"), "unreferenced file deleted")
	assert_false(_cached("stale.tmp"), "leftover .tmp deleted")
	assert_eq(_index(), {"guava": GUAVA}, "index entry for a flavor no longer in the catalog dropped")


func test_no_cleanup_after_failure_or_default() -> void:
	_make("no_cleanup")
	var f := FileAccess.open(fi.cache_dir.path_join("old-20250101a.png"), FileAccess.WRITE)
	f.store_string("x")
	f.close()
	assert_false(await _sync([_flavor("guava", GUAVA), _flavor("chocolate", MISSING)]), "failed pass")
	assert_true(_cached("old-20250101a.png"), "kept after a failed pass")
	assert_true(await _sync([_flavor("guava", GUAVA)], false), "ok pass without cleanup")
	assert_true(_cached("old-20250101a.png"), "kept for the bundled catalog")


func test_disabled_flavor_kept_not_downloaded() -> void:
	_make("disabled")
	var src := FileAccess.get_file_as_bytes(SERVED + CHOC)
	var f := FileAccess.open(fi.cache_dir.path_join(CHOC), FileAccess.WRITE)
	f.store_buffer(src)
	f.close()
	var flavors := [_flavor("guava", GUAVA), _flavor("chocolate", CHOC, false),
		_flavor("electro", "prymor_electro-20260926a.png", false)]
	assert_true(await _sync(flavors), "pass ok")
	assert_eq(await _counts(), {"flavors/" + GUAVA: 1}, "only the enabled flavor downloaded")
	assert_true(_cached(CHOC), "a disabled flavor's cached image is kept")


func test_retry_timer() -> void:
	_make("retry")
	fi.retry_interval_sec = 0.3
	fi.start_retry_timer()
	await _sync([_flavor("chocolate", MISSING)])
	var deadline := Time.get_ticks_msec() + 3000
	var count := 0
	while Time.get_ticks_msec() < deadline and count < 2:
		await wait_seconds(0.2)
		count = int((await _counts()).get("flavors/" + MISSING, 0))
	assert_true(count >= 2, "retried (requests: %d)" % count)
	assert_true(await _sync([_flavor("guava", GUAVA)]), "a good catalog")
	var before := await _counts()
	await wait_seconds(1.0)
	assert_eq(await _counts(), before, "nothing more requested once complete")


func test_isolation() -> void:
	assert_eq(FlavorImages.cache_dir, "user://test_runner/image_cache", "autoload on the test cache")
	assert_false(FlavorImages.auto_sync, "no automatic sync in tests")
	assert_false(ConfigManager.config_ready.is_connected(FlavorImages._on_config_ready), "not listening")
