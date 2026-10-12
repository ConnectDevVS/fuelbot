# Payment — story set (Milestone 2)

Replaces the payment stub with a real **Scan to pay** flow. A dynamic
Razorpay UPI QR is created, payment status is checked for, and the hopper
command goes to the bridge only **after** payment succeeds.

- Design: [designs/GMRFuelBot-OnDevice-SsampleScreens.pdf](../../../designs/GMRFuelBot-OnDevice-SsampleScreens.pdf),
  **page 4, "03 Payment — waiting for UPI"**.
- Plan: [greenfield-rewrite.md](../../plans/greenfield-rewrite.md) §0 decision
  log, §3.2 (hopper rule), §3.4 (OrderState: `order_id`, `order_number`),
  §3.5 (RazorpayManager), §3.6 (payment scene), §5 Milestone 2.
- Old working logic to port (not copy): `fuelbotsource_og/second.gd` (QR
  create/poll) and `fuelbotsource_og/udprxtx.py` (bridge protocol). **That
  file contains a live key: never copy credentials out of it.**
- Conventions, gotchas and test patterns: [CLAUDE.md](../../../CLAUDE.md).
  This set assumes them.

## Execution order

| # | Story | Depends on | Produces |
|---|-------|-----------|----------|
| 01 | [Order identity](PAY-01-order-identity.md) | details set | ULID `order_id` + display `order_number`, committed on Proceed |
| 02 | [Mock Razorpay & mock-server upgrades](PAY-02-mock-razorpay.md) | — | path params, response sequences, basic-auth check, static assets, Razorpay QR routes |
| 03 | [RazorpayManager autoload](PAY-03-razorpay-manager.md) | 01, 02 | create/download/poll/close QR; credentials file; live-key guard; dev_setup payment modes |
| 04 | [Bridge client](PAY-04-bridge-client.md) | — | `Bridge` autoload: `P<hopper>`, `B<base>`, `Y`/`X` over UDP; `tools/udp_monitor.py` |
| 05 | [Payment screen](PAY-05-payment-screen.md) | 03, 04 | PDF page 4 + states (creating / waiting / paid / failed / expired / cancel); dispensing stub |
| 06 | [Test-mode verification & sign-off](PAY-06-test-mode-signoff.md) | 05 | real Razorpay test-key run, SIGNOFF.md, plan + CLAUDE.md updates |

02 and 04 don't depend on anything in this set and can run in parallel with 01.

When 06 is done: attract → listing → details → **Proceed** (order ID
assigned) → **Scan to pay** shows a real Razorpay test-mode QR. On payment:
the hopper and base go to the bridge, then `Y`, then a dispensing stub. On
cancel or expiry: the QR is closed and `X` is sent to the bridge.

## Definition of Done (every story)

The same as the earlier sets: `tools/run_tests.sh` → `ALL TESTS PASSED`,
`tools/check_boot.sh` → `BOOT OK`, `python3 -m unittest mockserver/test_server.py`
passes, a screenshot compared with PDF page 4 for UI work, and one commit per
story with the message `PAY-NN: <title>`. **No credential ever appears in a
commit, a log line or a screenshot.**

## Decisions

Confirmed with the product owner on 2026-09-24 (plan §0):

1. **Order ID = ULID generated on the machine at Proceed to Pay.** Fleet-unique
   without coordination, works offline and sorts by time. It's the analytics
   key for every order, including abandoned or failed payments that never get
   a Razorpay ID. The **order number** ("ORDER #4821") is a display-only,
   per-machine counter and never a key.
2. **Razorpay test-mode keys** for this milestone. Automated tests run
   against the mock server.
3. **QR expiry 180 s** (`timing.qr_expiry_sec`).
4. **Hopper command only after payment succeeds.**

Made while writing this set:

5. **The Razorpay base URL is configurable**
   (`local_settings.api.razorpay_base_url`, default
   `https://api.razorpay.com`). The mock serves the **same paths** as Razorpay
   (`/v1/payments/qr_codes…`), so one code path talks to either, switched by
   the untracked override file.
6. **Live-key guard.** `RazorpayManager` refuses `rzp_live_…` keys unless
   `local_settings.payments.allow_live_keys` is `true` (default `false`). A
   dev machine can't take real money by accident. Production flips this in
   its build.
7. **Bridge message sequence on success:** `P<hopper>` and `B<base>` to UDP
   4242, a short gap (`bridge.result_gap_sec`, 0.3 s), then `Y` to 4243. On
   cancel, failure or expiry: `X` to 4243. The gap exists because the
   *current* `udprxtx.py` reads port 4243 without blocking while still
   collecting P and B, and **drops an early `Y`**. Milestone 4 rewrites the
   bridge to take one atomic order message; until then the gap is required.
8. **Cancel race.** A customer can pay in the same second they tap Cancel.
   Cancel therefore stops the regular polling, does **one final payment
   check**, and treats the order as **paid** if a captured payment is found.
   Only then does it close the QR and send `X`. Charging someone and
   cancelling their drink is the worst outcome.
9. **QR expiry is the payment screen's timeout.** No separate inactivity
   timer. On expiry: close the QR, send `X`, show the timeout message, then
   return to attract.
10. **"TEST MODE" chip** on the payment screen when test keys are in use, so
    nobody mistakes a test QR for a real one.
11. **Captured amount is checked.** If a captured payment's amount differs
    from `charged_price × 100` paise, log a warning and still treat the order
    as paid. The customer did pay. A fixed-amount QR makes this effectively
    impossible, and the log catches config bugs.
12. **Dispensing stub** (`scenes/dispensing/`) until the Milestone 4 set, the
    same pattern as earlier stubs.
13. **The mock QR image is a placeholder pattern**, not a scannable code. Real
    scannable QRs come only from Razorpay (PAY-06).
14. **Credentials:** only in `user://razorpay_credentials.cfg`, written by
    hand. Never on the command line (shell history), never in chat, never
    logged. Log the key *mode* (`test`/`live`) only.

## Design measurements (PDF page 4, 1080×1920 px)

| Element | Measurement |
|---------|-------------|
| Header (y ≈ 75 centre) | `StepIndicator` (step 2 of 2) left; mono ~24 muted `ORDER #4821` right |
| Title | "Scan to pay", Archivo 900 ~72 px, y ≈ 161 |
| Summary card | full width (72 margins), y 262–427 (165 tall), SURFACE + 2 px BORDER, radius 20; image ~56×96, name Archivo 800 ~42, mono ~22 `400 ML · 1 DRINK`, lime price ~60 right |
| QR card | centred, ~746 wide × ~665 tall, y ≈ 482, bg near-white `#F7F8FA`, radius 36; QR square ~600; mono ~24 dark caption `SCAN WITH ANY UPI APP` |
| Status row | y ≈ 1212, centred: lime dot 22 + Archivo 800 ~36 `Waiting for payment` + mono ~34 muted `2:41` |
| Hint | y ≈ 1265, Archivo 400 ~28 muted, centred |
| Cancel | full width, 126 tall, bottom margin ~52, ghost (2 px BORDER), Archivo 800 ~36 |
