# DSP-05 — Dispensing screen (PDF page 5)

**As a** customer who just paid, **I want** to see my drink being made, told
when to collect it, and told honestly when something went wrong, **so that**
I know what's happening and when to walk away.

Plan refs: §3.6, §3.7 (dispensing scene), §3.10; README decisions 2, 3, 6,
7, 8, 11, 12 and the page-5 measurements.
Depends on: DSP-01 (`Bridge.get_result` / `result_received`).

## Deliverables

```
scenes/dispensing/Dispensing.tscn, dispensing.gd     # replaces the stub
ui/components/status_badge/StatusBadge.tscn, status_badge.gd   # drawn circle + check / "!"
ui/theme/palette.gd                  # + ACCENT_TRACK
tools/build_theme.gd                 # + variations below; regenerate assets/theme/
config/local_settings.json           # messages + timing below; stub keys removed
autoload/DevCapture.gd               # --select also sets a transaction id (so the scene can be captured)
ui/gallery/                          # StatusBadge added
tests/unit/test_dispensing_screen.gd
tests/unit/test_payment_screen.gd    # stub tests removed
```

## Spec

### Settings

`timing`: `dispense_expected_sec: 75`, `dispense_safety_cap_sec: 130`,
`dispensing_done_return_sec: 6`, `dispensing_error_return_sec: 10`.
Remove `dispensing_stub_return_sec`.

`messages` (remove `dispensing_stub_title`/`_body`):

