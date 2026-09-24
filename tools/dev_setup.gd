extends SceneTree
## Provisions user:// for development.
## godot --headless --path . --script res://tools/dev_setup.gd -- \
##     [--tenant=machine-042] [--api=http://127.0.0.1:8787/fuelbot] [--poll=10] [--clear]

const TENANT_PATH := "user://tenant_id.txt"
const OVERRIDE_PATH := "user://local_settings.override.json"
const CACHE_PATH := "user://config_cache.json"


func _initialize() -> void:
	var tenant := "machine-042"
	var api := "http://127.0.0.1:8787/fuelbot"
	var poll := 10.0
	var clear := false
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--tenant="):
			tenant = arg.trim_prefix("--tenant=")
		elif arg.begins_with("--api="):
			api = arg.trim_prefix("--api=")
		elif arg.begins_with("--poll="):
			poll = float(arg.trim_prefix("--poll="))
		elif arg == "--clear":
			clear = true
	print("user data dir: ", OS.get_user_data_dir())
	if clear:
		for path in [TENANT_PATH, OVERRIDE_PATH, CACHE_PATH]:
			if FileAccess.file_exists(path):
				DirAccess.remove_absolute(path)
				print("removed ", path)
		quit(0)
		return
	_write(TENANT_PATH, tenant)
	_write(OVERRIDE_PATH, JSON.stringify({
		"api": {"base_url": api},
		"timing": {"maintenance_poll_interval_sec": poll},
	}, "  "))
	print("tenant=%s api=%s poll=%ss" % [tenant, api, poll])
	quit(0)


func _write(path: String, text: String) -> void:
	var f := FileAccess.open(path, FileAccess.WRITE)
	f.store_string(text)
	f.close()
	print("wrote ", path)
