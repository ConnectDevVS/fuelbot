# SET-01 — Wi-Fi backend

**As** the settings screen, **I want** one place that knows the machine's
network state and can scan and connect to Wi-Fi, **so that** screens never
run `nmcli` themselves, and the whole flow can be tested on a Mac.

Refs: README decisions 11–14.
Depends on: —.

## Deliverables

```
autoload/Wifi.gd                    # registered after FlavorImages, before DevCapture
config/local_settings.json          # wifi.nmcli_path, wifi.interface, timing.wifi_*
tools/fake_nmcli.py                 # stand-in nmcli (stdlib only) with a JSON state file
tools/test_fake_nmcli.py
tools/dev_setup.gd                  # --wifi=fake (default) | real: wifi.nmcli_path → the fake, state in user://fake_nmcli.json
tests/unit/test_wifi.gd
deploy/polkit/50-fuelbot-wifi.rules # installed by OTA-08's provision.sh
docs/stories/ota/OTA-08-pi-image.md # provision.sh installs the polkit rule (one line)
```

## Spec

### API (`Wifi` autoload)

```gdscript
signal status_changed(status: Dictionary)
signal scan_finished(networks: Array)          # [] on failure; see last_error
signal connect_finished(ok: bool, reason: String, ssid: String)

func refresh_status() -> void
func scan() -> void
func connect_to(ssid: String, password: String) -> void   # "" for an open network
func get_status() -> Dictionary
func is_busy() -> bool
func is_available() -> bool                     # nmcli runs, and there's a Wi-Fi device
```

