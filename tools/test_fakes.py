"""Tests for the test-rig fakes, plus the automated Level 1 run (real bridge + fake Arduino).
Run: python3 -m unittest tools/test_fakes.py"""
import json
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
ID2 = "01J8Z3K4M5N6P7Q8R9S0T1V2W4"
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


class FakeBridgeTelemetryTests(unittest.TestCase):
    def test_fake_bridge_cycle_event(self):
        f = fb.FakeBridge("done", delay=4.0, logger=QUIET)
        f.handle("ORDER %s P1 B2" % ID, 0.0)
        self.assertEqual(f.due_events(3.9), [])
        [rec] = f.due_events(4.0)
        self.assertEqual((rec["event_type"], rec["order_id"], rec["result"], rec["fault"]),
                         ("dispense_cycle", ID, "DONE", None))
        self.assertEqual([s["stage"] for s in rec["stages"]],
                         ["WATER_FILL_1_DONE", "PROTEIN_DISPENSED", "WATER_FILL_2_DONE", "MIX_DONE",
                          "HOMING_START", "HOMING_DONE", "DONE"])
        self.assertEqual(rec["stages"][-1]["t_offset_ms"], 4000, "squeezed into --delay")

    def test_fake_bridge_homing_fault_window(self):
        f = fb.FakeBridge("done", delay=2.0, logger=QUIET, homing_fault_sec=10.0)
        f.handle("ORDER %s P1 B2" % ID, 0.0)
        self.assertEqual(f.due(2.0), ["DONE %s" % ID])
        kinds = [e["event_type"] for e in f.due_events(2.0)]
        self.assertEqual(kinds, ["dispense_cycle", "machine_fault"])
        self.assertEqual(f.status(5.0)["machine_fault"], "HOMING_TIMEOUT")
        f.handle("ORDER %s P1 B2" % ID2, 5.0)
        self.assertEqual(f.due(5.0), ["REJECTED %s machine_fault" % ID2])
        self.assertEqual(sorted(e["event_type"] for e in f.due_events(12.0)), ["dispense_cycle", "machine_ok"])
        self.assertIsNone(f.status(12.0)["machine_fault"])

    def test_fake_bridge_telemetry_over_udp(self):
        results, telemetry = _udp_listener(), _udp_listener()
        args = fb.build_parser().parse_args([
            "--order-port", "0", "--result-port", str(results.getsockname()[1]),
            "--telemetry-port", str(telemetry.getsockname()[1]), "--heartbeat-sec", "0.3"])
        stop, ports = threading.Event(), []
        t = threading.Thread(target=fb.serve, args=(fb.FakeBridge("done", 0.2, QUIET), args, stop, ports.append),
                             kwargs={"logger": QUIET})
        t.start()
        try:
            _wait_for(lambda: ports)
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.sendto(("ORDER %s P2 B2" % ID).encode(), ("127.0.0.1", ports[0]))
            s.close()
            self.assertEqual(results.recvfrom(1024)[0].decode(), "DONE %s" % ID)
            events = _collect_events(telemetry, 1.0)
            kinds = [e["event_type"] for e in events]
            self.assertEqual(kinds.count("dispense_cycle"), 1)
            self.assertGreaterEqual(kinds.count("bridge_status"), 3, "heartbeats at the interval")
        finally:
            stop.set()
            t.join(2)
            results.close()
            telemetry.close()


