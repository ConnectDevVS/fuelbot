# DET-03 — Payment handoff & sign-off

**As a** customer, **I want** "Proceed to Pay" to lock in my drink and price
and take me to payment, **so that** the order continues. **As a** developer, I
want the details set verified end to end and its learnings recorded.

Plan refs: §3.2 (charge price), §3.4 (OrderState fields).
Depends on: DET-02.

## Deliverables

```
scenes/scene_paths.gd                  # + PAYMENT
scenes/payment/Payment.tscn            # TEMPORARY stub, replaced by the payment story set
scenes/payment/payment.gd
scenes/flavor_detail/flavor_detail.gd  # _proceed() wired
config/local_settings.json             # + payment stub strings/timing
tests/unit/test_payment_handoff.gd
tests/unit/test_order_state_nav.gd     # + PAYMENT path exists
devdocs/stories/details/SIGNOFF.md
CLAUDE.md                              # updated (see below)
```

## Spec

### `_proceed()` in `flavor_detail.gd` (README decision 3)

```gdscript
func _proceed() -> void:
	var flavor := OrderState.selected_flavor
	if not ConfigManager.is_orderable(flavor):
		OrderState.reset()
		Nav.go(ScenePaths.FLAVOR_SELECT)
		return
	OrderState.charged_price = ConfigManager.get_charge_price(flavor)
	OrderState.selected_base_id = _default_base_id()
	Nav.go(ScenePaths.PAYMENT)
```

- `_default_base_id()` returns the `id` of the first `bases` entry with
  `enabled == true` in `ConfigManager.current_config`, or `""` if none. With no
  enabled base, the order can't be made: disable the Proceed button and show it
  as disabled, and add a test for this. It's unreachable with today's configs,
  but it's a guard.
- Guard against double taps: disable the button on the first press.
- **No UDP / hopper priming** (README decision 4).

### Payment stub (`scenes/payment/`)

It exists only so Proceed lands somewhere real. Its header comment says it
will be replaced by the payment story set (PDF page 4, plan Milestone 2).
- `_ready()`: if `not OrderState.has_selection() or OrderState.charged_price <= 0`,
  call `Nav.go_idle.call_deferred()` and return.
- Layout on BG with margin 72: `StepIndicator` (step 2, total 2),
  `DisplayL` `get_message("payment_stub_title")`, `Heading` flavor name,
  `Price` `Fmt.rupees(OrderState.charged_price)`, `Body`
  `get_message("payment_stub_body")`, and a bottom `GhostButton`
  `get_message("payment_cancel")`.
- **Cancel** → `Nav.go_idle()`. This resets the order; the design's
  "Cancel order" also ends the order rather than going back to details.
- One-shot timer `payment_stub_return_sec` → `Nav.go_idle()`.

Strings and timing to add:

```json
"payment_stub_title": "Scan to pay",
"payment_stub_body": "Payment is coming in the next story set.",
"payment_cancel": "Cancel order"
```
```json
"payment_stub_return_sec": 20
```

### `SIGNOFF.md`

Use the same shape as `devdocs/stories/idle/SIGNOFF.md`: automated checks,
the flow, visual comparison with PDF page 3 (guava, electro, offline), and
deliberate differences (for example the demo product photo, sample ingredient
data, and no allergen icons). Record any issues found while executing.

### `CLAUDE.md` update

- Layout: add `scenes/flavor_detail/` (real screen) and `scenes/payment/`
  (stub), and the new components.
- Project rules: **Proceed to Pay is the order commitment point**
  (`charged_price`, `selected_base_id` are set there; payment reads them). The
  allergen banner is hidden when the list is empty, never "allergen-free".
  Nutrition hides when absent.
- Testing: the `DevCapture --select=<id>` hook for capturing screens that need
  a selection.
- Any new gotchas found while executing.
- Open items: replace the payment stub; the hopper-priming decision is still
  open.

## Acceptance criteria

`tests/unit/test_payment_handoff.gd` uses snapshot/restore and dry-run `Nav`:
- [ ] Details for guava → `press_proceed()` →
      `OrderState.charged_price == 75`, `selected_base_id == "water"`,
      `Nav.last_requested == ScenePaths.PAYMENT`.
- [ ] Details for chocolate → `charged_price == 180` (no offer).
- [ ] A double tap on Proceed navigates once (`Nav.navigated` count == 1).
- [ ] Flavor made unorderable (set `sold_out = true` in `current_config`,
      emit `config_ready`) → back to `FLAVOR_SELECT`, not payment.
- [ ] All bases disabled → Proceed is disabled and `press_proceed()` doesn't
      navigate.
- [ ] Payment stub: with a committed order it shows the flavor name and `₹75`;
      **Cancel** → `IDLE` and OrderState cleared; with no committed order →
      `IDLE` within 2 frames.
- [ ] `ScenePaths.PAYMENT` exists (extend `test_order_state_nav.gd`).

End to end (record in SIGNOFF.md):
- [ ] `tools/dev_run.sh`: attract → listing → guava → details → Proceed →
      payment stub `₹75` → Cancel → attract. Clicked through by hand, or
      scripted with the capture hook plus screenshots of each step.
- [ ] Details → Back → listing, with nothing selected.
- [ ] Idle for 60 s on details → attract.
- [ ] `mockserver/scenario.sh price_change` then restart: chocolate details
      and Proceed show `₹199`.
- [ ] `tools/run_tests.sh`, `tools/check_boot.sh`,
      `python3 -m unittest mockserver/test_server.py` pass.

## Out of scope

The real payment screen, Razorpay, the QR code and hopper UDP. That is the
payment story set, which needs the open decisions answered first (hopper
priming point, Razorpay test keys vs mock, QR expiry, order-number source).
