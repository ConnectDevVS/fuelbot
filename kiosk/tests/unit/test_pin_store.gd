extends TestCase
## PinStore: the settings PIN as an identity file, the check and the lockout (SET-02).

const DIR := "user://test_pin_store"

var _store: PinStore


func before_each() -> void:
	DirAccess.make_dir_recursive_absolute(DIR)
	for file in DirAccess.get_files_at(DIR):
		DirAccess.remove_absolute(DIR.path_join(file))
	_store = _new_store()


func _new_store() -> PinStore:
	var store := PinStore.new()
	store.pin_path = DIR.path_join("settings_pin.txt")
	store.lock_path = DIR.path_join("settings_pin_lock.json")
	store.lockout_sec = 300.0
	store.fake_now = 1000.0
	return store


func _write_pin_file(text: String) -> void:
	var f := FileAccess.open(_store.pin_path, FileAccess.WRITE)
	f.store_string(text)
	f.close()


func _fail_times(n: int) -> void:
	for i in n:
		_store.check("000000")


func test_record_format() -> void:
	var record := PinStore.make_record("123456")
	var parts := record.split(":")
	assert_eq(parts.size(), 2, "salt:hash")
	assert_eq(parts[0].length(), 32, "salt is 32 hex")
	assert_eq(parts[1], (parts[0] + "123456").sha256_text(), "hash = sha256(salt + pin)")
	assert_false(record.contains("123456"), "the PIN itself isn't in the record")
	assert_true(PinStore.make_record("123456") != record, "a new salt each time")


func test_not_set_and_malformed() -> void:
	assert_false(_store.is_set(), "no file")
	assert_eq(_store.check("123456"), "not_set", "no file → not_set")
	for text in ["", "123456", "abc:def", "%s:%s" % ["g".repeat(32), "0".repeat(64)],
			"%s:%s" % ["0".repeat(32), "0".repeat(63)]]:
		_write_pin_file(text)
		assert_eq(_store.check("123456"), "not_set", "malformed '%s' → not_set" % text.left(8))


func test_right_pin() -> void:
	_write_pin_file(PinStore.make_record("123456") + "\n")
	assert_true(_store.is_set(), "set")
	assert_eq(_store.check("123456"), "ok", "right PIN")


func test_wrong_formats() -> void:
	_write_pin_file(PinStore.make_record("123456"))
	for pin in ["12345", "1234567", "12a456", "", "-12345"]:
		DirAccess.remove_absolute(_store.lock_path)   # five wrong tries would lock the pad
		assert_eq(_new_store().check(pin), "wrong", "'%s' is wrong" % pin)


func test_right_pin_resets_the_count() -> void:
	_write_pin_file(PinStore.make_record("123456"))
	_fail_times(4)
	assert_eq(_store.last_attempt, 4, "fourth attempt")
	assert_eq(_store.check("123456"), "ok", "right PIN before the lock")
	_fail_times(4)
	assert_eq(_store.check("000000"), "locked", "count started again: 5 more to lock")


func test_lockout_survives_a_restart() -> void:
	_write_pin_file(PinStore.make_record("123456"))
	_fail_times(4)
	assert_eq(_store.check("000000"), "locked", "fifth wrong locks")
	assert_eq(_store.last_attempt, 5, "this attempt started the lock")
	assert_eq(_store.locked_seconds_left(), 300, "locked for the lockout")
	assert_eq(_store.check("123456"), "locked", "even the right PIN while locked")
	assert_eq(_store.last_attempt, 0, "no attempt counted while locked")

	var restarted := _new_store()
	restarted.fake_now = 1100.0
	assert_eq(restarted.locked_seconds_left(), 200, "still locked after a restart")
	restarted.fake_now = 1300.0
	assert_eq(restarted.locked_seconds_left(), 0, "unlocked after the lockout")
	assert_eq(restarted.check("123456"), "ok", "right PIN after the lock")


func test_clock_backwards_caps_the_lock() -> void:
	_write_pin_file(PinStore.make_record("123456"))
	_fail_times(5)
	_store.fake_now = 10.0
	assert_eq(_store.locked_seconds_left(), 300, "never more than one lockout")


func test_from_settings_is_sandboxed() -> void:
	var store := PinStore.from_settings()
	assert_eq(store.pin_path, "user://sandbox/settings_pin.txt", "test runs never touch the real identity")
	assert_eq(store.pin_length, 6, "pin_length")
	assert_eq(store.max_attempts, 5, "pin_max_attempts")


func test_provision_script() -> void:
	var script := ProjectSettings.globalize_path("res://tools/set_settings_pin.sh")
	var dir := ProjectSettings.globalize_path(DIR)
	for bad in ["12345", "1234567", "12a456"]:
		assert_true(_run_script(script, dir, bad) != 0, "rejects '%s'" % bad)
		assert_false(FileAccess.file_exists(_store.pin_path), "no file after a rejected PIN")
	assert_eq(_run_script(script, dir, "654321"), 0, "writes a 6-digit PIN")
	var written := FileAccess.get_file_as_string(_store.pin_path)
	assert_false(written.contains("654321"), "only the hash is stored")
	assert_eq(_store.check("654321"), "ok", "PinStore accepts the script's file")
	assert_true(_run_script(script, dir, "111111") != 0, "never overwrites an existing PIN")
	assert_eq(FileAccess.get_file_as_string(_store.pin_path), written, "file unchanged")


func _run_script(script: String, dir: String, pin: String) -> int:
	var output := []
	return OS.execute("bash", ["-c", "printf '%%s\\n' '%s' | '%s' --user-dir '%s' --stdin" % [pin, script, dir]],
		output, true)
