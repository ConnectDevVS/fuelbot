# PAY-05 — Payment screen ("Scan to pay")

**As a** customer who tapped Proceed, **I want** to scan a UPI QR, see the
time left and know when my payment went through, **so that** I can pay with
confidence, or cancel.

Design: **PDF page 4, "03 Payment — waiting for UPI"**. Measurements:
[README § Design measurements](README.md#design-measurements-pdf-page-4-10801920-px).
Plan refs: §3.6 payment scene; README decisions 7–12.
Depends on: PAY-03 (RazorpayManager), PAY-04 (Bridge).

## Deliverables

```
scenes/payment/Payment.tscn, payment.gd        # stub replaced
scenes/dispensing/Dispensing.tscn, dispensing.gd   # TEMPORARY stub (Milestone 4 replaces it)
scenes/scene_paths.gd                          # + DISPENSING
ui/theme/palette.gd                            # + QR_SURFACE (#F7F8FA), QR_CAPTION (#3A3D44)
tools/build_theme.gd                           # + variations below; regenerate
config/local_settings.json                     # + strings/timing below; remove payment_stub_*
tests/unit/test_payment_screen.gd              # replaces the stub tests in test_payment_handoff.gd
```

## Layout

```
Control ── BG
└─ VBox (full rect)
   ├─ Margin (72 l/r, 48 top), EXPAND_FILL
   │  └─ VBox (separation 0)
   │     ├─ HBox Header: StepIndicator(2/2) · spacer · [TestModeChip] · Label StepText "ORDER #0042"
   │     ├─ gap 44 · Label DisplayS "Scan to pay"
   │     ├─ gap 36 · PanelContainer SummaryPanel (min h 165)
   │     │     HBox: image 56×96 · VBox[Heading name, Mono "400 ML · 1 DRINK"] · spacer · Label Price
   │     ├─ gap 56 · CenterContainer > PanelContainer QrPanel (746 × ~665)
   │     │     VBox centred: QrArea 600×600 [TextureRect | CreatingState | ErrorState] · gap 20 · Label QrCaption
   │     ├─ gap 44 · HBox StatusRow (centred): StatusDot · Label StatusText · Label Countdown
   │     └─ gap 18 · Label BodySmall Hint (centred)
   └─ Margin (72 l/r, 0 top, 52 bottom): Button GhostButton Cancel (full width, h 126)
```

**Theme additions**

| Variation | Base | Font / size | Colour / style |
|-----------|------|-------------|----------------|
| `DisplayS` | Label | display_900 / 72 | TEXT |
| `StatusText` | Label | heading_800 / 36 | TEXT |
| `Countdown` | Label | mono_500 / 34 | TEXT_MUTED |
| `QrCaption` | Label | mono_500 / 24 | QR_CAPTION |
| `QrPanel` | PanelContainer | — | bg QR_SURFACE, radius 36, margins 48 h / 44 v |
| `SummaryPanel` | PanelContainer | — | bg SURFACE, border 2 BORDER, radius 20, margins 36 h / 28 v |
| `TestModeChip` | PanelContainer | — | bg WARNING_SURFACE, border 2 WARNING_BORDER, radius 8, margins 12/4 (text: `MonoWarning` 20 px) |

## States

The screen is a small state machine. All transitions are driven by
RazorpayManager signals, the countdown and Cancel.

| State | QR area | Status row | Actions |
|-------|---------|------------|---------|
| `CREATING` | `qr_generating` text + pulsing dot on QR_SURFACE | dot lime pulse, `payment_creating`, no countdown | enter: `RazorpayManager.create_qr(OrderState.charged_price, OrderState.order_id, OrderState.order_number, flavor name)` |
| `WAITING` | QR texture from `image_path` (`Image.load_from_file` → `ImageTexture`; it's a `user://` file) | dot lime pulse, `payment_waiting`, countdown `m:ss` from `qr_expiry_sec` | 1 s timer updates the countdown |
| `PAID` | QR dimmed (modulate 0.3) + lime check label `payment_received` | dot lime (no pulse), `payment_received` | enter: store `OrderState.transaction_id`, `await Bridge.send_order_paid(hopper, base code)`, then `Nav.go(DISPENSING)` |
| `FAILED` | error text (`payment_failed`, or `payment_unavailable` for not_configured / live_keys_disallowed) | dot amber, `payment_failed_status` | enter: `close_qr()`, `Bridge.send_order_cancelled()`, timer `payment_error_return_sec` → `Nav.go_idle()` |
| `EXPIRED` | error text `payment_timeout` | dot amber, `payment_expired_status`, countdown `0:00` | enter: `stop_polling()`, `close_qr()`, `send_order_cancelled()`, timer → `Nav.go_idle()` |
| `CANCELLING` | unchanged | `payment_cancelling` | see below |

- **Countdown reaching 0** → `EXPIRED`, even if the manager hasn't yet emitted
  `payment_failed("timeout")`. Both paths end in `EXPIRED` once.
- **Cancel** (enabled in CREATING / WAITING / FAILED / EXPIRED; hidden in
  PAID) implements the README decision 8 race rule:
  1. Disable Cancel and enter `CANCELLING`, then `stop_polling()`.
  2. If a QR exists: `check_now()`, waiting up to
     `payment_final_check_timeout_sec` (5 s). If `payment_received` → go to
     `PAID` (the customer paid; dispense).
  3. Otherwise: `close_qr()`, `Bridge.send_order_cancelled()`,
     `Nav.go_idle()`.
  In FAILED/EXPIRED, Cancel just calls `Nav.go_idle()` immediately (cleanup
  already happened).
- **Guards:** `_ready()` → if `not OrderState.has_selection() or OrderState.charged_price <= 0 or not Ulid.is_valid(OrderState.order_id)`,
  call `Nav.go_idle.call_deferred()`. `_exit_tree()` → `stop_polling()`.
  **No maintenance check** (idle is the only enforcement point).
- **Base code for the bridge:** the `code` of
  `ConfigManager.get_base(OrderState.selected_base_id)`. Hopper:
  `OrderState.selected_flavor.hopper`.
- **Test mode:** the chip is visible when `RazorpayManager.mode()` is `"test"`
  or `"mock"` (text `payment_test_mode` / `payment_mock_mode`).
- **Amount check** (decision 11): on `payment_received`, if
  `amount_paise != charged_price * 100`, `push_warning` with the order ID and
  proceed anyway.

### Dispensing stub

`scenes/dispensing/`: step-less screen on BG. `DisplayL`
`dispensing_stub_title` ("Payment received"), `Heading` flavor name, `StepText`
order number, `Body` `dispensing_stub_body`. It returns to idle after
`dispensing_stub_return_sec` (10). Guard: no `transaction_id` → idle. The
header comment points at Milestone 4.

### Strings & timing

Add to `messages`:

```json
"order_number": "ORDER #{number}",
"payment_title": "Scan to pay",
"payment_summary_meta": "{volume_ml} ML · 1 DRINK",
"payment_qr_caption": "SCAN WITH ANY UPI APP",
"payment_creating": "Preparing QR",
"payment_waiting": "Waiting for payment",
"payment_received": "Payment received",
"payment_failed_status": "Payment failed",
"payment_expired_status": "QR expired",
"payment_cancelling": "Cancelling…",
"payment_hint": "Do not leave the machine until your drink is dispensed",
"payment_unavailable": "Payments are unavailable right now. Please try again later.",
"payment_cancel": "Cancel order",
"payment_test_mode": "TEST MODE",
"payment_mock_mode": "MOCK PAYMENTS",
"dispensing_stub_title": "Payment received",
"dispensing_stub_body": "Dispensing arrives in the next story set."
```

(`qr_generating`, `payment_failed` and `payment_timeout` already exist.
`order_number` may already exist from PAY-01.) Remove `payment_stub_title`,
`payment_stub_body` and `payment_stub_return_sec`.

Add to `timing`: `"payment_error_return_sec": 8`,
`"payment_final_check_timeout_sec": 5`, `"dispensing_stub_return_sec": 10`.

## Acceptance criteria

`tests/unit/test_payment_screen.gd`. Use snapshot/restore, `Nav.dry_run`, and
a **committed order** fixture (guava, `charged_price` 75, water, a valid ULID,
`order_number` 42). Point the real `RazorpayManager` and `Bridge` at test
targets: the mock on :8788 with mock creds via their overridable vars, and
Bridge at ephemeral UDP listeners. Restore both afterwards.
- [ ] Header shows `ORDER #0042` and a `MOCK PAYMENTS` chip. The summary shows
      `Prymor Guava`, `400 ML · 1 DRINK`, `₹75`.
- [ ] `paid_after_3` (poll 0.2 s): CREATING → WAITING (the QR texture is
      non-null, the countdown text matches `^\d:\d\d$`) → PAID. The UDP
      listeners got `P1`, `B2` then `Y`. `OrderState.transaction_id == "pay_MockPay0000001"`.
      `Nav.last_requested == DISPENSING`.
- [ ] `failed` → FAILED. `X` received. Close route hit. After a shortened
      `payment_error_return_sec` → IDLE.
- [ ] Countdown expiry (`qr_expiry_sec` 1, pending) → EXPIRED, countdown
      `0:00`, close route hit, `X` received, then IDLE.
- [ ] Cancel while pending → close hit, `X`, IDLE, **no** `Y`.
- [ ] **Cancel race:** scenario `paid` but polling stopped before the first
      poll (a long poll interval), then Cancel → the final check finds it
      captured → PAID → `Y` sent → DISPENSING. No `X`.
- [ ] Create `server_error` → FAILED with `payment_failed`. No creds →
      FAILED with `payment_unavailable`. Neither sends `Y`.
- [ ] Guards: an order without `order_id` → IDLE. Leaving the scene stops
      polling (the request count stops increasing).
- [ ] Dispensing stub: shows the flavor name and order number, then goes idle
      after a shortened timer. Without `transaction_id` → IDLE.
- [ ] Existing handoff tests updated: Proceed → PAYMENT still holds. The old
      stub-specific tests are removed.

Visual: run the mock (`rzp_qr_payments` = `default`, pending) and `dev_setup.gd`
(mock payments), then
`tools/screenshot.sh res://scenes/payment/Payment.tscn .screenshots/Payment.png 4 guava`.
`DevCapture --select` must now also set `order_id`/`order_number` and the base
so the guard passes; extend it. Compare with PDF page 4:
- [ ] Logo + `STEP 2 OF 2` left, mono `ORDER #…` right (plus the mock chip).
- [ ] Heavy "Scan to pay"; a summary card with image, name, meta and lime
      price.
- [ ] A near-white rounded QR card with the pattern and a dark mono caption.
- [ ] Lime dot + "Waiting for payment" + mono countdown; muted hint below.
- [ ] Full-width ghost "Cancel order" at the bottom.
- [ ] Also capture CREATING (delay the mock create with a `delay_ms` scenario
      or capture at 0.3 s) and EXPIRED (short expiry). Both must look
      intentional.

General:
- [ ] `tools/run_tests.sh`, `tools/check_boot.sh` and the mock tests pass.
- [ ] `grep -rn "payment_stub" --include='*.gd' --include='*.json' .` is empty.

## Out of scope

The real dispensing screen and DONE/TIMEOUT (Milestone 4), sale report
(Milestone 6), and `payment_confirmed` telemetry (plan §3.9 item 6).
