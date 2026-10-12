# Payment (Milestone 2) — sign-off (PAY-06)

Executed 2026-09-24 on macOS (Apple M5), Godot 4.7.2.stable.official, branch
`idle-screens`. Evidence is in `.screenshots/pay-e2e/` (gitignored): walker
screenshots, `udp-<flow>.log` (bridge traffic via `tools/udp_monitor.py`) and
`mock-<flow>.log`.

**Status: Part A (mock) PASS. Part B (real Razorpay test mode) PENDING:** it
needs the product owner's test keys on this machine. Milestone 2 is marked
done only after Part B confirms creation and close for real.

## Automated

| Check | Result | Evidence |
|-------|--------|----------|
| `tools/run_tests.sh` | PASS | `ALL TESTS PASSED (123)`; payment tests repeated 3× with no flakes |
| `python3 -m unittest mockserver/test_server.py` | PASS | `Ran 16 tests … OK` |
| `tools/check_boot.sh` | PASS | `BOOT OK` |
| No credentials logged | PASS | Booted with sentinel creds (`rzp_test_SENTINEL1` / `SENTINEL2`): 0 occurrences in the log, only `[Razorpay] ready (mode=test)`. `run_tests.sh` also greps `RazorpayManager.gd` for print/warn calls formatting keys |
| No credentials committed | PASS | `git grep -nE "rzp_(live\|test)_[A-Za-z0-9]{6,}" -- ':!devdocs'` is empty. The only repo hit is the plan quoting the old, already-exposed key **ID** (flagged for rotation there) |

## Part A — end to end against the mock (real `Nav`, synthetic taps)

A temporary walker (not committed) drove attract → listing → guava → Proceed
→ Scan to pay, with `udp_monitor.py` bound to 4242/4243 in place of the
bridge.

| Flow | Result | Bridge traffic | Razorpay (mock) traffic |
|------|--------|----------------|--------------------------|
| **Paid** (`paid_after_3`) | PASS → dispensing stub, `tx=pay_MockPay0000001` | `P1`, `B2` (same ms), `Y` **+308 ms** | create; 3 polls |
| **Cancel** while pending | PASS → attract, selection cleared | `X` only | create; polls; **close** |
| **Expiry** (`qr_expiry_sec` 5) | PASS → attract | `X` only | create; poll; **close** |
| **Failed** | PASS → message → attract | `X` only | create; poll; **close** |
| **Cancel race** (`paid`, cancel at ~1 s) | PASS → **dispensing**, `tx=pay_MockPay0000001` | `P1`, `B2`, `Y` (+308 ms), **no `X`** | create; one final-check poll |
| **No credentials** | PASS → `payment_unavailable` → attract | `X` (harmless reset) | **no request** |
| **Two orders** | PASS | `X`, `X` | `#43 01M396JPV5…` then `#44 01M396JXTM…`: new ULID and consecutive number |

Create request body (from mock `last_body`, every flow):
`payment_amount: 7500`, `usage: single_use`, `type: upi_qr`,
`notes: {order_id: <the order's ULID>, order_number: "<n>", tenant_id: "machine-042"}`,
and `close_by` ≈ now + 180 s (unit test).

## Part B — real Razorpay test mode (product owner)

To run (full steps in [PAY-06](PAY-06-test-mode-signoff.md#part-b--real-razorpay-test-mode-run-by-the-product-owner)):
write `razorpay_credentials.cfg` by hand, run
`dev_setup.gd -- --payments=razorpay-test`, then `tools/dev_run.sh`.

| Check | Result |
|-------|--------|
| `TEST MODE` chip and a real, scannable QR | ☐ pending |
| QR listed in the Razorpay test dashboard with ₹75, single use, `notes.order_id` = the logged ULID | ☐ pending |
| Cancel → QR shows closed | ☐ pending |
| Expiry → closed by `close_by` (~180 s). If `http_400`, record Razorpay's minimum and raise `qr_expiry_sec` | ☐ pending |
| Payment simulation in test mode (if Razorpay offers it) → PAID → `Y` → dispensing | ☐ pending |

## Visual (PDF page 4)

`.screenshots/Payment.png` (waiting), `Payment-creating.png`,
`Payment-expired.png`, and the `pay-e2e/*` failure / no-credentials / paid
screens: PASS. The step indicator and order number, the "Scan to pay" title,
the summary card, the near-white QR card with a mono caption, the status row
with countdown, the hint and the full-width Cancel all match the design's
structure.

### Deliberate differences

- The mock QR is a placeholder pattern (not scannable). Real QRs come only
  from Razorpay.
- A `MOCK PAYMENTS` / `TEST MODE` chip in the header (not in the design), so a
  test QR is never mistaken for a real one.
- Order number is `#0042`-style: a zero-padded per-machine counter.
- Product thumbnails are small because the old PNGs are padded (open item
  from the details set).

## Issues found and fixed

1. **Early-firing timers.** A `SceneTreeTimer` created right after a slow
   frame fires early: a 0.2 s timer measured **29 ms**. The bridge's gap
   before `Y` now waits on the wall clock. Otherwise the current bridge would
   drop `Y` and a paid order would never dispense. The QR countdown also uses
   the wall clock.
2. **Orphaned QR on an early cancel.** Cancelling while the QR was still being
   created let the create finish later with nobody closing it.
   `RazorpayManager.abort()` now closes the current QR *and* any QR whose
   create is still in flight.
3. **Slow cancel.** With a pending payment, Cancel's final check emitted
   nothing and waited the full 5 s. `RazorpayManager.poll_completed` now
   reports every poll, so Cancel returns as soon as the check comes back.
4. **A failing test was committed** (`1baba35`) because a commit was chained
   with `;` instead of `&&`. Fixed in the next commit (`da5d050`).

## Notes

- The QR close is fire-and-forget. If the app quits in the same instant, the
  request may not leave, and Razorpay closes the QR at `close_by` (180 s)
  anyway.
- A `rzp_live_` key is refused unless `payments.allow_live_keys` is `true`.
  Production must flip it deliberately.
