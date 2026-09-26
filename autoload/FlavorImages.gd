extends Node
## Flavor images from S3 (plan §3.14, devdocs/stories/images/README.md).
## Each enabled flavor's image_url is downloaded once, checked (PNG/JPEG/WebP, size, pixels),
## trimmed of transparent borders and cached in cache_dir under the URL's file name. A known
## file name is never downloaded again; the backend gives every changed image a new name.
## - One download at a time, no X-Tenant-Id; .tmp + rename.
## - index.json: flavor id -> file name of its last good image (shown during an update).
## - Starts on ConfigManager.config_ready (once per boot); retried every
##   timing.image_retry_interval_sec while anything is missing.
## - Cleanup after a pass with no failures, for a backend catalog only (never the bundled one).
## - Failures: logged; image_download_failed posted once per file name + reason per run.

signal flavor_image_ready(flavor_id: String)
signal download_failed(flavor_id: String, file_name: String, reason: String)
signal pass_finished(ok: bool)

const INDEX_FILE := "index.json"
const PNG_SIGNATURE := [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]

# Overridable for tests: plain vars (configure_from_settings() reads them from settings).
var cache_dir := "user://image_cache"
var max_bytes := 2097152
var max_px := 2048
var download_timeout_sec := 30.0
var retry_interval_sec := 600.0
var auto_configure := true
var auto_sync := true
## Called with the image_download_failed event; default: TelemetryReporter.report_event(e, "app").
var report_failure: Callable

var _index: Dictionary = {}          # flavor id -> file name
var _textures: Dictionary = {}       # file name -> ImageTexture
var _http: HTTPRequest
var _retry: Timer
var _catalog: Array = []
var _allow_cleanup := false
var _has_catalog := false
var _queue: Array = []               # [{name, url, ids}]
var _current: Dictionary = {}
var _busy := false
var _pass_ok := true
var _resync := false
var _reported: Dictionary = {}       # "name|reason" -> true


func _init() -> void:
	report_failure = _report_to_telemetry


func _ready() -> void:
	_http = HTTPRequest.new()
	_http.request_completed.connect(_on_completed)
	add_child(_http)
	_retry = Timer.new()
	_retry.timeout.connect(_on_retry)
	add_child(_retry)
	if auto_configure:
		configure_from_settings()
	if auto_sync:
		ConfigManager.config_ready.connect(_on_config_ready)
		if ConfigManager.config_loaded:
			_on_config_ready.call_deferred(ConfigManager.current_config)


func configure_from_settings() -> void:
	var cfg: Dictionary = ConfigManager.local_settings.get("images", {})
	cache_dir = String(cfg.get("cache_dir", "user://image_cache"))
	max_bytes = int(cfg.get("max_bytes", 2097152))
	max_px = int(cfg.get("max_px", 2048))
	download_timeout_sec = float(cfg.get("download_timeout_sec", 30))
	retry_interval_sec = ConfigManager.get_timing("image_retry_interval_sec", 600.0)
	reload_index()
	start_retry_timer()


## Stops everything and never syncs again on its own (the test runner's isolation).
func stop() -> void:
	auto_sync = false
	if ConfigManager.config_ready.is_connected(_on_config_ready):
		ConfigManager.config_ready.disconnect(_on_config_ready)
	_retry.stop()
	_http.cancel_request()
	_queue.clear()
	_busy = false
	_resync = false
	_has_catalog = false


func start_retry_timer() -> void:
	_retry.wait_time = maxf(retry_interval_sec, 0.05)
	_retry.start()


## Re-reads index.json from cache_dir and forgets textures held in memory.
func reload_index() -> void:
	_textures.clear()
	_index = {}
	var path := cache_dir.path_join(INDEX_FILE)
	if not FileAccess.file_exists(path):
		return
	var data = JSON.parse_string(FileAccess.get_file_as_string(path))
	if data is Dictionary:
		for id in data:
			_index[String(id)] = String(data[id])
	else:
		push_warning("[Images] unreadable %s; starting with an empty index" % path)


func is_busy() -> bool:
	return _busy


## Enabled flavors (by distinct file name) whose current image isn't cached yet.
func missing_count() -> int:
	var missing := {}
	for f in _catalog:
		var name := _name_of(f)
		if bool(f.get("enabled", false)) and name != "" and not _is_cached(name):
			missing[name] = true
	return missing.size()


