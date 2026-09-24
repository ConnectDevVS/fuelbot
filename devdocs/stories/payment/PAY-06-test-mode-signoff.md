# PAY-06 — Razorpay test-mode verification & sign-off

**As the** product owner, **I want** the payment flow proven against the real
Razorpay API in test mode, and the milestone's evidence and learnings
recorded, **so that** Milestone 2 can be called done with confidence.

Plan refs: §5 Milestone 2 verification ("exercise create_qr()/poll/success/
failure manually against Razorpay test keys dropped into the local cfg
file"), §7 step 6.
Depends on: PAY-05.

## Deliverables

```
devdocs/stories/payment/SIGNOFF.md
devdocs/plans/greenfield-rewrite.md    # §0 + §5: Milestone 2 status; record the real close_by minimum
CLAUDE.md                              # payment rules, mock features, gotchas found
README.md                              # payments section: mock vs test keys, credentials file
```

## Part A — automated end to end (mock)

Use the temporary walker technique from CLAUDE.md (a persistent node,
synthetic taps, real `Nav`), with `tools/udp_monitor.py` running on
4242/4243. Record the output in SIGNOFF.md.
- [ ] **Paid:** attract → listing → guava → Proceed → Scan to pay
      (`paid_after_3`) → PAID → dispensing stub → attract. The monitor shows
      `P1`, `B2`, then `Y` about 0.3 s later. Mock `last_body`: amount 7500,
      `notes.order_id` = the order's ULID.
- [ ] **Cancel:** pending → Cancel → attract. The monitor shows only `X`, and
      the close route is hit.
- [ ] **Expiry:** override `qr_expiry_sec` to 15 → EXPIRED → attract, with `X`.
- [ ] **Failure:** `failed` → FAILED message → attract, with `X`.
- [ ] **Cancel race:** the `paid` scenario and Cancel as soon as the QR shows
      → PAID path, `Y`, no `X`.
- [ ] **No credentials** (`--clear` then provision config only) →
      `payment_unavailable` → attract, with no Razorpay request.
- [ ] **Two orders in a row** get different ULIDs and consecutive order
      numbers.

## Part B — real Razorpay **test mode** (run by the product owner)

Your keys never leave your machine. Write them into the credentials file by
hand; don't paste them into chat or a terminal command.

1. Create `~/Library/Application Support/Godot/app_userdata/FuelBot/razorpay_credentials.cfg`:
   ```ini
   [razorpay]
   key_id="rzp_test_…"
   key_secret="…"
   ```
2. `godot --headless --path . --script res://tools/dev_setup.gd -- --payments=razorpay-test`
   (keep the mock server running for the *config* route).
3. `tools/dev_run.sh` and go through the flow to Scan to pay. Check and record:
   - [ ] The chip reads `TEST MODE` and a **real, scannable** QR is shown.
   - [ ] Razorpay Dashboard (test mode) → QR Codes: the new QR is listed with
         amount ₹75, `usage single_use`, and **notes containing `order_id`**
         matching the log.
   - [ ] Cancel → the QR shows **closed** in the dashboard.
   - [ ] Let one expire → closed by `close_by` about 180 s after creation.
         If Razorpay rejects `close_by` at 180 s (a `http_400` in the log),
         record the minimum Razorpay states, raise `qr_expiry_sec` to meet it,
         and note it in plan §3.5.
   - [ ] **Payment:** if Razorpay test mode offers a way to simulate a
         payment on a test UPI QR (dashboard or test-payment tooling, per
         current Razorpay docs), do it and confirm PAID → `Y` → dispensing.
         If it doesn't, record that, and rely on Part A's mock for the
         capture path. Creation, polling, close and expiry are then verified
         for real.
4. Put the machine back on mock payments:
   `godot --headless --path . --script res://tools/dev_setup.gd`. Leaving the
   real test-key file in place is fine; mock mode overwrites it, so keep your
   own copy.

## Part C — records

- **SIGNOFF.md:** automated checks, Part A evidence, Part B results (fill in
  what the product owner reports), deliberate differences from PDF page 4,
  issues found and fixed.
- **Plan:** §5 Milestone 2 → done (or "done except capture simulation" if
  Part B couldn't simulate a payment); §0 log gets any new decision (for
  example the confirmed `close_by` minimum); §3.5 records verified facts.
- **CLAUDE.md:** payment rules (the hopper only after payment; the Cancel
  race rule; never log credentials; the live-key guard), the new mock-server
  features (path params, sequences, templating, `last_body`, assets),
  `dev_setup --payments`, `udp_monitor.py`, and any new Godot gotchas.
- **README.md:** a "Payments" section covering mock vs test keys, where the
  credentials file lives and its format, and the reminder never to commit it.

## Acceptance criteria

- [ ] Every Part A item is ticked in SIGNOFF.md with evidence.
- [ ] Part B is filled in with the product owner's results, or explicitly
      marked pending if they haven't run it yet. The milestone is marked done
      only once creation and close are confirmed for real.
- [ ] `git grep -nE "rzp_(live|test)_[A-Za-z0-9]{6,}|key_secret\s*=\s*\"[^\"]+\""` over
      the whole repo returns **no** real credentials. The old plan's quoted,
      already-exposed key ID is the known exception, noted.
- [ ] `tools/run_tests.sh`, `tools/check_boot.sh` and the mock tests pass.

## Out of scope

Dispensing (Milestone 4), sales reporting (Milestone 6), and live keys /
production rollout.
