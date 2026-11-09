# FuelBot hardware

The machine side of FuelBot: the Arduino Mega firmware
([firmware/VM_code.ino](firmware/VM_code.ino)), the bridge that runs on the
Pi between the kiosk app (UDP) and the board (serial)
([bridge/udprxtx.py](bridge/udprxtx.py)), and fakes for testing without a
board. Commands run from the repo root. Rules and gotchas:
[CLAUDE.md](CLAUDE.md).

## Requirements

- Python 3.9+, standard library only
- clang++ for the firmware checks and simulator

## Tests

```bash
python3 -m unittest hardware/bridge/test_udprxtx.py hardware/tools/test_fakes.py hardware/firmware/test_firmware.py
hardware/tools/check_firmware.sh     # host syntax check of the sketch + simulator build (not an AVR compile)
```

## Running with the app

The app sends one UDP datagram per paid order to the bridge on 4242,
`ORDER <order_id> P<hopper> B<n>`. The bridge replies on 4245 with
`DONE <order_id>`, `TIMEOUT <order_id> <reason>` or
`REJECTED <order_id> <reason>`, and sends telemetry (cycles, faults, a 10 s
heartbeat) as JSON on 4246. Protocol and decisions:
[dispensing README](../docs/stories/dispensing/README.md),
[telemetry README](../docs/stories/telemetry/README.md).

No hardware (Level 0): a fake bridge that answers every order.

```bash
kiosk/tools/dev_run.sh                                                # terminal 1: app + mock
python3 hardware/tools/fake_dispense_bridge.py --mode done --delay 8  # terminal 2 (also: timeout | reject | silent)
python3 hardware/tools/fake_dispense_bridge.py --mode done --delay 4 --homing-fault-sec 20   # a homing fault after the drink
```

Real bridge, fake Arduino (Level 1): the fake opens a PTY and speaks the
firmware's serial protocol.

```bash
python3 hardware/tools/fake_arduino_serial.py --time-scale 0.1 --link "$TMPDIR/fuelbot-arduino"   # --fault never_done|silent|disconnect|homing_timeout|homing_flaky
python3 hardware/bridge/udprxtx.py --serial "$TMPDIR/fuelbot-arduino" --recover-sec 3
kiosk/tools/dev_run.sh
```

Real board (Level 2, pending hardware): flash `hardware/firmware/VM_code.ino`
to the Mega, then `python3 hardware/bridge/udprxtx.py --serial /dev/tty.usbmodem…`
(on the Pi, `/dev/arduino`, the default). Step-by-step Level 2/3 checks are
in the [dispensing SIGNOFF](../docs/stories/dispensing/SIGNOFF.md).

Watch what the app sends the bridge: `python3 hardware/tools/udp_monitor.py`
(port 4242; it replaces the bridge while it runs). **Run exactly one bridge**
(real, fake or monitor) and one app.
