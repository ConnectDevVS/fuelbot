extends Node
## Loads the tenant catalog config and local settings, and tracks maintenance state.
##
## Refresh cadence (plan §3.3):
## - current_config: loaded at boot (cache or bundled default, synchronously), then
##   replaced once if the boot fetch succeeds. Catalog changes need a restart.
## - local_settings: read once at boot, never changes afterwards.
## - maintenance flag: refreshed live, every timing.maintenance_poll_interval_sec.
##
## Registered FIRST in [autoload]: later autoloads read tenant_id/current_config.

signal config_ready(config: Dictionary)
signal maintenance_changed(enabled: bool, message: String)
signal connectivity_changed(online: bool)

const MAX_HOPPER := 6

# Overridable for tests: plain vars, not consts.
var tenant_id_path := "user://tenant_id.txt"
var cache_path := "user://config_cache.json"
var default_config_path := "res://config/default_config.json"
var local_settings_path := "res://config/local_settings.json"
var local_settings_override_path := "user://local_settings.override.json"
var auto_boot := true

var tenant_id: String = ""
var current_config: Dictionary = {}
var local_settings: Dictionary = {}
var config_source: String = ""
var config_loaded := false
var is_online := false
var last_successful_fetch_unix := 0.0
var remote_maintenance_enabled := false
var local_hardware_fault_active := false

var _default_tenant: Dictionary = {}
var _http_boot: HTTPRequest
var _http_poll: HTTPRequest
var _poll_timer: Timer
var _poll_in_flight := false
var _last_emitted_active := false
var _last_emitted_message := ""


func _ready() -> void:
	if auto_boot:
		boot()


func boot() -> void:
	config_loaded = false
	_load_local_settings()
	_default_tenant = _read_json(default_config_path).get("tenant", {})

	tenant_id = ""
	if FileAccess.file_exists(tenant_id_path):
		tenant_id = FileAccess.get_file_as_string(tenant_id_path).strip_edges()
	if tenant_id == "":
		push_warning("[ConfigManager] no tenant id at %s; skipping remote fetch" % tenant_id_path)

	current_config = {}
	if FileAccess.file_exists(cache_path):
		var cached = _read_json(cache_path)
		var errors := validate_config(cached)
		if errors.is_empty():
			current_config = normalise(cached)
			config_source = "cache"
		else:
			push_warning("[ConfigManager] ignoring unusable cache: %s" % "; ".join(errors))
	if current_config.is_empty():
		current_config = normalise(_read_json(default_config_path))
		config_source = "default"

	remote_maintenance_enabled = bool(current_config.maintenance.enabled)
	_last_emitted_active = is_in_maintenance()
	_last_emitted_message = get_maintenance_info().message

	if tenant_id == "":
		_finish_boot.call_deferred("no tenant id")
		return

	_ensure_nodes()
	var err := _http_boot.request(get_api_url(), _headers())
	if err != OK:
		_finish_boot.call_deferred("request error %d" % err)
	_poll_timer.wait_time = maxf(get_timing("maintenance_poll_interval_sec", 120.0), 1.0)
	_poll_timer.start()


# --- Accessors ---------------------------------------------------------------

func get_flavors() -> Array:
	return current_config.get("flavors", []).filter(func(f: Dictionary) -> bool: return f.enabled)


func is_orderable(flavor: Dictionary) -> bool:
	return bool(flavor.get("enabled", false)) and not bool(flavor.get("sold_out", false))


func get_flavor_by_hopper(n: int) -> Dictionary:
	for f in get_flavors():
		if f.hopper == n:
			return f
	return {}


func get_charge_price(flavor: Dictionary) -> int:
	var offer = flavor.get("offer_price")
	return int(offer) if offer != null else int(flavor.get("actual_price", 0))


func get_min_charge_price() -> int:
	var best := 0
	for f in get_flavors():
		if is_orderable(f):
			var p := get_charge_price(f)
			if best == 0 or p < best:
				best = p
	return best


