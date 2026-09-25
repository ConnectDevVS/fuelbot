# Sale reporting & dead bridge (Milestone 6) — sign-off (SAL-04)

Executed 2026-09-25 on macOS (Apple M5), Godot 4.7.2.stable.official, Python
3.9.6, branch `milestone-6-sales` (off `develop`). Evidence is in
`.screenshots/sal-e2e/` (gitignored): walker screenshots, plus `app-<flow>.log`,
`bridge-<flow>.log` and `mock.log`.

The runs used their own ports (mock :8790; bridge 5242/5245/5246), with the
bridge check **on**, via a temporary settings override that was restored
afterwards. The product owner's own dev session was running on the default
ports throughout.

**Status: Level 0 PASS, plan §7 steps 9 and 10 PASS, Level 1 PASS.** The
maintenance half of Milestone 6 was built in the idle set; this set
re-verified it and extended it to several local faults.

## Automated

| Check | Result | Evidence |
|-------|--------|----------|
| `tools/run_tests.sh` | PASS | `ALL TESTS PASSED (180)` (162 → 180: sales 7, dead bridge 7, local fault set 2, footer 2). The sales and dead-bridge filters each passed 3× |
| Python (`mockserver`, `bridge`, `fakes`, `firmware`) | PASS | 18 + 24 + 21 + 9 = 72 tests, `OK` |
| `tools/check_boot.sh` | PASS | `BOOT OK` |
| Suite duration | 44 s | well inside the runner's 180 s limit |
| Test isolation | PASS | a full run left the dev mock's (:8787) telemetry/sales counts and the real `user://` queues unchanged (see issue 2) |

## Level 0 — app + mock (:8790) + `fake_dispense_bridge.py`

| Flow | Setup | Result |
|------|-------|--------|
| **sale on success** | `--mode done` | PASS. Exactly one sale: guava, `charged_price 75`, `success`, the order's ULID and `transaction_id`; one telemetry `dispense_cycle` |
| **sale on timeout** | `--mode timeout` | PASS. One sale, `timeout / deadline` |
| **sale on reject** | `--mode reject` | PASS. One sale, `rejected / busy` |
| **sales offline** (plan §7 step 9, literally) | **mock server killed** during the order, restarted 9 s later | PASS. The sale was in `user://sales_queue.json` while the server was down (`[5CZ9BF success]`); connection errors were retried; the restarted server received it **once** (1 sale, 1 telemetry, no duplicates); queue `[]` |
| **dead bridge on attract** | bridge killed at 15 s, restarted at 75 s | PASS. Out of service at **60.0 s** (the startup grace; the last heartbeat was 51 s earlier), `BRIDGE_DOWN` listed; back to attract at **74.7 s**, the moment the bridge returned; `bridge_down` and `bridge_up` posted |
| **dead bridge mid-order** | bridge killed right after payment, cap 20 s | PASS. The order failed at its cap with a sale `no_response / safety_cap` (the customer was charged; that record is what a refund needs); then out of service with `BRIDGE_DOWN` |

## Plan §7 step 10 — maintenance, current build

| Check | Result |
|-------|--------|
| `maintenance_on` while idle | PASS. Flag set at ~8 s → Maintenance at **10.0 s** (within the 10 s dev poll); `default` at ~28 s → attract at **30.0 s** |
| `maintenance_on` mid-order | PASS. Flag set while blending; the order **completed** ("Enjoy your shake", sale `success` posted); **then** Maintenance (23.6 s); back to attract when cleared |

## Level 1 — app + real `udprxtx.py` + `fake_arduino_serial.py` (×0.1)

| Flow | Result |
|------|--------|
| order, then the real bridge killed and restarted | PASS. `12` → DONE in 7.3 s → one sale `success`; bridge killed at 32 s → Maintenance `BRIDGE_DOWN` (60 s, startup grace) → bridge restarted → attract at 81.4 s, `bridge_up` posted (3 telemetry records in all) |

## Visual

`.screenshots/Maintenance-two-faults.png` (`HOMING_TIMEOUT` + `BRIDGE_DOWN`,
oldest first, with the self-clearing footer) and
`sal-e2e/l1-05-Maintenance.png` (`BRIDGE_DOWN · Hardware controller not
responding`). Both were compared against PDF page 6's layout.

## Issues found and fixed during execution

1. **Maintenance footer overflow.** The first draft of the local footer copy
   was longer than the remote one, and it widened the whole page past 1080
   px, cutting off the clock, diagnostics and faults. Found in the
   screenshot. Fixed with shorter copy ("BACK IN SERVICE AUTOMATICALLY") and
   a footer hint that wraps instead of widening; regression test
   `test_long_footer_does_not_widen_page`.
2. **Tests leaked into the developer's environment** (since TEL-05). The test
   process loads the dev override, so reporter records went to the dev mock
   on :8787 (64 posts found there), and the reporter used the real
   `user://telemetry_queue.json`. The test runner now points the backend at
   the test mock and the reporters at test-only queue files. Tests restore
   the runner's queue path, never the real one. Verified by counting before
   and after a full run.
3. **The dead-bridge watchdog would have fired inside the test run** (more
   than 90 s with no bridge). The runner switches it off; only its own tests
   switch it on.
4. **`maintenance_changed` didn't fire when a second local fault arrived**
   while already out of service, so the list wouldn't have refreshed. It now
   also fires when the set of fault codes changes.
5. Harness only: a Level 1 script started no bridge because zsh doesn't
   word-split an unquoted `$VAR` (the CLAUDE.md gotcha). The app correctly
   went out of service for a bridge that never started; re-run with `${=VAR}`.

## Observations (for review, not changed)

- **"LAST HEARTBEAT" in the maintenance diagnostics** is the *server*
  heartbeat (config poll). Shown next to `BRIDGE_DOWN` it can mislead a
  technician. Consider renaming it "LAST SERVER CONTACT", or adding a
  "BRIDGE" row.
- **Startup grace window.** Within the first 60 s after an app start, a dead
  bridge doesn't block orders yet (the mid-order and Level 1 runs show
  attract until 60 s). A customer who orders in that window still pays and
  fails. That was the chosen trade-off against false alarms at boot;
  Milestone 8's systemd ordering (bridge first) makes it rare.
- **Dev machines:** the restored dev override has no `require_heartbeat`
  key, so the watchdog defaults to **on** for an app started outside
  `dev_run.sh` (e.g. editor F5) until `tools/dev_run.sh` or `dev_setup.gd`
  is run again (they write `false` by default).

## Open items

- Refund policy and a reconciliation process (the sale records carry what's
  needed: `dispensing_result` / `dispensing_reason` per paid order).
- Real sales and telemetry backends (settings only).
- Carried over: motors 5–6 wiring, Level 2/3 hardware runs, Milestone 2 Part
  B, porting `pinelabs.py`.
