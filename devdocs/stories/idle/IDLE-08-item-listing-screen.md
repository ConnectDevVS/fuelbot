# IDLE-08 — Item listing screen ("Fuel Up")

**As a** customer, **I want** to see every drink the machine offers, with its
price, protein and calories, what's popular and what's sold out, **so that**
I can pick one with a single tap.

Design: **PDF page 2, "01 Item Listing / Idle"**.
Plan refs: §3.6 `scenes/flavor_select/` (reads `get_flavors()` once, clamps to
`flavors.size()`, writes `OrderState`), §3.2 (charge price rule), §3.1
`timing.flavor_screen_inactivity_sec`.
Depends on: IDLE-06.

## Deliverables

```
scenes/flavor_select/FlavorSelect.tscn
scenes/flavor_select/flavor_select.gd
scenes/flavor_detail/FlavorDetail.tscn        # TEMPORARY stub (see below)
scenes/flavor_detail/flavor_detail.gd
config/local_settings.json                    # + messages.listing_empty
tests/unit/test_flavor_select.gd
```

## Layout (1080×1920)

```
Control (full rect) ── ColorRect BG
└─ VBox (full rect)
   ├─ MarginContainer (72 left/right, 60 top)
   │  └─ VBox (separation 40)
   │     ├─ BrandHeader                       right_mode = "clock"
   │     └─ HBox  (TitleRow)
   │        ├─ Label DisplayL                 listing_title  "FUEL\nUP"
   │        ├─ spacer (expand)
   │        └─ Label Body, right-aligned, size_flags_vertical = SHRINK_END
   │                                          listing_hint "Tap a drink to see\ningredients and pay"
   ├─ MarginContainer (72 left/right, 40 top, 24 bottom), size_flags_vertical = EXPAND_FILL
   │  └─ ScrollContainer (horizontal scroll disabled)
   │     └─ GridContainer  columns = 2, h/v separation 28, h-size EXPAND_FILL
   │        └─ ProductCard × N                (h-size EXPAND_FILL)
   │     (EmptyLabel: Body, centred, listing_empty — only when N == 0)
   └─ FooterBar                               left_key "listing_footer", ready_key "status_machine_ready"
```

