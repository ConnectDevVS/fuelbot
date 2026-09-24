"""Behavioural tests of hardware/firmware/VM_code.ino on the host simulator (host_sim/sim.cpp).
Run: python3 -m unittest hardware/firmware/test_firmware.py   (needs clang++)"""
import os
import shutil
import subprocess
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
SIM_DIR = os.path.join(HERE, "host_sim")
_build = {}

MOTOR_PINS = {1: 2, 2: 3, 3: 4, 4: 5}
PUMP_PIN = 6


def setUpModule():
    cxx = shutil.which(os.environ.get("CXX", "clang++"))
    if not cxx:
        raise unittest.SkipTest("clang++ not found: firmware simulator tests skipped")
    tmp = tempfile.mkdtemp(prefix="fwsim")
    binary = os.path.join(tmp, "sim")
    subprocess.run([cxx, "-std=c++11", "-Wall", "-Wno-tautological-compare", "-I", SIM_DIR,
                    "-x", "c++", os.path.join(SIM_DIR, "sim.cpp"), "-o", binary],
                   check=True, capture_output=True, text=True)
    _build["bin"], _build["tmp"] = binary, tmp


def tearDownModule():
    if "tmp" in _build:
        shutil.rmtree(_build["tmp"], ignore_errors=True)


class Run:
    """One simulator run: .lines = [(t, text)], .end = {carriage, ena, low_writes{pin:n}, mix_pwm, z_steps}."""

    def __init__(self, *args):
        out = subprocess.run([_build["bin"]] + [str(a) for a in args], check=True,
                             capture_output=True, text=True, timeout=60).stdout
        self.lines, self.end = [], {}
        for raw in out.splitlines():
            head, _, rest = raw.partition("\t")
            if head == "END":
                for field in rest.split("\t"):
                    k, _, v = field.partition("=")
                    if k == "low_writes":
                        self.end[k] = {int(p): int(n) for p, n in (x.split(":") for x in v.split(","))}
                    else:
                        self.end[k] = int(v)
            else:
                self.lines.append((float(head), rest))

    def texts(self):
        return [t for _, t in self.lines]

    def first(self, text, after=-1.0):
        return next((t for t, s in self.lines if s == text and t > after), None)

    def moved_anything(self):
        return any(self.end["low_writes"].values()) or self.end["mix_pwm"] > 0


def _with(**kw):
    args = []
    for k, v in kw.items():
        flag = "--" + k.replace("_", "-")
        for item in (v if isinstance(v, list) else [v]):
            args += [flag, item]
    return args


CYCLE_STAGES = ["STATUS:WATER_FILL_1_DONE", "STATUS:PROTEIN_DISPENSED 1", "STATUS:WATER_FILL_2_DONE",
                "STATUS:MIX_DONE", "STATUS:HOMING_START", "STATUS:HOMING_DONE", "STATUS:DONE"]


