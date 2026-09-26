# FuelBot kiosk (v2)

Godot 4.7 app for the FuelBot protein-shake vending kiosk. It runs on a
1080×1920 portrait touchscreen. The catalog, prices and branding come from a
per-tenant config API. The machine caches it, and a bundled default config
keeps it usable offline.

The first milestone is the idle experience: the attract loop, the item listing
and the maintenance screen. The design is in
[devdocs/plans/greenfield-rewrite.md](devdocs/plans/greenfield-rewrite.md), and
the stories that built it are in [devdocs/stories/idle/](devdocs/stories/idle/).

## Requirements

- Godot **4.7.x** on `PATH`, or `GODOT=/path/to/godot`
- Python 3, standard library only, for the mock backend

## Quick start

```bash
tools/dev_run.sh                         # mock backend + dev tenant + app window
tools/dev_run.sh --scenario=maintenance_on
tools/dev_run.sh --no-mock               # offline, bundled default config
tools/dev_run.sh --editor                # open the editor instead, then press F5
```

Editor flow without the script:

```bash
python3 mockserver/server.py                                        # terminal 1
godot --headless --path . --script res://tools/dev_setup.gd         # once
godot -e --path .                                                   # then F5
```

## Everyday commands

| Command | What it does |
|---------|--------------|
| `tools/run_tests.sh [--filter=x]` | Headless GDScript tests (starts its own mock server on :8788) |
| `python3 -m unittest mockserver/test_server.py hardware/bridge/test_udprxtx.py tools/test_fakes.py hardware/firmware/test_firmware.py` | Python tests: mock server, hardware bridge, test-rig fakes (incl. automated Level 1), and the firmware on a host simulator |
| `tools/check_firmware.sh` | Host syntax check of `hardware/firmware/VM_code.ino` plus a build of the firmware simulator (clang++; not an AVR compile) |
| `tools/check_boot.sh` | Boots the app headless for 5 s and fails on script errors |
| `tools/screenshot.sh <res://Scene.tscn\|main> [out.png] [delay]` | Real-time screenshot into `.screenshots/` |
| `mockserver/scenario.sh <name\|reset>` | Switch the mock backend's response while the app runs |
| `godot --headless --path . --script res://tools/build_theme.gd` | Regenerate the theme after editing `ui/theme/palette.gd` |

## Payments

- **Mock (default):** `tools/dev_run.sh` / `tools/dev_setup.gd` write mock
  keys and point Razorpay calls at the mock server. The payment screen shows
  `MOCK PAYMENTS` and a placeholder (non-scannable) QR. Switch outcomes live:
  `mockserver/scenario.sh paid_after_3 '/v1/payments/qr_codes/{qr_id}/payments'`
  (also `paid`, `failed`, `default` = pending).
- **Razorpay test mode:** create `razorpay_credentials.cfg` in the user data
  folder **by hand**:
  ```ini
  [razorpay]
  key_id="rzp_test_…"
  key_secret="…"
  ```
  then `tools/dev_run.sh --payments=razorpay-test` (or
  `godot --headless --path . --script res://tools/dev_setup.gd -- --payments=razorpay-test`).
  Switching back to mock (`tools/dev_run.sh`) leaves this file alone.
  Never pass keys on the command line and never commit this file. Live keys
  are refused unless `payments.allow_live_keys` is enabled.
- Watch what the app sends the hardware bridge:
  `python3 tools/udp_monitor.py` (port 4242; it replaces the bridge while it runs).

## Dispensing and the hardware bridge

After payment the app sends **one** UDP datagram to the bridge on 4242,
`ORDER <order_id> P<hopper> B<n>`. The bridge replies on 4245 with
`DONE <order_id>`, `TIMEOUT <order_id> <reason>` or
`REJECTED <order_id> <reason>`. The protocol and all decisions are in
[devdocs/stories/dispensing/README.md](devdocs/stories/dispensing/README.md).

No hardware (Level 0): a fake bridge that answers every order.

```bash
tools/dev_run.sh                                             # terminal 1: app + mock
python3 tools/fake_dispense_bridge.py --mode done --delay 8  # terminal 2 (also: timeout | reject | silent)
```

Real bridge, fake Arduino (Level 1): the fake opens a PTY and speaks the
firmware's serial protocol.

```bash
python3 tools/fake_arduino_serial.py --time-scale 0.1 --link "$TMPDIR/fuelbot-arduino"   # --fault never_done|silent|disconnect|homing_timeout|homing_flaky
python3 hardware/bridge/udprxtx.py --serial "$TMPDIR/fuelbot-arduino" --recover-sec 3
tools/dev_run.sh
```

Real board (Level 2, pending hardware): flash `hardware/firmware/VM_code.ino`
to the Mega, then `python3 hardware/bridge/udprxtx.py --serial /dev/tty.usbmodem…`
(on the Pi, `/dev/arduino`, the default). The bridge is stdlib-only Python 3.9+.
Step-by-step Level 2/3 checks are in the
[dispensing SIGNOFF](devdocs/stories/dispensing/SIGNOFF.md).

