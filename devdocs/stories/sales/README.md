# Sale reporting & dead bridge — story set (Milestone 6)

Reports every paid order to the backend as a billing record, and takes the
machine out of service when the hardware bridge stops responding, so it
never takes money for a drink it can't make.

- Plan: [greenfield-rewrite.md](../../plans/greenfield-rewrite.md) §3.10
  (`BRIDGE_DOWN`), §3.11 (maintenance), §3.12 (sale reporting), §5 Milestone
  6, §7 steps 9 and 10.
- Builds on: [telemetry set](../telemetry/README.md) (`ReportQueue`,
  `TelemetryReporter`, heartbeats, local faults) and the
  [dispensing set](../dispensing/README.md) (dispensing outcomes).
- The maintenance half of Milestone 6 (the screen and the remote poll) was
  built early in the idle set. Here it only gets re-verified (§7 step 10) and
  extended for multiple local faults.
- Conventions: [CLAUDE.md](../../../CLAUDE.md).

## Execution order

| # | Story | Depends on | Produces |
|---|-------|-----------|----------|
| 01 | [Local faults as a set](SAL-01-local-fault-set.md) | telemetry set | `ConfigManager` tracks several local fault codes; maintenance lists them all; footer copy for self-clearing faults |
| 02 | [Dead bridge → out of service](SAL-02-dead-bridge.md) | 01 | `BRIDGE_DOWN` after 30 s without a heartbeat (60 s startup grace), auto-clear, `bridge_down`/`bridge_up` events, dev setting |
| 03 | [SalesReporter](SAL-03-sales-reporter.md) | — | one sale record per paid order via `ReportQueue`; mock `/fuelbot/sales` |
| 04 | [End-to-end & sign-off](SAL-04-e2e-signoff.md) | 01–03 | Level 0/1 runs incl. plan §7 steps 9 and 10, SIGNOFF, plan / README / CLAUDE.md |

## Definition of Done (every story)

As in the telemetry set: `tools/run_tests.sh` → `ALL TESTS PASSED`,
`tools/check_boot.sh` → `BOOT OK` (run `godot --headless --path . --import`
first when a `class_name` is added), all Python tests → `OK`. Timing-sensitive
tests are re-run 2–3×. UI changes get a screenshot that's actually looked at.
One commit per story (`SAL-NN: <title>`), chained with `&&` after the checks.

## Decisions

Made by the product owner (2026-09-24):

1. **Dead bridge → out of service.** No `bridge_status` heartbeat for **30 s**
   → local fault `BRIDGE_DOWN` → maintenance once any order in progress
   finishes. It **auto-clears** when heartbeats resume, and `bridge_down` /
   `bridge_up` are posted. There's a **60 s grace** after app start, and a
   **setting disables it** for development without a bridge.

Made while writing this set:

2. **One sale record for every paid order,** whatever the dispensing
   outcome. A sale is a billing fact: money was taken. `dispensing_result`
   is one of `success`, `timeout`, `rejected` or `no_response` (the plan had
   `success` / `timeout`; the other two exist since protocol v2 and
   Milestone 5), plus `dispensing_reason` (e.g. `deadline`, `busy`,
   `machine_fault`, `safety_cap`). Refund handling stays a backend and
   product question; these records are what it will need.
3. **Recorded where the outcome is known,** in the dispensing screen, on
   entering DONE or FAILED, exactly once per `order_id`. It's never
   recorded on the payment screen, because the outcome isn't known yet.
   `order_id` is the backend's dedupe key; there's no separate event id.
4. **The record** is the plan §3.12 payload plus `dispensing_reason`,
   `currency: "INR"` and `payment_method: "upi"`, with `timestamp` in UTC
   with a `Z`. Prices come from the committed order (`OrderState`), not from
   the live catalog.
5. **`SalesReporter` reuses `ReportQueue`** (`user://sales_queue.json`,
   `api.sales_path` = `/sales`, `timing.sale_report_retry_interval_sec` = 60,
   which already exists). It's a separate autoload from `TelemetryReporter`,
   as the plan intends: a billing record and a diagnostic record, possibly
   with different backends.
6. **Local faults become a set of codes** (`HOMING_TIMEOUT`, `BRIDGE_DOWN`, …),
   each with its start time. Out of service while any is set; clearing one
   never clears another. The existing `set_local_hardware_fault(active,
   code)` API is kept: `false` with a code clears that code, and `false`
   without one clears all of them.
7. **Maintenance footer for local faults** says the machine comes back by
   itself: `maintenance_exit_hint_local` = "RETURNS TO SERVICE AUTOMATICALLY
   ONCE FIXED". The remote-maintenance footer ("EXIT VIA REMOTE CONSOLE
   ONLY") is unchanged. *Proposed wording; the product owner can change the
   string in `local_settings.json`.*
8. **The dead-bridge check is off in development by default:**
   `bridge.require_heartbeat` is `true` in `local_settings.json`, and
   `dev_setup.gd` writes `false` into the dev override. Turn it on in the
   override to test it (and run a fake or real bridge, which both send
   heartbeats). Automated tests set it explicitly.
9. **Timings are settings:** `timing.bridge_heartbeat_timeout_sec` (30) and
   `timing.bridge_startup_grace_sec` (60).

## Sale record (POST `api.base_url + api.sales_path`, header `X-Tenant-Id`)

```json
{"tenant_id": "machine-042", "order_id": "01J8Z6Q4M9X3T7C2V5B8N1K4RD", "order_number": 4821,
 "transaction_id": "pay_QqR8xYz3vN2Kw1", "flavor_id": "guava", "hopper": 1, "base_id": "water",
 "actual_price": 90, "offer_price": 75, "charged_price": 75, "currency": "INR", "payment_method": "upi",
 "dispensing_result": "success", "dispensing_reason": "", "timestamp": "2026-09-25T10:22:31Z"}
```

## Out of scope

- Refund automation; reconciling paid-but-never-dispensed orders (backend,
  plan §3.10 Bucket D); a real sales backend (the mock stands in).
- Payment-funnel events (QR created, cancelled, expired).
- A sale for an order where the app crashed between payment and dispensing.
  Razorpay and telemetry records remain the source for that reconciliation.