func get_base(id: String) -> Dictionary:
	for b in current_config.get("bases", []):
		if b.get("id") == id:
			return b
	return {}


func get_tenant() -> Dictionary:
	return current_config.get("tenant", _default_tenant)


func get_message(key: String, params: Dictionary = {}) -> String:
	var messages: Dictionary = local_settings.get("messages", {})
	if not messages.has(key):
		push_warning("[ConfigManager] missing message '%s'" % key)
		return "[" + key + "]"
	return String(messages[key]).format(params)


func get_timing(key: String, fallback: float = 0.0) -> float:
	var timing: Dictionary = local_settings.get("timing", {})
	if not timing.has(key):
		push_warning("[ConfigManager] missing timing '%s'" % key)
		return fallback
	return float(timing[key])


func get_api_url() -> String:
	var api: Dictionary = local_settings.get("api", {})
	return String(api.get("base_url", "")).rstrip("/") + String(api.get("config_path", ""))


## base_url + api.<path_key> (e.g. "telemetry_path"); "" when either is unset.
func get_api_endpoint(path_key: String) -> String:
	var api: Dictionary = local_settings.get("api", {})
	var base := String(api.get("base_url", "")).rstrip("/")
	var path := String(api.get(path_key, ""))
	return "" if base == "" or path == "" else base + path


## Headers for our own backend; empty until a tenant is provisioned.
func get_backend_headers() -> PackedStringArray:
	return PackedStringArray() if tenant_id == "" else _headers()


# --- Maintenance -------------------------------------------------------------

func is_in_maintenance() -> bool:
	return remote_maintenance_enabled or local_hardware_fault_active


func get_maintenance_info() -> Dictionary:
	var m: Dictionary = current_config.get("maintenance", {})
	var default_message := get_message("maintenance_default")
	if remote_maintenance_enabled:
		var msg: String = m.get("message", "")
		return {
			"active": true,
			"source": "remote",
			"message": msg if msg != "" else default_message,
			"flagged_by": m.get("flagged_by", ""),
			"flagged_at": m.get("flagged_at", ""),
			"faults": m.get("faults", []),
		}
	if local_hardware_fault_active:
		return {
			"active": true,
			"source": "local",
			"message": default_message,
			"flagged_by": get_message("maintenance_local_fault_by"),
			"flagged_at": "",
			"faults": [],
		}
	return {"active": false, "source": "", "message": default_message,
		"flagged_by": "", "flagged_at": "", "faults": []}


func set_local_hardware_fault(active: bool) -> void:
	local_hardware_fault_active = active
	_emit_maintenance_if_changed()


func refresh_maintenance_now() -> bool:
	if tenant_id == "" or _poll_in_flight:
		return false
	_ensure_nodes()
	var err := _http_poll.request(get_api_url(), _headers())
	if err != OK:
		push_warning("[ConfigManager] maintenance poll request error %d" % err)
		return false
	_poll_in_flight = true
	return true


# --- Validation & normalisation ---------------------------------------------

