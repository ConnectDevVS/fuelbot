# DSP-06 — End-to-end verification (Levels 0 and 1) and sign-off

**As the** product owner, **I want** evidence that a paid order reaches the
bridge, the bridge reaches the (fake) Arduino, and the screen reacts to what
really happened, **so that** Milestone 4 can be called done in software,
with the hardware steps written down for when a board is available.

Plan refs: §5 Milestone 4, §6, §7 steps 5, 7, 8; README decision 4.
Depends on: DSP-01 … DSP-05.

## Deliverables

```
devdocs/stories/dispensing/SIGNOFF.md
mockserver/responses/config/hopper_shuffle.json   # guava↔electro hoppers swapped (plan §7 step 5)
devdocs/plans/greenfield-rewrite.md     # §0 log + status, §3.6, §3.7, §4, §5 (M4 status), §6 notes
README.md                               # running the bridge and the fakes
CLAUDE.md                               # new rules, commands and gotchas
```

A temporary walker scene and screenshots live only in the scratchpad and in
`.screenshots/dsp-e2e/` (gitignored). **Not committed.**

## Spec

### Level 0: app + mock payments + `fake_dispense_bridge.py`

Run: mock on :8787 (`dev_setup.gd` = mock payments), payments scenario
`paid_after_3`, fake bridge with `--delay 4`. The walker (CLAUDE.md
technique) taps attract → first card → Proceed, then waits. Record the fake
bridge's log, the app's log, and screenshots of blending, done and failed.

| Flow | Fake bridge | Expected |
|------|-------------|----------|
| done | `--mode done` | `ORDER <ulid> P1 B2` logged by the fake, blending → DONE → collect → attract after 6 s |
| timeout | `--mode timeout` | FAILED with the support message → attract after 10 s |
| silent | `--mode silent` (`dispense_safety_cap_sec` lowered via `user://local_settings.override.json` for the run) | FAILED at the cap, not before |
| reject | `--mode reject` | FAILED immediately |

Plan §7 step 5 (hopper vs list position): every mock flavor's hopper matches
its list position, so a new config scenario `hopper_shuffle` (`extends`
default, `body_patch` giving guava hopper 3 and electro hopper 1, merged by
id) is added. With it, tapping the first card (guava) must send
`ORDER <ulid> P3 B2`.

### Level 1: app + mock payments + real `udprxtx.py` + `fake_arduino_serial.py`

The fake Arduino at `--time-scale 0.1` (a ~7 s cycle), `--link` a stable
path; the bridge `--serial` that path, `--recover-sec 3`.

| Flow | Fake Arduino | Expected |
|------|--------------|----------|
| normal cycle | default | bridge writes `12`, reads to `STATUS:DONE`, sends `DONE`; app DONE → attract; bridge RECOVERING → READY on `Home reached` |
| never-DONE | `--fault never_done`, bridge `--deadline 15` | bridge `TIMEOUT <id> deadline` at ~15 s; app FAILED |
| hopper 5 unassigned | default (assigned 1–4); walker taps the cookie card (hopper 5) | fake prints `FAULT:HOPPER_UNASSIGNED 5`; bridge `TIMEOUT <id> fault:HOPPER_UNASSIGNED`; app FAILED at once |

Also recorded: the automated Level 1 tests in `tools/test_fakes.py`.

### Level 2 / Level 3 (pending, written as exact steps)

Level 2 (real Mega, LEDs instead of actuators): flash with the Arduino IDE
or `arduino-cli compile --fqbn arduino:avr:mega` + `upload`; serial monitor
at 9600: the `Reset!`/`Homing`/`Home reached` banner (limit switch pressed by
hand), send `12` → the LED sequence, then `Mix Done`, `STATUS:DONE` and the
reset; send `52` → `FAULT:HOPPER_UNASSIGNED 5` and no LED; then run
`udprxtx.py --serial /dev/tty…` with `fake_dispense_bridge` stopped and the
app running. Level 3 (bench): time 5 cycles per hopper, then set
`dispense_expected_sec`, `--deadline` and `dispense_safety_cap_sec` from the
maximum (cap > deadline > max cycle × 1.3).

## Acceptance criteria

- [ ] `python3 -m unittest mockserver/test_server.py` still passes with the
      new scenario, and `hopper_shuffle` passes `validate_config()` (a
      fixture test).
- [ ] SIGNOFF.md: automated results (GDScript count, Python test counts,
      boot, firmware syntax), Level 0 table (4 flows), Level 1 table (3 flows
      plus automated), screenshots listed, issues found and fixed, Level 2/3
      pending checklist, and open items.
- [ ] Plan §0: decisions logged (README decisions 1–14) and status; §3.6/§3.7
      rewritten to match what was built (one screen, protocol v2, the listener
      in `Bridge`, timings); §4 tree updated (`hardware/`, no `complete/`);
      §5 Milestone 4 status 🟡 "built; Level 0/1 PASS; Level 2/3 pending
      hardware".
- [ ] README.md: how to run the fakes, the bridge, and the Python tests.
- [ ] CLAUDE.md: protocol v2 rules, new commands, the new gotchas.
- [ ] Tree clean. `pgrep -f "mockserver/server.py|fake_dispense_bridge|fake_arduino_serial|udprxtx.py|udp_monitor"`
      is empty.

## Out of scope

Running Levels 2/3 (no hardware); Milestone 2 Part B.
