# PAY-04 — Bridge client (UDP to `udprxtx.py`)

**As the** payment flow, **I want** one place that tells the hardware bridge
which hopper and base to use and whether payment succeeded, **so that** the
machine starts only for paid orders and resets for everything else.

Plan refs: §3.2 (hopper, never list position), §0 decision "hopper after
payment"; README decision 7.
Depends on: nothing in this set.

## Deliverables

```
autoload/Bridge.gd
project.godot                    # register above DevCapture
config/local_settings.json       # + bridge block
tools/udp_monitor.py             # stdlib: prints every packet on 4242/4243 (dev aid)
tests/unit/test_bridge.gd
```

## Spec

### Protocol (the current `udprxtx.py`, unchanged in this milestone)

| Port | Message | Meaning |
|------|---------|---------|
| 4242 | `P<hopper>` | hopper digit, 1–6 (from the flavor's `hopper`, **never** list position) |
| 4242 | `B<n>` | base: the config base's `code` as-is (`"B2"` for water) |
| 4243 | `Y` | payment succeeded: the bridge writes `"<hopper><n>\n"` to the Arduino |
| 4243 | `X` | cancel/failure: the bridge resets its collected indices |

**Early-`Y` hazard (README decision 7):** while still collecting P and B, the
bridge reads 4243 without blocking and only acts on `X`, so an early `Y` is
**dropped** and the paid order stalls. Always send `Y` after a gap.

### Settings

In `config/local_settings.json`:

```json
"bridge": { "host": "127.0.0.1", "selection_port": 4242, "result_port": 4243, "result_gap_sec": 0.3 }
```

### `Bridge` autoload

```gdscript
signal sent(port: int, message: String)          # every packet, for tests and diagnostics

func send_order_paid(hopper: int, base_code: String) -> void   # coroutine: P, B, await gap, Y
func send_order_cancelled() -> void                            # X
```

- Two `PacketPeerUDP` sockets, `connect_to_host`'d in `_ready()` (sending
  only; the dispensing set adds the receiving socket on 4245).
- **Validates before sending:** `hopper` in `1..ConfigManager.MAX_HOPPER` and
  `base_code` matching `^B\d$`. Otherwise `push_error` (a programmer error)
  and send `X` instead, so the bridge never gets a malformed order.
- `send_order_paid` guards re-entry: a second call while one is in progress
  is ignored with a warning.
- Logs each send as `[Bridge] -> 4242 P1`. These aren't secrets.
- Host, ports and gap are overridable vars (read from settings in `_ready()`)
  so tests can use ephemeral ports.

### `tools/udp_monitor.py`

`python3 tools/udp_monitor.py [--ports 4242,4243]` binds to the given ports on
127.0.0.1 and prints `HH:MM:SS.mmm :4242 P1` for every packet. Use it during
dev in place of the real bridge. It can't run alongside the real bridge,
since only one process can bind a port.

## Acceptance criteria

`tests/unit/test_bridge.gd`: bind two `UDPServer`/`PacketPeerUDP` listeners
on free ports, and point a **fresh** `Bridge` instance at them (overridden
host, ports and a 0.2 s gap).
- [ ] `send_order_paid(3, "B2")` → 4242 receives `P3` then `B2`; 4243 receives
      `Y`; `Y` arrives ≥ 0.2 s after `B2`.
- [ ] `send_order_cancelled()` → 4243 receives `X`.
- [ ] `send_order_paid(0, "B2")`, `(7, "B2")` and `(2, "water")` → nothing on
      4242, `X` on 4243.
- [ ] Hopper 6 is accepted (`P6`).
- [ ] Re-entry: two overlapping `send_order_paid` calls → only one P/B/Y
      sequence is sent.
- [ ] `sent` fires for every packet with the right port and message.
- [ ] `python3 tools/udp_monitor.py --help` works, and it uses only the
      standard library.
- [ ] `tools/run_tests.sh` and `tools/check_boot.sh` pass. Nothing binds
      4242/4243 during tests (so a real bridge or monitor running on the dev
      machine doesn't break the suite).

## Out of scope

The bridge rewrite and receiving `DONE`/`TIMEOUT` (Milestone 4); firmware
motors 5–6.
