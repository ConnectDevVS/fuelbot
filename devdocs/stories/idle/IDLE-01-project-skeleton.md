# IDLE-01 — Project skeleton & headless test harness

**As a** developer, **I want** a bootable, correctly configured Godot 4.7
project with a test harness and helper scripts, **so that** every later story
can be built and checked by running commands.

Plan refs: §4 (folder structure), §5 Milestone 0.
Depends on: nothing.

## Deliverables

```
project.godot
icon.svg                          # copy of the old tree's icon.svg
.gitignore                        # extended
scenes/idle/Idle.tscn             # PLACEHOLDER, replaced in IDLE-09
scenes/idle/idle.gd               # PLACEHOLDER
tests/TestRunner.tscn
tests/test_runner.gd
tests/test_case.gd
tests/unit/test_smoke.gd
tools/run_tests.sh
tools/check_boot.sh
tools/screenshot.sh
autoload/DevCapture.gd            # dev-only screenshot hook, inert unless --capture= is passed
```

Also create these empty directories, each holding a `.gitkeep`: `autoload/`,
`config/`, `scenes/flavor_select/`, `scenes/flavor_detail/`,
`scenes/maintenance/`, `ui/components/`, `assets/images/flavors/`,
`assets/images/branding/`, `assets/video/`, `assets/fonts/`, `assets/theme/`.

Add an empty **`.gdignore`** to `devdocs/` and `designs/`. Godot then skips
them: no import of the PDF, and they are never exported. Files in a
`.gdignore`d folder can still be read with `FileAccess` via `res://` when
running from the project directory, which IDLE-03 relies on for `mockserver/`.

## Spec

### `project.godot`

Write it exactly like this. Godot will reorder and add keys on first editor
save, which is fine.

```ini
config_version=5

[application]

config/name="FuelBot"
config/version="0.1.0"
run/main_scene="res://scenes/idle/Idle.tscn"
config/features=PackedStringArray("4.7", "GL Compatibility")
config/icon="res://icon.svg"

[autoload]

DevCapture="*res://autoload/DevCapture.gd"

[display]

window/size/viewport_width=1080
window/size/viewport_height=1920
window/size/mode=0
window/size/window_width_override=540
window/size/window_height_override=960
window/stretch/mode="canvas_items"
window/stretch/aspect="keep"
window/handheld/orientation=1

[input_devices]

pointing/emulate_mouse_from_touch=true

[rendering]

renderer/rendering_method="gl_compatibility"
renderer/rendering_method.mobile="gl_compatibility"
textures/vram_compression/import_s3tc_bptc=true
textures/vram_compression/import_etc2_astc=true
```

Notes:
- `stretch/mode="canvas_items"` is **required**. Without it the 540×960 window
  shows the top-left quarter of the 1080×1920 layout unscaled instead of a
  scaled-down whole screen (spike-verified).
- Fullscreen is **not** set here (README decision 7). The kiosk launches with
  `--fullscreen`.
- Drop `text_to_speech` (plan §5 M0).
- IDLE-04 and IDLE-05 add their autoloads **above** `DevCapture`.

### `.gitignore`: append

```
# Provisioning / credentials: must never be committed (plan §5 M0)
*.local.cfg
tenant_id.txt
razorpay_credentials.cfg
local_settings.override.json

# Local tooling output
.DS_Store
.screenshots/
__pycache__/
```

### Placeholder `scenes/idle/Idle.tscn`

A full-rect `Control` named `Idle` with a `ColorRect` background `#111215` and a
centred `Label` saying `FuelBot — skeleton`, plus `idle.gd`
(`extends Control`, empty `_ready`). IDLE-09 replaces both files.

### Test harness

`tests/test_case.gd`, the base class for every test file:

```gdscript
class_name TestCase
extends Node
## Base class for tests. Methods named test_* are run by tests/test_runner.gd.
## Tests may be coroutines (use await). Optional hooks: before_each(), after_each().

var failures: PackedStringArray = []

func fail(msg: String) -> void:
	failures.append(msg)

func assert_true(cond: bool, msg: String = "expected true") -> void:
	if not cond:
		fail(msg)

func assert_false(cond: bool, msg: String = "expected false") -> void:
	if cond:
		fail(msg)

func assert_eq(actual: Variant, expected: Variant, msg: String = "") -> void:
	if typeof(actual) != typeof(expected) or actual != expected:
		fail("%s expected <%s> got <%s>" % [msg, str(expected), str(actual)])

func wait_seconds(sec: float) -> void:
	await get_tree().create_timer(sec).timeout

## Waits for obj.signal_name or until timeout. Returns {"fired": bool, "args": Array}.
func wait_for_signal(obj: Object, signal_name: StringName, timeout_sec: float) -> Dictionary:
	var state := {"fired": false, "args": []}
	var cb := func(a0 = null, a1 = null, a2 = null) -> void:
		state.fired = true
		state.args = [a0, a1, a2]
	obj.connect(signal_name, cb, CONNECT_ONE_SHOT)
	var deadline := Time.get_ticks_msec() + int(timeout_sec * 1000)
	while not state.fired and Time.get_ticks_msec() < deadline:
		await get_tree().process_frame
	if not state.fired and obj.is_connected(signal_name, cb):
		obj.disconnect(signal_name, cb)
	return state
```

`tests/test_runner.gd`, attached to the root `Node` of `tests/TestRunner.tscn`:

- Collects every `res://tests/unit/test_*.gd` via `DirAccess.get_files_at`,
  sorted. Also matches `*.gd.remap` in case of an export. Strip `.remap`.
