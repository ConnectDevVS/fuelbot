# Dispensing — story set (Milestone 4)

Replaces the dispensing stub with the real thing. After payment, the app
sends **one atomic order message** to a rewritten hardware bridge. The bridge
drives the Arduino and reports **`DONE`** or **`TIMEOUT`** back on UDP 4245.
The **Thank You / Dispensing** screen shows blending progress, then the
collect state, then returns to attract.

- Design: [designs/GMRFuelBot-OnDevice-SsampleScreens.pdf](../../../designs/GMRFuelBot-OnDevice-SsampleScreens.pdf),
  **page 5, "04 Thank You / Dispensing"**.
- Plan: [greenfield-rewrite.md](../../plans/greenfield-rewrite.md) §0 decision
  log, §3.2 (hopper rule), §3.7 (dispensing signal), §5 Milestone 4, §6 (test
  rig levels), §7 steps 5, 7, 8.
- Old working logic to port (not copy): `fuelbotsource_og/VM_code.ino`
  (firmware) and `fuelbotsource_og/udprxtx.py` (bridge). Both are read-only.
- Conventions, gotchas and test patterns: [CLAUDE.md](../../../CLAUDE.md).
  This set assumes them.

## Goals

1. Remove the dropped-`Y` hazard and the 0.3 s gap: one UDP message per paid
   order, carrying the order ID.
2. The app learns the real outcome of a dispense (`DONE` / `TIMEOUT`), and
   never hangs if it hears nothing.
3. A bridge that is small and testable, and **never hangs**: no serial read
   without a deadline, no blocking on a missing Arduino.
4. Firmware that says when it's done, and fails safe for hoppers 5–6 until
   they are wired.
5. Everything verified without hardware: Level 0 (fake bridge) and Level 1
   (real bridge + fake Arduino over a PTY), per plan §6.

## Execution order

| # | Story | Depends on | Produces |
|---|-------|-----------|----------|
| 01 | [App bridge protocol v2](DSP-01-app-bridge-protocol.md) | payment set | `Bridge` sends `ORDER`/`CANCEL` on 4242, listens on 4245 and caches results per order; payment uses it; `udp_monitor.py` updated |
| 02 | [Rewritten bridge](DSP-02-bridge-rewrite.md) | — | `hardware/bridge/udprxtx.py` (stdlib only): state machine, POSIX serial, deadline, `DONE`/`TIMEOUT`/`REJECTED` on 4245 |
| 03 | [Firmware](DSP-03-firmware.md) | — | `hardware/firmware/VM_code.ino`: `STATUS:DONE`, command validation, motors 5–6 placeholders that fail safe; host syntax check |
| 04 | [Test-rig fakes](DSP-04-test-rig-fakes.md) | 02, 03 | `tools/fake_dispense_bridge.py` (Level 0), `tools/fake_arduino_serial.py` (Level 1), automated Level 1 test |
| 05 | [Dispensing screen](DSP-05-dispensing-screen.md) | 01 | PDF page 5: blending → done (collect, return in 6 s) or failed (support message) |
| 06 | [End-to-end & sign-off](DSP-06-e2e-signoff.md) | 01–05 | Level 0 + Level 1 walkthroughs, SIGNOFF.md, plan / README / CLAUDE.md updates |

02 and 03 don't depend on 01 and could run in parallel. They are executed in
the order above.

When 06 is done: attract → listing → details → Proceed → Scan to pay →
**paid** → `ORDER <ulid> P<h> B<n>` to the bridge → **Blending your drink**
with a progress bar → `DONE <ulid>` → check + **Collect from the hatch
below** → "Returning to menu in 6s" → attract. `TIMEOUT`, `REJECTED` or
silence past the safety cap → the support message → attract.

## Definition of Done (every story)

`tools/run_tests.sh` → `ALL TESTS PASSED`, `tools/check_boot.sh` → `BOOT OK`,
and `python3 -m unittest mockserver/test_server.py hardware/bridge/test_udprxtx.py tools/test_fakes.py`
→ `OK` (the files that exist at that story). Timing-sensitive tests
(bridge, dispensing, payment) are re-run 2–3× with `--filter=`. UI work gets
a screenshot compared with PDF page 5. One commit per story: `DSP-NN: <title>`,
chained with `&&` after the checks. No credential in any commit, log or
screenshot.

## Decisions

Made by the product owner (2026-09-24):

1. **Motors 5–6 pins are placeholders.** The wiring isn't final. The firmware
   defines `M5`/`M6` as `-1` with `TODO(wiring)` markers and placeholder
   positions and durations. While a pin is `-1`, an order for that hopper
   prints `FAULT:HOPPER_UNASSIGNED <n>` and **nothing moves** (not even the
   water pump). The Godot side already supports hoppers 1–6. Until the
   wiring is done, a real machine's catalog must not enable flavors on
   hoppers 5–6: the customer would pay and get the support message. The
   mock catalog enables them on purpose, to exercise that path.
