# SAL-04 — End-to-end verification and sign-off

**As the** product owner, **I want** evidence that every paid order reaches
the sales backend exactly once, that a dead bridge stops sales and recovers,
and that maintenance still behaves as designed, **so that** Milestone 6 can
be called done.

Plan refs: §5 Milestone 6, §7 steps 9 and 10.
Depends on: SAL-01 … SAL-03.

## Deliverables

```
devdocs/stories/sales/SIGNOFF.md
devdocs/plans/greenfield-rewrite.md   # §0 log + status, §3.10, §3.12, §4, §5 (M6)
README.md, CLAUDE.md
```

The walker and captures stay uncommitted (`tmp_capture/`,
`.screenshots/sal-e2e/`). As in TEL-07, the runs use their own mock port
and bridge ports if the dev ports are busy, and the override is restored
afterwards.

## Spec

### Level 0 (app + mock + `fake_dispense_bridge.py`)

| Flow | Setup | Expected |
|------|-------|----------|
| sale on success | `--mode done` | one sale POST `success` with the order's ULID, `transaction_id` and prices; one telemetry `dispense_cycle` |
| sale on failure | `--mode timeout`, then `--mode reject` | one sale each: `timeout/deadline`, `rejected/busy` |
| sales offline (§7 step 9) | sales route `server_error` during the order, then `default` | the record is in `user://sales_queue.json`; posted once after recovery; no duplicate |
| dead bridge | bridge check on; fake bridge stopped while on attract | out of service ~30 s later with `BRIDGE_DOWN`, `bridge_down` posted; bridge restarted → back to attract, `bridge_up` posted |
| dead bridge mid-order | stop the fake bridge right after payment | the order fails at its safety cap (sale `no_response`), then maintenance |

### §7 step 10 (maintenance), re-run against the current build

- Config `maintenance_on` while idle → maintenance within one poll interval
  (10 s dev poll), with the operator message and faults; `default` → back to
  attract.
- `maintenance_on` mid-order → the order completes (sale posted), then
  maintenance.

### Level 1 (app + real bridge + fake Arduino)

A normal order → a sale `success` plus telemetry; stopping the real bridge →
`BRIDGE_DOWN` → maintenance; restarting it → recovery.

### Level 2/3

Nothing new beyond the telemetry SIGNOFF's list, plus: with the real
bridge's systemd unit (Milestone 8), check that a bridge restart shorter
than 30 s never shows maintenance.

## Acceptance criteria

- [ ] SIGNOFF.md: automated results, the Level 0 table, the §7 step 10
      table, the Level 1 table, screenshots, issues found and fixed, and
      open items.
- [ ] Plan: §0 decisions (README 2–9), §3.12 as built (`dispensing_result`
      values, trigger point, `ReportQueue`), §4 (`SalesReporter`), §5 M6
      status.
- [ ] README.md: sales and the dead-bridge check (and how to turn it on in
      dev). CLAUDE.md: rules and open items (the dead bridge is resolved).
- [ ] Tree clean, and no stray processes of ours.

## Out of scope

Refunds and reconciliation; Milestone 7/8 work.