- Cards come from `ConfigManager.get_flavors()` **in config order**. That
  includes sold-out flavors (greyed, README decision 4) and excludes
  `enabled: false`. There is no hard-coded count: the grid shows whatever the
  config has. Six cards (the machine's full load) must fit without scrolling.
  Height budget: 60 + header 104 + 40 + title ≈ 200 + 40 + grid
  (3 × 424 + 2 × 28 = 1328) + 24 + footer ≈ 108, total ≈ 1904 of 1920. If the
  screenshot overflows, shrink card height first, not the title. More than six
  would scroll.
- Add `"listing_empty": "No drinks available right now."` to
  `local_settings.messages`.

## Behaviour

- `_ready()`: `_build_cards()`, connect `ConfigManager.config_ready` →
  `_build_cards()` (the boot fetch may finish while this screen is open), and
  start the inactivity timer.
- `_build_cards()` frees the existing cards, then instances `ProductCard` per
  flavor, calls `set_flavor(f)`, and connects `selected` → `_on_card_selected`.
- `_on_card_selected(f)`: `OrderState.select_flavor(f)`, then
  `Nav.go(ScenePaths.FLAVOR_DETAIL)`. The card already refuses sold-out taps
  (IDLE-06). The UDP `P<hopper>` send is deferred (README decision 10).
- **Inactivity** (plan §3.1): a one-shot `Timer` with
  `wait_time = ConfigManager.get_timing("flavor_screen_inactivity_sec")`. Any
  `InputEventMouseButton` (pressed), `InputEventScreenTouch` or
  `InputEventScreenDrag` in `_input(event)` restarts it. On timeout, call
  `Nav.go_idle()`.
- Does **not** check maintenance. Idle is the only enforcement point (plan
  §3.11): an operator flag never interrupts a customer mid-browse.

## `flavor_detail` stub (temporary)

It exists only so a tap goes somewhere real. Its script's header comment says
it will be replaced by the Ingredients & Allergens story (PDF page 3).
- Layout: BG. Margin 72. `GhostButton` with `get_message("back")` top-left.
  `DisplayL` with the selected flavor's name, `Price` with its charge price,
  `Body` with `detail_stub_title` and `detail_stub_body`.
- `_ready()`: if `not OrderState.has_selection()`, call
  `Nav.go_idle.call_deferred()` and return.
- Back → `Nav.go(ScenePaths.FLAVOR_SELECT)`. A one-shot timer
  (`detail_stub_return_sec`) → `Nav.go_idle()`.

## Acceptance criteria

`tests/unit/test_flavor_select.gd`. `before_each` stores the autoload's
`current_config` and `local_settings` (deep copies), sets
`ConfigManager.current_config = load_mock_config("default")`, sets
`Nav.dry_run = true` and calls `OrderState.reset()`. `after_each` restores
everything and frees the scene.
- [ ] 6 cards in 3 rows; the grid has `columns == 2`; card 1 is guava with
      `CardPanelPopular`; card 4 (vanilla) shows `SOLD OUT`; the ScrollContainer
      needs no scrolling (content height ≤ its height).
- [ ] Press+release on the guava card: `OrderState.selected_flavor.id == "guava"`,
      `Nav.last_requested == ScenePaths.FLAVOR_DETAIL`.
- [ ] Press+release on vanilla: `Nav.last_requested` unchanged (`""`) and no
      selection.
- [ ] `price_change` config: 5 cards (electro hidden), and the chocolate card
      price reads `₹199`.
- [ ] Changing `current_config` then emitting `ConfigManager.config_ready`
      rebuilds the grid (the count changes accordingly).
- [ ] Inactivity: with `flavor_screen_inactivity_sec = 0.3`, after 0.6 s
      `Nav.last_requested == ScenePaths.IDLE` and OrderState is reset.
- [ ] Inactivity reset: with `0.5`, calling the scene's `_input()` with a
      pressed `InputEventMouseButton` at 0.3 s means **no** navigation at
      0.65 s, and IDLE by 1.1 s.
- [ ] Empty catalog (all flavors `enabled: false`): 0 cards, `EmptyLabel`
      visible, no errors.
- [ ] Stub: with a selection, the name label equals the flavor name and Back
      requests `FLAVOR_SELECT`. With no selection, it requests `IDLE`.
- [ ] Extend `test_order_state_nav.gd`: `FLAVOR_SELECT` and `FLAVOR_DETAIL` now
      exist.

Visual: run the mock server (`default` scenario) and
`godot --headless --path . --script res://tools/dev_setup.gd`, then
`tools/screenshot.sh res://scenes/flavor_select/FlavorSelect.tscn .screenshots/FlavorSelect.png 5`.
Compare with PDF page 2:
- [ ] Header: lime `PF` tile, `POWERFUEL GYM` / `FUELBOT · BAY 02`, live mono
      clock at the right.
- [ ] Huge two-line `FUEL / UP` at left. Muted two-line hint right-aligned on
      the baseline of `UP`.
- [ ] 2 × 3 grid of cards, all six visible without scrolling, footer not
      pushed off screen: product image centred, bold name, mono
      `24g protein · 210 kcal` line, lime price, dim `TAP →` at right.
- [ ] Guava: lime border plus `POPULAR` chip, price `₹75`. Vanilla: faded,
      `SOLD OUT`, no `TAP →`.
- [ ] Footer hairline, `UPI PAYMENT ONLY · ONE DRINK PER ORDER` left, lime dot
      plus `MACHINE READY` right.
- [ ] Manual: stop the mock server, run `tools/dev_setup.gd -- --clear` and
      relaunch the scene. It shows the bundled `FuelBot`/`FB` branding, 4
      cards (the bundled fallback's four) with **no** meta line, and footer `OFFLINE` in amber.

General:
- [ ] `tools/run_tests.sh` and `tools/check_boot.sh` pass.

## Out of scope

Ingredients/allergens screen, payment, UDP to the bridge, struck-through
actual vs offer price (plan §8).
