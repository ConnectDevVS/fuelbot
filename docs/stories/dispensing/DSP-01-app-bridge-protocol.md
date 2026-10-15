# DSP-01 — App bridge protocol v2 (atomic order + result listener)

**As the** payment and dispensing flow, **I want** to hand the bridge one
complete, identified order and hear back what happened to *that* order, **so
that** a paid order can't be dropped by a timing gap and the dispensing
screen reacts to the real outcome.

Plan refs: §3.2 (hopper, never list position; only after payment), §3.7;
README decisions 5, 6, 7, 13 and the protocol table.
Depends on: the payment set (`Bridge`, `payment.gd`).

## Verified before writing (spike, 2026-09-24)

- Headless Godot 4.7.2: `PacketPeerUDP.bind(0, "127.0.0.1")` receives
  datagrams from a Python sender, polled with `get_available_packet_count()`
  every frame. `get_packet_ip()`/`get_packet_port()` work.
- A second `bind()` on a port already bound returns **`ERR_UNAVAILABLE`**
  (not a crash). The listener must handle that.

## Deliverables

```
autoload/Bridge.gd                    # rewritten: ORDER/CANCEL sender + 4245 listener + result cache
scenes/payment/payment.gd             # send_order_paid(order_id, hopper, base_code); send_order_cancelled(order_id)
config/local_settings.json            # bridge block v2
tools/udp_monitor.py                  # default ports 4242; docs for 4245
tests/unit/test_bridge.gd             # rewritten
tests/unit/test_payment_screen.gd     # expectations updated to ORDER/CANCEL
```

## Spec

### Settings (`local_settings.bridge`)

```json
"bridge": { "host": "127.0.0.1", "order_port": 4242, "listen_host": "127.0.0.1", "listen_port": 4245 }
```

`selection_port`, `result_port` (4243) and `result_gap_sec` are removed.

### `Bridge` autoload API

```gdscript
signal sent(port: int, message: String)                              # every datagram sent
signal result_received(order_id: String, kind: String, reason: String)  # kind: DONE | TIMEOUT | REJECTED

var host := "127.0.0.1"
var order_port := 4242
var listen_host := "127.0.0.1"
var listen_port := 4245
var auto_configure := true

func configure_from_settings() -> void     # reads the block, connect_sockets(), listen()
func connect_sockets() -> void             # (re)connects the sending socket
func listen() -> Error                     # (re)binds the listener; OK or the bind error
func is_listening() -> bool
func send_order_paid(order_id: String, hopper: int, base_code: String) -> bool
func send_order_cancelled(order_id: String) -> void
func get_result(order_id: String) -> Dictionary   # {} or {"kind": .., "reason": ..}
```

- **`send_order_paid`** is synchronous: no coroutine, no gap. It validates
  `Ulid.is_valid(order_id)`, `hopper` in `1..ConfigManager.MAX_HOPPER`, and
  `base_code` matching `^B\d$`. When valid it sends
  `ORDER <order_id> P<hopper> <base_code>` to `order_port` and returns
  `true`. When invalid it `push_error`s (a programmer error), sends `CANCEL`
  if the ID is valid, **records a local result** `REJECTED <order_id>
  bad_order` (so the dispensing screen fails at once instead of waiting for
  the cap), emits `result_received`, and returns `false`.
- **One order per ID:** a second `send_order_paid` with the same `order_id`
  is ignored with a warning. That replaces the old `_busy` guard.
- **`send_order_cancelled(order_id)`** sends `CANCEL <order_id>`. With an
  invalid ID it warns and sends nothing.
- **Listener:** a `PacketPeerUDP` bound to `listen_host:listen_port` in
  `listen()`. `_process()` drains it. If the bind fails (`ERR_UNAVAILABLE`:
  another app instance, or someone ran `udp_monitor.py --ports 4245`), it
  `push_warning`s once and retries every 5 s (wall clock). The dispensing
  safety cap still protects the customer.
- **Parsing:** strip, then match
  `^(DONE|TIMEOUT|REJECTED) ([0-7][0-9A-HJKMNP-TV-Z]{25})(?: (\S+))?$` (the same ULID rule as `Ulid.is_valid`). On a
  match, store `{kind, reason}` under the order ID in a result cache (keep
  the newest 16 IDs), log `[Bridge] <- DONE 01J…`, and emit
  `result_received`. A later result for the same ID doesn't replace the
  first: the first outcome wins, and duplicates are logged. Anything else is
  logged as ignored.
- Logs every send (`[Bridge] -> 4242 ORDER 01J… P1 B2`). Order IDs aren't
  secrets.

### `payment.gd`

- `_on_payment_received`: `Bridge.send_order_paid(OrderState.order_id,
  int(flavor.hopper), base.code)` (no `await`), then
  `Nav.go(ScenePaths.DISPENSING)` **whatever it returns**. A refused order
  already has a `REJECTED` result waiting.
- Both cancel paths: `Bridge.send_order_cancelled(OrderState.order_id)`.

### `tools/udp_monitor.py`

Default `--ports 4242`. The docstring explains that 4245 is bound by the app,
so `--ports 4242,4245` works only while the app isn't running (for example,
to watch a bridge's replies).

## Acceptance criteria

`tests/unit/test_bridge.gd`: a fresh `Bridge` instance (`auto_configure =
false`) sending to an ephemeral `PacketPeerUDP.bind(0)` peer and listening on
an ephemeral port (`listen_port = 0`, then read the bound port with
`get_listen_port()`).
- [ ] `test_order_message`: `send_order_paid(id, 3, "B2")` returns `true`,
      and the peer receives exactly `ORDER <id> P3 B2`.
- [ ] `test_hopper_six_accepted`: `P6` is sent.
- [ ] `test_invalid_orders_rejected_locally`: hopper 0 or 7, base `water`
      → `false`, only `CANCEL <id>` on the wire, and `get_result(id)` =
      `REJECTED/bad_order`. A bad ULID → nothing on the wire.
- [ ] `test_duplicate_order_ignored`: same ID twice → one datagram.
- [ ] `test_cancel_message`: `CANCEL <id>`.
- [ ] `test_receives_results`: `DONE <id>`, `TIMEOUT <id> deadline` and
      `REJECTED <id> busy` sent to the listen port → `result_received` with
      the parsed kind/reason and `get_result()` filled in.
- [ ] `test_ignores_malformed`: `DONE`, `DONE nope`, `Y`, `DONE <id> a b` →
      no signal, empty cache.
- [ ] `test_first_result_wins`: `DONE` then `TIMEOUT` for the same ID →
      the cache keeps `DONE`.
- [ ] `test_bind_conflict`: a port already bound → `listen()` returns
      `ERR_UNAVAILABLE` and `is_listening()` is false (no script error).
- [ ] `test_payment_screen.gd`: paid flows send
      `ORDER <OrderState.order_id> P1 B2` (guava = hopper 1); cancel,
      failure and expiry send `CANCEL <order_id>`. Nothing is ever sent to
      the old 4243.
- [ ] `grep -rn "result_gap_sec\|4243" autoload scenes config tools` returns
      nothing (docs aside).
- [ ] `tools/run_tests.sh`, `tools/check_boot.sh` pass. Tests bind only
      ephemeral ports. The `Bridge` autoload itself binds 4245 at boot in
      every process, the test runner included; if a dev app already holds
      it, that is one warning and not a failure. Bridge and payment tests
      are re-run 3×.

## Out of scope

The Python bridge (DSP-02), the dispensing screen that consumes results
(DSP-05).