- **Status:** `{"kind": "wifi" | "ethernet" | "none", "ssid": String,
  "signal": int (0–100, -1 if unknown), "available": bool}`. Ethernet wins
  when both are connected (it's the route the machine uses).
- **Network** (an entry of `scan_finished`): `{"ssid", "signal",
  "security": "open" | "psk" | "enterprise", "in_use": bool}`. One entry per
  SSID (the strongest), hidden networks (empty SSID) left out, sorted with
  `in_use` first, then by signal.
- **Reasons** for `connect_finished(false, …)`: `wrong_password`,
  `not_found`, `timeout`, `unsupported` (enterprise), `unavailable`,
  `not_authorized` (nmcli says "Not authorized" or "Insufficient
  privileges": the polkit rule is missing or names another user), `busy`,
  `failed`. The screen maps each to a `wifi_error_*` message.
- A failed scan emits `scan_finished([])` and sets `last_error`
  (`not_authorized`, `timeout`, `failed` or `unavailable`), so the screen
  never mistakes it for "no networks in range".

### Running `nmcli`

- Always the machine-readable form (`nmcli -t -f …`), parsed with `-t`'s
  escaping (`\:` inside a field). The exact commands:

  | Purpose | Command |
  |---------|---------|
  | status | `nmcli -t -f DEVICE,TYPE,STATE,CONNECTION device status` |
  | signal of the active network, scan | `nmcli -t -f IN-USE,SSID,SIGNAL,SECURITY device wifi list ifname <if> --rescan no\|yes` |
  | remember what's active | `nmcli -t -f NAME,UUID,TYPE,DEVICE connection show --active` |
  | connect | settled by the spike below |
  | roll back | `nmcli connection up uuid <old>`, `nmcli connection delete uuid <new>` |

- Each command runs **off the main thread**: `OS.execute_with_pipe`, with
  a `Thread` reading both pipes to the end while the main thread awaits
  frames. Commands run **one at a time** (a small queue of operations;
  `connect_to` while a connect is queued or running finishes at once with
  `busy`). The UI never freezes, even when a rescan takes seconds on the
  Pi.
- Timeouts: scan `timing.wifi_scan_timeout_sec` (15), connect
  `timing.wifi_connect_timeout_sec` (30, passed to `nmcli -w`; the app
  waits `connect_grace_sec` = 5 s longer before killing it), 10 s for the
  quick commands. A command that outlives its timeout is killed
  (`OS.kill`, which also reaps it) and reported as `timeout`.
- **No background polling.** The autoload runs nothing until a screen
  asks; the maintenance screen calls `refresh_status()` on open and every
  10 s (SET-04).
- `nmcli` missing or failing to start → `is_available() == false`, status
  `available: false`, every call finishes with `unavailable`. One warning
  per app run, not one per call.

### Connecting (decisions 12, 13)

1. Remember the active Wi-Fi connection's UUID (if any).
2. If a saved profile for this SSID exists, delete it (a re-typed password
   replaces the old one).
3. Create the profile (`connection add type wifi ifname <if> con-name
   <ssid> ssid <ssid> autoconnect yes`, plus `wifi-sec.key-mgmt wpa-psk`
   when secured), read its UUID from nmcli's reply, and bring it up **by
   UUID** with the password, **never on the command line**: built with
   option A below (`passwd-file`), pending the spike.
4. Success: report `wifi_connected` (`ssid`, `signal`) via
   `TelemetryReporter.report_event`, refresh the status, emit
   `connect_finished(true, "", ssid)`.
5. Failure: bring the remembered connection back up, delete the new
   profile, report `wifi_connect_failed` (`ssid`, `reason`), emit
   `connect_finished(false, reason, ssid)`.
6. An `enterprise` network is refused before step 1 with `unsupported`.

Map `nmcli`'s failure to a reason from its exit code (`4` activation
failed) and message (`Secrets were required`, `802-1X supplicant failed` →
`wrong_password`; `No network with SSID` → `not_found`). Unknown → `failed`.
The raw message is logged (it never contains the password; the leak test
proves it).

### Pi spike (open: no Pi yet; record the result in SET-05)

Built and tested against the fake with option A. On a Pi, confirm A, or
switch to B in `_connect_steps` (one place):

On a Pi with Raspberry Pi OS Bookworm, as a non-root user with the polkit
rule:

- **Option A:** `nmcli -w 30 connection up id <ssid> passwd-file <file>`,
  the file `802-11-wireless-security.psk:<password>` written to `user://`
  with mode 600 and deleted right after. Check that the password is
  **saved** (the network reconnects after a reboot).
- **Option B:** `nmcli --ask -w 30 connection up id <ssid>` with the
  password written to stdin (`OS.execute_with_pipe`).
- Also check that `connection add … wifi-sec.key-mgmt wpa-psk` **without**
  a psk is accepted (the fake accepts it). If NetworkManager refuses it,
  pass the password with the `up` instead (`nmcli device wifi connect`
  with `--ask`, option B).
- Pick the first that saves the password and never shows it in
  `ps -ef` or the journal. If neither saves it, report back before going
  further: the fallback (`connection modify … wifi-sec.psk`) puts the
  password in the process list for a moment, and that's a decision for the
  product owner.

### The polkit rule

```js
// deploy/polkit/50-fuelbot-wifi.rules: the kiosk user may manage Wi-Fi, nothing else.
polkit.addRule(function (action, subject) {
  if (subject.user === "fuelbot" && [
        "org.freedesktop.NetworkManager.wifi.scan",
        "org.freedesktop.NetworkManager.network-control",
        "org.freedesktop.NetworkManager.settings.modify.system",
      ].indexOf(action.id) >= 0) {
    return polkit.Result.YES;
  }
});
```

The user name follows Milestone 8's kiosk user. If it isn't `fuelbot`,
change it here and in OTA-08 together.

### `tools/fake_nmcli.py`

- Stdlib only, executable, the same arguments, `-t` output (with `\:`
  escaping) and error messages as the real one for the commands above.
  State in a JSON file named by `FUELBOT_FAKE_NMCLI_STATE` (the app sets
  it from `wifi.fake_state_path`; created with sample networks if
  missing): networks in range (ssid, signal, security, password), the
  active connection, saved profiles, and two knobs: `delay` (`{sec, on,
  times}`: the next `times` commands containing `on` are slow, e.g. a
  connect timing out) and `fail_next` (`{code, stderr, on}`: the next
  command containing `on`, or the next command at all, exits with that
  code and message, once).
- Records every call (arguments **with any password replaced by `***`**)
  in the state, so tests can assert the rollback happened.
- `dev_setup.gd` points `wifi.nmcli_path` at it with a state file holding
  four sample networks (one open, one enterprise, one connected), so
  `dev_run.sh` shows a believable list on the Mac.

## Acceptance criteria

`tests/unit/test_wifi.gd` uses a fresh `Wifi` instance pointed at the fake
with its own state file under `user://test_wifi/`; `tools/test_fake_nmcli.py`
tests the fake itself.

- [ ] The spike is done on a real Pi and the chosen option is recorded.
      **Open** (no Pi yet); carried into SET-05's Pi table.
- [ ] Status: wifi with ssid and signal; ethernet wins over wifi; none;
      `nmcli` missing → `available: false`, one warning.
- [ ] Scan: one entry per SSID (the strongest), hidden left out, in-use
      first then by signal; security parsed (`WPA2`/`WPA3` → `psk`, `802.1X`
      → `enterprise`, empty → `open`).
- [ ] Fields with an escaped `:` in the SSID parse correctly.
- [ ] Connect success: profile created, telemetry `wifi_connected`, status
      updated, signal emitted once.
- [ ] Wrong password → `wrong_password`; the old connection is up again and
      the new profile is gone (from the fake's call log); telemetry
      `wifi_connect_failed`.
- [ ] Not found, timeout (fake `delay_sec` > timeout, process killed),
      enterprise refused, busy, unavailable: each gives its reason.
- [ ] The main thread is never blocked: a 3 s fake scan keeps frames
      coming (`process_frame` keeps firing).
- [ ] Leak: connect with password `SENTINEL3`; `SENTINEL` appears in no log
      line, no telemetry record and no fake call log entry, and no
      `passwd-file` is left in `user://`. `run_tests.sh`'s source grep also
      covers `Wifi.gd` (no `print` of the password variable).
