extends Node
## The machine's network, through NetworkManager's nmcli (docs/stories/settings, SET-01).
## Screens never run nmcli themselves. Nothing runs until a screen asks: no polling.
## Each command runs off the main thread (a pipe read on a Thread), one at a time, and is
## killed when it outlives its timeout. The kiosk user may manage Wi-Fi through a polkit rule
## (deploy/polkit/50-fuelbot-wifi.rules), so the app never runs as root.
## The Wi-Fi password is never logged and never on a command line: it goes to nmcli in a
## passwd-file under user://, deleted straight after.

signal status_changed(status: Dictionary)
signal scan_finished(networks: Array)
signal connect_finished(ok: bool, reason: String, ssid: String)

const SECRET_FILE := "user://wifi_secret.tmp"
const STATUS_TIMEOUT_SEC := 10.0

# Overridable for tests: plain vars (configure_from_settings() reads them from settings).
var nmcli_path := "nmcli"
var interface := "wlan0"
var scan_timeout_sec := 15.0
var connect_timeout_sec := 30.0
## Extra time the app waits past nmcli's own -w before killing it.
var connect_grace_sec := 5.0
## Dev and tests: the fake nmcli's state file (passed to it in FUELBOT_FAKE_NMCLI_STATE).
var fake_state_path := ""
var secret_path := SECRET_FILE
var auto_configure := true
## Tests capture events; otherwise TelemetryReporter.report_event.
var report_event: Callable
## Why the last scan or connect failed ("" when it didn't).
var last_error := ""

var _status := {"kind": "none", "ssid": "", "signal": -1, "available": true}
var _networks: Array = []        # the last scan, for each network's security
var _available := -1             # -1 not checked yet, 0 no, 1 yes
var _unavailable_warned := false
var _queue: Array[Callable] = []
var _running := false
var _connecting := false
var _exists := {}                # nmcli path -> found (looked up once)


func _ready() -> void:
	if auto_configure:
		configure_from_settings()


func configure_from_settings() -> void:
	var s: Dictionary = ConfigManager.local_settings.get("wifi", {})
	nmcli_path = String(s.get("nmcli_path", nmcli_path))
	interface = String(s.get("interface", interface))
	fake_state_path = String(s.get("fake_state_path", ""))
	scan_timeout_sec = ConfigManager.get_timing("wifi_scan_timeout_sec", scan_timeout_sec)
	connect_timeout_sec = ConfigManager.get_timing("wifi_connect_timeout_sec", connect_timeout_sec)
	secret_path = ConfigManager.user_path(SECRET_FILE)
	_available = -1


func get_status() -> Dictionary:
	return _status.duplicate()


func is_busy() -> bool:
	return _running or not _queue.is_empty()


## False when nmcli can't run or there's no Wi-Fi device. Known after the first command.
func is_available() -> bool:
	return _available != 0


func refresh_status() -> void:
	_enqueue(_do_refresh_status)


func scan() -> void:
	_enqueue(_do_scan)


## `password` is "" for an open network. Finishes with connect_finished; a second connect
## while one is queued or running finishes at once with "busy".
func connect_to(ssid: String, password: String) -> void:
	if _connecting:
		connect_finished.emit(false, "busy", ssid)
		return
	_connecting = true
	_enqueue(_do_connect.bind(ssid, password))


# --- Parsing (static, for tests) ---------------------------------------------

## One line of nmcli -t output: fields split on ":", with "\:" and "\\" unescaped.
static func split_terse(line: String) -> PackedStringArray:
	var fields: PackedStringArray = []
	var current := ""
	var i := 0
	while i < line.length():
		var c := line[i]
		if c == "\\" and i + 1 < line.length():
			current += line[i + 1]
			i += 2
			continue
		if c == ":":
			fields.append(current)
			current = ""
		else:
			current += c
		i += 1
	fields.append(current)
	return fields


## nmcli's SECURITY column → "open", "psk" or "enterprise".
static func security_kind(security: String) -> String:
	var s := security.strip_edges()
	if s == "" or s == "--":
		return "open"
	return "enterprise" if s.contains("802.1X") else "psk"


## `device wifi list` (IN-USE,SSID,SIGNAL,SECURITY) → one entry per SSID (the strongest),
## hidden networks left out, the one in use first, then by signal.
static func parse_networks(output: String) -> Array:
	var best := {}
	for line in output.split("\n", false):
		var f := split_terse(line)
		if f.size() < 4 or f[1] == "":
			continue
		var entry := {"ssid": f[1], "signal": int(f[2]), "security": security_kind(f[3]),
			"in_use": f[0].strip_edges() == "*"}
		var old: Dictionary = best.get(entry.ssid, {})
		if old.is_empty() or (entry.in_use and not old.in_use) \
				or (entry.in_use == old.in_use and entry.signal > old.signal):
			best[entry.ssid] = entry
	var list := best.values()
	list.sort_custom(func(a: Dictionary, b: Dictionary) -> bool:
		if a.in_use != b.in_use:
			return a.in_use
		return a.signal > b.signal)
	return list


