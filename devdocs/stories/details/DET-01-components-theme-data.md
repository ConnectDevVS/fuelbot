# DET-01 — Detail components, theme & data

**As a** developer building the details page, **I want** its repeated pieces
(ingredient chips, allergen banner, nutrition tiles, step indicator, back pill)
as themed components with realistic sample data, **so that** the screen story
is layout and behaviour only.

Design: PDF page 3. Measurements: [README § Design measurements](README.md#design-measurements-pdf-page-3-in-10801920-px).
Depends on: the idle set (theme generator, `Palette`, gallery, test harness).

## Deliverables

```
tools/build_theme.gd                          # + new variations (below), then regenerate
assets/theme/fuelbot_theme.tres               # regenerated (committed)
ui/components/chip/{Chip.tscn, chip.gd}
ui/components/allergen_banner/{AllergenBanner.tscn, allergen_banner.gd}
ui/components/nutrition_tile/{NutritionTile.tscn, nutrition_tile.gd}
ui/components/step_indicator/{StepIndicator.tscn, step_indicator.gd}
ui/gallery/gallery.gd                         # + a "details" section (below)
config/local_settings.json                    # + messages / timing (below)
mockserver/responses/config/default.json      # richer ingredients (below)
tests/unit/test_detail_components.gd
```

## Spec

### Theme variations: add to `tools/build_theme.gd`

Reuse existing fonts. **No new colour literals**: everything comes from
`Palette`. If a derived colour is needed, add a Palette constant.

| Variation | Base | Font / size | Colour / style |
|-----------|------|-------------|----------------|
| `DisplayM` | Label | display_900 / 80, pitch 76 (via `_label(..., 76)`) | TEXT |
| `BodySmall` | Label | body_400 / 28 | TEXT_MUTED |
| `SectionLabel` | Label | mono_500 / 22 | TEXT_DIM |
| `ChipText` | Label | heading_800 / 28 | TEXT |
| `AllergenCaption` | Label | mono_500 / 20 | ON_ACCENT |
| `AllergenText` | Label | display_900 / 46 | ON_ACCENT |
| `AllergenIcon` | Label | display_900 / 44 | WARNING |
| `NutritionValue` | Label | display_900 / 52 | TEXT |
| `NutritionValueAccent` | Label | display_900 / 52 | ACCENT |
| `NutritionLabel` | Label | mono_500 / 20 | TEXT_DIM |
| `StepText` | Label | mono_500 / 22 | TEXT_MUTED |
| `LogoTextSmall` | Label | display_900 / 22 | ON_ACCENT |
| `ChipPanel` | PanelContainer | — | bg SURFACE_RAISED, border 2 BORDER, radius 33, margins 26 h / 14 v |
| `AllergenPanel` | PanelContainer | — | bg WARNING, radius 20, margins 36 h / 30 v |
| `AllergenIconPanel` | PanelContainer | — | bg ON_ACCENT, radius 40 (circle at 80×80) |
| `NutritionTilePanel` | PanelContainer | — | bg SURFACE, border 2 BORDER, radius 16, margin 24 |
| `LogoTileSmall` | PanelContainer | — | bg ACCENT, radius 12 |
| `BackPill` | Button | heading_800 / 30, TEXT (all states) | bg SURFACE_RAISED, border 2 BORDER, radius 40; pressed SURFACE; focus empty |
| `GhostButtonMuted` | Button | heading_800 / 36, TEXT_MUTED | like `GhostButton`, radius 20 |
| `PrimaryButtonM` | Button | display_900 / 40, ON_ACCENT | like `PrimaryButton`, radius 20 |

Regenerate with `godot --headless --path . --script res://tools/build_theme.gd`
and commit the `.tres`.

### Components

All of them follow the idle-set pattern: a thin `.tscn` root plus a script that
builds children in `_init()`, so setters work before entering the tree. Keep
references to child nodes; never `get_node()` by auto-generated names.

**`Chip`** (`PanelContainer`, `ChipPanel`): `func set_text(t: String)`, one
`ChipText` label. `mouse_filter = IGNORE`.

**`AllergenBanner`** (`PanelContainer`, `AllergenPanel`):
`HBox(separation 28)` holding `[AllergenIconPanel 80×80 > centred AllergenIcon "!"]`
and `VBox[AllergenCaption get_message("allergen_caption"), AllergenText]`.
- `func set_allergens(list: Array) -> void`: text =
  `get_message("allergen_contains", {"list": ", ".join(list).to_upper()})`;
  `visible = not list.is_empty()` (README decision 1).
- `AllergenText` autowraps (`WORD_SMART`) so long lists wrap instead of
  overflowing.
- `func get_text() -> String` for tests.

**`NutritionTile`** (`PanelContainer`, `NutritionTilePanel`,
`size_flags_horizontal = EXPAND_FILL`): `VBox[value, label]`.
- `func set_value(value_text: String, label_text: String, accent: bool)`
  picks `NutritionValueAccent` when `accent`, else `NutritionValue`.
- Getters `get_value_text()` / `get_label_text()`.

**`StepIndicator`** (`HBoxContainer`, separation 16):
`[LogoTileSmall 54×54 > LogoTextSmall tenant.logo_text, StepText]`.
- `@export var step := 1`, `@export var total := 2`. Text =
  `get_message("step_indicator", {"step": step, "total": total})`.
- Refreshes the logo on `ConfigManager.config_ready`.

The back pill is just a `Button` with `theme_type_variation = &"BackPill"` and
text `"←  " + get_message("back")`. No component is needed; the Archivo arrow
glyph exists.

### Strings & timing: `config/local_settings.json`

Add to `messages`:

```json
"step_indicator": "STEP {step} OF {total}",
"allergen_caption": "ALLERGEN WARNING",
"allergen_contains": "CONTAINS {list}",
"detail_volume": "{volume_ml} ml.",
"detail_ingredients": "INGREDIENTS",
"detail_nutrition": "NUTRITION PER SERVING",
"nutrition_kcal": "KCAL",
"nutrition_protein": "PROTEIN",
"nutrition_carbs": "CARBS",
"nutrition_fat": "FAT",
"nutrition_grams": "{value}g",
"nutrition_missing": "—",
"proceed_to_pay": "Proceed to Pay  {price}"
```

Add to `timing`: `"detail_screen_inactivity_sec": 60`. Remove
`detail_stub_title`, `detail_stub_body` and `detail_stub_return_sec` **in
DET-02**, when the stub is replaced (they are still referenced until then).

### Mock data: `mockserver/responses/config/default.json`

Replace the `ingredients` lists with realistic sample lists. This is sample
data, like the nutrition values (README decision 9). At least one flavor must
wrap onto a second chip row at 1080 px, and electro keeps `allergens: []` so
the no-banner path is exercised:

| id | ingredients |
|----|-------------|
| guava | Whey protein isolate, Guava pulp, Electrolyte blend, Toned milk, Rolled oats, Jaggery, Pink salt, Filtered water |
| chocolate | Whey protein concentrate, Toned milk, Cocoa, Jaggery, Filtered water |
| electro | Electrolyte blend, Citrus extract, Pink salt, Filtered water |
| vanilla | Whey protein, Toned milk, Vanilla extract, Filtered water |
| cookie | Whey protein, Toned milk, Cookie crumb, Cocoa, Jaggery |
| coffee | Whey protein, Cold brew coffee, Toned milk, Jaggery |

Also set guava's `allergens` to `["Milk", "Soy"]` (unchanged) and cookie's to
`["Milk", "Gluten"]` (unchanged). Keep the mock server tests green:
`python3 -m unittest mockserver/test_server.py`.

### Gallery

Append a section to `ui/gallery/gallery.gd`: a `StepIndicator`, a `BackPill`,
an `AllergenBanner` for `["Peanuts", "Milk"]`, an `HFlowContainer` of 8 chips
(the design's list: Whey protein isolate … Filtered water), and 4
NutritionTiles (`480 KCAL`, `32g PROTEIN` accent, `46g CARBS`, `14g FAT`).
The gallery can grow past 1920 px because it sits in a ScrollContainer. If
it doesn't yet, wrap it in one, with the details section at the top so a
default screenshot shows it.

## Acceptance criteria

`tests/unit/test_detail_components.gd`:
- [ ] The theme has every new Label, Panel and Button variation in the table.
- [ ] `AllergenBanner.set_allergens(["Peanuts", "Milk"])` → visible,
      `get_text() == "CONTAINS PEANUTS, MILK"`. `set_allergens([])` → hidden.
- [ ] `NutritionTile.set_value("32g", "PROTEIN", true)` →
      `theme_type_variation` of the value label is `NutritionValueAccent`, and
      the getters return the texts.
- [ ] `StepIndicator` with step 1 / total 2 → text `STEP 1 OF 2`, and the logo
      tile shows `get_tenant().logo_text`.
- [ ] `Chip.set_text("Banana")` shows `Banana`.
- [ ] Mock data: `load_mock_config()` guava has ≥ 8 ingredients and electro has
      0 allergens.

Visual: `tools/screenshot.sh res://ui/gallery/Gallery.tscn`. Compare the
details section with PDF page 3:
- [ ] Amber banner with dark round `!` badge, dark mono caption and heavy dark
      `CONTAINS PEANUTS, MILK`.
- [ ] Pill chips wrap onto two rows with even 18 px gaps.
- [ ] Four equal nutrition tiles; the protein value is lime.
- [ ] `STEP 1 OF 2` with a small lime logo tile; the Back pill has a rounded
      dark background and `← Back`.

General:
- [ ] `tools/run_tests.sh`, `tools/check_boot.sh`,
      `python3 -m unittest mockserver/test_server.py` all pass.
- [ ] No colour literals outside `palette.gd`:
      `grep -rnE 'Color\(|#[0-9A-Fa-f]{6}' --include='*.gd' ui scenes | grep -v palette.gd`
      is empty.

## Out of scope

The screen itself (DET-02), payment (DET-03 stub only).
