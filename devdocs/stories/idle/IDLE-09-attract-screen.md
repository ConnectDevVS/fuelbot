# IDLE-09 — Attract (idle) screen, "Tap Anywhere To Start"

**As a** passer-by, **I want** an eye-catching looping screen that invites me
to tap, **so that** I start an order. **As an** operator, **I want** this screen
to be the one place that sends the machine to maintenance.

Design: **PDF page 1, "00 Attract / Tap to Start"**.
Plan refs: §3.6 `scenes/idle/` (attract video, tap-to-start, maintenance
check plus subscription), §3.11 (idle is the **only** enforcement point),
§3.13 (bundled `.ogv`, explicit loop via `finished`, stop on leave, restart on
re-entry), §5 M3 verification.
Depends on: IDLE-07 (maintenance target), IDLE-08 (tap target).

## Deliverables

```
scenes/idle/Idle.tscn          # replaces the IDLE-01 placeholder; stays run/main_scene
scenes/idle/idle.gd
tests/unit/test_idle_screen.gd
```

## Layout (1080×1920)

```
Control (full rect, mouse_filter STOP) ── ColorRect BG
└─ MarginContainer (72 left/right, 60 top, 64 bottom)
   └─ VBox
      ├─ BrandHeader                              right_mode = "status"  (● READY / ● OFFLINE)
      ├─ gap 64
      ├─ PanelContainer HeroPanel                 custom_minimum_size.y = 640,
      │  │                                        clip_children = CLIP_CHILDREN_ONLY (rounded mask)
      │  └─ Control VideoFrame (clip_contents)
      │     ├─ VideoStreamPlayer Video            cover-fitted (see below)
      │     └─ CenterContainer Fallback (hidden)  └─ LogoTile 240×240 > LogoText at size 110
      ├─ gap 64
      ├─ Label DisplayXL Headline                 attract_headline "FRESH\nBLENDED\nPROTEIN"
      ├─ gap 28
      ├─ Label Body Subline (autowrap)            attract_subline (formatted, below)
      ├─ spacer (EXPAND_FILL)
      ├─ Button PrimaryButton Cta                 min height 172, text "", mouse_filter IGNORE
      │  └─ CenterContainer > HBox (sep 24)
      │       ├─ StatusDot (ON_ACCENT @ 45% alpha, diameter 22, pulse)
      │       └─ Label (PrimaryButton font)       attract_cta "Tap Anywhere To Start"
      ├─ gap 40
      └─ Label Mono, centred                      attract_footer "UPI PAYMENT ONLY · NO CASH ACCEPTED"
```

If `clip_children` gives trouble with the video texture, fall back to square
corners on the video and say so in the PR. Rounded corners are cosmetic.

**Subline**: `get_message("attract_subline", {"count_word": Fmt.count_word(n), "min_price": Fmt.rupees(ConfigManager.get_min_charge_price())})`,
where `n` = number of **orderable** flavors. Hide it when `n == 0`. Recompute on
`ConfigManager.config_ready`.

## Behaviour

**Maintenance (the only check in the app):**
- `_ready()`: `OrderState.reset()`. Then, if `ConfigManager.is_in_maintenance()`,
  call `Nav.go.call_deferred(ScenePaths.MAINTENANCE)` and **return before
  starting the video**.
- Connect `ConfigManager.maintenance_changed(enabled, _msg)`: if `enabled`,
  call `_stop_video()` and then `Nav.go(ScenePaths.MAINTENANCE)`.

**Tap anywhere:**
- `_input(event)`: act on `InputEventMouseButton` (left, **released**) or
  `InputEventScreenTouch` (released). Ignore it if less than
  `get_timing("attract_tap_debounce_sec")` has passed since `_ready()` (this
  stops a tap from the previous screen carrying over), or if already leaving.
- `_start()`: set `_leaving = true`, call `_stop_video()`, then
  `Nav.go(ScenePaths.FLAVOR_SELECT)`.
- The CTA button is visual only (`mouse_filter IGNORE`). The whole screen is
  the target.

**Video (plan §3.13, bundled tier):**
- `@export var video_path_override := ""` exists for tests.
  `_resolve_video_path()` returns the override if set, else
  `res://assets/video/idle_ad_default.ogv`. Leave a one-line comment that
  §3.13's `user://idle_video_cache/` tiers plug in here later.