## Starts a download pass for this catalog (or queues one if a pass is running).
func sync(flavors: Array, allow_cleanup: bool) -> void:
	_catalog = flavors.duplicate(true)
	_allow_cleanup = allow_cleanup
	_has_catalog = true
	if _busy:
		_resync = true
		return
	_start_pass()


# --- Decoding ------------------------------------------------------------------

## Decodes PNG, JPEG or WebP by signature (never by extension); null for anything else.
static func decode(bytes: PackedByteArray) -> Image:
	var image := Image.new()
	var err := ERR_FILE_UNRECOGNIZED
	if _is_png(bytes):
		err = image.load_png_from_buffer(bytes)
	elif bytes.size() > 3 and bytes[0] == 0xFF and bytes[1] == 0xD8 and bytes[2] == 0xFF:
		err = image.load_jpg_from_buffer(bytes)
	elif bytes.size() >= 12 and bytes.slice(0, 4).get_string_from_ascii() == "RIFF" \
			and bytes.slice(8, 12).get_string_from_ascii() == "WEBP":
		err = image.load_webp_from_buffer(bytes)
	return image if err == OK and not image.is_empty() else null


## The image without its transparent border (the same object if there's nothing to trim;
## an empty Image if it's fully transparent).
static func trim_transparent(image: Image) -> Image:
	var rect := image.get_used_rect()
	if rect.size == image.get_size():
		return image
	if rect.size.x == 0 or rect.size.y == 0:
		return Image.new()
	return image.get_region(rect)


## A PNG's width/height from its IHDR, read before decoding; (0, 0) if not a PNG.
static func png_size(bytes: PackedByteArray) -> Vector2i:
	if not _is_png(bytes) or bytes.size() < 24 or bytes.slice(12, 16).get_string_from_ascii() != "IHDR":
		return Vector2i.ZERO
	return Vector2i(_be32(bytes, 16), _be32(bytes, 20))


static func _is_png(bytes: PackedByteArray) -> bool:
	if bytes.size() < PNG_SIGNATURE.size():
		return false
	for i in PNG_SIGNATURE.size():
		if bytes[i] != PNG_SIGNATURE[i]:
			return false
	return true


static func _be32(bytes: PackedByteArray, at: int) -> int:
	return (bytes[at] << 24) | (bytes[at + 1] << 16) | (bytes[at + 2] << 8) | bytes[at + 3]


# --- The pass --------------------------------------------------------------------

func _on_config_ready(_config: Dictionary) -> void:
	sync(ConfigManager.current_config.get("flavors", []), ConfigManager.config_source != "default")


func _on_retry() -> void:
	if _has_catalog and not _busy and missing_count() > 0:
		print("[Images] retrying %d missing image(s)" % missing_count())
		_start_pass()


func _start_pass() -> void:
	_busy = true
	_pass_ok = true
	_queue.clear()
	var by_name := {}
	var index_changed := false
	for f in _catalog:
		var name := _name_of(f)
		if not bool(f.get("enabled", false)) or name == "":
			continue
		var id := String(f.get("id", ""))
		if _is_cached(name):
			if _index.get(id, "") != name:
				_index[id] = name
				index_changed = true
		elif by_name.has(name):
			by_name[name].ids.append(id)
		else:
			by_name[name] = {"name": name, "url": String(f.image_url), "ids": [id]}
			_queue.append(by_name[name])
	if index_changed:
		_save_index()
	_next()


func _next() -> void:
	if _queue.is_empty():
		_finish_pass()
		return
	_current = _queue.pop_front()
	_http.timeout = download_timeout_sec
	_http.body_size_limit = max_bytes
	var err := _http.request(_current.url)   # a plain GET: no X-Tenant-Id, no credentials
	if err != OK:
		_fail("unreachable")
		_next.call_deferred()


func _on_completed(result: int, code: int, _headers: PackedStringArray, body: PackedByteArray) -> void:
	if _current.is_empty():
		return
	var reason := _check_and_store(result, code, body)
	if reason == "":
		for id in _current.ids:
			_index[id] = _current.name
		_save_index()
		for id in _current.ids:
			flavor_image_ready.emit(id)
	else:
		_fail(reason)
	_next.call_deferred()


