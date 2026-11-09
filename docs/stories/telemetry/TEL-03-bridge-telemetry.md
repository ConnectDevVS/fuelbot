# TEL-03 — Bridge: per-cycle telemetry and machine health

**As the** app and the operations team, **I want** the bridge to report how
each cycle went and whether the machine is fit to sell, **so that** faults
reach the maintenance screen and the backend, and no order is started on a
board that isn't homed.

Plan refs: §3.8 (bridge), §3.10; README decisions 3–6, the event table.
Depends on: TEL-02 (the new serial lines).

## Deliverables

```
hardware/bridge/udprxtx.py         # stage collection, health, 4246 events, heartbeat
hardware/bridge/test_udprxtx.py    # new + updated tests
```

## Spec

### CLI additions

`--telemetry-port 4246` (to `--app-host`), `--heartbeat-sec 10`.

### `BridgeCore` additions

The constructor gains `emit(event: dict)`, which the run loop JSON-encodes
and sends to 4246.

- **Stage collection.** While `DISPENSING`, each `STATUS:<STAGE>[ detail]`
  line is appended as `{"stage": STAGE, "t_offset_ms": ms since the command
  was written}`. `BOOT` lines are ignored for stages.
- **Ending a cycle** (`_finish`) emits the `dispense_cycle` event (README
  table): `result` (`DONE`/`TIMEOUT`), `reason`, `stages`, `fault` (the
  first fault code seen in this cycle, or null), `duration_ms`, `hopper`,
  `base`. A `REJECTED` order emits a `dispense_cycle` with `result:
  "REJECTED"`, `stages: []`.
- **Health.** `machine_fault: Optional[str]`.
  - `FAULT:HOMING_TIMEOUT` (any state): if not already faulted, set it and
    emit `machine_fault` (`order_id` = active or null). **It does not end a
    cycle** (decision 3: `STATUS:DONE` follows at the end of a cycle, and
    the deadline covers anything else).
  - `STATUS:HOMING_DONE` (any state): if faulted, clear it and emit
    `machine_ok`. In `RECOVERING` it also means `READY` (it replaces `Home
    reached`, which is still accepted).
  - Other `FAULT:<CODE>` lines during `DISPENSING` end the order as before:
    `TIMEOUT <id> fault:<CODE>` (`NOT_HOMED`, `HOPPER_UNASSIGNED`,
    `BAD_COMMAND`).
- **Order gate.** An `ORDER` while `machine_fault` is set →
  `REJECTED <id> machine_fault`, and nothing is written to serial. The check
  order is: serial unavailable, then machine fault, then busy.
- **Heartbeat.** `tick()` emits `bridge_status` (`state`, `serial`,
  `machine_fault`, `uptime_s`) every `heartbeat_sec`, and once right after
  startup.

### Run loop

`emit` sends compact JSON (`separators=(",", ":")`) to
`app_host:telemetry_port`. Datagrams stay under 1 KB. A cycle has fewer than
12 stages; that's asserted in a test.

## Acceptance criteria

`hardware/bridge/test_udprxtx.py`:
- [ ] `test_cycle_record`: a scripted cycle → one `dispense_cycle`,
      `result: DONE`, with stages in firmware order and offsets from the fake
      clock, and `fault: null`.
- [ ] `test_timeout_record`: deadline → `result: TIMEOUT`, `reason:
      deadline`, with the stages seen so far.
- [ ] `test_rejected_record`: busy → `dispense_cycle` with `result: REJECTED`.
- [ ] `test_homing_fault_mid_cycle`: `MIX_DONE`, `FAULT:HOMING_TIMEOUT`,
      `STATUS:DONE` → the app gets `DONE <id>`, the record has `fault:
      HOMING_TIMEOUT`, and `machine_fault` is emitted once.
- [ ] `test_orders_refused_while_faulted`: after `FAULT:HOMING_TIMEOUT`
      outside an order, `ORDER` → `REJECTED <id> machine_fault`, nothing
      written; after `STATUS:HOMING_DONE` → `machine_ok`, and the next order
      runs.
- [ ] `test_not_homed_fault_ends_order`: `FAULT:NOT_HOMED` →
      `TIMEOUT <id> fault:NOT_HOMED`.
- [ ] `test_heartbeat`: at start and then every `heartbeat_sec`,
      `bridge_status` with the current `machine_fault`.
- [ ] `test_legacy_home_reached`: `Home reached` still ends recovery.
- [ ] `test_run_loop_telemetry`: the real loop on a PTY and ephemeral ports
      → a JSON `dispense_cycle` on the telemetry socket after `DONE`.
- [ ] `test_event_size`: a maximal record encodes to under 1 024 bytes.
- [ ] All DSP-02 tests still pass (updated for the new line names).

## Out of scope

Posting to the backend (that's the app, TEL-05); dead-bridge detection.