- `_play_video()` (spike-verified construction):
  ```gdscript
  var path := _resolve_video_path()
  if not FileAccess.file_exists(path):
  	_show_fallback()
  	return
  var stream := VideoStreamTheora.new()
  stream.file = path
  video.stream = stream
  video.play()
  ```
  After one frame, if `not video.is_playing()`, call `_show_fallback()`.
- **Loop**: `video.finished.connect(_play_video)`. This re-resolves the path
  every loop, as §3.13 wants. Godot's VideoStreamPlayer has no loop flag, and
  the old build froze on the last frame.
- **Cover fit**: on `VideoFrame.resized` and after each `play()`, read
  `tex := video.get_video_texture()`. If it's null or zero-size, retry next
  frame (up to 10 frames; headless may never get a size, which is fine).
  Otherwise `s = max(frame.w / tex.w, frame.h / tex.h)`,
  `video.size = tex.size * s`, `video.position = (frame.size - video.size) / 2`.
  Set `video.expand = true`.
- `_stop_video()`: `video.stop()`, disconnect nothing. It's also called from
  `_exit_tree()` so decoding never continues off-screen (plan §3.13, matters
  on the Pi).
- Re-entry (`Nav.go_idle()` loads a fresh scene) naturally restarts from the
  beginning.

## Acceptance criteria

`tests/unit/test_idle_screen.gd`. `before_each`: snapshot and restore the
autoload's `current_config`, `local_settings`, `remote_maintenance_enabled` and
`local_hardware_fault_active`; `current_config = load_mock_config("default")`;
`Nav.dry_run = true`; `Nav.last_requested = ""`.
- [ ] Normal: after 2 frames there is no navigation, `Video.is_playing()` is
      true (spike: Theora plays headless) and `Fallback` is hidden.
- [ ] Subline reads `Five shakes on tap. Blended to order in under a minute.\nFrom ₹35.`
      (6 enabled, vanilla sold out, electro ₹35).
- [ ] Maintenance at entry: `set_local_hardware_fault(true)` **before**
      instantiating → within 2 frames `Nav.last_requested == ScenePaths.MAINTENANCE`
      and the video is not playing.
- [ ] Maintenance while open: instantiate, then `set_local_hardware_fault(true)`
      → `MAINTENANCE` is requested and the video is stopped.
- [ ] Tap before debounce (set `attract_tap_debounce_sec = 0.3`, tap at once)
      → no navigation. Tap after 0.4 s → `FLAVOR_SELECT` and the video is
      stopped. A second tap doesn't navigate again (count `Nav.navigated`
      emissions == 1).
- [ ] Loop: `Video.finished.emit()` → `Video.is_playing()` is true again.
- [ ] `video_path_override = "res://nope.ogv"` → `Fallback` visible, no script
      error.
- [ ] Changing `current_config` to `price_change` and emitting `config_ready`
      updates the subline (electro gone → `Four shakes on tap…`,
      `From ₹75.`).

Visual: run the mock server (`default`),
`godot --headless --path . --script res://tools/dev_setup.gd`, then
`tools/screenshot.sh main .screenshots/Idle.png 5`. Compare with PDF page 1:
- [ ] Header: `PF` tile, `POWERFUEL GYM` / `FUELBOT · BAY 02`, lime dot plus
      `READY` at right.
- [ ] Rounded hero panel filled edge to edge by the playing video, with no
      letterbox bars.
- [ ] Huge three-line `FRESH / BLENDED / PROTEIN`, muted subline beneath.
- [ ] Full-width lime CTA near the bottom with a dark pulsing dot and heavy
      black `Tap Anywhere To Start`. Mono footer line under it.

Manual (plan §5 M3 verification):
- [ ] F5 in the editor opens straight into this screen.
- [ ] Leave it running past the end of the clip: the video restarts on its own
      and doesn't freeze on the last frame.
- [ ] Click anywhere: the listing opens. Wait 60 s untouched on the listing:
      back to this screen, video playing from the start.
- [ ] `mockserver/scenario.sh maintenance_on` while this screen is up: within
      about 10 s (dev poll interval from `dev_setup.gd`) the maintenance screen
      appears. `mockserver/scenario.sh reset`: it returns here within about
      10 s.
- [ ] With `maintenance_on` active, open the listing **first**, then flip the
      flag: the listing is **not** interrupted. After its inactivity timeout it
      returns to idle, which immediately redirects to maintenance (plan §7
      step 10, mid-order non-interruption).

General:
- [ ] `tools/run_tests.sh` and `tools/check_boot.sh` pass.

## Out of scope

Remote/S3 video tiers (§3.13 future scope), door/tamper interlock (§3.9).