## "" when the image was accepted and cached, else the failure reason.
func _check_and_store(result: int, code: int, body: PackedByteArray) -> String:
	if result == HTTPRequest.RESULT_TIMEOUT:
		return "timeout"
	if result == HTTPRequest.RESULT_BODY_SIZE_LIMIT_EXCEEDED or body.size() > max_bytes:
		return "too_large_bytes"
	if result != HTTPRequest.RESULT_SUCCESS:
		return "unreachable"
	if code != 200:
		return "http_%d" % code
	var header_size := png_size(body)
	if header_size.x > max_px or header_size.y > max_px:
		return "too_large_px"     # before decoding: a small PNG can still decode huge
	var image := decode(body)
	if image == null:
		return "not_an_image"
	if image.get_width() > max_px or image.get_height() > max_px:
		return "too_large_px"
	var trimmed := trim_transparent(image)
	if trimmed.is_empty():
		return "empty_image"
	var bytes := body if trimmed == image else trimmed.save_png_to_buffer()
	if not _write_atomic(cache_dir.path_join(_current.name), bytes):
		return "write_failed"
	_textures[_current.name] = ImageTexture.create_from_image(trimmed)
	print("[Images] cached %s (%dx%d%s)" % [_current.name, trimmed.get_width(), trimmed.get_height(),
		"" if trimmed == image else ", trimmed from %dx%d" % [image.get_width(), image.get_height()]])
	return ""


func _fail(reason: String) -> void:
	_pass_ok = false
	var name: String = _current.name
	for id in _current.ids:
		push_warning("[Images] %s %s: %s (keeping the image shown now)" % [id, name, reason])
		download_failed.emit(id, name, reason)
	var key := name + "|" + reason
	if not _reported.has(key):
		_reported[key] = true
		report_failure.call({"v": 1, "event_type": "image_download_failed",
			"flavor_id": _current.ids[0], "file_name": name, "reason": reason})


func _finish_pass() -> void:
	_busy = false
	_current = {}
	if _pass_ok and _allow_cleanup:
		_cleanup()
	pass_finished.emit(_pass_ok)
	if _resync:
		_resync = false
		_start_pass()


## Deletes files no flavor in the catalog names (and *.tmp); drops stale index entries.
func _cleanup() -> void:
	var keep := {INDEX_FILE: true}
	var ids := {}
	for f in _catalog:
		ids[String(f.get("id", ""))] = true
		var name := _name_of(f)
		if name != "":
			keep[name] = true
	var removed: PackedStringArray = []
	for file in DirAccess.get_files_at(cache_dir):
		if not keep.has(file):
			DirAccess.remove_absolute(cache_dir.path_join(file))
			_textures.erase(file)
			removed.append(file)
	var index_changed := false
	for id in _index.keys():
		if not ids.has(id) or not _is_cached(_index[id]):
			_index.erase(id)
			index_changed = true
	if index_changed:
		_save_index()
	if not removed.is_empty():
		print("[Images] cleanup removed %s" % ", ".join(removed))


# --- Files -------------------------------------------------------------------------

func _name_of(flavor: Dictionary) -> String:
	var url = flavor.get("image_url", "")
	return ConfigManager.image_file_name(url) if url is String else ""


func _is_cached(name: String) -> bool:
	return FileAccess.file_exists(cache_dir.path_join(name))


func _save_index() -> void:
	if not _write_atomic(cache_dir.path_join(INDEX_FILE), JSON.stringify(_index).to_utf8_buffer()):
		push_warning("[Images] cannot write the image index")


func _write_atomic(path: String, bytes: PackedByteArray) -> bool:
	DirAccess.make_dir_recursive_absolute(path.get_base_dir())
	var tmp := path + ".tmp"
	var f := FileAccess.open(tmp, FileAccess.WRITE)
	if f == null:
		push_warning("[Images] cannot write %s: %s" % [tmp, error_string(FileAccess.get_open_error())])
		return false
	f.store_buffer(bytes)
	f.close()
	var err := DirAccess.rename_absolute(tmp, path)
	if err != OK:
		DirAccess.remove_absolute(tmp)
		push_warning("[Images] rename to %s failed: %s" % [path, error_string(err)])
		return false
	return true


func _report_to_telemetry(event: Dictionary) -> void:
	TelemetryReporter.report_event(event, "app")
