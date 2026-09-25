# CLAUDE.md

Guidance for working on this repo. The facts below were verified while
building the idle, details, payment, dispensing, telemetry and sales story
sets (IDLE-01…10, DET-01…03, PAY-01…06, DSP-01…06, TEL-01…07, SAL-01…04;
Sept 2026, Godot 4.7.2).
Read [README.md](README.md) for how to run things. This file covers how to
change things without re-learning the same lessons.

## What this is

A Godot 4.7 kiosk app for the FuelBot protein-shake vending machine. It runs
1080×1920 portrait, `gl_compatibility` renderer, with a Raspberry Pi as the
eventual target.
- Source of truth for architecture: [devdocs/plans/greenfield-rewrite.md](devdocs/plans/greenfield-rewrite.md).
- Work is planned as story sets in `devdocs/stories/<set>/`. Each set has a
  README with decisions and deviations from the plan, plus a `SIGNOFF.md`.
  Check the idle set's README "Decisions & deviations" before assuming the plan
  text is current.
- Designs: `designs/GMRFuelBot-OnDevice-SsampleScreens.pdf` (6 raster pages;
  render with PyMuPDF in a scratch venv; poppler isn't installed).

## Layout

```
autoload/      ConfigManager (first!), OrderState, Nav, OrderCounter, RazorpayManager, Bridge,
               TelemetryReporter, SalesReporter, DevCapture (always last)
core/          report_queue.gd (ReportQueue: durable outbound POST queue; telemetry now, sales in M6)
scenes/        one folder per screen (idle, flavor_select, flavor_detail, payment, dispensing,
               maintenance);
               scene_paths.gd = ScenePaths constants
ui/            components/ (brand_header, product_card, footer_bar, connectivity_status, chip,
               allergen_banner, nutrition_tile, step_indicator, status_badge), theme/palette.gd (Palette),
               format.gd (Fmt), gallery/ (dev only; shows every component)
config/        local_settings.json (strings, timing, api), default_config.json (offline fallback catalog)
assets/        fonts (OFL), generated theme/, images/flavors/, video/ (.ogv only)
hardware/      firmware/VM_code.ino (+ host_sim/ simulator, test_firmware.py), bridge/udprxtx.py (+ test) (.gdignore'd)
mockserver/    stdlib Python mock backend: routes.json, responses/<route>/*.json, assets/ (.gdignore'd)
tests/         TestRunner.tscn + test_case.gd + unit/test_*.gd
tools/         run_tests.sh, check_boot.sh, screenshot.sh, dev_run.sh, dev_setup.gd, build_theme.gd,
               udp_monitor.py (prints app→bridge UDP on 4242), fake_dispense_bridge.py (Level 0),
               fake_arduino_serial.py (Level 1), check_firmware.sh, test_fakes.py
```

## Commands (run from repo root)

- `tools/run_tests.sh [--filter=x]`: all GDScript tests. Starts its own mock on
  **:8788**, and fails on any `SCRIPT ERROR`, not just on failed asserts.
- `python3 -m unittest mockserver/test_server.py hardware/bridge/test_udprxtx.py tools/test_fakes.py hardware/firmware/test_firmware.py`:
  all Python tests (mock server, bridge, fakes + automated Level 1, and the
  **firmware on the host simulator**).
- `tools/check_firmware.sh`: `clang++ -fsyntax-only` of the sketch and a build
  of the simulator (`hardware/firmware/host_sim/`). Not an AVR compile
  (`arduino-cli` isn't installed).
- Firmware simulator by hand: build `hardware/firmware/host_sim/sim.cpp` (see
  `test_firmware.py`), then `sim [--start-pos N] [--broken-limit FROM:TO]
  [--at T:LINE] [--until S]` prints `<t>\t<serial line>`.
- `python3 tools/fake_dispense_bridge.py --mode done|timeout|reject|silent --delay N
  [--homing-fault-sec N]`: Level 0 stand-in for the bridge (also sends 4246
  telemetry and heartbeats). `python3 tools/fake_arduino_serial.py
  --time-scale 0.1 --link <path> [--fault never_done|silent|disconnect|homing_timeout|homing_flaky]` +
  `python3 hardware/bridge/udprxtx.py --serial <path> --recover-sec 3`: Level 1.
- `tools/check_boot.sh`: 5 s headless boot, fails on script or parse errors.
- `tools/screenshot.sh <res://Scene.tscn|main> [out.png] [delay] [flavor id]`:
  real-time capture (540×960) into `.screenshots/`. The 4th arg passes
  `--select=<id>` to `DevCapture` so details/payment can be launched directly.
- `tools/dev_run.sh [--scenario=x] [--payments=mock|razorpay-test] [--editor]
  [--fullscreen] [--no-mock] [--skip-port-check] [--bridge-check] [-- godot args]`: dev launch with the mock on
  **:8787**. `--scenario` switches the *config* route only; switch payment
  outcomes with `mockserver/scenario.sh <name> '/v1/payments/qr_codes/{qr_id}/payments'`.
- **One app, one bridge.** Only one process can listen on 4245 (bridge
  results) or 4242 (orders). A second app copy (typically the editor's F5
  game plus a `dev_run` window) never gets `DONE` and shows the failure
  screen at the safety cap. Its only sign is the log line `can't listen on
  127.0.0.1:4245`. `dev_run.sh` refuses to start in that case
  (`--skip-port-check` overrides), and its banner warns when no bridge is on
  4242. Test runs and screenshots start their own copies, which only warn.
- `python3 tools/udp_monitor.py`: see exactly what the app sends the bridge
  (4242). It can't run alongside the real or fake bridge (port conflict), and
  it can't watch 4245 while the app runs (the app binds it).
- `godot --headless --path . --script res://tools/build_theme.gd`: regenerate
  the theme after changing `palette.gd` or type sizes.
- After adding assets, run `godot --headless --path . --import` (run_tests does
  this).

## Definition of done for any change

`tools/run_tests.sh` → `ALL TESTS PASSED`, `tools/check_boot.sh` → `BOOT OK`,
the Python tests (`mockserver/`, `hardware/bridge/`, `tools/test_fakes.py`) → `OK` when any Python changed, `tools/check_firmware.sh` when the sketch changed,
and for UI changes a screenshot compared against the relevant PDF page.
**Look at the screenshot**: the stuck-maintenance race and the six-card
overflow were both found this way. Story work is one commit per story
(`IDLE-NN:`, `DET-NN:`, `PAY-NN: title`).
- **Chain the commit with `&&`, never `;`.** `tools/run_tests.sh …; git commit`
  committed a failing test once (`1baba35`). Use
  `tools/run_tests.sh && tools/check_boot.sh && git commit …`.
- **Re-run timing-sensitive tests** (payment, bridge, inactivity) 2–3× with
  `--filter=` before calling them green.

## Project rules

- **Autoload order matters.** `ConfigManager` is first (the others read it in
  `_ready`). `DevCapture` stays last. New autoloads go in between.
- **`project.godot` is rewritten by the editor**: it strips comments and drops
  keys equal to defaults. Put rules like the autoload order here, not in
  comments there, and commit the editor-normalised form.
- **Autoload scripts never use `class_name`.** Godot rejects a class name that
  shadows a singleton.
- **All scene changes go through `Nav.go()` / `Nav.go_idle()`**, never
  `change_scene_to_file`. `go_idle()` also resets `OrderState`.
- **Proceed to Pay (details) is the order commitment point.** It sets
  `OrderState.charged_price` and `selected_base_id` (first enabled base), and
  payment reads them. Back clears the selection. A catalog refresh while on
  details re-resolves the flavor by id and bails to the listing if it's gone
  or sold out.
- **Payment rules (Milestone 2):**
  - The hopper goes to the bridge **only after payment succeeds**, as one
    datagram `ORDER <order_id> P<hopper> B<n>` on 4242
    (`Bridge.send_order_paid`). Cancel, failure and expiry send
    `CANCEL <order_id>`. Port 4243, `Y`/`X` and the gap are gone (protocol v2).
  - **Cancel race:** Cancel does one final `check_now()` and dispenses if the
    payment is already captured.
  - Leaving the payment screen by any path except PAID calls
    `RazorpayManager.abort()`, which closes the QR, including one still being
    created.
  - `OrderState.order_id` (ULID from `Ulid.generate()`) is the analytics key
    and goes in the QR notes. `order_number` (`OrderCounter`) is display-only.
  - **Credentials:** only in `user://razorpay_credentials.cfg`, written by
    hand. **Never log, print or commit keys** (`run_tests.sh` greps for it).
    Log `mode()` only. `rzp_live_` keys are refused unless
    `payments.allow_live_keys`.
  - `dev_setup.gd` (default) = mock keys in a **separate**
    `razorpay_credentials.mock.cfg` (selected via the override) +
    `razorpay_base_url` → mock. `--payments=razorpay-test` (also on
    `dev_run.sh`) = real Razorpay with the hand-written
    `razorpay_credentials.cfg`. Mock mode never touches the real file.
    Mock Razorpay routes use the **same paths** as the real API.
- **Dispensing rules (Milestone 4, protocol table in
  `devdocs/stories/dispensing/README.md`):**
  - Results come back on 4245 as `DONE|TIMEOUT|REJECTED <order_id> [reason]`.
    The **`Bridge` autoload** owns that socket for the app's lifetime and
    caches results per order. A scene reads `Bridge.get_result(id)` on entry
    *and* listens to `result_received`, because a reply can arrive before the
    scene loads. Don't move the socket into a scene.
  - A refused `send_order_paid` records a local `REJECTED … bad_order`, so the
    dispensing screen fails at once. Payment navigates to dispensing either way.
  - The dispensing screen is lime in every state. Anything but `DONE`, or no
    result within `timing.dispense_safety_cap_sec` (130), shows
    `dispensing_timeout`. No refund logic. No maintenance check.
  - Timing chain: firmware cycle ≈ 68–78 s < bridge `--deadline` 110 <
    app cap 130. Keep cap > deadline if you retune.
  - The bridge is stdlib-only Python 3.9 (no `match`, no `X | Y` hints). All
    policy lives in `BridgeCore` (no I/O, fake clock in tests). It rejects
    orders while dispensing, recovering (after each cycle until
    `STATUS:HOMING_DONE`, max `--recover-sec`) or faulted, and never blocks
    without a deadline.
  - Firmware changes are minimal and marked `// M4:` / `// M5:`. Every serial
    line is `STATUS:<STAGE>` or `FAULT:<CODE>` (table in the telemetry
    README); keep them exact, since the bridge and fakes match them. Hoppers
    5–6 are `-1` placeholders that fail safe. **Change firmware only with a
    simulator test** (`hardware/firmware/test_firmware.py`).
- **Telemetry & machine-fault rules (Milestone 5, `devdocs/stories/telemetry/README.md`):**
  - The bridge sends JSON events on 4246: `dispense_cycle`, `machine_fault`,
    `machine_ok` (all posted to `api.base_url + api.telemetry_path`) and a
    10 s `bridge_status` heartbeat (state only, never posted).
    `TelemetryReporter` owns that socket, stamps `event_id`, `tenant_id`, a
    UTC `timestamp` + `Z`, `source`, and the order context from
    `Bridge.get_order_context()`, then queues.
  - Anything that must reach a backend goes through `ReportQueue`
    (`core/`): written to disk before the network, one POST in flight, retry
    timer, flush on boot, 4xx (not 408/429) dropped, capped. Don't write a
    second queue for sales in M6: reuse it.
  - Local maintenance faults are a **set of codes** (`ConfigManager.local_faults`,
    code → start time): `HOMING_TIMEOUT` (from the board) and `BRIDGE_DOWN`
    (no bridge heartbeat for `timing.bridge_heartbeat_timeout_sec` = 30 s,
    after `bridge_startup_grace_sec` = 60 s). Each clears only its own code:
    `set_local_hardware_fault(false, code)`. **Auto-clear, always** (product
    owner). Idle stays the only enforcement point; an order in progress
    finishes first. The watchdog is `bridge.require_heartbeat`: on in
    production, off in dev by default (`dev_setup --bridge-check=off|on`,
    `dev_run --bridge-check`).
- **Sale rules (Milestone 6, `devdocs/stories/sales/README.md`):** every paid
  order gets exactly one sale record (`SalesReporter`, via `ReportQueue`,
  `api.sales_path`), recorded by the dispensing screen when the outcome is
  known: `success` / `timeout` / `rejected` / `no_response` + reason. Build it
  from `SalesReporter.sale_from_order_state()` (committed prices, never the
  live catalog), and never on the payment screen.
- **Tests never touch the dev environment.** The test process loads the dev
  override (backend → the dev mock on :8787), so `tests/test_runner.gd`
  re-points the backend at the test mock (:8788) and the reporters at
  `user://test_runner/` queues, and turns off the dead-bridge watchdog. A
  test that swaps a reporter's `queue_path` restores the previous value,
  never the real `QUEUE_PATH`. A new reporter or queue needs the same
  treatment in `_isolate_app()`.
  - The board never resets in a loop on a homing fault: it retries after 1,
    2, 4 and 8 min, then every 10 min, and refuses commands (`FAULT:NOT_HOMED`).
    The bridge also refuses orders while faulted (`REJECTED machine_fault`).
    A homing failure after mixing still ends in `STATUS:DONE` (the drink
    counts).
- **Allergens:** the banner is hidden when the list is empty. Never render
  "allergen-free"; the data only says nothing was declared. The nutrition
  section hides when absent (the bundled config has none), and missing keys
  show `—`.
- **Idle (`scenes/idle`) is the only maintenance enforcement point.** Other
  screens must not check maintenance: an order in progress is never
  interrupted. The maintenance screen re-checks the flag on entry, because it
  can clear between idle's redirect and the new scene connecting.
- **No user-facing string literals in scenes.** Add keys to
  `config/local_settings.json` → `messages`, read with
  `ConfigManager.get_message(key, params)` (`{name}` placeholders). A missing
  key renders as `[key]`.
- **No colour literals outside `ui/theme/palette.gd`.** Derived colours (alpha
  variants) become new Palette constants.
- **Styling goes through theme type variations** (`theme_type_variation =
  &"Heading"`, `&"CardPanel"` …) defined in `tools/build_theme.gd`. The `.tres`
  files are generated but committed, so don't hand-edit them.
- **Timing values** come from `ConfigManager.get_timing()`. The API base URL
  lives in `local_settings.api` and can be overridden by
  `user://local_settings.override.json`. Never hardcode URLs in GDScript.
- **Catalog data is normalised once** in `ConfigManager.normalise()`: JSON
  numbers arrive as float, and `hopper`/prices become int there. Scenes trust
  normalised dicts. Anything new in the schema needs a default there and a rule
  in `validate_config()`.
- **Hoppers are 1..`ConfigManager.MAX_HOPPER` (6)**, unique among enabled
  flavors. `enabled:false` hides a flavor; `sold_out:true` shows it greyed and
  not tappable. Use `ConfigManager.is_orderable()`.
- Credentials and provisioning files (`tenant_id.txt`,
  `razorpay_credentials.cfg`, `razorpay_credentials.mock.cfg`, `*.local.cfg`,
  overrides) live in `user://` and are gitignored. Never commit a key.
- **The old build's `fuelbotsource_og/second.gd` contains a live Razorpay
  key.** Port logic from it, never text. When grepping it, mask
  `rzp_(live|test)_…` and secrets in the output.

## Razorpay test-mode run (real API, product owner's keys)

Automated tests never need this: they use the mock. Run it to verify the
payment integration against real Razorpay (PAY-06 Part B), and again after
any change to `RazorpayManager` or the create payload.

1. **Keys stay on the machine.** Never paste them into chat, a terminal
   command or a file in the repo. Create this file by hand:
   `~/Library/Application Support/Godot/app_userdata/FuelBot/razorpay_credentials.cfg`
   ```ini
   [razorpay]
   key_id="rzp_test_…"
   key_secret="…"
   ```
   `dev_setup.gd -- --payments=razorpay-test` refuses to continue (exit 1,
   printing this format) if the file is missing or doesn't hold `rzp_test_`
   keys. `rzp_live_` keys are refused by the app unless
   `payments.allow_live_keys` is `true`. Never flip that on a dev machine.
2. **Launch:** `tools/dev_run.sh --payments=razorpay-test`. The mock server
   still serves the *config* route; payment calls go to
   `https://api.razorpay.com` (the override's `razorpay_base_url` is removed).
   The log should show `[Razorpay] ready (mode=test)` and never the key.
3. **Order through to Scan to pay** (attract → drink → Proceed to Pay). Check:
   - the header chip reads `TEST MODE` and the QR is real and scannable (the
     mock's QR is a non-scannable placeholder);
   - Razorpay Dashboard (test mode) → QR Codes lists the new QR: amount ₹ of
     the drink, `single_use`, and **notes** with `order_id` (a 26-char ULID
     matching `OrderState.order_id`), `order_number` and `tenant_id`.
4. **Cancel** → the dashboard shows the QR as **closed** (on demand).
5. **Expiry:** leave one alone → it closes at `close_by` ≈ creation + 180 s.
   If create fails with `http_400` (the log says `QR create failed … http_400`),
   Razorpay rejected `close_by` as too soon: record its stated minimum, raise
   `timing.qr_expiry_sec` above it, and update plan §3.5 and the §0 decision
   log.
6. **Payment:** if Razorpay test mode offers a way to simulate paying a test
   UPI QR (dashboard or test tooling, per current Razorpay docs), do it and
   confirm `Payment received` → the dispensing screen, with
   `python3 tools/udp_monitor.py` showing `ORDER <order_id> P<hopper> B2`
   (or run `tools/fake_dispense_bridge.py` to see it through to DONE). If there's no way to simulate it, record that; the capture
   path is covered by the mock (`paid`, `paid_after_3`).
7. **Record** the results in `devdocs/stories/payment/SIGNOFF.md` (Part B
   table) and mark Milestone 2 done in plan §0/§5 once creation and close are
   confirmed.
8. **Back to mock:** `tools/dev_run.sh`. Mock keys live in their own
   `razorpay_credentials.mock.cfg`, so the real test-key file is left alone.
   `dev_setup.gd -- --clear` *does* delete it.

## Godot 4.7 gotchas (all hit or verified here)

- **A new `class_name` needs `godot --headless --path . --import`** before
  `tools/check_boot.sh`. Otherwise an autoload that uses it fails with
  "script does not inherit from 'Node'". `run_tests.sh` imports first;
  `check_boot.sh` doesn't.
- **`Time.get_datetime_string_from_system(true)` has no `Z`** (it returns
  `2026-09-24T11:51:11`). Append it for UTC timestamps in payloads.
- **Firmware simulator:** the sketch is compiled as `struct Board { #include
  VM_code.ino }`, with a fresh `Board` per boot, because re-running `setup()`
  keeps RAM and a cycle repeats. The stop time (`--until`) is enforced inside
  `delay()`, since a busy-wait never returns to the driver.

- **Variable fonts:** `FontVariation.variation_opentype` keys must be integer
  tags: `TextServerManager.get_primary_interface().name_to_tag("wght")`. String
  keys are silently ignored, and every weight renders the same.
- **Glyph coverage:** only Archivo has `₹`, so it is the fallback on the mono
  font. Neither font has `●`/`✓`, which is why dots are drawn (`StatusDot`).
- **Stretch:** `display/window/stretch/mode="canvas_items"` is required for the
  540×960 dev window to show the whole 1080×1920 layout scaled.
- **Movie Maker (`--write-movie`) is not real time**: it ignores `--max-fps`.
  Use the `DevCapture` autoload (`-- --capture=<abs path> --capture-delay=N`)
  for screenshots that depend on HTTP or timers.
- **`--script` mode:** autoloads exist, but their `_ready()` runs *after* the
  script's `_initialize()`. Tests use the scene-based runner instead. Tool
  scripts (`dev_setup.gd`, `build_theme.gd`) are fine because they don't depend
  on autoload state.
- **Coroutines:** calling one without `await` gives you no awaitable handle.
  To wait for a signal triggered after setup, use
  `watch_signal(obj, sig)` → trigger → `await wait_until(state, timeout)`.
- **A script error aborts a test coroutine** before its asserts run. That's why
  `run_tests.sh` greps the log for `SCRIPT ERROR`/`Parse Error`.
- **`:=` type inference fails** on Variant-ish expressions (`a is X and …`,
  `theme.get_…()` on an untyped var). Annotate explicitly (`var ok: bool = …`).
  This shows up as a Parse Error that makes the whole script fail to load.
- **Nodes created in code get auto names** (`@MarginContainer@12`). Keep
  references or set `name` explicitly; don't `get_node()` by guessed paths.
- **`.gdignore` folders** (`mockserver/`, `devdocs/`, `designs/`) aren't
  imported or exported, but `FileAccess` can still read them via `res://` in
  dev. Tests use this to load mock scenarios.
- **Video:** Theora `.ogv` only (no MP4/WebM in this build). Build it with
  `VideoStreamTheora.new()` + `.file = path`. There's no loop flag, so loop via
  `finished` → `play()`. Theora also plays headless (`is_playing()` is true in
  tests).
- **Rounded video mask:** `clip_children = CLIP_CHILDREN_ONLY` on the rounded
  `HeroPanel` works.
- **Label line pitch:** `line_spacing` is added to the font height. The theme
  generator computes it as `pitch - font.get_height(size)` to match the design
  exactly.
- **Bottom-anchored controls** need `grow_vertical = GROW_DIRECTION_BEGIN`, or
  they grow off screen.
- **Atomic file writes:** write `path.tmp`, then
  `DirAccess.rename_absolute(tmp, path)`, which replaces the target atomically
  on POSIX.
- **`SceneTreeTimer` can fire early.** A `create_timer()` made right after a
  slow frame consumes that frame's delta: 0.2 s measured 29 ms. For anything
  where a short wait is a correctness problem (bridge gaps, countdowns), wait
  on `Time.get_ticks_msec()` in a `process_frame` loop instead.
- **JSON numbers are floats** in GDScript. Compare with `int(...)`, or
  `assert_eq(1.0, 1)` fails on type.
- **`HTTPRequest` requests die with the app.** A fire-and-forget request made
  just before `quit()` may never go out. That's fine for the QR close
  (Razorpay closes at `close_by`), but keep it in mind.
- **Theme generator vs cache:** the project theme is loaded before
  `build_theme.gd` runs, so saving fonts at their existing paths collided
  ("cyclic resource inclusion"). The generator calls `take_over_path()` and
  then saves in place. Keep that pattern for any generated resource the
  project already loads.
- **`PacketPeerUDP.bind(0, "127.0.0.1")`** picks a free port
  (`get_local_port()`). Use it for UDP tests. To test timing between sends,
  timestamp the sender's own `sent` signal, not packet receipt: drain loops
  add frame-sized jitter (a 200 ms gap measured as 126 ms).
- A `JSON.parse_string` failure prints an engine `ERROR:` line. That's
  expected in the corrupt-cache/malformed tests, and `check_boot.sh`
  deliberately doesn't match it.

## Testing patterns

- Base class `TestCase` (`tests/test_case.gd`): asserts, `watch_signal`/
  `wait_until`, `click(control)` (synthetic press+release via `_gui_input`),
  `load_mock_config(scenario)` (resolves `extends`/`body_patch` like the server,
  then normalises), `mock_scenario()`/`mock_reset()`/`mock_state()` against
  :8788.
- **ConfigManager tests** use a fresh instance
  (`load(...).new()`, `auto_boot=false`, paths under `user://test_cm/`), never
  the real autoload or real `user://` files.
- **Scene tests** mutate the real autoloads, so wrap them in
  `snapshot_app_state()` / `restore_app_state()` and set `Nav.dry_run = true`
  (then assert `Nav.last_requested`).
- Scenes expose small getters for tests (`get_cards()`, `get_message_text()`,
  `get_cell_value()` …) rather than tests walking node trees.
- Layout constraints worth keeping get a test (e.g. six cards fit without
  scrolling, a long name stays within 3 lines).
- **Scene tests with real autoloads** (payment): point `RazorpayManager` at
  the mock (`base_url`, `credentials_path`, poll timings, then
  `reload_credentials()`) and `Bridge` at ephemeral `PacketPeerUDP.bind(0)`
  listeners (`order_port` + `connect_sockets()`; for results
  `listen_port = 0` + `listen()`, then send datagrams to
  `get_listen_port()`). Restore both in `after_each` with
  `configure_from_settings()`. Tests bind only ephemeral ports (the autoload
  itself binds 4245 at boot and only warns if it's taken).
- **Real-flow walkthroughs:** to verify navigation without dry-run and without
  a human, use a temporary scene that adds a persistent `Node` to `root`
  (so it survives scene changes), calls `Nav.go(IDLE)`, then injects taps with
  `Input.parse_input_event()`. Positions are in *window* coordinates, i.e.
  viewport × (window size / 1080×1920). Useful viewport tap points: attract
  anywhere (540,960), first listing card (300,650), Proceed (700,1800),
  payment Cancel (540,1805). Capture with
  `get_viewport().get_texture().get_image()` after two `process_frame`s,
  **not** `await RenderingServer.frame_post_draw`: that never fires once
  macOS stops drawing a hidden or occluded window, and the walker hangs.
  In that case captures are also a stale frame (every shot identical), so
  compare the md5s and re-run. Run `tools/udp_monitor.py`
  alongside to record bridge traffic, and read the mock's `last_body` from
  `/__mock/state` for what was sent to "Razorpay". **Wait ~1.5 s before
  `quit()`** so fire-and-forget requests (QR close) actually go out. Waits
  inside the walker use the wall clock. Don't commit it; record results in
  SIGNOFF.
- **Capturing screens that need an order:** `tools/screenshot.sh <scene> <out>
  <delay> <flavor id>` → `DevCapture --select=<id>` sets the flavor, price,
  base (`water`), a fresh ULID, order number 42 and a dummy transaction id
  (so dispensing opens in its blending state). It selects from whatever
  catalog is loaded at boot, so before the first fetch lands that's the
  cache or the bundled default (no volume/nutrition). A missing meta line in
  a capture can be this, not a bug.
- **Credential leak checks:** boot with sentinel keys
  (`rzp_test_SENTINEL1` / `SENTINEL2`) in the creds file and grep the log for
  `SENTINEL`: it must be 0. `run_tests.sh` also greps `RazorpayManager.gd` for
  print/warn calls that format `key_id`/`key_secret`/`_auth_header`.

## Mock server

- Features: `{param}` path segments (exact routes win), `require_basic_auth`,
  `sequence` envelopes (one response per request, the last repeats),
  placeholders `{{origin}}`/`{{now}}`/`{{request.<key>}}` (a whole-string
  placeholder keeps its JSON type), `last_body` in `/__mock/state`, and
  `/__mock/assets/<file>`. Route keys for pattern routes are the literal
  paths, e.g. `'/v1/payments/qr_codes/{qr_id}/payments'`.
- One JSON file per response variant in `mockserver/responses/<route>/`.
  `extends` + `body_patch` deep-merge, and arrays of `{id}` objects merge by
  id. Files are re-read on every request.
- Add routes in `routes.json`; `server.py` has no route-specific code.
- Missing `X-Tenant-Id` → 400 (config route). Missing/empty Basic auth → 401
  (Razorpay routes; any `id:secret` passes). Admin endpoints: `/__mock/state`,
  `/__mock/scenario`, `/__mock/reset` (`mockserver/scenario.sh`).
- Razorpay scenarios: create `default`/`bad_request`/`server_error`; payments
  `default` (pending), `paid`, `paid_after_3` (a sequence), `failed`,
  `server_error`; close `default`. Captured amounts are fixed at 7500 paise
  (guava ₹75), so amount-checking tests use guava. Switching a scenario
  restarts its sequence.
- `assets/qr_demo.png` comes from `make_demo_qr.py` (stdlib PNG writer). It's
  deliberately not scannable.
- **Stale servers bite.** A leftover server on :8787 silently serves an old
  scenario, and a new one fails with "Address already in use" in its log. Start
  background servers with `& PID=$!` and `kill $PID`: `kill %1` did not work
  across chained commands. `pkill -f mockserver/server.py` (and
  `pkill -f udp_monitor.py`) clears everything. `run_tests.sh` refuses to run
  if :8788 is already taken.
- The cached config persists maintenance state across reboots (by design). A
  previous `maintenance_on` run makes the next boot start in maintenance until
  a fetch says otherwise.

## Working on this machine

- Screenshot and dev windows pop up in front of the user. Their clicks have
  landed in capture windows twice, navigating away. If a capture shows an
  unexpected screen, re-run it before debugging.
- The macOS `user://` dir is `~/Library/Application Support/Godot/app_userdata/FuelBot/`.
  `godot --headless --path . --script res://tools/dev_setup.gd -- --clear`
  resets it (no tenant, override, cache, credentials or QR image; the order
  counter stays). Plain `dev_setup.gd` re-provisions for mock payments.
- **The shell is zsh.** Bash-only expansions fail (`${var^^}` →
  "bad substitution"), and an unquoted `$var` isn't word-split (use
  `${=var}`). Scripts in `tools/` have a bash shebang and are fine; this bites
  inline one-liners.
- `socat`, `pyserial` and `arduino-cli` aren't installed. Serial fakes use
  Python `pty` pairs. **PTY gotcha:** with `O_NONBLOCK` and `VMIN=0`, macOS
  returns `b''` for "no data", which looks like EOF. Use `VMIN=1` (EAGAIN =
  no data, `b''` = closed). Keep the fake's slave fd open and raw, or the
  pty echoes the fake's own output back to it.
- Temporary walker/capture scenes live in an untracked folder (e.g.
  `tmp_capture/`). Delete it before finishing, and never `git add -A`.
- There's no `timeout` binary on macOS; use Godot's `--quit-after N` (with
  `--max-fps` for real-time pacing).

## Open items carried forward

- **Motors 5–6 wiring:** `hardware/firmware/VM_code.ino` has `-1`
  placeholder pins, positions and durations (`TODO(wiring)`). Until they're
  wired, a real machine's catalog must not enable flavors on hoppers 5–6.
- **Milestone 4 Levels 2/3 pending hardware** (steps in the dispensing
  SIGNOFF), including the first real AVR compile. Then retune the timing
  chain from measured cycles.
- **Refund policy** for paid-but-failed dispenses: undecided (support
  message only).
- ~~Stuck board~~: resolved in Milestone 5 (bounded homing, machine fault,
  maintenance, orders refused while faulted).
- **Milestone 5 Levels 2/3 pending hardware** (steps in the telemetry
  SIGNOFF): unplug the limit switch, watch the fault, retries and auto-clear.
- ~~Dead bridge~~: built in Milestone 6 (`BRIDGE_DOWN`, see the rules above).
- Maintenance diagnostics: "LAST HEARTBEAT" is the *server*; the BRIDGE /
  BRIDGE HEARTBEAT row (from `TelemetryReporter`) is the hardware bridge.
  The 60 s dead-bridge startup grace is accepted as is (product owner).
- ~~Maintenance footer~~: local faults now say "BACK IN SERVICE AUTOMATICALLY"
  (Milestone 6).
- **Homing past the switch:** after a broken-switch fault the carriage can sit
  beyond home, and the next successful homing zeroes there (M4 homing
  behaviour). Check at Level 2.
- `hardware/pos/pinelabs.py` (inert port, plan §5 M4) not done.
- The plan doc quotes the old Razorpay key ID. Rotate the key as the plan
  says.
- Not yet verified by hand: the editor F5 path, and a manual tap-through of the
  full flow.
- **Milestone 2 Part B pending:** the real Razorpay test-mode check by the
  product owner. Steps are in "Razorpay test-mode run" above; results go in
  the payment SIGNOFF. Confirm Razorpay's minimum `close_by` lead time and
  whether test mode can simulate a UPI QR payment.
- Next: Milestone 7 (crop the flavor PNGs, port `pinelabs.py` inert), then
  Milestone 8 (Raspberry Pi: export, systemd, kiosk boot, udev rule).
- **Real sales/telemetry backends:** only the mock exists (settings change).
- Flavor PNGs from the old build have heavy padding and render small; crop
  them.