| Key | Text |
|-----|------|
| `dispensing_order_paid` | `ORDER #{number} · PAID` |
| `dispensing_paid_via` | `UPI · {price}` |
| `dispensing_title` | `BLENDING\nYOUR DRINK` |
| `dispensing_success` (existing key, new text) | `ENJOY\nYOUR SHAKE` |
| `dispensing_failed_title` | `WE'RE\nSORRY` |
| `dispensing_meta` | `{name} · {volume_ml} ml` (just the name when there's no volume) |
| `dispensing_progress_label` | `BLENDING` |
| `dispensing_remaining` | `~{seconds} SECONDS` |
| `dispensing_almost` | `ALMOST DONE` |
| `dispensing_ready_label` | `READY` |
| `dispensing_collect` | `Collect from the hatch below` |
| `dispensing_footer` | `Earned it. Now drink it.` |
| `dispensing_returning` | `RETURNING TO MENU IN {seconds}S` |
| `dispensing_timeout` (existing) | unchanged: the failure body |

### Theme (all colours via `Palette`; new token `ACCENT_TRACK = #ABDA35`)

| Variation | Base | Font / box |
|-----------|------|------------|
| `DisplayOnAccent` | Label | display 900, **113**, `ON_ACCENT`, line pitch **96** (see note) |
| `BodyOnAccent` | Label | body 600, 34, `ON_ACCENT` |
| `MonoOnAccent` | Label | mono 500, 22, `ON_ACCENT` (+2 spacing, as `Mono`) |
| `MonoOnAccentSmall` | Label | mono 500, 20, `ON_ACCENT` |
| `FooterOnAccent` | Label | heading 800, 50, `ON_ACCENT` |
| `CollectText` | Label | display 900, 46, `ACCENT` |
| `LogoTextInverse` | Label | display 900, 26, `ACCENT` |
| `LogoTileInverse` | PanelContainer | `ON_ACCENT`, radius 12 |
| `CollectPill` | PanelContainer | `ON_ACCENT`, radius 20 |
| `DispenseProgress` | ProgressBar | `background` `ACCENT_TRACK` r14, `fill` `ON_ACCENT` r14 |

Note, found at the first screenshot: at 124 px the weight-900 title rendered
`YOUR DRINK` 860 px wide, against 781 in the design. The design's display
face is narrower than Archivo 900 at wdth 100. Matching the **width** (113 px,
pitch 96) keeps long titles such as `ENJOY / YOUR SHAKE` inside the column.
The cap height is then ~78 px against 89 in the design.

### `StatusBadge` (`class_name StatusBadge`, `Control`)

`@export var mark: Mark` (`CHECK`, `ALERT`), `diameter := 224.0`,
`circle_color := Palette.ON_ACCENT`, `mark_color := Palette.ACCENT`. `_draw()`
draws an antialiased circle, then either a check (a two-segment polyline,
stroke ≈ diameter × 0.09, spanning ≈ 55 % of the diameter) or a `!` (a
rounded bar plus a dot). It's drawn, not a glyph (decision 12).

### Layout (1080×1920; y from the measurements)

Full-rect `ACCENT` background. Header row at top 52, side margins 62: tile
64×64 + mono `dispensing_order_paid` (`number` = `%04d`), then an expander,
then `dispensing_paid_via` (`price` = `Fmt.rupees(charged_price)`). A centre
column 762 wide holds, top to bottom: badge 224 (top ≈ 514), gap, title
(2 lines, centred), meta, the progress bar 762×28 (top ≈ 1094), the label
row (`BLENDING` left, remaining right), then the collect pill 751×116 (top
≈ 1230). The footer and return line are anchored to the bottom
(`grow_vertical = BEGIN`, bottom margin ≈ 76). Everything is centred.

### States

| | `BLENDING` (entry) | `DONE` | `FAILED` |
|--|--|--|--|
| Enter on | `_ready` | a `DONE` for this order | `TIMEOUT` / `REJECTED` for this order, or the safety cap |
| Badge | check | check | `!` |
| Title | `dispensing_title` | `dispensing_success` | `dispensing_failed_title` |
| Meta | `dispensing_meta` | `dispensing_meta` | `dispensing_timeout` (wraps, max 762 wide) |
| Bar | estimated progress | 100 % | hidden |
| Bar labels | `BLENDING` / `~N SECONDS` → `ALMOST DONE` | `READY` / (empty) | hidden |
| Pill | hidden | `dispensing_collect` | hidden |
| Footer | `dispensing_footer` | `dispensing_footer` | hidden |
| Return line | hidden | `RETURNING TO MENU IN {s}S`, counting down from `dispensing_done_return_sec` | same, from `dispensing_error_return_sec` |
| Leaves | — | `Nav.go_idle()` at 0 | `Nav.go_idle()` at 0 |

- **Entry guard:** `OrderState.transaction_id == ""` or an invalid
  `order_id` → `Nav.go_idle()` deferred (unchanged from the stub).
- **Result intake:** on `_ready`, check `Bridge.get_result(order_id)` (it may
  already have arrived; decision 6). Then connect `Bridge.result_received`
  and act only on `order_id == OrderState.order_id`. Only `BLENDING` reacts;
  later results are ignored. `TIMEOUT`/`REJECTED` log the reason with
  `push_warning("[Dispensing] order <id> <kind> <reason>")`.
- **All timing is wall clock** (`Time.get_ticks_msec()` in `_process`;
  CLAUDE.md: `SceneTreeTimer` can fire early): the elapsed time, the safety
  cap, and the return countdown (the label shows `ceil(remaining)`).
- **Progress estimate** (static, tested):
  `estimate_progress(elapsed, expected)`: `0.95 × elapsed/expected` up to
  `expected`; beyond that `0.95 + 0.04 × (1 − e^(−(elapsed−expected)/expected))`;
  `expected <= 0` → 0.95. It's monotonic and always `< 0.99` before `DONE`.
  Remaining = `ceil(expected − elapsed)`; below 1 it shows `ALMOST DONE`.
- **No maintenance check** (idle is the only enforcement point). No
  inactivity timer, and taps do nothing.
- Test getters: `get_state()`, `get_progress()`, `get_title_text()`,
  `get_meta_text()`, `get_remaining_text()`, `get_return_text()`,
  `get_header_texts()`, `is_collect_visible()`, `get_badge_mark()`.

## Acceptance criteria

`tests/unit/test_dispensing_screen.gd`. `Nav.dry_run`; `Bridge` pointed at an
ephemeral listen port (`listen_port = 0`); results are injected by sending
real UDP datagrams to it. Short timings: expected 1.0 s, cap 1.5 s, returns
0.3 s.
- [ ] `test_header_and_meta`: `ORDER #0042 · PAID`, `UPI · ₹75`, meta
      `Guava … · 400 ml` from the mock catalog (name only when there's no
      volume).
- [ ] `test_blending_progress`: after ~0.5 s the progress is in (0.3, 0.6),
      the remaining label matches `^~\d+ SECONDS$`, and the pill is hidden.
- [ ] `test_estimate_progress`: 0 at 0; 0.95 at `expected`; monotonic; `< 0.99`
      at 10× `expected`; `expected = 0` → 0.95.
- [ ] `test_done`: `DONE <id>` → state DONE, progress 1.0, pill visible,
      return text `RETURNING TO MENU IN 1S` (0.3 s → ceil), then
      `Nav.last_requested == IDLE`.
- [ ] `test_other_order_ignored`: `DONE <other id>` → still BLENDING.
- [ ] `test_timeout` and `test_rejected`: → FAILED, meta =
      `dispensing_timeout` text, `!` badge, bar hidden, then idle after the
      error return.
- [ ] `test_safety_cap`: no packet → FAILED after the cap (not before), then
      idle.
- [ ] `test_result_before_scene`: a result cached before `_ready` is acted on
      at once.
- [ ] `test_late_result_ignored`: TIMEOUT then DONE → stays FAILED.
- [ ] `test_no_transaction_goes_idle`.
- [ ] `test_ignores_maintenance`: maintenance on → no navigation to
      maintenance while blending.
- [ ] `test_layout_fits`: at 1080×1920 every visible control is on screen,
      the title is 2 lines, the bar is 762 wide, and the pill is ≥ 751 wide.
- [ ] Screenshot `tools/screenshot.sh res://scenes/dispensing/Dispensing.tscn
      .screenshots/Dispensing.png 3 guava` (blending), plus done and failed
      captures from a temporary capture scene, compared with PDF page 5.
- [ ] `tools/run_tests.sh`, `tools/check_boot.sh` pass; the dispensing tests
      are re-run 3×.

## Out of scope

Sale reporting and telemetry on the result (Milestones 5–6); refunds;
localisation.
