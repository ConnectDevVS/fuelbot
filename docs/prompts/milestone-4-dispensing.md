# Prompt: Milestone 4 — hardware bridge & dispensing (write stories, then execute them)

Paste everything below the line into a new Claude Code session opened at the
repo root (`/Volumes/Professional/Professional/FuelBot/Source/Sourcegit/fuelbot`).

---

You're continuing the FuelBot kiosk project (Godot 4.7.2, 1080×1920 portrait
vending-machine app). Your job has two phases: **(A)** write an executable
story set for **Milestone 4 — hardware bridge + real dispensing signal**, then
**(B)** execute every story, one commit each, and sign it off. The product
owner has already made the decisions listed below. Proceed without asking
unless you are genuinely blocked.

## 0. Read first (don't skip)

1. `CLAUDE.md`: conventions, Godot gotchas, testing patterns, mock server,
   and machine quirks. **Follow it.** Especially: tests via
   `tools/run_tests.sh`; chain commits with `&&`, never `;`; wall-clock waits
   for anything timing-critical; no string or colour literals in scenes; all
   navigation through `Nav`; never log or commit credentials.
2. `devdocs/plans/greenfield-rewrite.md`: §0 (status + decision log), §3.2
   (hopper rule), §3.7 (dispensing signal), §3.8 (telemetry: **Milestone 5,
   out of scope here**), §5 Milestone 4, §6 (hardware test rig levels), §7
   steps 5, 7, 8.
3. The existing story sets as the model for format and rigour:
   `devdocs/stories/{idle,details,payment}/` (README with decisions + design
   measurements, one file per story with Deliverables / Spec / Acceptance
   criteria / Out of scope, and a SIGNOFF.md). Match that style.
4. Current code you'll change or build on: `autoload/Bridge.gd`,
   `autoload/OrderState.gd`, `scenes/payment/payment.gd` (it calls
   `Bridge.send_order_paid(...)` then `Nav.go(ScenePaths.DISPENSING)`), the
   stub `scenes/dispensing/`, `tools/udp_monitor.py`, and `config/local_settings.json`.
