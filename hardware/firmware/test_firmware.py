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


class M4FirmwareTests(unittest.TestCase):
    def test_boot_homes(self):
        r = Run(*_with(start_pos=30000, until=10))
        self.assertEqual(r.texts()[:4], [" ", "Reset!", "Homing", "Home reached"])
        self.assertLess(r.first("Home reached"), 5.0)
        self.assertEqual(r.end["carriage"], 0)

    def test_cycle_hopper1(self):
        r = Run(*_with(start_pos=30000, at="5:12", until=200))
        t = r.texts()
        done = r.first("STATUS:DONE")
        self.assertIsNotNone(done)
        self.assertTrue(60 <= done - 5 <= 85, "cycle took %.1f s" % (done - 5))
        self.assertEqual(t.count("STATUS:DONE"), 1, "no second cycle after the reset")
        self.assertEqual(t.count("<watchdog reset>"), 1)
        self.assertEqual(t[-1], "Home reached", "clean boot after the reset")
        self.assertEqual(t.index("Mix Done") + 1, t.index("STATUS:DONE"))

    def test_each_hopper_dispenses_its_motor(self):
        for hopper, pin in MOTOR_PINS.items():
            r = Run(*_with(at="1:%d2" % hopper, until=150))
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

    def test_broken_limit_hangs_m4(self):
        # Documents the M4 hang that TEL-02 fixes: homing waits forever.
        r = Run(*_with(start_pos=30000, broken_limit="0:10000", until=120))
        self.assertIn("Homing", r.texts())
        self.assertNotIn("Home reached", r.texts())


if __name__ == "__main__":
    unittest.main()
