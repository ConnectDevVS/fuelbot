"""Tests for the test-rig fakes, plus the automated Level 1 run (real bridge + fake Arduino).
Run: python3 -m unittest tools/test_fakes.py"""
import os
import socket
import subprocess
import sys
import threading
import time
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
BRIDGE_DIR = os.path.join(HERE, "..", "hardware", "bridge")
sys.path.insert(0, HERE)
sys.path.insert(0, BRIDGE_DIR)
import fake_arduino_serial as fa  # noqa: E402
import fake_dispense_bridge as fb  # noqa: E402
import udprxtx  # noqa: E402

ID = "01J8Z3K4M5N6P7Q8R9S0T1V2W3"
QUIET = lambda _m: None  # noqa: E731


class FakeBridgeTests(unittest.TestCase):
    def test_fake_bridge_modes(self):
        expected = {"done": "DONE %s" % ID, "timeout": "TIMEOUT %s deadline" % ID}
        for mode, reply in expected.items():
            f = fb.FakeBridge(mode, delay=5.0, logger=QUIET)
            f.handle("ORDER %s P1 B2" % ID, 100.0)
            self.assertEqual(f.due(104.9), [], mode)
            self.assertEqual(f.due(105.0), [reply], mode)
            self.assertEqual(f.due(200.0), [], "once (%s)" % mode)
        f = fb.FakeBridge("reject", delay=5.0, logger=QUIET)
        f.handle("ORDER %s P1 B2" % ID, 100.0)
        self.assertEqual(f.due(100.0), ["REJECTED %s busy" % ID], "reject is immediate")
        f = fb.FakeBridge("silent", delay=0.0, logger=QUIET)
        f.handle("ORDER %s P1 B2" % ID, 100.0)
        self.assertEqual(f.due(1e9), [], "silent")

    def test_fake_bridge_bad_and_cancel(self):
        f = fb.FakeBridge("done", delay=1.0, logger=QUIET)
        f.handle("ORDER %s P9 B2" % ID, 0.0)
        f.handle("CANCEL %s" % ID, 0.0)
        f.handle("Y", 0.0)
        self.assertEqual(f.due(10.0), ["REJECTED %s bad_order" % ID])

    def test_fake_bridge_over_udp(self):
        results = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        results.bind(("127.0.0.1", 0))
        results.settimeout(2)
        args = fb.build_parser().parse_args(["--order-port", "0", "--result-port", str(results.getsockname()[1])])
        stop, ports = threading.Event(), []
        t = threading.Thread(target=fb.serve, args=(fb.FakeBridge("done", 0.2, QUIET), args, stop, ports.append),
                             kwargs={"logger": QUIET})
        t.start()
        try:
            _wait_for(lambda: ports)
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.sendto(("ORDER %s P2 B2" % ID).encode(), ("127.0.0.1", ports[0]))
            self.assertEqual(results.recvfrom(1024)[0].decode(), "DONE %s" % ID)
            s.close()
        finally:
            stop.set()
            t.join(2)
            results.close()


class FakeArduinoTests(unittest.TestCase):
    def _run(self, fake, command, until=500.0):
        fake.feed(command, 0.0)
        return fake.due(until)

    def test_fake_arduino_cycle(self):
        fake = fa.FakeArduino(logger=QUIET)
        lines = self._run(fake, b"12\n")
        self.assertEqual(lines, ["Water Filled in Cup", "Protein 1 Dispensed", "Water Filled in Cup",
                                 "Shake Frothing Done", "Homing", "Home reached", "Mix Done", "STATUS:DONE",
                                 " ", "Reset!", "Homing", "Home reached"])
        # Firmware estimate for hopper 1 (README decision 8): ~72.8 s.
        self.assertAlmostEqual(fa.cycle_seconds(1), 72.8, delta=0.73)
        for hopper, estimate in ((2, 74.9), (3, 68.3), (4, 77.8)):
            self.assertAlmostEqual(fa.cycle_seconds(hopper), estimate, delta=estimate * 0.01, msg=hopper)

    def test_time_scale(self):
        fake = fa.FakeArduino(time_scale=0.02, logger=QUIET)
        fake.feed(b"12\n", 0.0)
        done_at = fa.cycle_seconds(1) * 0.02
        self.assertNotIn("STATUS:DONE", fake.due(done_at - 0.01))
        self.assertIn("STATUS:DONE", fake.due(done_at + 0.001))

    def test_fake_arduino_validation(self):
        cases = {b"52\n": ["FAULT:HOPPER_UNASSIGNED 5"], b"62\r\n": ["FAULT:HOPPER_UNASSIGNED 6"],
                 b"72\n": ["FAULT:BAD_COMMAND"], b"13\n": ["FAULT:BAD_COMMAND"],
                 b"ab\n": ["FAULT:BAD_COMMAND"], b"123\n": ["FAULT:BAD_COMMAND"], b"\n": []}
        for command, expected in cases.items():
            self.assertEqual(self._run(fa.FakeArduino(logger=QUIET), command), expected, command)
        wired = fa.FakeArduino(assigned=(1, 2, 3, 4, 5), logger=QUIET)
        self.assertIn("STATUS:DONE", self._run(wired, b"52\n"))

    def test_fake_arduino_faults(self):
        never = self._run(fa.FakeArduino(fault="never_done", logger=QUIET), b"12\n", until=1e9)
        self.assertNotIn("STATUS:DONE", never)
        self.assertEqual(never[-1], "Homing", "stuck in homeAxis()")
        silent = fa.FakeArduino(fault="silent", logger=QUIET)
        silent.boot(0.0)
        self.assertEqual(self._run(silent, b"12\n", until=1e9), [])
        disc = fa.FakeArduino(fault="disconnect", logger=QUIET)
        lines = self._run(disc, b"12\n", until=1e9)
        self.assertNotIn("STATUS:DONE", lines)
        self.assertIsNotNone(disc.disconnect_at)

    def test_commands_during_cycle_are_dropped(self):
        fake = fa.FakeArduino(logger=QUIET)
        fake.feed(b"12\n", 0.0)
        fake.feed(b"22\n", 10.0)
        lines = fake.due(1e9)
        self.assertEqual(lines.count("STATUS:DONE"), 1)
        self.assertNotIn("Protein 2 Dispensed", lines)
        self.assertEqual(fake.commands, ["12", "22"])