2. **A dispensing timeout keeps the support message.** On `TIMEOUT` (or any
   failure after payment), show `messages.dispensing_timeout` ("Something
   went wrong. Please contact support if you were charged.") and return to
   attract. **No automatic refund** in this milestone; the refund policy is
   an open item.
3. **Dispensing and Complete are one screen** (`scenes/dispensing/`), as on
   PDF page 5: blending with progress, then on `DONE` the check/collect state
   and "Returning to menu in 6s", then idle. There is no `scenes/complete/`.
4. **Fake hardware only.** No board is available. Verification is plan §6
   Level 0 and Level 1. Levels 2 and 3 are written up as pending manual steps
   (DSP-06).

Made while writing this set (verified by the spikes noted in each story):

5. **Protocol v2** (table below): one `ORDER` datagram per paid order on
   4242, `CANCEL` on 4242, results on 4245. **Port 4243 is retired.** `Y`,
   `X`, `P`/`B` and `bridge.result_gap_sec` are gone.
6. **The 4245 listener lives in the `Bridge` autoload**, bound for the app's
   lifetime, not in the dispensing scene (plan §3.7 said the scene). A
   bridge can answer in milliseconds (`REJECTED busy`, a fast fake), which is
   before the dispensing scene has loaded and bound a socket. A UDP datagram
   to an unbound port is lost, and the customer would wait out the safety
   cap. `Bridge` caches results per order ID, and the dispensing scene reads
   the cache on entry, then listens to `result_received`.
7. **A third result kind, `REJECTED <order_id> <reason>`**, for orders the
   bridge never started (`busy`, `bad_order`, `serial_unavailable`). The app
   treats it like `TIMEOUT`, but it arrives at once instead of after the
   safety cap. `TIMEOUT` gets a reason token as well (`deadline`,
   `serial_lost`, `fault:<CODE>`). The app logs reasons and never shows them.
8. **Timing, from firmware arithmetic rather than the plan's estimate.** The
   plan assumed a 35–55 s cycle and a 60 s bridge deadline. Adding up
   `VM_code.ino`'s `delay()`s and stepper moves (X axis 100 µs/step and Z
   axis 140 µs/step nominal, plus about 10 % for `digitalWrite` overhead)
   gives about **68–78 s** per drink:

   | Hopper | Stepper moves | Pump, dispense and mix delays | Total ≈ |
   |--------|---------------|-------------------------------|---------|
   | 1 | 31.5 s | 41.3 s | 73 s |
   | 2 | 27.5 s | 47.3 s | 75 s |
   | 3 | 28.0 s | 40.3 s | 68 s |
   | 4 | 31.9 s | 45.8 s | 78 s |

   A 60 s deadline would time out **every** real order. So: bridge deadline
   **110 s** (`--deadline`), app `timing.dispense_expected_sec` **75**,
   `timing.dispense_safety_cap_sec` **130**. The cap must be greater than
   the bridge deadline, so that the bridge's own `TIMEOUT` normally arrives
   first. Level 3 (real bench) retunes these from measured cycles.
9. **After `DONE` or `TIMEOUT` the bridge "recovers"** before taking another
   order. The firmware watchdog-resets and re-homes after every cycle, and
   the bootloader can swallow serial bytes. Recovery ends at the firmware's
   `Home reached` line or after `--recover-sec` (15 s, so it can never hang).
   The same applies at startup, because opening the port resets a Mega.
   Orders during recovery get `REJECTED busy`.
10. **No `pyserial`.** It isn't installed here, and neither is `socat`. The
    bridge opens the port with stdlib `termios` (raw, 9600 8N1), which works
    for `/dev/arduino` on Linux and for a PTY on macOS. It's verified on a
    PTY here and on a real port in Level 2. `fake_arduino_serial.py` creates
    the PTY pair itself (Python `pty`), so `socat` isn't needed.
11. **The dispensing screen stays lime in every state**, including failure,
    where the circle shows a drawn `!`. The header's `ORDER #… · PAID` stays
    true, and it helps support.
12. **The check and `!` marks are drawn** (`StatusBadge` component). Neither
    font has `✓`.
13. **`CANCEL <order_id>` is informational.** The order only reaches the
    bridge after payment, so there's never a pending selection to reset. The
    app still sends `CANCEL` on cancel, failure and expiry (the old `X`
    semantics). The bridge logs it, and it never interrupts a running cycle.
14. **The firmware is syntax-checked on the host, not compiled for AVR.**
    `arduino-cli` isn't installed. `tools/check_firmware.sh` compiles the
    sketch with `clang++ -fsyntax-only` against minimal Arduino stub
    headers. That catches typos, not AVR-specific problems. Level 2 is the
    real compile and flash.

