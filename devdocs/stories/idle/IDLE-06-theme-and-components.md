# IDLE-06 — Theme, fonts & shared UI components

**As a** developer building the idle screens, **I want** the design's colours,
type and repeated widgets (brand header, product card, footer, status dot) as
reusable pieces, **so that** each screen is just layout plus data.

Design refs: PDF pages 1, 2, 6 (header, cards, footer, status). Token table:
[README § Design tokens](README.md#design-tokens-measured-from-the-pdf).
Depends on: IDLE-03 (assets), IDLE-05 (`Fmt`, autoloads).

## Deliverables

```
assets/fonts/Archivo-Variable.ttf
assets/fonts/JetBrainsMono-Variable.ttf
assets/fonts/OFL-Archivo.txt
assets/fonts/OFL-JetBrainsMono.txt
ui/theme/palette.gd                       # class_name Palette: colours + sizes (single source of truth)
tools/build_theme.gd                      # generates the two items below
assets/theme/fonts/*.tres                 # generated FontVariation resources (committed)
assets/theme/fuelbot_theme.tres           # generated Theme (committed)
project.godot                             # gui/theme/custom = res://assets/theme/fuelbot_theme.tres
ui/components/status_dot.gd               # class_name StatusDot
ui/components/connectivity_status/{ConnectivityStatus.tscn, connectivity_status.gd}
ui/components/brand_header/{BrandHeader.tscn, brand_header.gd}
ui/components/product_card/{ProductCard.tscn, product_card.gd}
ui/components/footer_bar/{FooterBar.tscn, footer_bar.gd}
ui/gallery/{Gallery.tscn, gallery.gd}     # dev-only component sheet for screenshot review
tests/unit/test_theme_components.gd
```

## Spec

### Fonts (OFL, from the google/fonts repo; URLs verified)

```bash
B=https://raw.githubusercontent.com/google/fonts/main/ofl
curl -fsSL "$B/archivo/Archivo%5Bwdth,wght%5D.ttf"          -o assets/fonts/Archivo-Variable.ttf
curl -fsSL "$B/jetbrainsmono/JetBrainsMono%5Bwght%5D.ttf"   -o assets/fonts/JetBrainsMono-Variable.ttf
curl -fsSL "$B/archivo/OFL.txt"                             -o assets/fonts/OFL-Archivo.txt
curl -fsSL "$B/jetbrainsmono/OFL.txt"                       -o assets/fonts/OFL-JetBrainsMono.txt
```

Glyph facts checked with fontTools: **only Archivo has `₹`**. Neither font has
`●` or `✓`. `→`, `·` and `—` exist in both.

### `ui/theme/palette.gd`

`class_name Palette` holds `const` Colors for every token in the README table
(`BG`, `SURFACE`, `SURFACE_RAISED`, `BORDER`, `ACCENT`, `ON_ACCENT`, `TEXT`,
`TEXT_MUTED`, `TEXT_DIM`, `WARNING`, `WARNING_SURFACE`, `WARNING_BORDER`,
`SUCCESS`) plus `PAD := 72`, `RADIUS_CARD := 28`, `RADIUS_PANEL := 16`.
Scripts use `Palette.*`. Hex literals appear only here.

### `tools/build_theme.gd` → generated theme

`godot --headless --path . --import && godot --headless --path . --script res://tools/build_theme.gd`

An `extends SceneTree` script that builds everything in code and saves it
with `ResourceSaver.save`. It is re-runnable; output is committed so the
editor works without running it.

**Variable-font gotcha (spike-verified):** `FontVariation.variation_opentype`
keys must be **integer tags**:
```gdscript
var ts := TextServerManager.get_primary_interface()
fv.variation_opentype = {ts.name_to_tag("wght"): 900, ts.name_to_tag("wdth"): 100}
```
String keys like `{"wght": 900}` are silently ignored, and every weight renders
the same.

Fonts to write to `assets/theme/fonts/`:

| File | Base | Axes | Extra |
|------|------|------|-------|
| `display_900.tres` | Archivo | wght 900, wdth 100 | |
| `heading_800.tres` | Archivo | wght 800, wdth 100 | |
| `body_400.tres` | Archivo | wght 400, wdth 100 | |
| `body_600.tres` | Archivo | wght 600, wdth 100 | |
| `mono_500.tres` | JetBrains Mono | wght 500 | `spacing_glyph = 2`, `fallbacks = [Archivo]` (for `₹`) |

Set `wdth` to 100 first, then tune against the PDF in the screenshot step. The
design's display type is slightly wide, so 100–108 is the plausible range.

Theme (`default_font = body_400`, `default_font_size = 34`, Label
`font_color = TEXT`). **Type variations:**

| Variation | Base type | Font / size | Colour / style |
|-----------|-----------|-------------|----------------|
| `DisplayXL` | Label | display_900 / 128, `line_spacing ≈ -36` (tune to a 118 px line pitch) | TEXT |
| `DisplayL` | Label | display_900 / 100, `line_spacing ≈ -24` (tune to a 96 px line pitch) | TEXT |
| `Heading` | Label | heading_800 / 46 | TEXT |
| `HeadingDim` | Label | heading_800 / 46 | TEXT_DIM (sold-out name) |
| `Body` | Label | body_400 / 34 | TEXT_MUTED |
| `BodyStrong` | Label | body_600 / 34 | TEXT_MUTED |
| `Mono` | Label | mono_500 / 24 | TEXT_DIM |
| `MonoMuted` | Label | mono_500 / 26 | TEXT_MUTED |
| `MonoAccent` | Label | mono_500 / 26 | ACCENT |
| `MonoWarning` | Label | mono_500 / 26 | WARNING |
| `MonoValue` | Label | mono_500 / 30 | TEXT |
| `Clock` | Label | mono_500 / 32 | TEXT |
| `Price` | Label | display_900 / 60 | ACCENT |
| `PriceSoldOut` | Label | display_900 / 60 | TEXT_DIM |
| `LogoText` | Label | display_900 / 42 | ON_ACCENT |
| `BadgeText` | Label | mono_500 / 20 | ON_ACCENT |
| `LogoTile` | PanelContainer | — | bg ACCENT, radius 22 |
| `CardPanel` | PanelContainer | — | bg SURFACE, border 2 BORDER, radius 28, content margin 36 |
| `CardPanelPopular` | PanelContainer | — | like CardPanel, border **4 ACCENT**, `shadow_color` ACCENT @ 25% alpha, `shadow_size 12` |
| `HeroPanel` | PanelContainer | — | bg SURFACE_RAISED, radius 28, margin 0 |
| `BadgePanel` | PanelContainer | — | bg ACCENT, radius 6, margins 12/6 |
| `DiagPanel` | PanelContainer | — | bg SURFACE, border 2 BORDER, radius 16, margin 0 |
| `FaultPanel` | PanelContainer | — | bg WARNING_SURFACE, border 2 WARNING_BORDER, radius 12, margin 28 |
| `PrimaryButton` | Button | display_900 / 52, font colour ON_ACCENT (all states) | normal bg ACCENT radius 28; pressed ACCENT darkened 10%; focus = empty StyleBox |
| `GhostButton` | Button | heading_800 / 40, TEXT | transparent bg, border 2 BORDER, radius 24 |

### Components

All components are `.tscn` with a script next to them. They read strings via
`ConfigManager.get_message()` and data via `ConfigManager`. **No hard-coded
copy.**

**`StatusDot`** (`status_dot.gd`, `class_name StatusDot`, `extends Control`):
`@export var color: Color`, `@export var diameter := 18.0`,
`@export var pulse := false`. `_draw()` draws a filled circle.
`custom_minimum_size = Vector2(diameter, diameter)`. With `pulse`, a looping
`Tween` animates `modulate:a` 1.0 → 0.35 → 1.0 over 1.2 s. Setters call
`queue_redraw()`. Glyph dots aren't used because no font has `●`.

**`ConnectivityStatus`**: `HBoxContainer` (separation 14) containing
`[StatusDot, Label]`. `@export var ready_key := "status_ready"`.
- `apply(loaded: bool, online: bool)`: ready if `not loaded or online`, else
  offline. Ready shows `ACCENT` dot plus `MonoAccent` text
  `get_message(ready_key)`. Offline shows `WARNING` dot plus `MonoWarning`
  `get_message("status_offline")`.
- `_ready()` calls
  `apply(ConfigManager.config_loaded, ConfigManager.is_online)` and connects
  `config_ready` and `connectivity_changed` to re-apply. Because the state
  before the first fetch counts as ready, the attract screen doesn't flash
  "OFFLINE" at boot.

**`BrandHeader`**: `HBoxContainer`, separation 28, height 104. Layout:
`[LogoTile(104×104) > LogoText]`, then `VBox[Heading tenant name UPPERCASE, Mono location_label]`,
then an expanding spacer, then the right slot.
`@export_enum("status", "clock") var right_mode := "status"`.
- `status` shows a `ConnectivityStatus` (`ready_key = "status_ready"`).
- `clock` shows a `Clock` label updated by a 1 s `Timer` with
  `Fmt.clock_12h(Time.get_time_dict_from_system())`.
- Tenant fields come from `ConfigManager.get_tenant()`, refreshed on
  `config_ready`.

**`ProductCard`** (`extends PanelContainer`, `mouse_filter = STOP`,
`custom_minimum_size.y = 424`):
```
CardPanel / CardPanelPopular
└─ VBox (separation 14)
   ├─ ImageArea (Control, min height 176, clip_contents)
   │   ├─ TextureRect   expand_mode IGNORE_SIZE, stretch KEEP_ASPECT_CENTERED, full rect
   │   ├─ Placeholder   Label LogoText-style on SURFACE_RAISED, shown when the image is missing
   │   └─ Badge         BadgePanel > BadgeText, anchored top-left, hidden when badge == null
   ├─ Name     Label Heading (HeadingDim when sold out), autowrap off, clip text
   ├─ Meta     Label Mono: get_message("card_meta", nutrition); hidden when nutrition lacks protein_g/kcal
   └─ Row HBox
       ├─ Price  Label Price: Fmt.rupees(ConfigManager.get_charge_price(f)), or PriceSoldOut get_message("card_sold_out")
       ├─ spacer
       └─ Tap    Label Mono get_message("card_tap"), hidden when sold out
```
- `signal selected(flavor: Dictionary)`.
- `func set_flavor(f: Dictionary) -> void` populates everything. Load the image
  with `ResourceLoader.exists(path)` → `load(path)`, otherwise show the
  placeholder with `get_tenant().logo_text`.
- Sold out: the content VBox gets `modulate.a = 0.45` and
  `mouse_default_cursor_shape = CURSOR_ARROW`.
- Input: override `_gui_input(event)`. On left-button **press**, show pressed
  feedback (tween `scale` to 0.98 with `pivot_offset = size / 2`). On
  **release** inside the rect, restore scale and, if
  `ConfigManager.is_orderable(f)`, emit `selected(f)`. Sold-out cards give no
  feedback and never emit. Touch arrives as emulated mouse events
  (`emulate_mouse_from_touch=true`, IDLE-01).

**`FooterBar`**: `VBoxContainer`. A 2 px `ColorRect` in BORDER on top, then a
`MarginContainer` (72 / 36) with
`HBox[Label MonoMuted get_message(left_key), spacer, ConnectivityStatus(ready_key)]`.
`@export var left_key := "listing_footer"`,
`@export var ready_key := "status_machine_ready"`,
`@export var show_status := true`.

**`Gallery.tscn`**: dev only. It is never referenced by `ScenePaths` and never
reachable in the app. It's a `ScrollContainer` on a BG background showing: a
BrandHeader in status mode; a BrandHeader in clock mode; a 2-column
`GridContainer` of four ProductCards built from inline fixture dicts (normal,
popular with offer price, sold out, missing image path with no nutrition); one
`PrimaryButton` "Tap Anywhere To Start" with a pulsing StatusDot; and a
FooterBar. It exists only so this story can be reviewed by screenshot before
any screen uses the components.

## Acceptance criteria

`tests/unit/test_theme_components.gd`. Flavor fixtures come from a new
`TestCase.load_mock_config()` helper: it reads
`res://mockserver/responses/config/default.json` with `FileAccess` and returns
`ConfigManager.normalise(envelope.body)`. Tests never hand-roll flavor dicts,
so they can't drift from the schema.
- [ ] `ProjectSettings.get_setting("gui/theme/custom")` loads as a `Theme`, and
      `get_type_variation_list("Label")` contains every Label variation in the
      table above.
- [ ] `display_900.tres` has the `wght` tag (via `name_to_tag`) set to 900, and
      `mono_500.tres` has `fallbacks.size() == 1`.
- [ ] ProductCard with the mock `vanilla` (sold out): the price label shows
      `SOLD OUT`, Tap is hidden, and calling `_gui_input` with a synthetic
      left press then release at the card centre emits **no** `selected`.
- [ ] ProductCard with `guava` (badge POPULAR, offer 75): the badge is visible
      with text `POPULAR`, `theme_type_variation == "CardPanelPopular"`, the
      price reads `₹75`, and a press+release emits `selected` with
      `id == "guava"`.
- [ ] ProductCard with `nutrition = {}` hides Meta. With a non-existent image
      path it shows Placeholder and logs no error.
- [ ] BrandHeader in clock mode: the label matches `^\d\d:\d\d (AM|PM)$`.
- [ ] ConnectivityStatus: `apply(false, false)` → ready text,
      `apply(true, false)` → `OFFLINE`, `apply(true, true)` → ready text.

Visual (compare `.screenshots/Gallery.png` with PDF pages 1 and 2):
- [ ] `tools/screenshot.sh res://ui/gallery/Gallery.tscn`
- [ ] Display, heading and price text render **heavy** (weight 900/800 is
      clearly different from body 400). Seeing the same weight everywhere means
      the integer-tag rule was missed.
- [ ] `₹` renders in both Price (Archivo) and Mono (fallback) labels, with no
      tofu boxes.
- [ ] Popular card: lime 4 px border plus soft glow, lime POPULAR chip at top
      left. Sold-out card: faded, grey "SOLD OUT", no "TAP →".
- [ ] Logo tile: lime rounded square with black "PF"/"FB". Status dot: lime
      circle before "READY".
- [ ] Colours match the token table by eye. Background is near-black
      `#111215`, not Godot's default grey.

General:
- [ ] `tools/run_tests.sh` and `tools/check_boot.sh` pass.
- [ ] `git grep -nE "Color\(|#[0-9A-Fa-f]{6}" -- 'ui/**/*.gd' 'scenes/**/*.gd' ':!ui/theme/palette.gd'`
      returns nothing: no stray colour literals.

## Out of scope

Screen layouts (IDLE-07/08/09), pixel-perfect matching (the target is "reads as
the design at a glance").