## nmcli's error text → a connect_finished reason.
static func failure_reason(stderr: String) -> String:
	if stderr.contains("Secrets were required") or stderr.contains("802-1X supplicant") \
			or stderr.contains("psk: property is invalid"):
		return "wrong_password"
	if stderr.contains("No network with SSID") or stderr.contains("could not be found"):
		return "not_found"
	return "failed"


# --- Operations --------------------------------------------------------------

func _enqueue(op: Callable) -> void:
	_queue.append(op)
	if not _running:
		_drain()


func _drain() -> void:
	_running = true
	while not _queue.is_empty():
		var op: Callable = _queue.pop_front()
		await op.call()
	_running = false


func _do_refresh_status() -> void:
	var dev := await _run(["-t", "-f", "DEVICE,TYPE,STATE,CONNECTION", "device", "status"], STATUS_TIMEOUT_SEC)
	if not _check_available(dev):
		_set_status({"kind": "none", "ssid": "", "signal": -1, "available": false})
		return
	var kind := "none"
	var wifi_up := false
	for line in String(dev.out).split("\n", false):
		var f := split_terse(line)
		if f.size() < 3 or not f[2].begins_with("connected") or f[1] == "loopback":
			continue
		if f[1] == "ethernet":
			kind = "ethernet"
		elif f[1] == "wifi" and f[0] == interface:
			wifi_up = true
	var status := {"kind": kind, "ssid": "", "signal": -1, "available": true}
	if wifi_up:
		var list := await _run(_list_args("no"), STATUS_TIMEOUT_SEC)
		for net in parse_networks(String(list.out)):
			if net.in_use:
				status.ssid = net.ssid
				status.signal = net.signal
		if kind == "none":
			status.kind = "wifi"
	_set_status(status)


func _do_scan() -> void:
	var res := await _run(_list_args("yes"), scan_timeout_sec)
	if not _check_available(res):
		last_error = "unavailable"
		scan_finished.emit([])
		return
	if res.timeout or res.code != 0:
		last_error = "timeout" if res.timeout else "failed"
		print("[Wifi] scan failed: %s %s" % [last_error, String(res.err).strip_edges()])
		scan_finished.emit([])
		return
	last_error = ""
	_networks = parse_networks(String(res.out))
	scan_finished.emit(_networks.duplicate(true))


func _do_connect(ssid: String, password: String) -> void:
	var kind := _security_of(ssid, password)
	var reason := ""
	if kind == "enterprise":
		reason = "unsupported"
	else:
		reason = await _connect_steps(ssid, password, kind)
	_connecting = false
	last_error = reason
	if reason == "":
		await _do_refresh_status()
		print("[Wifi] connected to %s" % ssid)
		_report({"event_type": "wifi_connected", "ssid": ssid, "signal": _status.signal})
		connect_finished.emit(true, "", ssid)
	else:
		print("[Wifi] connecting to %s failed: %s" % [ssid, reason])
		if reason != "unavailable":
			_report({"event_type": "wifi_connect_failed", "ssid": ssid, "reason": reason})
		connect_finished.emit(false, reason, ssid)


## Remember what's up, replace any saved profile for this SSID, add the new one, bring it up
## with the password. On failure, the old network comes back and the new profile goes.
## Returns "" on success, else the reason.
func _connect_steps(ssid: String, password: String, kind: String) -> String:
	var active := await _run(["-t", "-f", "NAME,UUID,TYPE,DEVICE", "connection", "show", "--active"], STATUS_TIMEOUT_SEC)
	if not _check_available(active):
		return "unavailable"
	var old_uuid := ""
	for line in String(active.out).split("\n", false):
		var f := split_terse(line)
		if f.size() >= 3 and f[2] == "802-11-wireless":
			old_uuid = f[1]
	var saved := await _run(["-t", "-f", "NAME,UUID,TYPE", "connection", "show"], STATUS_TIMEOUT_SEC)
	for line in String(saved.out).split("\n", false):
		var f := split_terse(line)
		if f.size() >= 3 and f[0] == ssid and f[2] == "802-11-wireless" and f[1] != old_uuid:
			await _run(["connection", "delete", "uuid", f[1]], STATUS_TIMEOUT_SEC)

	var add: Array = ["connection", "add", "type", "wifi", "ifname", interface, "con-name", ssid,
		"ssid", ssid, "autoconnect", "yes"]
	if kind == "psk":
		add.append_array(["wifi-sec.key-mgmt", "wpa-psk"])
	var added := await _run(add, STATUS_TIMEOUT_SEC)
	var m := RegEx.create_from_string("\\(([0-9a-fA-F-]{36})\\)").search(String(added.out))
	if added.code != 0 or m == null:
		print("[Wifi] adding the profile failed: %s" % String(added.err).strip_edges())
		return "failed"
	var new_uuid := m.get_string(1)

	var up: Array = ["-w", str(int(connect_timeout_sec)), "connection", "up", "uuid", new_uuid]
	if kind == "psk":
		if not _write_secret(password):
			await _run(["connection", "delete", "uuid", new_uuid], STATUS_TIMEOUT_SEC)
			return "failed"
		up.append_array(["passwd-file", ProjectSettings.globalize_path(secret_path)])
	var res := await _run(up, connect_timeout_sec + connect_grace_sec)
	DirAccess.remove_absolute(secret_path)
	if res.code == 0 and not res.timeout:
		return ""
	var reason := "timeout" if res.timeout else failure_reason(String(res.err))
	print("[Wifi] nmcli: %s" % String(res.err).strip_edges())
	if old_uuid != "":
		await _run(["connection", "up", "uuid", old_uuid], connect_timeout_sec)
	await _run(["connection", "delete", "uuid", new_uuid], STATUS_TIMEOUT_SEC)
	return reason


