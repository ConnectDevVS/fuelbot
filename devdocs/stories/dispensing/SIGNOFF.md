# Dispensing (Milestone 4) — sign-off (DSP-06)

Executed 2026-09-24 on macOS (Apple M5), Godot 4.7.2.stable.official, Python
3.9.6, branch `milestone-4-dispensing` (off `idle-screens`). Evidence is in
`.screenshots/dsp-e2e/` (gitignored): walker screenshots
`<flow>-{listing,blending,done,failed,after}.png`, plus `app-<flow>.log`,
`bridge-<flow>.log` and `arduino-<flow>.log`.

**Status: Level 0 PASS, Level 1 PASS. Level 2 and Level 3 are PENDING
hardware.** Milestone 4 is built and verified in software. It can be called
done once Level 2 confirms the real board prints `STATUS:DONE` and the
`FAULT:` lines.

## Automated

| Check | Result | Evidence |
|-------|--------|----------|
| `tools/run_tests.sh` | PASS | `ALL TESTS PASSED (140)`. Dispensing (14), payment (15) and bridge (10) filters each re-run 3× with no flakes |
| `python3 -m unittest mockserver/test_server.py` | PASS | `Ran 16 tests … OK` (includes the new `hopper_shuffle` scenario) |
| `python3 -m unittest hardware/bridge/test_udprxtx.py` | PASS | `Ran 15 tests … OK`, 3× |
| `python3 -m unittest tools/test_fakes.py` | PASS | `Ran 13 tests … OK`, 3×. Includes the **automated Level 1** tests: normal → `DONE`, never-done → `TIMEOUT deadline`, hopper 5 → `TIMEOUT fault:HOPPER_UNASSIGNED`, disconnect → `TIMEOUT serial_lost` |
| `tools/check_boot.sh` | PASS | `BOOT OK` |
| `tools/check_firmware.sh` | PASS | `FIRMWARE SYNTAX OK`. It fails on a planted typo, and a variant with M5/M6 on real pins (so the `#if` branches compile) passes. **This is not an AVR compile:** `arduino-cli` isn't installed (decision 14) |
| No credentials committed | PASS | `git grep -nE "rzp_(live\|test)_[A-Za-z0-9]{6,}" -- ':!devdocs'` matches only CLAUDE.md's documented test sentinel `rzp_test_SENTINEL1` (a placeholder, not a key). Nothing in `hardware/`, `tools/`, `scenes/`, `autoload/` or `config/` |

## Level 0 — app + mock payments + `tools/fake_dispense_bridge.py`

Mock on :8787 (`dev_setup.gd` mock payments; payments route `paid_after_3`),
the fake bridge on 4242, and the real app with a temporary walker (not
committed): attract → first card → Proceed → Scan to pay → paid. Times are
from entering the dispensing screen.