class FakeArduinoTests(unittest.TestCase):
    def _run(self, fake, command, until=500.0):
        fake.feed(command, 0.0)
        return fake.due(until)

    def test_fake_arduino_cycle(self):
        fake = fa.FakeArduino(logger=QUIET)
        lines = self._run(fake, b"12\n")
        self.assertEqual(lines, ["STATUS:WATER_FILL_1_DONE", "STATUS:PROTEIN_DISPENSED 1",
                                 "STATUS:WATER_FILL_2_DONE", "STATUS:MIX_DONE", "STATUS:HOMING_START",
                                 "STATUS:HOMING_DONE", "STATUS:DONE",
                                 "STATUS:BOOT", "STATUS:HOMING_START", "STATUS:HOMING_DONE"])
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
        self.assertEqual(never[-1], "STATUS:MIX_DONE", "hangs after mixing")
        silent = fa.FakeArduino(fault="silent", logger=QUIET)
        silent.boot(0.0)
        self.assertEqual(self._run(silent, b"12\n", until=1e9), [])
        disc = fa.FakeArduino(fault="disconnect", logger=QUIET)
        lines = self._run(disc, b"12\n", until=1e9)
        self.assertNotIn("STATUS:DONE", lines)
        self.assertIsNotNone(disc.disconnect_at)

    def test_fake_arduino_homing_timeout(self):
        fake = fa.FakeArduino(fault="homing_timeout", logger=QUIET)
        fake.boot(0.0)
        boot = fake.due(20.5)
        self.assertEqual(boot, ["STATUS:BOOT", "STATUS:HOMING_START", "FAULT:HOMING_TIMEOUT"])
        fake.feed(b"12\n", 30.0)
        self.assertEqual(fake.due(30.0), ["FAULT:NOT_HOMED"])
        later = fake.due(1000.0)
        self.assertNotIn("STATUS:WATER_FILL_1_DONE", later)
        starts = [0.0] + [round(t) for t, line in fa.failed_homing_script(0.0, 5) if line == "STATUS:HOMING_START"][1:]
        self.assertEqual(starts, [0.0, 80, 220, 480, 980], "the firmware's back-off")

    def test_fake_arduino_homing_flaky(self):
        fake = fa.FakeArduino(fault="homing_flaky", logger=QUIET)
        lines = self._run(fake, b"12\n", until=1e9)
        i = lines.index("STATUS:MIX_DONE")
        self.assertEqual(lines[i:], ["STATUS:MIX_DONE", "STATUS:HOMING_START", "FAULT:HOMING_TIMEOUT",
                                     "STATUS:DONE", "STATUS:BOOT", "STATUS:HOMING_START", "STATUS:HOMING_DONE"])
        fake.feed(b"12\n", 1e9 + 1)
        self.assertNotIn("FAULT:HOMING_TIMEOUT", fake.due(2e9), "flaky only once")

    def test_commands_during_cycle_are_dropped(self):
        fake = fa.FakeArduino(logger=QUIET)
        fake.feed(b"12\n", 0.0)
        fake.feed(b"22\n", 10.0)
        lines = fake.due(1e9)
        self.assertEqual(lines.count("STATUS:DONE"), 1)
        self.assertNotIn("STATUS:PROTEIN_DISPENSED 2", lines)
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
        self.telemetry = _udp_listener()
        args = udprxtx.build_parser().parse_args([
            "--serial", paths[0], "--order-port", "0", "--result-port", str(self.results.getsockname()[1]),
            "--deadline", str(deadline), "--recover-sec", "0.5", "--reopen-sec", "60",
            "--telemetry-port", str(self.telemetry.getsockname()[1]), "--heartbeat-sec", "0.5"])
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
        self.telemetry.close()
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


    def _events(self, seconds):
        return [e for e in _collect_events(self.telemetry, seconds) if e["event_type"] != "bridge_status"]

    def test_level1_telemetry(self):
        self._start()
        _collect_events(self.telemetry, 0.1)   # drop startup heartbeats
        reply, _ = self._order(1)
        self.assertEqual(reply, "DONE %s" % ID)
        [rec] = [e for e in self._events(0.5) if e["event_type"] == "dispense_cycle"]
        self.assertEqual((rec["order_id"], rec["result"], rec["fault"]), (ID, "DONE", None))
        self.assertEqual([st["stage"] for st in rec["stages"]],
                         ["WATER_FILL_1_DONE", "PROTEIN_DISPENSED", "WATER_FILL_2_DONE", "MIX_DONE",
                          "HOMING_START", "HOMING_DONE", "DONE"])
        offsets = [st["t_offset_ms"] for st in rec["stages"]]
        self.assertEqual(offsets, sorted(offsets))

    def test_level1_homing_timeout(self):
        self._start(fault="homing_timeout")
        time.sleep(0.3)   # boot homing fails at 20 s x 0.02 = 0.4 s
        events = self._events(0.5)
        self.assertIn("machine_fault", [e["event_type"] for e in events])
        reply, took = self._order(1)
        self.assertEqual(reply, "REJECTED %s machine_fault" % ID)
        self.assertLess(took, 0.5)
        self.assertEqual(self.fake.commands, [], "nothing written to the board")

    def test_level1_homing_flaky(self):
        self._start(fault="homing_flaky")
        reply, _ = self._order(1)
        self.assertEqual(reply, "DONE %s" % ID, "the drink counts (decision 3)")
        events = self._events(1.0)
        kinds = [e["event_type"] for e in events if e["event_type"] != "dispense_cycle"]
        self.assertEqual(kinds, ["machine_fault", "machine_ok"], "fault at the final homing, ok after reboot")
        self.assertEqual(events[[e["event_type"] for e in events].index("machine_fault")]["order_id"], ID)
        [rec] = [e for e in events if e["event_type"] == "dispense_cycle"]
        self.assertEqual((rec["result"], rec["fault"]), ("DONE", "HOMING_TIMEOUT"))


class CliTests(unittest.TestCase):
    def test_help_and_stdlib_only(self):
        stdlib = set(getattr(sys, "stdlib_module_names", ())) or {
            "argparse", "datetime", "json", "os", "pty", "select", "signal", "socket", "sys", "threading",
            "time", "tty", "typing"}
        for script in ("fake_dispense_bridge.py", "fake_arduino_serial.py"):
            out = subprocess.run([sys.executable, os.path.join(HERE, script), "--help"],
                                 capture_output=True, text=True, timeout=10)
            self.assertEqual(out.returncode, 0, script)
            with open(os.path.join(HERE, script)) as f:
                imports = {line.split()[1].split(".")[0] for line in f
                           if line.startswith("import ") or line.startswith("from ")}
            self.assertLessEqual(imports - {"udprxtx", "fake_arduino_serial"}, stdlib, script)


def _udp_listener():
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.bind(("127.0.0.1", 0))
    sock.settimeout(3)
    return sock


def _collect_events(sock, seconds):
    events, deadline = [], time.monotonic() + seconds
    while time.monotonic() < deadline:
        sock.settimeout(max(0.01, deadline - time.monotonic()))
        try:
            events.append(json.loads(sock.recvfrom(4096)[0]))
        except socket.timeout:
            break
    return events


def _wait_for(cond, timeout=3.0):
    deadline = time.monotonic() + timeout
    while not cond() and time.monotonic() < deadline:
        time.sleep(0.02)
    if not cond():
        raise AssertionError("timed out waiting")


if __name__ == "__main__":
    unittest.main()
