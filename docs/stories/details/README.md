# Details page — story set

Replaces the temporary `flavor_detail` stub with the real **Ingredients &
Allergens** screen, the step between tapping a drink and paying.

- Design: [designs/GMRFuelBot-OnDevice-SsampleScreens.pdf](../../../designs/GMRFuelBot-OnDevice-SsampleScreens.pdf),
  **page 3, "02 Ingredients & Allergens"**.
- Plan refs: [greenfield-rewrite.md](../../plans/greenfield-rewrite.md) §3.1
  (flavor `ingredients`/`allergens` were wired as data "for whenever UI work
  picks it up"), §3.2 (charge price), §3.4 (OrderState).
- Builds on the idle set ([../idle/](../idle/README.md)). Follow
  [CLAUDE.md](../../../CLAUDE.md) for conventions, gotchas and the test
  patterns. This set assumes them rather than repeating them.

## Execution order

| # | Story | Depends on | Produces |
|---|-------|-----------|----------|
| 01 | [Detail components, theme & data](DET-01-components-theme-data.md) | idle set | theme variations, `Chip`, `AllergenBanner`, `NutritionTile`, `StepIndicator`, richer mock data, new strings/timing |
| 02 | [Details screen](DET-02-details-screen.md) | 01 | `scenes/flavor_detail/` rewritten to PDF page 3 |
| 03 | [Payment handoff & sign-off](DET-03-payment-handoff-signoff.md) | 02 | `scenes/payment/` stub, OrderState commit on Proceed, SIGNOFF.md, CLAUDE.md update |

When 03 is done: attract → listing → tap a drink → details → **Proceed to
Pay** lands on a payment stub showing the committed amount. **Back** returns to
the listing. Inactivity anywhere returns to attract.

## Definition of Done (every story)

The same as the idle set: `tools/run_tests.sh` → `ALL TESTS PASSED`,
`tools/check_boot.sh` → `BOOT OK`, a screenshot compared with PDF page 3 for
UI work, and one commit per story with the message `DET-NN: <title>`.

## Decisions & deviations

1. **No allergens → no banner.** If a flavor's `allergens` list is empty, the
   amber banner is **hidden**. The screen never claims "allergen-free": the
   data only says nothing was declared, and a false claim is worse than
   silence.
2. **Missing nutrition → no nutrition section.** The bundled
   `default_config.json` ships no nutrition (idle decision 12), so offline
   machines show ingredients and allergens only. If individual keys are
   missing, those tiles show `—`.
3. **Proceed to Pay commits the order.** It writes
   `OrderState.charged_price` (`ConfigManager.get_charge_price`) and
   `OrderState.selected_base_id` (first enabled base, which is `water` today).
   The plan (§3.4/§3.6) had the payment screen do this, but the design has no
   base-selection step: "Step 1 of 2" goes straight to payment, so details is
   the commitment point. Payment reads these values.
4. **Hopper UDP (`P<hopper>`) is still deferred.** When to prime the hopper
   (on Proceed or on payment success) is an open decision for the payment
   story set. Nothing here touches hardware.
5. **Proceed goes to a payment stub** (`scenes/payment/`) until the payment
   set replaces it, the same pattern the idle set used for details.
6. **Back clears the selection** (`OrderState.reset()`) before returning to the
   listing, so no stale order survives a change of mind.
7. **New timing key `detail_screen_inactivity_sec` (60)** replaces
   `detail_stub_return_sec`. Inactivity → `Nav.go_idle()`.
8. **Catalog refresh while open.** On `ConfigManager.config_ready`, the screen
   looks the flavor up again by `id`. If it's gone or no longer orderable, it
   returns to the listing. If it changed (for example the price), it
   re-renders. This covers the boot fetch landing mid-browse.
9. **Richer mock ingredients.** The mock `default` scenario gets realistic
   ingredient lists (up to 8 items) so chip wrapping is exercised, as in the
   design. This is sample data only; the bundled config is untouched.

## Design measurements (PDF page 3, in 1080×1920 px)

| Element | Measurement |
|---------|-------------|
| Top row | Back pill 196×80, radius 40, at y 48; right: 54 px logo tile (radius 12) + mono `STEP 1 OF 2` |
| Hero row | image column ~340 wide, y 163–489; name column from x ≈ 460 |
| Name | Archivo 900, ~80 px, line pitch ~76, up to 2–3 lines |
| Description | Archivo 400, ~28 px, muted, `"{description} {volume_ml} ml."` |
| Price | existing `Price` (60 px lime) |
| Allergen banner | y 542–691 (~150 tall), radius 20, bg WARNING; 80 px dark circle with amber `!`; mono 20 `ALLERGEN WARNING` + Archivo 900 ~46 `CONTAINS PEANUTS, MILK`, both dark |
| Section labels | mono ~22, dim, glyph-spaced (`INGREDIENTS`, `NUTRITION PER SERVING`) |
| Chips | height 66, radius 33, bg SURFACE_RAISED, 2 px BORDER, Archivo 800 ~28 white, gaps 18 |
| Nutrition tiles | 4 across, ~234×146, gap 18, radius 16, SURFACE + BORDER; value Archivo 900 ~52 (protein in lime), mono 20 label |
| Bottom bar | hairline at y ≈ 1700; Back ghost 284×130 (muted text) + Proceed lime 644×130, radius 20, Archivo 900 ~40 `Proceed to Pay  ₹220` |
