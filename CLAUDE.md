# CLAUDE.md

Guidance for working on this repo. The facts below were verified while
building the idle-screen milestone (stories IDLE-01…10, Sept 2026, Godot 4.7.2).
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
autoload/      ConfigManager (first!), OrderState, Nav, DevCapture (always last)
scenes/        one folder per screen; scene_paths.gd = ScenePaths constants
ui/            components/, theme/palette.gd (Palette), format.gd (Fmt), gallery/ (dev only)
config/        local_settings.json (strings, timing, api), default_config.json (offline fallback catalog)
assets/        fonts (OFL), generated theme/, images/flavors/, video/ (.ogv only)
mockserver/    stdlib Python mock backend + JSON scenarios (.gdignore'd)
tests/         TestRunner.tscn + test_case.gd + unit/test_*.gd
tools/         run_tests.sh, check_boot.sh, screenshot.sh, dev_run.sh, dev_setup.gd, build_theme.gd
```

## Commands (run from repo root)

- `tools/run_tests.sh [--filter=x]`: all GDScript tests. Starts its own mock on
  **:8788**, and fails on any `SCRIPT ERROR`, not just on failed asserts.
- `python3 -m unittest mockserver/test_server.py`: mock server tests.
- `tools/check_boot.sh`: 5 s headless boot, fails on script or parse errors.
- `tools/screenshot.sh <res://Scene.tscn|main> [out.png] [delay]`: real-time
  capture (540×960) into `.screenshots/`.
- `tools/dev_run.sh [--scenario=x] [--editor] [--no-mock] [-- godot args]`: dev
  launch with the mock on **:8787**.
- `godot --headless --path . --script res://tools/build_theme.gd`: regenerate
  the theme after changing `palette.gd` or type sizes.
- After adding assets, run `godot --headless --path . --import` (run_tests does
  this).

## Definition of done for any change

`tools/run_tests.sh` → `ALL TESTS PASSED`, `tools/check_boot.sh` → `BOOT OK`,
and for UI changes a screenshot compared against the relevant PDF page.
**Look at the screenshot**: the stuck-maintenance race and the six-card
overflow were both found this way. Story work is one commit per story
(`IDLE-NN: title`).

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
  `razorpay_credentials.cfg`, `*.local.cfg`, overrides) live in `user://` and
  are gitignored. Never commit a key.

## Godot 4.7 gotchas (all hit or verified here)

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
  scrolling).

## Mock server

- One JSON file per response variant in `mockserver/responses/<route>/`.
  `extends` + `body_patch` deep-merge, and arrays of `{id}` objects merge by
  id. Files are re-read on every request.
- Add routes in `routes.json`; `server.py` has no route-specific code.
- Missing `X-Tenant-Id` → 400. Admin endpoints: `/__mock/state`,
  `/__mock/scenario`, `/__mock/reset` (`mockserver/scenario.sh`).
- **Stale servers bite.** A leftover server on :8787 silently serves an old
  scenario, and a new one fails with "Address already in use" in its log. Start
  background servers with `& PID=$!` and `kill $PID`: `kill %1` did not work
  across chained commands. `pkill -f mockserver/server.py` clears everything.
  `run_tests.sh` refuses to run if :8788 is already taken.
- The cached config persists maintenance state across reboots (by design). A
  previous `maintenance_on` run makes the next boot start in maintenance until
  a fetch says otherwise.

## Working on this machine

- Screenshot and dev windows pop up in front of the user. Their clicks have
  landed in capture windows twice, navigating away. If a capture shows an
  unexpected screen, re-run it before debugging.
- The macOS `user://` dir is `~/Library/Application Support/Godot/app_userdata/FuelBot/`.
  `godot --headless --path . --script res://tools/dev_setup.gd -- --clear`
  resets it (no tenant, no override, no cache).
- There's no `timeout` binary on macOS; use Godot's `--quit-after N` (with
  `--max-fps` for real-time pacing).

## Open items carried forward

- The plan (§2.1.3, §3.3) and `VM_code.ino` still assume 4 motors; hoppers 5–6
  need firmware and wiring work.
- The plan doc quotes the old Razorpay key ID. Rotate the key as the plan
  says.
- Not yet verified by hand: the editor F5 path, and a manual tap-through of the
  full flow.
- Next story set proposed: Order flow (Ingredients → Payment → Dispensing →
  Complete → Sale reporting). Pending decisions: when to send the hopper
  command, Razorpay test keys vs mock, QR expiry, order-number source.