**Run exactly one app and one bridge.**
- **One app:** use either `tools/dev_run.sh` or F5 in the Godot editor, never
  both. The app listens for the bridge's replies on 4245, and only one
  process can. A second copy can't hear `DONE`, so after the safety cap
  (130 s) it shows "Something went wrong". `tools/dev_run.sh` refuses to
  start while another copy holds 4245 (`--skip-port-check` overrides it).
  The banner's `Bridge` line says whether a bridge is listening on 4242.
- **One bridge:** only one process can bind 4242. Run the real bridge, the
  fake bridge or `tools/udp_monitor.py`, not two at once.

## Telemetry and machine faults

The bridge reports every dispense cycle (its stages and outcome) and machine
faults as JSON on UDP 4246. The app adds the order and tenant details, keeps
each record in `user://telemetry_queue.json` until the backend accepts it, and
posts it to `api.base_url + api.telemetry_path` (the mock: `/fuelbot/telemetry`).
Watch what arrives with `curl -s http://127.0.0.1:8787/__mock/state`
(`request_counts` and `last_body` for `/fuelbot/telemetry`).

A homing fault (the limit switch isn't reached within 20 s) puts the machine
on the out-of-service screen after any order in progress finishes. It comes
back by itself when the board homes again; the board retries after 1, 2, 4
and 8 minutes, then every 10. To see it without hardware:

```bash
python3 tools/fake_dispense_bridge.py --mode done --delay 4 --homing-fault-sec 20
```

Order a drink: after "Enjoy your shake", the machine is out of service for
20 s, then back on the attract screen. Details:
[devdocs/stories/telemetry/README.md](devdocs/stories/telemetry/README.md).

## Sales and the dead-bridge check

Every paid order produces one sale record (what was charged, and whether the
drink was dispensed: `success`, `timeout`, `rejected` or `no_response`). It's
kept in `user://sales_queue.json` until the backend (`api.base_url +
api.sales_path`; the mock: `/fuelbot/sales`) accepts it, so no sale is lost
offline.

If the hardware bridge stops sending its 10 s heartbeat for 30 s, the machine
goes out of service (`BRIDGE_DOWN`) and comes back by itself when the bridge
returns. This check is **off in development** by default, so the app runs
without a bridge. To try it:

```bash
python3 tools/fake_dispense_bridge.py --mode done     # terminal 1 (sends heartbeats)
tools/dev_run.sh --bridge-check                       # terminal 2; then stop the bridge (Ctrl+C)
```

About 60–90 s later (30 s after the last heartbeat, and not before 60 s from
app start) the out-of-service screen appears. Restart the bridge and it's
back on the attract screen within seconds.

## Flavor images (S3)

Each flavor's picture comes from the catalog's `image_url` (an AWS S3 URL in
production). The app downloads each image once, trims its transparent
border, and keeps it in `user://image_cache/` under the URL's file name.
A new file name means a new download; a known one is never downloaded again.
Until an image is cached, the screens show the flavor's previous image, then
the bundled one (`assets/images/flavors/`), then a placeholder. A finished
download swaps in without leaving the screen. Details:
[devdocs/stories/images/README.md](devdocs/stories/images/README.md); rules
for whoever uploads images: [devdocs/image-spec.md](devdocs/image-spec.md).

In dev, the mock serves generated images (coloured cups; the white bands show
the version) from `mockserver/assets/flavors/`. The catalog is read at boot,
so switch the scenario, then restart the app:

```bash
mockserver/scenario.sh images_v2         # guava gets a new file name (served in 3 s): old image, then new
mockserver/scenario.sh images_broken     # a 404, a corrupt file, a too-wide image: old images stay
mockserver/scenario.sh images_url_only   # coffee has no bundled fallback and its URL 404s: placeholder
mockserver/scenario.sh default
curl -s http://127.0.0.1:8787/__mock/state   # asset_counts: what the app downloaded
```

Failures are logged (`[Images] …`), retried every 10 minutes, and reported
once per file as a telemetry `image_download_failed` event. To start from an
empty cache, delete `user://image_cache/` (or `tools/dev_setup.gd -- --clear`).

## Local machine state (`user://`)

On macOS this is `~/Library/Application Support/Godot/app_userdata/FuelBot/`.
On Linux it is `~/.local/share/godot/app_userdata/FuelBot/`.

| File | Written by | Purpose |
|------|------------|---------|
| `tenant_id.txt` | provisioning (`tools/dev_setup.gd` in dev) | sent as `X-Tenant-Id`; no fetch happens without it |
| `local_settings.override.json` | provisioning | overrides the API URL and poll interval from `config/local_settings.json` |
| `config_cache.json` | the app | last valid remote config, used when offline |
| `razorpay_credentials.cfg` | you, by hand (test keys) | Razorpay key id + secret; never touched by mock mode |
| `razorpay_credentials.mock.cfg` | `dev_setup` (mock mode) | mock keys, selected via the override |
| `order_counter.txt` | the app | next display order number |
| `image_cache/` | the app | downloaded flavor images + `index.json` (flavor → last good file) |

`tools/dev_setup.gd -- --clear` removes the provisioning, cache and credential
files and the image cache (not the order counter), which resets the app to a fresh machine with no
network. None of these files are ever committed.

## Kiosk

Run the exported binary with `--fullscreen`. The project runs windowed at
540×960 for development.
