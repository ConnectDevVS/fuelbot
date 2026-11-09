# IDLE-03 — Bundled config fixtures & idle assets

**As a** kiosk, **I want** a bundled catalog, local messages/timing, flavor
images and an attract video, **so that** the idle screens always have
something to show, even with no network and no tenant ID.

Plan refs: §3.1 (both JSON documents), §3.3 (bundled fallback), §3.13
(bundled `.ogv`), §5 M1/M7.
Depends on: IDLE-01.

## Deliverables

```
config/local_settings.json
config/default_config.json
assets/images/flavors/prymor_guava.png
assets/images/flavors/mmn_chocolate.png
assets/images/flavors/prymor_electro.png
assets/images/flavors/on_vanilla.png
assets/images/flavors/prymor_cookie.png
assets/images/flavors/beast_coffee.png
assets/video/idle_ad_default.ogv
assets/ASSETS.md                         # provenance table
tests/unit/test_config_fixtures.gd
```

## Spec

### Asset copy

The source is the old tree
`/Volumes/Professional/Professional/FuelBot/Source/fuelbotsource_og/`.
Copy only these files (plan M7: nothing speculative):

| Source | Destination |
|--------|-------------|
| `PrymorGuava.png` | `assets/images/flavors/prymor_guava.png` |
| `mmn_chocolate.png` | `assets/images/flavors/mmn_chocolate.png` |
| `Prymor_Electro.png` | `assets/images/flavors/prymor_electro.png` |
| `OnVanilla.png` | `assets/images/flavors/on_vanilla.png` |
| `PrymorCookie.png` | `assets/images/flavors/prymor_cookie.png` (mock tenant only) |
| `BeastCoffee.png` | `assets/images/flavors/beast_coffee.png` (mock tenant only; not the `(1)` duplicate) |
| `mmgc.ogv` (3.2 MB) | `assets/video/idle_ad_default.ogv` |

- Use the plain names, not the `(1)` duplicates. `mmgc (1).ogv` (48 MB)
  **differs** from `mmgc.ogv` (`cmp` confirms). Leave it behind and note it in
  `ASSETS.md` as "unreviewed alternate, not ported".
- Do not port `mmgc.mp4` or `PreparationVideo.webm` (plan §3.13: not playable
  in this Godot build).
- `assets/ASSETS.md` is a table of destination, source filename, and a
  one-line note.

### `config/local_settings.json`

This is the plan §3.1 content, plus an `api` block (README decision 6) and the
idle-screen copy. **Every user-facing string on the idle screens comes from
here.** No string literals in scenes.

```json
{
  "api": {
    "base_url": "https://example.invalid/fuelbot",
    "config_path": "/config",
    "request_timeout_sec": 10
  },
  "messages": {
    "qr_generating": "QR Code Generation in Progress",
    "payment_failed": "Payment failed. Please try again.",
    "payment_timeout": "Payment timed out. Please try again.",
    "dispensing_success": "Enjoy your shake!",
    "dispensing_timeout": "Something went wrong. Please contact support if you were charged.",
    "maintenance_default": "This machine is temporarily out of service.",
    "config_fetch_failed": "Running in offline mode.",

    "status_ready": "READY",
    "status_machine_ready": "MACHINE READY",
    "status_offline": "OFFLINE",

    "attract_headline": "FRESH\nBLENDED\nPROTEIN",
    "attract_subline": "{count_word} shakes on tap. Blended to order in under a minute.\nFrom {min_price}.",
    "attract_cta": "Tap Anywhere To Start",
    "attract_footer": "UPI PAYMENT ONLY · NO CASH ACCEPTED",

    "listing_title": "FUEL\nUP",
    "listing_hint": "Tap a drink to see\ningredients and pay",
    "listing_footer": "UPI PAYMENT ONLY · ONE DRINK PER ORDER",
    "card_tap": "TAP →",
    "card_meta": "{protein_g}g protein · {kcal} kcal",
    "card_sold_out": "SOLD OUT",

    "maintenance_header": "FUELBOT PLATFORM · SERVICE MODE",
    "maintenance_status": "STATUS: OUT OF SERVICE",
    "maintenance_title": "OUT OF\nSERVICE",
    "maintenance_diagnostics_title": "DIAGNOSTICS — TECHNICIAN USE",
    "maintenance_local_fault_by": "Local hardware fault",
    "maintenance_payments_disabled": "DISABLED",
    "maintenance_network_online": "ONLINE",
    "maintenance_network_offline": "OFFLINE",
    "maintenance_faults_title": "ACTIVE FAULTS ({count})",
    "maintenance_service": "SERVICE: {phone}",
    "maintenance_exit_hint": "EXIT VIA REMOTE CONSOLE ONLY",
    "diag_machine_id": "MACHINE ID",
    "diag_site": "SITE",
    "diag_flagged_by": "FLAGGED BY",
    "diag_flagged_at": "FLAGGED AT",
    "diag_firmware": "FIRMWARE",
    "diag_network": "NETWORK",
    "diag_last_heartbeat": "LAST HEARTBEAT",
    "diag_payments": "PAYMENTS",
    "diag_never": "never",
    "diag_unknown": "—",

    "detail_stub_title": "Ingredients & allergens",
    "detail_stub_body": "This screen is coming in the next story.",
    "back": "Back"
  },
  "timing": {
    "flavor_screen_inactivity_sec": 60,
    "payment_screen_inactivity_sec": 180,
    "payment_poll_interval_sec": 3,
    "payment_poll_timeout_sec": 180,
    "qr_expiry_sec": 180,
    "maintenance_poll_interval_sec": 120,
    "sale_report_retry_interval_sec": 60,
    "detail_stub_return_sec": 10,
    "attract_tap_debounce_sec": 0.5
  }
}
```