class FirmwareTests(unittest.TestCase):
    def test_boot_homes(self):
        r = Run(*_with(start_pos=30000, until=10))
        self.assertEqual(r.texts()[:3], ["STATUS:BOOT", "STATUS:HOMING_START", "STATUS:HOMING_DONE"])
        self.assertLess(r.first("STATUS:HOMING_DONE"), 5.0)
        self.assertEqual(r.end["carriage"], 0)

    def test_cycle_stage_order(self):
        r = Run(*_with(start_pos=30000, at="5:12", until=200))
        t = r.texts()
        done = r.first("STATUS:DONE")
        self.assertIsNotNone(done)
        self.assertTrue(60 <= done - 5 <= 85, "cycle took %.1f s" % (done - 5))
        i = t.index("STATUS:WATER_FILL_1_DONE")
        self.assertEqual(t[i:i + len(CYCLE_STAGES)], CYCLE_STAGES)
        times = [tt for tt, _ in r.lines]
        self.assertEqual(times, sorted(times), "non-decreasing times")
        self.assertEqual(t[i + len(CYCLE_STAGES)], "<watchdog reset>")
        self.assertEqual(t[-3:], ["STATUS:BOOT", "STATUS:HOMING_START", "STATUS:HOMING_DONE"], "clean boot")
        self.assertEqual(t.count("STATUS:DONE"), 1, "no second cycle after the reset")
        for line in t:
            self.assertTrue(line.startswith(("STATUS:", "FAULT:", "<")), "free-text line %r" % line)

    def test_each_hopper_dispenses_its_motor(self):
        for hopper, pin in MOTOR_PINS.items():
            r = Run(*_with(at="1:%d2" % hopper, until=150))
            self.assertIn("STATUS:PROTEIN_DISPENSED %d" % hopper, r.texts())
            self.assertIsNotNone(r.first("STATUS:DONE"), hopper)
            for other in MOTOR_PINS.values():
                self.assertEqual(r.end["low_writes"][other], 1 if other == pin else 0, (hopper, other))
            self.assertEqual(r.end["low_writes"][PUMP_PIN], 2, "two water fills")
            self.assertGreater(r.end["mix_pwm"], 0)

    def test_unassigned_and_bad_commands(self):
        cases = {"52": "FAULT:HOPPER_UNASSIGNED 5", "62": "FAULT:HOPPER_UNASSIGNED 6",
                 "72": "FAULT:BAD_COMMAND", "13": "FAULT:BAD_COMMAND", "ab": "FAULT:BAD_COMMAND"}
        for command, fault in cases.items():
            r = Run(*_with(start_pos=0, at="2:" + command, until=30))
            self.assertIn(fault, r.texts(), command)
            self.assertFalse(r.moved_anything(), "nothing moves for %s" % command)
            self.assertEqual(r.end["carriage"], 0, command)
            self.assertNotIn("STATUS:DONE", r.texts(), command)

    def test_homing_timeout_at_boot(self):
        r = Run(*_with(start_pos=30000, broken_limit="0:10000", until=60))
        t = r.first("FAULT:HOMING_TIMEOUT")
        self.assertIsNotNone(t, "bounded wait (M4 hung here forever)")
        self.assertAlmostEqual(t, 20.0, delta=0.5)
        self.assertEqual(r.end["ena"], 0, "motor stopped")
        self.assertNotIn("<watchdog reset>", r.texts(), "no reset loop")
        self.assertNotIn("STATUS:HOMING_DONE", r.texts())

    def test_not_homed_refuses_commands(self):
        r = Run(*_with(start_pos=0, broken_limit="0:10000", at="30:12", until=60))
        self.assertIn("FAULT:NOT_HOMED", r.texts())
        self.assertFalse(r.moved_anything(), "no motor or pump while not homed")
        self.assertNotIn("STATUS:WATER_FILL_1_DONE", r.texts())

    def test_retry_backoff(self):
        r = Run(*_with(start_pos=0, broken_limit="0:100000", until=2400))
        starts = [round(t) for t, s in r.lines if s == "STATUS:HOMING_START"]
        faults = [round(t) for t, s in r.lines if s == "FAULT:HOMING_TIMEOUT"]
        self.assertEqual(starts[:7], [0, 80, 220, 480, 980, 1600, 2220])
        self.assertEqual([f - s for s, f in zip(starts, faults)], [20] * len(faults), "20 s per attempt")
        gaps = [starts[i + 1] - faults[i] for i in range(len(starts) - 1)]
        self.assertEqual(gaps[:6], [60, 120, 240, 480, 600, 600], "doubling, capped at 10 min")
        self.assertNotIn("<watchdog reset>", r.texts())

    def test_auto_recovery(self):
        r = Run(*_with(start_pos=0, broken_limit="0:150", at=["150:12", "300:12"], until=450))
        faults = [round(t) for t, s in r.lines if s == "FAULT:HOMING_TIMEOUT"]
        self.assertEqual(faults, [20, 100])
        self.assertAlmostEqual(r.first("FAULT:NOT_HOMED"), 150, delta=0.1)
        self.assertAlmostEqual(r.first("STATUS:HOMING_DONE"), 220, delta=0.5)
        self.assertIsNotNone(r.first("STATUS:DONE", after=300), "a full cycle after recovery")
        self.assertEqual(r.texts().count("STATUS:DONE"), 1)

    def test_end_of_cycle_homing_failure_keeps_drink(self):
        # Cycle from 5 s; the final homing starts at ~74.7 s. Break the switch only then.
        r = Run(*_with(start_pos=0, at="5:12", broken_limit="70:100", until=140))
        t = r.texts()
        i = t.index("STATUS:MIX_DONE")
        self.assertEqual(t[i:i + 4], ["STATUS:MIX_DONE", "STATUS:HOMING_START", "FAULT:HOMING_TIMEOUT", "STATUS:DONE"])
        self.assertEqual(t[i + 4], "<watchdog reset>")
        self.assertIn("STATUS:HOMING_DONE", t[i + 5:], "boot homing after the reset succeeds")
        self.assertEqual(r.end["low_writes"][MOTOR_PINS[1]], 1, "the drink was made")


if __name__ == "__main__":
    unittest.main()