5. The design: `designs/GMRFuelBot-OnDevice-SsampleScreens.pdf` **page 5,
   "04 Thank You / Dispensing"**. Render it with PyMuPDF in a scratchpad venv
   (poppler isn't installed) and measure it in 1080×1920 px like the earlier
   READMEs do. What's on it: a full-screen **lime** background; top-left dark
   logo tile + mono `ORDER #4821 · PAID`, top-right mono `UPI · ₹220`; a large
   dark circle with a check mark; heavy dark `BLENDING YOUR DRINK`;
   `Peanut Power · 400 ml`; a dark progress bar on a lighter track labelled
   `BLENDING` … `~18 SECONDS`; a dark pill `Collect from the hatch below`
   with lime text; bottom `Earned it. Now drink it.` + mono
   `RETURNING TO MENU IN 6S`.
6. The old sources, **read-only reference** (never modify):
   `/Volumes/Professional/Professional/FuelBot/Source/fuelbotsource_og/`:
   - `VM_code.ino`: Arduino **Mega** (limit switch on pin 22). Motors
     `M1–M4` on pins 2–5, `PU` 6, `MIX` 7, stepper `ENA/DIR/Z/X` 8–11. It
     reads a 2-digit `"<protein><base>\n"` serial command. Each protein has
     its own dispense duration (1500 / 7500 / 500 / 6000 ms). It prints
     free-text status lines (`Homing`, `Home reached`, `Water Filled in Cup`,
     `Protein n Dispensed`, …) and ends with `Mix Done` → `resetArduino()`.
     `homeAxis()` loops forever if the limit switch never triggers.
   - `udprxtx.py`: the current bridge. P/B on UDP 4242, Y/X on 4243, writes
     to `/dev/arduino`, and **drops a `Y` that arrives while it's still
     collecting P/B** (why the app currently waits 0.3 s before `Y`).
   - `second.gd` contains a **live Razorpay key**. Don't open it; you don't
     need it. If you ever grep old files, mask `rzp_(live|test)_…` in output.
7. Git: work on a new branch off `idle-screens`, e.g.
   `git checkout idle-screens && git checkout -b milestone-4-dispensing`.
   **Don't push, and don't merge to `main`.** Leave that to the product owner.

## 1. Decisions already made (put them in the new README's Decisions list and the plan's §0 log)

1. **Motors 5–6 pins are placeholders.** The wiring isn't final. The
   firmware defines `M5`/`M6` with clearly marked placeholder pins (e.g.
   `#define M5 -1 // TODO(wiring): assign pin`) and placeholder dispense
   durations. Hoppers 5/6 must fail safe while unassigned: print a
   machine-parseable fault and skip dispensing rather than drive pin -1. The
   Godot side already supports hoppers 1–6.
2. **Dispensing timeout keeps the support message.** If dispensing times out
   after payment, show the existing `messages.dispensing_timeout` ("Something
   went wrong. Please contact support if you were charged.") and return to
   attract. **No automatic refund** in this milestone. Record the refund
   question as an open item.
3. **Dispensing and Complete are ONE screen** (`scenes/dispensing/`) as in
   PDF page 5: blending with progress, then on DONE the check/collect state
   and "Returning to menu in 6s", then idle. Don't create a separate
   `scenes/complete/`. Update plan §3.6/§3.7/§4 accordingly.
4. **Fake hardware only.** No physical board is available. Verification uses
   plan §6 **Level 0** (a fake bridge) and **Level 1** (the real rewritten
   bridge talking to a fake Arduino over a virtual serial pair). If `socat`
   isn't installed, use a Python `pty`-based fake that the bridge can open,
   or make the bridge's serial transport injectable for tests. Level 2/3
   (real Arduino, real machine) become documented, pending manual steps.

## 2. Scope to design into the stories (you choose the exact split, likely 5–7 stories)

- **Bridge protocol v2 (atomic order).** Replace the P/B/gap/Y dance with
  **one UDP message per order**, carrying the hopper, base code and order ID
  (e.g. `ORDER <order_id> P<h> B<n>` on 4242, and `CANCEL <order_id>`). This
  removes the dropped-`Y` hazard and the 0.3 s gap. Update `Bridge.gd`
  (`send_order_paid(order_id, hopper, base_code)`) and `payment.gd`; drop
  `result_gap_sec`; keep `X`-equivalent cancel semantics. Hopper is still
  sent **only after payment succeeds**, and always from the flavor's `hopper`
  field.
- **Rewritten bridge** `hardware/bridge/udprxtx.py`: a clean, testable Python
  (stdlib + `pyserial` only for the real port; keep the serial layer behind a
  small interface so tests use a fake). On an order it writes
  `"<hopper><base digit>\n"` to the Arduino, then reads lines with an overall
  deadline (~60 s), looking for `STATUS:DONE`. It sends UDP **`DONE <order_id>`**
  or **`TIMEOUT <order_id>`** to **port 4245** (plan §3.7). It must never
  hang forever. It rejects orders while one is in progress (single-cup
  machine) and logs clearly. Include a `--serial` path argument (default
  `/dev/arduino`).
- **Firmware** `hardware/firmware/VM_code.ino`: port forward from the old
  file, **only** the changes needed: `Serial.println("STATUS:DONE")` before
  the end-of-cycle reset; motors 5–6 per decision 1; a bounded homing wait is
  **Milestone 5** (note it, don't do it unless trivial and clearly
  separated). Firmware can't be compiled here unless `arduino-cli` exists. If
  it doesn't, say so in SIGNOFF and keep the changes minimal and reviewable.
- **Fakes / test rig:** `tools/fake_dispense_bridge.py` (Level 0: listens on
  4242, replies `DONE`/`TIMEOUT` on 4245 after a configurable delay, with
  `--mode done|timeout|silent`) and `tools/fake_arduino_serial.py` (Level 1:
  speaks the firmware's serial protocol with realistic delays, `--fault`
  modes such as never sending `STATUS:DONE`). Update `tools/udp_monitor.py`
  and docs as needed.
- **App: dispensing screen** (PDF page 5, decision 3). A `PacketPeerUDP`
  **bound** on 4245 (the first receiving socket in the app; make the
  host/port configurable in `local_settings.bridge` so tests bind an
  ephemeral port). It accepts only messages whose `order_id` matches
  `OrderState.order_id`. Progress is estimated from
  `timing.dispense_expected_sec` (the ~35–55 s firmware cycle; pick a sane
  default and make the bar never reach 100% before DONE). On `DONE`: 100%,
  the check state, "Collect from the hatch below", "Returning to menu in 6s"
  countdown, then `Nav.go_idle()`. On `TIMEOUT`, or **no message within the
  safety cap** (~90 s, `timing.dispense_safety_cap_sec`): show
  `dispensing_timeout`, then return. Use **wall-clock** timing (see
  CLAUDE.md: `SceneTreeTimer` can fire early). No maintenance check. New
  theme variations and Palette tokens for the lime screen go through
  `tools/build_theme.gd` + `palette.gd`, and all copy goes in
  `local_settings.json`.
- **Out of scope (note it in the README):** telemetry and `STATUS:*` stage
  reformatting + `FAULT:HOMING_TIMEOUT` (Milestone 5), sale reporting
  (Milestone 6), refunds, Pi deployment (Milestone 8), the real Razorpay
  test-mode check (Milestone 2 Part B, pending with the product owner; don't
  block on it).

## 3. Phase A — write the stories

- Create `devdocs/stories/dispensing/` with `README.md` (goals, execution
  order table, Definition of Done, Decisions, protocol table, page-5 design
  measurements) and `DSP-01…DSP-NN-*.md`. Every story needs: a user story,
  plan refs, dependencies, an exact Deliverables list, a Spec concrete enough
  to implement without guessing (message formats, ports, settings keys,
  state tables), Acceptance criteria as checkable items with named tests, and
  Out of scope.
- Verify risky assumptions with a quick spike before writing them into a
  story (for example `PacketPeerUDP.bind` + `wait`/poll in headless Godot,
  whether `pyserial`/`socat`/`arduino-cli` exist, PTY-based serial fakes on
  macOS). Say in the story what you verified.
- Commit the stories alone: `Add dispensing story set (DSP-01..NN, Milestone 4)`.

## 4. Phase B — execute

- For each story in order: implement, add the tests it names, then run
  `tools/run_tests.sh && tools/check_boot.sh` (plus
  `python3 -m unittest …` for any Python you add; give the bridge and fakes
  their own unittest files). Re-run timing-sensitive tests 2–3×. For UI work,
  screenshot with `tools/screenshot.sh` and **look at it** against PDF page 5.
  Then commit `DSP-NN: <title>`.
- **End-to-end checks** (record in `devdocs/stories/dispensing/SIGNOFF.md`):
  - **Level 0:** full app flow on mock payments (`paid_after_3`) with
    `tools/fake_dispense_bridge.py`. Cover done, timeout, and silent (the
    safety cap).
  - **Level 1:** the real rewritten bridge + the fake Arduino. Cover a normal
    cycle and the never-DONE fault.
  - Use the temporary walker technique from CLAUDE.md (don't commit it), and
    capture screenshots of blending / done / timeout.
  - Mark Level 2/3 as pending manual steps with exact instructions for when
    hardware is available.
- **Finish:**
  - Update plan §0 (decisions), §3.6/§3.7/§4/§5 (Milestone 4 status),
    README.md (how to run the fakes and the bridge), and CLAUDE.md (new
    rules, gotchas and commands you learned). Commit.
  - Leave the tree clean, and make sure no background mock servers, fakes or
    monitors are left running.

## 5. When you're done, report

A short summary: the stories and commits, test counts, which end-to-end
levels passed, any issues found and fixed, anything you couldn't verify (for
example firmware compilation), and the open items (motor 5–6 wiring, refund
policy, Level 2/3 hardware runs, Milestone 2 Part B).