Placeholders use `{name}` and are filled with GDScript `String.format(dict)`.
`{min_price}` receives an already formatted `₹75` (see IDLE-05 `Fmt.rupees`).

### `config/default_config.json`

This is the final fallback (plan §3.3 step 4), filled with the old build's
hardcoded values (plan M1: prices 75/180/35/140). It deliberately stays at **four
flavors on hoppers 1–4** of the six: these are the only products with known
prices. Hoppers 5–6 simply have no fallback entry (README decision 5). It is generic, not
PowerFuel-branded, and has **no** nutrition, description or badge fields
(README decision 12). Nothing is sold out.

```json
{
  "version": 1,
  "tenant": {
    "display_name": "FuelBot",
    "logo_text": "FB",
    "location_label": "FUELBOT",
    "site": "",
    "support_phone": ""
  },
  "flavors": [
    {"id": "guava", "name": "Prymor Guava", "hopper": 1, "actual_price": 90, "offer_price": 75,
     "image": "res://assets/images/flavors/prymor_guava.png",
     "ingredients": ["Whey Isolate", "Guava Flavor", "Electrolytes"], "allergens": ["Milk", "Soy"], "enabled": true},
    {"id": "chocolate", "name": "MMN Chocolate", "hopper": 2, "actual_price": 180, "offer_price": null,
     "image": "res://assets/images/flavors/mmn_chocolate.png",
     "ingredients": ["Whey Protein", "Cocoa"], "allergens": ["Milk"], "enabled": true},
    {"id": "electro", "name": "Prymor Electro", "hopper": 3, "actual_price": 35, "offer_price": null,
     "image": "res://assets/images/flavors/prymor_electro.png",
     "ingredients": ["Electrolytes"], "allergens": [], "enabled": true},
    {"id": "vanilla", "name": "ON Vanilla", "hopper": 4, "actual_price": 140, "offer_price": null,
     "image": "res://assets/images/flavors/on_vanilla.png",
     "ingredients": ["Whey Protein", "Vanilla Flavor"], "allergens": ["Milk", "Soy"], "enabled": true}
  ],
  "bases": [
    {"id": "water", "name": "Water", "code": "B2", "enabled": true},
    {"id": "milk", "name": "Milk", "code": "B1", "enabled": false}
  ],
  "maintenance": {"enabled": false, "message": "", "flagged_by": null, "flagged_at": null, "faults": []},
  "idle_video_url": null
}
```

### `tests/unit/test_config_fixtures.gd`

Parse the files directly with `JSON.parse_string(FileAccess.get_file_as_string(...))`.
ConfigManager doesn't exist yet.

- `test_local_settings_parses_and_has_sections`: `api`, `messages`, `timing`
  are Dictionaries.
- `test_every_timing_value_is_positive_number`.
- `test_default_config_hoppers_unique_within_1_to_6`.
- `test_default_config_images_exist`: `ResourceLoader.exists(image)` for every
  flavor.
- `test_idle_video_exists`: `ResourceLoader.exists("res://assets/video/idle_ad_default.ogv")`
  **or** `FileAccess.file_exists(...)`. A `.ogv` may not get an import
  resource, so accept either.
- `test_mock_default_images_exist`: parse
  `res://mockserver/responses/config/default.json` and assert every
  `body.flavors[].image` exists. This stops the mock and the bundled assets
  from drifting apart. Skip with a printed note if IDLE-02 isn't merged yet.

## Acceptance criteria

- [ ] `tools/run_tests.sh` passes, including the 6 new tests.
- [ ] `tools/check_boot.sh` prints `BOOT OK`. The new PNGs import without
      errors.
- [ ] `git grep -n "rzp_" -- config/` returns nothing.
- [ ] `du -sh assets/` is under 15 MB. Only the listed files were copied.

## Verification

```bash
tools/run_tests.sh --filter=fixtures
tools/check_boot.sh
ls -la assets/images/flavors assets/video
```

## Out of scope

Fonts and theme (IDLE-06). Branding images: the design's logo tile is drawn
from `tenant.logo_text`, not an image.
