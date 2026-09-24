# DET-02 — Details screen (Ingredients & Allergens)

**As a** customer who tapped a drink, **I want** to see what's in it, any
allergens, its nutrition and its price before paying, **so that** I can decide
safely and either go back or proceed.

Design: **PDF page 3, "02 Ingredients & Allergens"**.
Depends on: DET-01.

## Deliverables

```
scenes/flavor_detail/FlavorDetail.tscn    # same path (ScenePaths.FLAVOR_DETAIL), stub replaced
scenes/flavor_detail/flavor_detail.gd     # rewritten
config/local_settings.json                # remove detail_stub_* keys (see DET-01)
tests/unit/test_flavor_select.gd          # stub tests move out (below)
tests/unit/test_flavor_detail.gd          # new
```

## Layout (1080×1920)

```
Control ── ColorRect BG
└─ VBox (full rect, separation 0)
   ├─ MarginContainer (72 left/right, 48 top) , size_flags_vertical EXPAND_FILL
   │  └─ VBox (separation 0)
   │     ├─ HBox TopRow
   │     │   ├─ Button BackPill "←  Back"   (min 196×80)
   │     │   ├─ spacer
   │     │   └─ StepIndicator (step 1, total 2)
   │     ├─ gap 36
   │     ├─ HBox HeroRow (separation 40)
   │     │   ├─ Control ImageArea (min 340×326, clip) > TextureRect KEEP_ASPECT_CENTERED | placeholder (logo_text)
   │     │   └─ VBox (separation 18, EXPAND_FILL, SHRINK_CENTER vertically)
   │     │       ├─ Label DisplayM Name        (autowrap WORD_SMART, max_lines_visible 3)
   │     │       ├─ Label BodySmall Description (autowrap)
   │     │       └─ Label Price
   │     ├─ gap 52
   │     ├─ AllergenBanner                      (hidden when no allergens)
   │     ├─ gap 50  (collapsed with the banner)
   │     ├─ Label SectionLabel "INGREDIENTS"    ┐ hidden together when
   │     ├─ gap 20                              │ ingredients is empty
   │     ├─ HFlowContainer Chips (h/v sep 18)   ┘
   │     ├─ gap 58
   │     ├─ Label SectionLabel "NUTRITION PER SERVING" ┐ hidden together when
   │     ├─ gap 20                                     │ nutrition is empty
   │     └─ HBox Tiles (separation 18) × 4 NutritionTile┘
   ├─ ColorRect hairline 2 px BORDER
   └─ MarginContainer (72 left/right, 38 top, 52 bottom)
      └─ HBox (separation 24)
          ├─ Button GhostButtonMuted "Back"      (min 284×130)
          └─ Button PrimaryButtonM ProceedButton (min h 130, EXPAND_FILL)
                    text = get_message("proceed_to_pay", {"price": Fmt.rupees(charge_price)})
```

Wrap each optional section (banner, ingredients, nutrition) with its gaps in
its own `VBox`, so hiding one collapses its spacing too.

**Content rules**
- Name: `flavor.name`.
- Description: `description` + `" "` + `get_message("detail_volume", {"volume_ml": v})`
  when `volume_ml > 0`. If both are empty, hide it.
- Price: `Fmt.rupees(ConfigManager.get_charge_price(flavor))`.
- Allergens: `AllergenBanner.set_allergens(flavor.allergens)`.
- Chips: one `Chip` per `flavor.ingredients` entry, in config order.
- Nutrition tiles, in order:
  - `kcal` → `str(int)` + `nutrition_kcal`
  - `protein_g` → `nutrition_grams` + `nutrition_protein`, **accent**
  - `carbs_g` → `nutrition_grams` + `nutrition_carbs`
  - `fat_g` → `nutrition_grams` + `nutrition_fat`

  A missing key shows `nutrition_missing` (`—`). An empty `nutrition` dict
  hides the section (README decision 2).
- Image: the same load-or-placeholder rule as `ProductCard`
  (`ResourceLoader.exists` → `load`, else a placeholder with
  `tenant.logo_text`).

## Behaviour

- `_ready()`: if `not OrderState.has_selection()`, call
  `Nav.go_idle.call_deferred()` and return. This keeps the stub's guard.
- Render from `OrderState.selected_flavor`.
- **Back** (top pill *and* bottom button): `OrderState.reset()` →
  `Nav.go(ScenePaths.FLAVOR_SELECT)` (README decision 6).
- **Proceed to Pay**: calls `_proceed()`. DET-02 implements it as a no-op
  placeholder with a `pass` and a one-line comment pointing at DET-03, which
  wires the commit and navigation. The button is visible and styled now.
- **Inactivity**: a one-shot `Timer` using
  `get_timing("detail_screen_inactivity_sec")`, restarted by any
  pressed mouse/touch/drag in `_input()` (the same pattern as
  `flavor_select.gd`). Timeout → `Nav.go_idle()`.