func _security_of(ssid: String, password: String) -> String:
	for net in _networks:
		if net.ssid == ssid:
			return net.security
	return "open" if password == "" else "psk"


## mode 600, then the password; never anywhere else.
func _write_secret(password: String) -> bool:
	var f := FileAccess.open(secret_path, FileAccess.WRITE)
	if f == null:
		push_warning("[Wifi] cannot write the passwd-file: %s" % error_string(FileAccess.get_open_error()))
		return false
	FileAccess.set_unix_permissions(secret_path, FileAccess.UNIX_READ_OWNER | FileAccess.UNIX_WRITE_OWNER)
	f.store_string("802-11-wireless-security.psk:" + password + "\n")
	f.close()
	return true


func _list_args(rescan: String) -> Array:
	return ["-t", "-f", "IN-USE,SSID,SIGNAL,SECURITY", "device", "wifi", "list", "ifname", interface,
		"--rescan", rescan]


func _set_status(status: Dictionary) -> void:
	_status = status
	status_changed.emit(status.duplicate())


func _report(event: Dictionary) -> void:
	if report_event.is_valid():
		report_event.call(event)
	else:
		TelemetryReporter.report_event(event)


## False (and one warning per run) when nmcli can't run or the Wi-Fi device is missing.
func _check_available(res: Dictionary) -> bool:
	if _available == -1 and not res.missing:
		_available = 1
	if res.missing:
		_available = 0
	if _available == 0 and not _unavailable_warned:
		_unavailable_warned = true
		push_warning("[Wifi] nmcli isn't available (%s); Wi-Fi settings are off" % nmcli_path)
	return _available == 1


# --- Running nmcli -----------------------------------------------------------

## Runs nmcli with `args`; resolves to {code, out, err, timeout, missing}.
func _run(args: Array, timeout_sec: float) -> Dictionary:
	if not _nmcli_exists():
		return {"code": -1, "out": "", "err": "", "timeout": false, "missing": true}
	if fake_state_path != "":
		OS.set_environment("FUELBOT_FAKE_NMCLI_STATE", ProjectSettings.globalize_path(fake_state_path))
	var proc := OS.execute_with_pipe(nmcli_path, PackedStringArray(args))
	if proc.is_empty():
		return {"code": -1, "out": "", "err": "", "timeout": false, "missing": true}
	var result := {"code": -1, "out": "", "err": "", "timeout": false, "missing": false}
	var thread := Thread.new()
	thread.start(_read_process.bind(proc, result))
	var deadline := Time.get_ticks_msec() + int(timeout_sec * 1000.0)
	while thread.is_alive():
		if not result.timeout and Time.get_ticks_msec() > deadline:
			result.timeout = true
			OS.kill(proc.pid)
		await get_tree().process_frame
	thread.wait_to_finish()
	return result


## Worker thread: read both pipes to the end, then the exit code. A timed-out process was
## killed (and reaped) by the main thread, so it isn't asked about any more.
static func _read_process(proc: Dictionary, result: Dictionary) -> void:
	result.out = _read_all(proc.stdio)
	result.err = _read_all(proc.stderr)
	if result.timeout:
		return
	while OS.is_process_running(proc.pid):
		OS.delay_msec(5)
	result.code = OS.get_process_exit_code(proc.pid)


static func _read_all(pipe: FileAccess) -> String:
	var bytes := PackedByteArray()
	while true:
		var chunk := pipe.get_buffer(4096)
		if chunk.is_empty():
			break
		bytes.append_array(chunk)
	return bytes.get_string_from_utf8()


func _nmcli_exists() -> bool:
	if not _exists.has(nmcli_path):
		if nmcli_path.is_absolute_path():
			_exists[nmcli_path] = FileAccess.file_exists(nmcli_path)
		else:
			_exists[nmcli_path] = OS.execute("sh", ["-c", "command -v \"$0\" >/dev/null", nmcli_path]) == 0
	return _exists[nmcli_path]