static func validate_config(data: Variant) -> PackedStringArray:
	var errors: PackedStringArray = []
	if not data is Dictionary:
		errors.append("config is not an object")
		return errors
	var flavors = data.get("flavors")
	if not flavors is Array or flavors.is_empty():
		errors.append("flavors must be a non-empty array")
		return errors
	if not data.get("bases", []) is Array:
		errors.append("bases must be an array")
	if data.has("tenant") and not data.tenant is Dictionary:
		errors.append("tenant must be an object")
	if data.has("maintenance"):
		if not data.maintenance is Dictionary:
			errors.append("maintenance must be an object")
		elif data.maintenance.has("faults") and not data.maintenance.faults is Array:
			errors.append("maintenance.faults must be an array")
	var used_hoppers := {}
	for f in flavors:
		if not f is Dictionary:
			errors.append("flavor is not an object")
			continue
		var fid := str(f.get("id", "?"))
		if not f.get("id") is String or f.id == "":
			errors.append("flavor id missing")
		if not f.get("name") is String or f.name == "":
			errors.append("%s: name missing" % fid)
		var h = f.get("hopper")
		var hopper_ok: bool = (h is int or h is float) and h == floorf(h) and h >= 1 and h <= MAX_HOPPER
		if not hopper_ok:
			errors.append("%s: hopper must be a whole number 1-%d" % [fid, MAX_HOPPER])
		var price = f.get("actual_price")
		if not (price is int or price is float) or price <= 0:
			errors.append("%s: actual_price must be > 0" % fid)
		var offer = f.get("offer_price")
		if offer != null and (not (offer is int or offer is float) or offer <= 0):
			errors.append("%s: offer_price must be null or > 0" % fid)
		if not f.get("image") is String or f.image == "":
			errors.append("%s: image missing" % fid)
		if f.has("sold_out") and not f.sold_out is bool:
			errors.append("%s: sold_out must be bool" % fid)
		if f.has("badge") and f.badge != null and not f.badge is String:
			errors.append("%s: badge must be string or null" % fid)
		if f.has("nutrition") and not f.nutrition is Dictionary:
			errors.append("%s: nutrition must be an object" % fid)
		if hopper_ok and f.get("enabled", false) == true:
			if used_hoppers.has(int(h)):
				errors.append("%s: hopper %d already used by %s" % [fid, int(h), used_hoppers[int(h)]])
			else:
				used_hoppers[int(h)] = fid
	return errors


func normalise(raw: Dictionary) -> Dictionary:
	var cfg: Dictionary = raw.duplicate(true)
	var tenant: Dictionary = _default_tenant.duplicate(true)
	var raw_tenant = raw.get("tenant", {})
	if raw_tenant is Dictionary:
		for key in raw_tenant:
			tenant[key] = raw_tenant[key]
	cfg["tenant"] = tenant

	var flavors: Array = []
	for f in cfg.get("flavors", []):
		var n: Dictionary = f.duplicate(true)
		n["hopper"] = int(n.get("hopper", 0))
		n["actual_price"] = int(n.get("actual_price", 0))
		n["offer_price"] = int(n.offer_price) if n.get("offer_price") != null else null
		n["enabled"] = bool(n.get("enabled", false))
		n["sold_out"] = bool(n.get("sold_out", false))
		for key in ["badge"]:
			if not n.has(key):
				n[key] = null
		_default(n, "description", "")
		_default(n, "volume_ml", 0)
		_default(n, "nutrition", {})
		_default(n, "ingredients", [])
		_default(n, "allergens", [])
		n["volume_ml"] = int(n.volume_ml)
		flavors.append(n)
	cfg["flavors"] = flavors
	_default(cfg, "bases", [])
	cfg["maintenance"] = _normalise_maintenance(cfg.get("maintenance", {}))
	return cfg


static func _normalise_maintenance(raw: Variant) -> Dictionary:
	var m: Dictionary = raw.duplicate(true) if raw is Dictionary else {}
	m["enabled"] = bool(m.get("enabled", false))
	for key in ["message", "flagged_by", "flagged_at"]:
		m[key] = str(m[key]) if m.get(key) != null else ""
	m["faults"] = m.faults if m.get("faults") is Array else []
	return m


static func _default(d: Dictionary, key: String, value: Variant) -> void:
	if d.get(key) == null:
		d[key] = value


# --- Internals ---------------------------------------------------------------

func _ensure_nodes() -> void:
	if _http_boot:
		return
	var timeout := float(local_settings.get("api", {}).get("request_timeout_sec", 10))
	_http_boot = HTTPRequest.new()
	_http_boot.timeout = timeout
	_http_boot.request_completed.connect(_on_boot_completed)
	add_child(_http_boot)
	_http_poll = HTTPRequest.new()
	_http_poll.timeout = timeout
	_http_poll.request_completed.connect(_on_poll_completed)
	add_child(_http_poll)
	_poll_timer = Timer.new()
	_poll_timer.timeout.connect(refresh_maintenance_now)
	add_child(_poll_timer)


func _headers() -> PackedStringArray:
	return ["X-Tenant-Id: " + tenant_id, "Accept: application/json"]