- **Catalog refresh** (README decision 8): on `ConfigManager.config_ready`,
  find the flavor by `id` in `ConfigManager.get_flavors()`.
  - Not found, or `not is_orderable()` → `OrderState.reset()` and
    `Nav.go(ScenePaths.FLAVOR_SELECT)`.
  - Otherwise → `OrderState.select_flavor(fresh)` and re-render (price or
    ingredients may have changed).
- **No maintenance check** here: idle is the only enforcement point.

Expose small getters for tests: `get_name_text()`, `get_description_text()`,
`get_price_text()`, `get_proceed_text()`, `get_chip_texts() -> PackedStringArray`,
`is_banner_visible()`, `get_banner_text()`, `is_nutrition_visible()`,
`get_tile_texts() -> Array` (`[[value, label], …]`),
`press_back_top()`, `press_back_bottom()`, `press_proceed()`.

## Acceptance criteria

`tests/unit/test_flavor_detail.gd` uses `snapshot_app_state()` /
`restore_app_state()`, `Nav.dry_run = true`, and
`ConfigManager.current_config = load_mock_config("default")`. Select flavors
with `OrderState.select_flavor(find_flavor(cfg, id))`.
- [ ] **guava:** name `Prymor Guava`; description ends with `400 ml.`; price
      `₹75`; banner visible `CONTAINS MILK, SOY`; ≥ 8 chips, first
      `Whey protein isolate`; tiles
      `[["210","KCAL"],["24g","PROTEIN"],["12g","CARBS"],["2g","FAT"]]`; the
      protein value uses `NutritionValueAccent`; proceed text
      `Proceed to Pay  ₹75`.
- [ ] **electro:** banner hidden; the ingredients section is still visible.
- [ ] **No nutrition:** a flavor from `ConfigManager.normalise(<bundled default_config.json>)`
      has the nutrition section hidden, while ingredients and banner are
      shown.
- [ ] **Partial nutrition:** `nutrition = {"kcal": 100}` → tiles show
      `100 KCAL` and `—` for the other three.
- [ ] **Empty ingredients** → the ingredients section is hidden.
- [ ] **Back (top) and Back (bottom)** each → `OrderState` cleared and
      `Nav.last_requested == ScenePaths.FLAVOR_SELECT`.
- [ ] **No selection** → `Nav.last_requested == ScenePaths.IDLE` within 2
      frames.
- [ ] **Inactivity:** `detail_screen_inactivity_sec = 0.3` → IDLE after 0.6 s,
      and input at 0.2 s postpones it (the same shape as the listing test).
- [ ] **Refresh, price change:** open guava, set `current_config` to a copy
      with guava `offer_price = 70`, emit `config_ready` → price `₹70`,
      proceed `Proceed to Pay  ₹70`, and `OrderState.selected_flavor.offer_price == 70`.
- [ ] **Refresh, flavor gone:** open electro, switch to `price_change`
      (electro disabled), emit `config_ready` → `FLAVOR_SELECT` requested and
      the selection cleared.
- [ ] **Long name:** `name = "Cookies & Cream Protein Deluxe"` renders at most
      3 lines with no overlap into the price (`Name` height ≤ 3 × 76 px + a few
      px).
- [ ] Move the two stub tests out of `test_flavor_select.gd` (they're
      superseded here). Keep the listing's own tests unchanged.

Visual: run the mock server (`default`) and `tools/dev_setup.gd`. Capture
`guava` with a small dev hook: extend `DevCapture` to accept
`--select=<flavor id>`, which calls `OrderState.select_flavor()` from
`ConfigManager.get_flavors()` before capture, so a directly-launched detail
scene has a selection. Then run
`godot --path . res://scenes/flavor_detail/FlavorDetail.tscn -- --select=guava --capture=$(pwd)/.screenshots/FlavorDetail.png --capture-delay=4`.
Add a `--select` passthrough to `tools/screenshot.sh` as a 4th argument if
that's cleaner. Compare with PDF page 3:
- [ ] Back pill top-left; small lime logo tile + `STEP 1 OF 2` top-right.
- [ ] Product image left, heavy two-line name right, muted description with
      `400 ml.`, lime price.
- [ ] Full-width amber allergen banner.
- [ ] `INGREDIENTS` label + pill chips wrapping to 2 rows.
- [ ] `NUTRITION PER SERVING` + 4 tiles with lime protein.
- [ ] Bottom bar: hairline, muted ghost `Back` left, lime `Proceed to Pay  ₹75`
      right, with empty space above like the design.
- [ ] Also capture `electro` (no banner) and an offline run
      (`dev_setup.gd -- --clear`, no mock: no nutrition section). Both must
      look intentional, not broken.

General:
- [ ] `tools/run_tests.sh` and `tools/check_boot.sh` pass.
- [ ] `grep -rn "detail_stub" --include='*.gd' --include='*.json' .` returns
      nothing.

## Out of scope

The payment commit and navigation (DET-03), hopper UDP, and an allergen icon
set (plan §3.1: plain strings only).