| Flow | Fake bridge | Result |
|------|-------------|--------|
| **done** | `--mode done --delay 4` | PASS. The fake got `ORDER 01M39CK026… P1 B2` (the paid order's ULID, hopper 1). `DONE` → DONE state at **+3.97 s**, progress 1.00, collect pill; attract at **+10.00 s** (4 + 6), `OrderState` cleared |
| **timeout** | `--mode timeout --delay 4` | PASS. `TIMEOUT … deadline` → FAILED at +3.99 s with the support message; attract at +14.00 s (4 + 10) |
| **silent** (safety cap) | `--mode silent`, cap lowered to 15 s via the override | PASS. No packet → FAILED at **+15.00 s** (not before); attract at +25.04 s |
| **reject** | `--mode reject` | PASS. `REJECTED … busy` arrived **before the dispensing scene loaded** (the Bridge log line precedes the scene entry). The cached result failed the screen at **+0.01 s**. This is decision 6 working for real |
| **hopper ≠ position** (plan §7 step 5) | config scenario `hopper_shuffle`, `--mode done` | PASS. The first card (guava) is hopper 3 in that scenario, and the fake got `ORDER … P3 B2` |

## Level 1 — app + mock payments + real `hardware/bridge/udprxtx.py` + `tools/fake_arduino_serial.py`

The fake Arduino at `--time-scale 0.1` on a PTY (`--link` to a stable path
in the scratchpad). The bridge `--serial` that path, `--recover-sec 3`.

| Flow | Fake Arduino / bridge | Result |
|------|-----------------------|--------|
| **normal cycle** | default / `--deadline 110` | PASS. Bridge: `ready` (saw `Home reached` from the boot banner) → `ORDER … -> serial 12` → the line sequence → `STATUS:DONE` → `DONE` after 7.28 s (the fake's hopper-1 cycle at 0.1× is 7.27 s) → `Home reached` → `ready`. App: DONE at **+7.26 s**, attract 6 s later |
| **never-DONE** | `--fault never_done` / `--deadline 15` | PASS. The fake stops at `Homing`. The bridge logged `no STATUS:DONE within 15 s` and sent `TIMEOUT … deadline`; the app went FAILED at +15.14 s, then attract |
| **hopper 5 unassigned** | default (assigned 1–4); walker taps Cookies & Cream (hopper 5) | PASS. Serial `52` → `FAULT:HOPPER_UNASSIGNED 5` → `TIMEOUT … fault:HOPPER_UNASSIGNED` in the same millisecond; the app went FAILED at +0.01 s, then attract |

## Visual (PDF page 5)

`.screenshots/Dispensing.png` (blending, via `tools/screenshot.sh … guava`),
`Dispensing-{blending,done,failed}.png` (temporary capture scene), and every
walker flow above. Compared side by side with a 400-dpi render of page 5
cropped to the screen: the header, badge, two-line title, meta, bar and
labels, collect pill, footer and return line all match in position and
colour. Deliberate differences: the title is 113 px (not the measured
~124) to match the design's **width** (DSP-05 note), and the drawn check is
rounder than the design's glyph.

## Issues found and fixed during execution

1. **Plan timing was wrong for the real firmware.** Adding up the `delay()`s
   and stepper steps in `VM_code.ino` gives **68–78 s** per drink, not
   35–55 s. The plan's 60 s bridge deadline would have timed out every real
   order. Now 110 s at the bridge and a 130 s app cap (README decision 8).
2. **Firmware hazard (existing):** a command with an unknown hopper digit
   (e.g. `52`) filled water, skipped every protein branch, never reached the
   reset, and **refilled water forever**. Fixed by validating at parse time
   (DSP-03).
3. **macOS PTY gotcha:** with `O_NONBLOCK` and `VMIN=0`, a read with no data
   returns `b''`, which is indistinguishable from EOF. `PosixSerial` uses
   `VMIN=1` (DSP-02).
4. **Dispensing bar widened in DONE:** the `YOUR SHAKE` title made the column
   821 px, and the bar stretched with it. Caught by `test_layout_fits`; fixed
   with shrink-centre on the bar and meta.
5. **Bridge claimed "ready" with no serial link** after a disconnect (the
   recovery timer had expired). Orders were still safe, because the serial
   check comes first, but the state was wrong. Recovery now completes only
   while the link is up; `test_not_ready_while_link_down`.
6. **Walker capture stalls (harness only).** `await
   RenderingServer.frame_post_draw` never returned once macOS stopped drawing
   the capture window, and one run's screenshots were all a stale frame
   while the flow itself (per the logs) was correct. The walker now waits on
   `process_frame`, and that flow was re-run for valid screenshots.

## Level 2 / Level 3 — pending hardware

**Level 2 (real Mega, LEDs in place of actuators):**

1. `arduino-cli core install arduino:avr`, then
   `arduino-cli compile --fqbn arduino:avr:mega hardware/firmware` and
   `arduino-cli upload -p /dev/tty.usbmodem… --fqbn arduino:avr:mega hardware/firmware`
   (or use the Arduino IDE). The sketch folder must be named `VM_code` for
   the IDE, so copy `VM_code.ino` into `VM_code/`.
2. Serial monitor at 9600, newline line ending. Expect ` `, `Reset!`,
   `Homing`, then `Home reached` once the limit switch is pressed by hand.
3. Send `12` → the M1 / PU / MIX / stepper LED sequence, the free-text lines,
   then `Mix Done`, **`STATUS:DONE`**, and the reset banner.
4. Send `52` → **`FAULT:HOPPER_UNASSIGNED 5`**, and no LED lights. Send `13`
   and `ab` → `FAULT:BAD_COMMAND`, and nothing moves.
5. Time step 3 with a stopwatch and record it against the 68–78 s estimate.
6. Close the monitor. Run `python3 hardware/bridge/udprxtx.py --serial
   /dev/tty.usbmodem…` and the app (`tools/dev_run.sh`), with no fake bridge
   or `udp_monitor.py` on 4242. Walk an order: the bridge log shows `serial
   open`, `ready` after `Home reached`, the command, and `DONE`; the app
   shows the done state.
7. Unplug USB mid-cycle → the bridge sends `TIMEOUT … serial_lost`, the app
   shows the support message, and the bridge reopens when it's plugged back
   in.

**Level 3 (full mechanical bench):** time 5 cycles per hopper. Then set
`timing.dispense_expected_sec` to the mean, the bridge `--deadline` to the
max × 1.3, and `timing.dispense_safety_cap_sec` above the deadline. Update
README decision 8 and plan §3.7.

## Open items

- **Motors 5–6 wiring:** real pins, positions and durations (`TODO(wiring)`
  in the sketch). Until then, a real machine's catalog must not enable
  flavors on hoppers 5–6 (the customer pays and gets the support message).
- **Refund policy** for a paid order that fails to dispense (decision 2):
  today it's only the support message, plus the order ID in the logs and the
  Razorpay notes.
- **Stuck board after a TIMEOUT (Milestone 5):** after `--recover-sec`, the
  bridge takes the next order even if the board is still stuck in
  `homeAxis()`, so that customer also pays and times out. `FAULT:HOMING_TIMEOUT`
  plus a maintenance flip is Milestone 5.
- **Level 2 / Level 3** runs (above), including the first real AVR compile.
- **Milestone 2 Part B** (real Razorpay test mode) is still pending with the
  product owner.
- Porting `hardware/pos/pinelabs.py` inert (plan §5 Milestone 4) wasn't in
  this set.