func _on_boot_completed(result: int, code: int, _headers_in: PackedStringArray, body: PackedByteArray) -> void:
	if result != HTTPRequest.RESULT_SUCCESS or code != 200:
		_set_online(false)
		_finish_boot("HTTP result %d, status %d" % [result, code])
		return
	var json := JSON.new()
	if json.parse(body.get_string_from_utf8()) != OK:
		_set_online(true)
		_finish_boot("parse error: %s" % json.get_error_message())
		return
	var data = json.get_data()
	var errors := validate_config(data)
	if not errors.is_empty():
		_set_online(true)
		_finish_boot("validation failed: %s" % "; ".join(errors))
		return
	current_config = normalise(data)
	config_source = "remote"
	last_successful_fetch_unix = Time.get_unix_time_from_system()
	_set_online(true)
	_write_cache(data)
	_apply_remote_maintenance(data.get("maintenance", {}))
	print("[ConfigManager] loaded remote config for tenant %s" % tenant_id)
	config_loaded = true
	config_ready.emit(current_config)


func _finish_boot(reason: String) -> void:
	print("[ConfigManager] %s (%s; using %s config)" % [get_message("config_fetch_failed"), reason, config_source])
	config_loaded = true
	config_ready.emit(current_config)


func _on_poll_completed(result: int, code: int, _headers_in: PackedStringArray, body: PackedByteArray) -> void:
	_poll_in_flight = false
	if result != HTTPRequest.RESULT_SUCCESS or code != 200:
		_set_online(false)
		return
	var data = JSON.parse_string(body.get_string_from_utf8())
	if not data is Dictionary:
		push_warning("[ConfigManager] maintenance poll: unparseable body")
		return
	last_successful_fetch_unix = Time.get_unix_time_from_system()
	_set_online(true)
	_apply_remote_maintenance(data.get("maintenance", {}))


func _apply_remote_maintenance(raw: Variant) -> void:
	var m := _normalise_maintenance(raw)
	current_config["maintenance"] = m
	remote_maintenance_enabled = m.enabled
	_emit_maintenance_if_changed()


func _emit_maintenance_if_changed() -> void:
	var active := is_in_maintenance()
	var message: String = get_maintenance_info().message
	if active == _last_emitted_active and (not active or message == _last_emitted_message):
		return
	_last_emitted_active = active
	_last_emitted_message = message
	maintenance_changed.emit(active, message)


func _set_online(online: bool) -> void:
	if online == is_online:
		return
	is_online = online
	connectivity_changed.emit(online)


func _write_cache(data: Variant) -> void:
	var tmp := cache_path + ".tmp"
	var f := FileAccess.open(tmp, FileAccess.WRITE)
	if f == null:
		push_warning("[ConfigManager] cannot write cache: %s" % error_string(FileAccess.get_open_error()))
		return
	f.store_string(JSON.stringify(data))
	f.close()
	var err := DirAccess.rename_absolute(tmp, cache_path)
	if err != OK:
		push_warning("[ConfigManager] cache rename failed: %s" % error_string(err))


func _load_local_settings() -> void:
	local_settings = _read_json(local_settings_path)
	if FileAccess.file_exists(local_settings_override_path):
		var override = JSON.parse_string(FileAccess.get_file_as_string(local_settings_override_path))
		if override is Dictionary:
			local_settings = _deep_merge(local_settings, override)
		else:
			push_warning("[ConfigManager] ignoring unparseable %s" % local_settings_override_path)


static func _deep_merge(base: Dictionary, patch: Dictionary) -> Dictionary:
	var out := base.duplicate(true)
	for key in patch:
		if out.get(key) is Dictionary and patch[key] is Dictionary:
			out[key] = _deep_merge(out[key], patch[key])
		else:
			out[key] = patch[key]
	return out


static func _read_json(path: String) -> Dictionary:
	var data = JSON.parse_string(FileAccess.get_file_as_string(path)) if FileAccess.file_exists(path) else null
	return data if data is Dictionary else {}
