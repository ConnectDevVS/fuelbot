# DSP-02 — Rewritten hardware bridge (`hardware/bridge/udprxtx.py`)

**As the** machine, **I want** a bridge that turns one paid order into one
Arduino command and reports back whether the drink was finished, **so that**
the app shows the real outcome and the bridge never hangs on a silent or
missing board.

Plan refs: §3.7 (bridge), §6 Level 1, §5 Milestone 8 (systemd and
`/dev/arduino`, later); README decisions 5, 7, 8, 9, 10, 13.
Depends on: nothing in this set (the protocol table in the README).

## Verified before writing (spike, 2026-09-24)

- `pyserial`, `socat` and `arduino-cli` are **not installed**. Python is
  **3.9.6**, so no `match` statements and no `X | Y` type hints.
- A PTY pair from `pty.openpty()` behaves like a serial port. The bridge
  side opens the slave **by path** (`os.open(path, O_RDWR|O_NOCTTY|O_NONBLOCK)`),
  sets raw 9600 with `termios`, writes `12\n`, and the other side reads it.
  Lines written back arrive intact.
- When the far side closes, `select()` reports the fd readable and
  `os.read()` returns `b''` (EOF). The bridge must treat that as **link
  lost**, not spin.
- **Found while implementing:** with `O_NONBLOCK` and `VMIN=0`, macOS
  returns `b''` from a PTY with *no data*, which is indistinguishable from
  EOF. `VMIN=1` makes "no data" raise `EAGAIN`, and `b''` then means closed.
  `PosixSerial` uses `VMIN=1`.

## Deliverables

```
hardware/bridge/udprxtx.py          # stdlib only; runnable: python3 hardware/bridge/udprxtx.py --serial /dev/arduino
hardware/bridge/test_udprxtx.py     # unittest
```

## Spec

### CLI

```
python3 hardware/bridge/udprxtx.py [--serial /dev/arduino] [--baud 9600]
    [--listen-host 127.0.0.1] [--order-port 4242]
    [--app-host 127.0.0.1] [--result-port 4245]
    [--deadline 110] [--recover-sec 15] [--reopen-sec 5]
```

Logs go to stdout, one line each, flushed, prefixed `HH:MM:SS.mmm`. Order
IDs, commands and serial lines are logged. There are no secrets here.

### Structure (all in `udprxtx.py`, one file to deploy)

- `parse_app_message(text) -> Optional[tuple]`:
  `("ORDER", order_id, hopper, base)` or `("CANCEL", order_id)`, or `None`.
  `ORDER` matches `^ORDER ([0-9A-HJKMNP-TV-Z]{26}) P([1-6]) B([1-9])$`,
  `CANCEL` matches `^CANCEL ([0-9A-HJKMNP-TV-Z]{26})$`. For a line that
  starts with `ORDER ` and has a valid ID but a bad body,
  `parse_order_id_only()` recovers the ID so the bridge can reply
  `REJECTED <id> bad_order`.
- `class PosixSerial`: `open()` (raw 8N1 at `--baud`, `O_NONBLOCK`,
  `CLOCAL|CREAD`, `HUPCL` off, `VMIN=1`/`VTIME=0`), `fileno()`, `write_line(str)`,
  `read_lines() -> list[str]` (non-blocking, buffers partial lines, strips
  `\r\n`, drops empty lines, decodes as UTF-8 with replacement), `close()`.
  EOF or `OSError` raises `LinkLost`.
- `class BridgeCore`: the whole policy, with **no I/O of its own**. Its
  constructor takes `send(msg)`, `write_serial(cmd)`, `serial_ok()` and a
  `clock()`. Methods: `on_app_message(text)`, `on_serial_line(line)`,
  `on_link_lost()`, `on_link_restored()`, `tick()`. It holds `state` and
  `active` (the order ID).
- `run(args)`: the loop. `select()` on the UDP socket and (when open) the
  serial fd, with a 0.2 s timeout. It feeds the core, calls `tick()` every
  pass, and reopens the serial every `--reopen-sec` while it's closed. It
  exits cleanly on SIGINT/SIGTERM.