Deviations from the plan text: §3.7's 60 s / 90 s numbers (decision 8), the
socket location (decision 6), the separate Complete scene (decision 3), and
the §6 Level 0 telemetry on 4246 (Milestone 5, not built). §5 Milestone 4 also
lists porting `hardware/pos/pinelabs.py` inert. That is **not** in this set
and stays open.

## Protocol v2 (app ⇄ bridge ⇄ Arduino)

All UDP is ASCII, one message per datagram, on `127.0.0.1`. `<order_id>` is
the 26-character Crockford ULID from `OrderState.order_id`.

| Direction | Port | Message | Meaning |
|-----------|------|---------|---------|
| app → bridge | 4242 | `ORDER <order_id> P<h> B<n>` | paid order. `h` = flavor `hopper` 1–6 (never list position), `n` = base code digit (`B2` water). Sent **once, only after payment succeeds** |
| app → bridge | 4242 | `CANCEL <order_id>` | cancel / failure / expiry. Informational (decision 13) |
| bridge → app | 4245 | `DONE <order_id>` | the firmware printed `STATUS:DONE` |
| bridge → app | 4245 | `TIMEOUT <order_id> <reason>` | started but no `STATUS:DONE`: `deadline` (110 s), `serial_lost`, `fault:<CODE>` |
| bridge → app | 4245 | `REJECTED <order_id> <reason>` | never started: `busy`, `bad_order`, `serial_unavailable` |
| bridge → Arduino | serial 9600 | `<h><n>\n` | e.g. `12\n` (unchanged from the old firmware) |
| Arduino → bridge | serial | free text + `STATUS:DONE` | end of cycle, before the watchdog reset |
| Arduino → bridge | serial | `FAULT:HOPPER_UNASSIGNED <h>` / `FAULT:BAD_COMMAND` | refused; nothing moved |
| Arduino → bridge | serial | `Home reached` | homing finished (boot and after every cycle). Ends bridge recovery |

The app accepts only 4245 messages matching
`^(DONE|TIMEOUT|REJECTED) <ULID>( <token>)?$` whose ULID is the current
order's. Anything else is logged and ignored.

## Design measurements (PDF page 5, 1080×1920 px)

Measured on a 400-dpi render cropped to the lime screen (the page has a
caption strip and frame; the crop scales to exactly 1080×1920).

| Element | Measurement |
|---------|-------------|
| Background | `#C8FF3E` = `Palette.ACCENT`, full screen |
| Header (y 52–119, centre ≈ 86) | left: dark tile ~64 px at x 62, radius ~12, lime `PF` Archivo 900 ~26; mono ~20 dark `ORDER #4821 · PAID` from x 148. Right: mono ~20 `UPI · ₹220` ending at x 1016 (margin ~62) |
| Circle | 224 px dark (`#111215`), y 514–737, centred; lime check ~55 % of the diameter |
| Title | `BLENDING` / `YOUR DRINK`, Archivo 900, cap height 89 → **~124 px**, line pitch **105**, dark, centred; lines at y 789 and 894 |
| Meta | `Peanut Power · 400 ml`, Archivo ~600, **~34 px**, dark, y 1018–1046 |
| Progress bar | x 158–920 (**762 wide**), y 1094–1121 (**28 tall**), fully rounded; track `#ABDA35` (new `Palette.ACCENT_TRACK`), fill dark; the sample is at 62 % |
| Bar labels | mono ~22 dark, `BLENDING` left / `~18 SECONDS` right, y 1146–1163 |
| Collect pill | x 164–914 (**751 × 116**), y 1230–1345, radius ~20, dark; lime Archivo 900 **~46** text, 658 wide |
| Footer | `Earned it. Now drink it.`, Archivo 800 **~50**, dark, centred, y 1748–1785 |
| Return line | mono ~22 dark `RETURNING TO MENU IN 6S`, y 1828–1844 (bottom margin ~76) |

The PDF is one composite frame. How the elements map to states is in DSP-05.

## Out of scope

- Telemetry: `STATUS:*` stage lines, `FAULT:HOMING_TIMEOUT`, a bounded
  `homeAxis()`, `TelemetryReporter` and port 4246 (**Milestone 5**). Until
  then, a board stuck homing makes the next order `TIMEOUT` as well. That's
  recorded as an open item.
- Sale reporting (**Milestone 6**), refunds (decision 2), Raspberry Pi
  deployment, systemd and the udev rule (**Milestone 8**), porting
  `pinelabs.py`.
- The real Razorpay test-mode check (Milestone 2 Part B, pending with the
  product owner). Nothing here blocks on it.
- Wiring and real pins, positions and durations for motors 5–6.