- Optional filter: `OS.get_cmdline_user_args()` may contain `--filter=<substr>`.
  If so, only files or methods containing the substring run.
- For each file: `var t: TestCase = load(path).new()`, then `add_child(t)`.
  For each method whose name starts with `test_`, in declaration order (from
  `get_script().get_script_method_list()`): clear `t.failures`, call
  `before_each` if present (awaited), then `await t.call(method)`, then
  `after_each` if present (awaited). Record pass/fail and print
  `  PASS file::method` or `  FAIL file::method — <failures joined by "; ">`.
  Finally `t.queue_free()`.
- Watchdog: a 180 s `Timer`. If it fires, print `TEST RUN TIMED OUT` and
  `get_tree().quit(2)`.
- Ends with `print("ALL TESTS PASSED (%d)" % n)` and `quit(0)`, or
  `print("TESTS FAILED: %d of %d" % [f, n])` and `quit(1)`.

`tests/unit/test_smoke.gd` (`extends TestCase`):
- `test_viewport_is_portrait_1080x1920`: `ProjectSettings` width 1080, height
  1920.
- `test_renderer_is_compatibility`.
- `test_main_scene_loads`: `load(ProjectSettings.get_setting("application/run/main_scene"))`
  is a `PackedScene` and `instantiate()` works. Free the instance afterwards.

### Tool scripts

All scripts are `bash` with `set -euo pipefail`, `cd` to the repo root
(`cd "$(dirname "$0")/.."`), use `GODOT="${GODOT:-godot}"`, and are
`chmod +x`.

**`tools/run_tests.sh [--filter=x]`**
1. `"$GODOT" --headless --path . --import >/dev/null 2>&1 || true` so new
   assets are imported first.
2. Run `"$GODOT" --headless --path . res://tests/TestRunner.tscn -- "$@"`,
   tee output to a `mktemp` log, capture the Godot exit code via
   `${PIPESTATUS[0]}`.
3. Exit non-zero unless the code is 0 **and** the log contains
   `ALL TESTS PASSED`. The second check catches a crash that exits 0.
4. IDLE-04 extends this script to start and stop the mock server on port
   8788. Leave a clearly marked `# --- mock server (IDLE-04) ---` spot.

**`tools/check_boot.sh`**
- Runs the main scene headless for about 5 real seconds:
  `"$GODOT" --headless --path . --max-fps 60 --quit-after 300`. Tee to a log.
- Fails (exit 1, printing matching lines) if the log matches
  `SCRIPT ERROR|Parse Error|Failed loading resource|Failed to load script|Invalid call|Nonexistent function`.
- Prints `BOOT OK` on success.

**`autoload/DevCapture.gd`**: a real-time screenshot hook, registered in
`project.godot` as `DevCapture="*res://autoload/DevCapture.gd"`. IDLE-04 and
IDLE-05 insert their autoloads **above** it, so it always stays last.
- In `_ready()`, read `OS.get_cmdline_user_args()` for `--capture=<abs path>`
  and optional `--capture-delay=<sec>` (default 4). If there is no
  `--capture=`, `queue_free()` and do nothing, so it's inert in normal runs and
  on the kiosk.
- Otherwise, `await get_tree().create_timer(delay).timeout`, then
  `await RenderingServer.frame_post_draw`, then
  `get_viewport().get_texture().get_image().save_png(path)`. Print
  `CAPTURED <path>`, then `get_tree().quit(0)` (or `quit(1)` on save error).
- Why not Movie Maker (`--write-movie`): spike-measured, it renders as fast as
  possible and ignores `--max-fps`. 30 frames "at 10 fps" took 0.8 s of wall
  time, so HTTP-dependent screens got captured before the config fetch
  returned. This hook waits in **real** time.

**`tools/screenshot.sh <scene-res-path|main> [out.png] [delay_sec]`**
- Defaults: out = `.screenshots/<scene basename or main>.png`, delay = `4`.
- Runs windowed:
  `"$GODOT" --path . [scene] -- --capture="$(pwd)/$out" --capture-delay="$delay"`.
  Omit the scene argument for `main`.
- Fails if the output file wasn't written. Prints its path.
- Output is 540×960 (window override, whole screen scaled). That is fine for
  side-by-side review against the PDF.

## Acceptance criteria

- [ ] `godot --headless --path . --import` completes with no errors.
- [ ] `tools/run_tests.sh` prints `ALL TESTS PASSED (3)` and exits 0.
- [ ] Temporarily adding `assert_true(false)` to a smoke test makes
      `run_tests.sh` exit non-zero with a `FAIL` line. Revert afterwards.
- [ ] `tools/check_boot.sh` prints `BOOT OK`.
- [ ] `tools/screenshot.sh main` writes `.screenshots/main.png` after about
      4 s: a 540×960 image showing the whole placeholder (the label is centred,
      not cropped).
- [ ] A normal run (`godot --path .`) is unaffected by DevCapture: no quit,
      no capture.
- [ ] Opening the project in the Godot editor and pressing F5 shows a 540×960
      window with the placeholder.
- [ ] The Godot editor's FileSystem dock shows neither `devdocs/` nor `designs/`.
- [ ] `git status` shows no `.godot/` directory and no `.screenshots/`
      directory.

## Verification

```bash
godot --headless --path . --import
tools/run_tests.sh
tools/check_boot.sh
tools/screenshot.sh main && open .screenshots/main.png
git status --short
```

## Out of scope

Autoloads, config files, real screens.
