class_name PinStore
extends RefCounted
## The technician PIN that opens settings (docs/stories/settings, SET-02). It's part of the
## machine identity, next to tenant_id.txt, machine_id.txt and machine_key.txt, stored only as
## "<salt>:<sha256 hex of salt + pin>" (written by tools/set_settings_pin.sh). The lockout lives
## in its own file so an app restart doesn't reset it. Never log the PIN, the digits or the hash.

const SALT_HEX_LEN := 32
const HASH_HEX_LEN := 64

var pin_path := "user://settings_pin.txt"
var lock_path := "user://settings_pin_lock.json"
var pin_length := 6
var max_attempts := 5
var lockout_sec := 300.0
## Tests: a fixed clock (unix seconds); < 0 = the system clock.
var fake_now := -1.0
## The attempt number of the last wrong PIN (1..max_attempts), for the audit event.
var last_attempt := 0

var _malformed_warned := false


## The store the app uses: paths and limits from local_settings (sandboxed in test runs).
static func from_settings() -> PinStore:
	var store := PinStore.new()
	var s: Dictionary = ConfigManager.local_settings.get("settings", {})
	store.pin_path = ConfigManager.user_path(String(s.get("pin_path", store.pin_path)))
	store.lock_path = ConfigManager.user_path(String(s.get("pin_lock_path", store.lock_path)))
	store.pin_length = int(s.get("pin_length", store.pin_length))
	store.max_attempts = int(s.get("pin_max_attempts", store.max_attempts))
	store.lockout_sec = ConfigManager.get_timing("settings_pin_lockout_sec", store.lockout_sec)
	return store


static func hash_pin(salt: String, pin: String) -> String:
	return (salt + pin).sha256_text()


## A new identity record for `pin` (dev_setup and tests; real machines use set_settings_pin.sh).
static func make_record(pin: String) -> String:
	var salt := Crypto.new().generate_random_bytes(SALT_HEX_LEN / 2).hex_encode()
	return "%s:%s" % [salt, hash_pin(salt, pin)]


func is_set() -> bool:
	return not _read_record().is_empty()


## Seconds until the pad unlocks; 0 when it isn't locked. Never more than one lockout,
## so a clock that jumped backwards can't lock the pad for longer.
func locked_seconds_left() -> int:
	var left := float(_read_lock().get("locked_until", 0.0)) - _now()
	return int(ceil(clampf(left, 0.0, lockout_sec)))


## "ok", "wrong", "locked" (now, or this attempt started the lock) or "not_set".
func check(pin: String) -> String:
	last_attempt = 0
	var record := _read_record()
	if record.is_empty():
		return "not_set"
	if locked_seconds_left() > 0:
		return "locked"
	if _is_digits(pin) and _same(hash_pin(record.salt, pin), record.hash):
		_write_lock({"failed": 0, "locked_until": 0.0})
		return "ok"
	var failed := int(_read_lock().get("failed", 0)) + 1
	last_attempt = failed
	if failed >= max_attempts:
		_write_lock({"failed": 0, "locked_until": _now() + lockout_sec})
		return "locked"
	_write_lock({"failed": failed, "locked_until": 0.0})
	return "wrong"


func _is_digits(pin: String) -> bool:
	if pin.length() != pin_length:
		return false
	for i in pin.length():
		if pin[i] < "0" or pin[i] > "9":
			return false
	return true


## Compares the whole string whatever differs first.
static func _same(a: String, b: String) -> bool:
	if a.length() != b.length():
		return false
	var diff := 0
	for i in a.length():
		diff |= a.unicode_at(i) ^ b.unicode_at(i)
	return diff == 0


func _read_record() -> Dictionary:
	if not FileAccess.file_exists(pin_path):
		return {}
	var parts := FileAccess.get_file_as_string(pin_path).strip_edges().split(":")
	if parts.size() != 2 or parts[0].length() != SALT_HEX_LEN or parts[1].length() != HASH_HEX_LEN \
			or not parts[0].is_valid_hex_number() or not parts[1].is_valid_hex_number():
		if not _malformed_warned:
			_malformed_warned = true
			push_warning("[PinStore] %s is malformed; settings stay closed" % pin_path)
		return {}
	return {"salt": parts[0], "hash": parts[1].to_lower()}


func _read_lock() -> Dictionary:
	if not FileAccess.file_exists(lock_path):
		return {}
	var data = JSON.parse_string(FileAccess.get_file_as_string(lock_path))
	return data if data is Dictionary else {}


func _write_lock(state: Dictionary) -> void:
	DirAccess.make_dir_recursive_absolute(lock_path.get_base_dir())
	var tmp := lock_path + ".tmp"
	var f := FileAccess.open(tmp, FileAccess.WRITE)
	if f == null:
		push_warning("[PinStore] cannot write %s: %s" % [lock_path, error_string(FileAccess.get_open_error())])
		return
	f.store_string(JSON.stringify(state))
	f.close()
	DirAccess.rename_absolute(tmp, lock_path)


func _now() -> float:
	return fake_now if fake_now >= 0.0 else Time.get_unix_time_from_system()
