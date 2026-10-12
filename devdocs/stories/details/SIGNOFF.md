# Details page — sign-off (DET-03)

Executed 2026-09-24 on macOS (Apple M5), Godot 4.7.2.stable.official, branch
`idle-screens`. Screenshots are in `.screenshots/` and
`.screenshots/det-e2e/` (gitignored).

## Automated

| Check | Result | Evidence |
|-------|--------|----------|
| `tools/run_tests.sh` | PASS | `ALL TESTS PASSED (89)`: 16 new across `test_detail_components`, `test_flavor_detail`, `test_payment_handoff`; 2 superseded stub tests removed |
| `tools/check_boot.sh` | PASS | `BOOT OK` |
| `python3 -m unittest mockserver/test_server.py` | PASS | `OK` (richer ingredient lists keep all scenarios valid) |
| No `detail_stub` references | PASS | grep empty |
| No colour literals outside `palette.gd` | PASS | grep empty |

## End to end

The real flow was driven by a temporary walker scene that injected synthetic
taps with `Input.parse_input_event` and used real `Nav` (no dry run) against
the mock server. The walker isn't committed.

| Check | Result | Evidence |
|-------|--------|----------|
| attract → listing → guava → details → Proceed → payment `₹75` → Cancel → attract | PASS | `det-e2e/1-attract` … `5-after-cancel`; state log: `price=75 base=water`, then `selection=false scene=Idle` |
| Details → Back (top/bottom) → listing, selection cleared | PASS (automated) | `test_back_top_and_bottom` |
| 60 s idle on details → attract | PASS (automated, scaled) | `test_inactivity` at 0.3 s |
| `price_change`: chocolate details and payment show `₹199` | PASS | `det-e2e/6-price-details`, `det-e2e/7-price-payment` |
| Double tap on Proceed navigates once | PASS | `test_double_tap_navigates_once` |
| Not clicked through by hand | — | Synthetic taps go through the same input path; a human tap-through is still worthwhile |

## Visual (PDF page 3)

| Capture | Result |
|---------|--------|
| `FlavorDetail.png` (guava) | PASS: Back pill, `PF STEP 1 OF 2`, image + two-line name + description `… 400 ml.` + lime `₹75`, amber `CONTAINS MILK, SOY`, chips, 4 tiles with lime protein, bottom bar |
| `FlavorDetail-electro.png` | PASS: no banner, sections move up, no gap left behind |
| `FlavorDetail-offline.png` (bundled config) | PASS: `FB` branding, no description, no nutrition section; ingredients and banner shown |
| `Gallery.png` (components) | PASS: the design's 8 chips wrap 4 + 4, as in the PDF |

### Deliberate differences from the PDF

- Product photos are the old build's PNGs. They carry heavy built-in padding,
  so the bottle looks small in the 340 px image area. That's an asset issue
  (crop the PNGs later), not a layout one.
- Ingredient lists and nutrition are sample data in the mock tenant.
- Guava's 8 real ingredient names are longer than the design's, so they wrap
  to 3 rows. The design's own list wraps to 2 (verified in the gallery).
- No allergen icons (plan §3.1: plain strings only).

## Tuned during execution

- `ChipText` 28 → **26 px** and chip side padding 26 → **22 px**, so the
  design's 8 chips wrap to 2 rows as in the PDF.
- `PrimaryButtonM` gained a disabled style (SURFACE_RAISED + dim text) for the
  no-enabled-base guard.

## Issues found and fixed

- **Theme generator:** re-running it printed "possible cyclic resource
  inclusion" errors, because the project theme (and its fonts) is already
  cached when the script runs. It now calls `take_over_path()` and saves in
  place.

## Open items

- Replace the payment stub (payment story set). Pending decisions: when to
  prime the hopper, Razorpay test keys vs mock, QR expiry, order-number source.
- Crop or pad-trim the flavor PNGs so product images fill their areas.