class Level1Tests(unittest.TestCase):
    """The real udprxtx.run() against the fake Arduino over a PTY (plan §6 Level 1)."""

    def _start(self, fault="none", deadline=5.0):
        self.fake = fa.FakeArduino(time_scale=0.02, fault=fault, logger=QUIET)
        self.stop = threading.Event()
        paths = []
        self.fake_thread = threading.Thread(target=fa.serve, args=(self.fake, self.stop, paths.append),
                                            kwargs={"logger": QUIET})
        self.fake_thread.start()
        _wait_for(lambda: paths)
        self.results = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        self.results.bind(("127.0.0.1", 0))
        self.results.settimeout(deadline + 3)
        args = udprxtx.build_parser().parse_args([
            "--serial", paths[0], "--order-port", "0", "--result-port", str(self.results.getsockname()[1]),
            "--deadline", str(deadline), "--recover-sec", "0.5", "--reopen-sec", "60"])
        ports = []
        self.bridge_thread = threading.Thread(target=udprxtx.run, args=(args, self.stop, ports.append),
                                              kwargs={"logger": QUIET})
        self.bridge_thread.start()
        _wait_for(lambda: ports)
        time.sleep(0.7)   # serial open + recovery (boot banner or recover_sec)
        self.order_port = ports[0]

    def tearDown(self):
        self.stop.set()
        self.bridge_thread.join(3)
        self.fake_thread.join(3)
        self.results.close()
        self.assertFalse(self.bridge_thread.is_alive(), "bridge stopped")
        self.assertFalse(self.fake_thread.is_alive(), "fake stopped")

    def _order(self, hopper=1):
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.sendto(("ORDER %s P%d B2" % (ID, hopper)).encode(), ("127.0.0.1", self.order_port))
        s.close()
        t0 = time.monotonic()
        reply = self.results.recvfrom(1024)[0].decode()
        return reply, time.monotonic() - t0

    def test_level1_normal_cycle(self):
        self._start()
        reply, took = self._order(1)
        self.assertEqual(reply, "DONE %s" % ID)
        self.assertEqual(self.fake.commands, ["12"], "exactly one command on the wire")
        self.assertGreater(took, fa.cycle_seconds(1) * 0.02 * 0.9, "waited for the cycle")

    def test_level1_never_done(self):
        self._start(fault="never_done", deadline=2.0)
        reply, took = self._order(1)
        self.assertEqual(reply, "TIMEOUT %s deadline" % ID)
        self.assertGreaterEqual(took, 1.9)

    def test_level1_unassigned_hopper(self):
        self._start()
        reply, took = self._order(5)
        self.assertEqual(reply, "TIMEOUT %s fault:HOPPER_UNASSIGNED" % ID)
        self.assertLess(took, 1.0, "fails at once, not at the deadline")

    def test_level1_disconnect(self):
        self._start(fault="disconnect")
        reply, _ = self._order(1)
        self.assertEqual(reply, "TIMEOUT %s serial_lost" % ID)


class CliTests(unittest.TestCase):
    def test_help_and_stdlib_only(self):
        stdlib = set(getattr(sys, "stdlib_module_names", ())) or {
            "argparse", "datetime", "os", "pty", "select", "signal", "socket", "sys", "threading",
            "time", "tty", "typing"}
        for script in ("fake_dispense_bridge.py", "fake_arduino_serial.py"):
            out = subprocess.run([sys.executable, os.path.join(HERE, script), "--help"],
                                 capture_output=True, text=True, timeout=10)
            self.assertEqual(out.returncode, 0, script)
            with open(os.path.join(HERE, script)) as f:
                imports = {line.split()[1].split(".")[0] for line in f
                           if line.startswith("import ") or line.startswith("from ")}
            self.assertLessEqual(imports - {"udprxtx"}, stdlib, script)


def _wait_for(cond, timeout=3.0):
    deadline = time.monotonic() + timeout
    while not cond() and time.monotonic() < deadline:
        time.sleep(0.02)
    if not cond():
        raise AssertionError("timed out waiting")


if __name__ == "__main__":
    unittest.main()