### State machine

| State | Enter | `ORDER` (valid) | Serial line | `tick()` |
|-------|-------|-----------------|-------------|----------|
| `RECOVERING` | startup, serial (re)opened, after `DONE`/`TIMEOUT` | `REJECTED <id> busy` | `Home reached` → `READY` | after `--recover-sec` → `READY` (log a warning: no `Home reached` seen) |
| `READY` | — | serial closed → `REJECTED <id> serial_unavailable`. Otherwise write `<h><b>\n`, `active = id`, deadline = now + `--deadline` → `DISPENSING` | logged | — |
| `DISPENSING` | — | same ID: ignored (duplicate). Other ID: `REJECTED <id> busy` | `STATUS:DONE` → `DONE <id>`; `FAULT:<CODE>…` → `TIMEOUT <id> fault:<CODE>`; then `RECOVERING` | deadline passed → `TIMEOUT <id> deadline` → `RECOVERING` |

- Link lost while `DISPENSING` → `TIMEOUT <id> serial_lost`. Link lost in any
  state → serial closed (reopen loop). Link restored → `RECOVERING`.
- `ORDER` with a valid ID but a bad body → `REJECTED <id> bad_order` in any
  state. Unparseable text → log `ignored`.
- `CANCEL <id>` → logged only: "cancel for active order ignored (cycle can't
  be interrupted)" or "cancel: no active order". The serial is never
  touched.
- A `FAULT:` line outside `DISPENSING` is logged.
- An `ORDER` for an ID that already finished (the last 32 IDs are
  remembered) is logged as a duplicate and ignored, with no reply, so a
  stray resend can never dispense twice.
- The bridge never blocks: all serial I/O is non-blocking, and every wait
  has a deadline.

## Acceptance criteria

`hardware/bridge/test_udprxtx.py` (`python3 -m unittest hardware/bridge/test_udprxtx.py`):
- [ ] `test_parse_messages`: valid ORDER/CANCEL; hopper 0/7, base 0, lower-case
      or short IDs, extra tokens → `None`; `parse_order_id_only` recovers the ID.
- [ ] `test_order_happy_path` (core, fake clock): READY → ORDER → serial
      `12\n` → `STATUS:DONE` → `DONE <id>`, state RECOVERING → `Home reached`
      → READY.
- [ ] `test_deadline`: no DONE → after the deadline, `TIMEOUT <id> deadline`,
      exactly once.
- [ ] `test_fault_line`: `FAULT:HOPPER_UNASSIGNED 5` → `TIMEOUT <id>
      fault:HOPPER_UNASSIGNED`.
- [ ] `test_busy_rejections`: ORDER during DISPENSING (other ID) and during
      RECOVERING → `REJECTED <id> busy`, and nothing written to serial.
- [ ] `test_duplicate_order_ignored`: same ID while dispensing and after
      done → no second serial write.
- [ ] `test_serial_unavailable` and `test_link_lost_mid_order`.
- [ ] `test_recover_timeout`: no `Home reached` → READY after `recover_sec`.
- [ ] `test_bad_order`: `ORDER <id> P9 B2` → `REJECTED <id> bad_order`.
- [ ] `test_cancel_is_informational`: CANCEL never writes serial or changes state.
- [ ] `test_posix_serial_on_pty`: `PosixSerial` on a real PTY: writes arrive,
      partial lines are buffered, `\r\n` stripped, far-end close → `LinkLost`.
- [ ] `test_run_loop_end_to_end`: `run()` in a thread with ephemeral UDP ports,
      a PTY scripted to answer `STATUS:DONE`; a UDP `ORDER` → `DONE` datagram
      on the result socket within 2 s; stops cleanly.
- [ ] `python3 hardware/bridge/udprxtx.py --help` works; the file imports only
      the standard library.

## Out of scope

Stage telemetry, `STATUS:*` parsing beyond `DONE`, port 4246 (Milestone 5);
systemd unit and udev rule (Milestone 8).
