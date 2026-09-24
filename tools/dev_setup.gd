extends SceneTree
## Provisions user:// for development.
## godot --headless --path . --script res://tools/dev_setup.gd -- \
##     [--tenant=machine-042] [--api=http://127.0.0.1:8787/fuelbot] [--poll=10]
##     [--payments=mock|razorpay-test] [--clear] [--print-dir]
##
## --payments=mock (default): mock Razorpay keys + razorpay_base_url -> mock server.
## --payments=razorpay-test: real Razorpay (test mode). Keys are NEVER taken as
##   arguments; write razorpay_credentials.cfg by hand (format printed on error).

const TENANT_PATH := "user://tenant_id.txt"
const OVERRIDE_PATH := "user://local_settings.override.json"
const CACHE_PATH := "user://config_cache.json"
const CREDS_PATH := "user://razorpay_credentials.cfg"
const QR_PATH := "user://qr_current.png"


func _initialize() -> void:
	var tenant := "machine-042"
	var api := "http://127.0.0.1:8787/fuelbot"
	var poll := 10.0
	var payments := "mock"
	var clear := false
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--tenant="):
			tenant = arg.trim_prefix("--tenant=")
		elif arg.begins_with("--api="):
			api = arg.trim_prefix("--api=")
		elif arg.begins_with("--poll="):
			poll = float(arg.trim_prefix("--poll="))
		elif arg == "--payments":
			payments = "mock"
		elif arg.begins_with("--payments="):
			payments = arg.trim_prefix("--payments=")
		elif arg == "--clear":
			clear = true
		elif arg == "--print-dir":
			print("user data dir: ", OS.get_user_data_dir())
			quit(0)
			return
	print("user data dir: ", OS.get_user_data_dir())
	if clear:
		for path in [TENANT_PATH, OVERRIDE_PATH, CACHE_PATH, CREDS_PATH, QR_PATH]:
			if FileAccess.file_exists(path):
				DirAccess.remove_absolute(path)
				print("removed ", path)
		quit(0)
		return
	if payments not in ["mock", "razorpay-test"]:
		printerr("unknown --payments=%s (use mock or razorpay-test)" % payments)
		quit(2)
		return

	var override := {
		"api": {"base_url": api},
		"timing": {"maintenance_poll_interval_sec": poll},
	}
	if payments == "mock":
		override.api["razorpay_base_url"] = _origin(api)
		var cfg := ConfigFile.new()
		cfg.set_value("razorpay", "key_id", "mock_key")
		cfg.set_value("razorpay", "key_secret", "mock_secret")
		cfg.save(CREDS_PATH)
		print("wrote ", CREDS_PATH, " (mock keys)")
	elif not _has_real_test_keys():
		printerr("No Razorpay test keys found. Create this file by hand (never commit it):\n  %s\n\n[razorpay]\nkey_id=\"rzp_test_...\"\nkey_secret=\"...\"\n"
			% ProjectSettings.globalize_path(CREDS_PATH))
		quit(1)
		return

	_write(TENANT_PATH, tenant)
	_write(OVERRIDE_PATH, JSON.stringify(override, "  "))
	print("tenant=%s api=%s poll=%ss payments=%s" % [tenant, api, poll, payments])
	quit(0)


func _has_real_test_keys() -> bool:
	var cfg := ConfigFile.new()
	if cfg.load(CREDS_PATH) != OK:
		return false
	return String(cfg.get_value("razorpay", "key_id", "")).begins_with("rzp_test_") \
		and String(cfg.get_value("razorpay", "key_secret", "")) != ""


## "http://127.0.0.1:8787/fuelbot" -> "http://127.0.0.1:8787"
func _origin(url: String) -> String:
	var scheme_end := url.find("://")
	var path_start := url.find("/", scheme_end + 3 if scheme_end >= 0 else 0)
	return url if path_start < 0 else url.left(path_start)


func _write(path: String, text: String) -> void:
	var f := FileAccess.open(path, FileAccess.WRITE)
	f.store_string(text)
	f.close()
	print("wrote ", path)
