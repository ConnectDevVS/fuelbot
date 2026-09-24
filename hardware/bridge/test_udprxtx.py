"""Tests for the hardware bridge. Run: python3 -m unittest hardware/bridge/test_udprxtx.py"""
import argparse
import os
import pty
import select
import socket
import subprocess
import sys
import threading
import time
import tty
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import udprxtx  # noqa: E402
from udprxtx import BridgeCore, LinkLost, PosixSerial  # noqa: E402

ID = "01J8Z3K4M5N6P7Q8R9S0T1V2W3"
ID2 = "01J8Z3K4M5N6P7Q8R9S0T1V2W4"


class FakeClock:
    def __init__(self):
        self.now = 1000.0

    def __call__(self):
        return self.now


class CoreHarness:
    def __init__(self, serial_ok=True, write_ok=True, deadline=110.0, recover_sec=15.0):
        self.clock = FakeClock()
        self.sent = []
        self.written = []
        self.serial_ok = serial_ok
        self.write_ok = write_ok
        self.core = BridgeCore(self.sent.append, self._write, lambda: self.serial_ok,
                               clock=self.clock, deadline=deadline, recover_sec=recover_sec,
                               logger=lambda _m: None)

    def _write(self, command):
        if self.write_ok:
            self.written.append(command)
        return self.write_ok

    def ready(self):
        self.core.on_serial_line("Home reached")
        assert self.core.state == udprxtx.READY
        return self


class ParseTests(unittest.TestCase):
    def test_parse_messages(self):
        p = udprxtx.parse_app_message
        self.assertEqual(p("ORDER %s P1 B2" % ID), ("ORDER", ID, 1, 2))
        self.assertEqual(p("ORDER %s P6 B2\n" % ID), ("ORDER", ID, 6, 2))
        self.assertEqual(p("CANCEL %s" % ID), ("CANCEL", ID))
        for bad in ["ORDER %s P0 B2" % ID, "ORDER %s P7 B2" % ID, "ORDER %s P1 B0" % ID,
                    "ORDER %s P1 B2" % ID.lower(), "ORDER 01J8 P1 B2", "ORDER %s P1 B2 extra" % ID,
                    "ORDER %s P12 B2" % ID, "Y", "X", "P1", "", "CANCEL"]:
            self.assertIsNone(p(bad), bad)
        self.assertEqual(udprxtx.parse_order_id_only("ORDER %s P9 B2" % ID), ID)
        self.assertEqual(udprxtx.parse_order_id_only("ORDER %s" % ID), ID)
        self.assertIsNone(udprxtx.parse_order_id_only("ORDER nope P1 B2"))


class CoreTests(unittest.TestCase):
    def test_order_happy_path(self):
        h = CoreHarness().ready()
        h.core.on_app_message("ORDER %s P1 B2" % ID)
        self.assertEqual(h.written, ["12"])
        self.assertEqual(h.core.state, udprxtx.DISPENSING)
        for line in ["Water Filled in Cup", "Protein 1 Dispensed", "Homing", "Home reached", "Mix Done"]:
            h.core.on_serial_line(line)
        self.assertEqual(h.sent, [], "Home reached mid-cycle is not the end")
        h.core.on_serial_line("STATUS:DONE")
        self.assertEqual(h.sent, ["DONE %s" % ID])
        self.assertEqual(h.core.state, udprxtx.RECOVERING)
        h.core.on_serial_line("Reset!")
        h.core.on_serial_line("Home reached")
        self.assertEqual(h.core.state, udprxtx.READY)

    def test_deadline(self):
        h = CoreHarness(deadline=110).ready()
        h.core.on_app_message("ORDER %s P2 B2" % ID)
        h.clock.now += 109.9
        h.core.tick()
        self.assertEqual(h.sent, [])
        h.clock.now += 0.2
        h.core.tick()
        h.core.tick()
        self.assertEqual(h.sent, ["TIMEOUT %s deadline" % ID], "exactly once")
        h.core.on_serial_line("STATUS:DONE")
        self.assertEqual(len(h.sent), 1, "a late DONE is not reported")

    def test_fault_line(self):
        h = CoreHarness().ready()
        h.core.on_app_message("ORDER %s P5 B2" % ID)
        h.core.on_serial_line("FAULT:HOPPER_UNASSIGNED 5")
        self.assertEqual(h.sent, ["TIMEOUT %s fault:HOPPER_UNASSIGNED" % ID])
        self.assertEqual(h.core.state, udprxtx.RECOVERING)

    def test_busy_rejections(self):
        h = CoreHarness()
        h.core.on_app_message("ORDER %s P1 B2" % ID)
        self.assertEqual(h.sent, ["REJECTED %s busy" % ID], "recovering at startup")
        h.ready()
        h.core.on_app_message("ORDER %s P1 B2" % ID2)
        h.core.on_app_message("ORDER %s P3 B2" % ID)
        self.assertEqual(h.sent[-1], "REJECTED %s busy" % ID)
        self.assertEqual(h.written, ["12"], "nothing else written")

    def test_duplicate_order_ignored(self):
        h = CoreHarness().ready()
        h.core.on_app_message("ORDER %s P1 B2" % ID)
        h.core.on_app_message("ORDER %s P1 B2" % ID)
        h.core.on_serial_line("STATUS:DONE")
        h.core.on_serial_line("Home reached")
        h.core.on_app_message("ORDER %s P1 B2" % ID)
        self.assertEqual(h.written, ["12"])
        self.assertEqual(h.sent, ["DONE %s" % ID])

    def test_serial_unavailable(self):
        h = CoreHarness(serial_ok=False)
        h.clock.now += 20
        h.core.tick()
        h.core.on_app_message("ORDER %s P1 B2" % ID)
        self.assertEqual(h.sent, ["REJECTED %s serial_unavailable" % ID])
        h2 = CoreHarness(write_ok=False).ready()
        h2.core.on_app_message("ORDER %s P1 B2" % ID)
        self.assertEqual(h2.sent, ["REJECTED %s serial_unavailable" % ID])
        self.assertEqual(h2.core.state, udprxtx.READY)

    def test_link_lost_mid_order(self):
        h = CoreHarness().ready()
        h.core.on_app_message("ORDER %s P1 B2" % ID)
        h.core.on_link_lost()
        self.assertEqual(h.sent, ["TIMEOUT %s serial_lost" % ID])
        h.core.on_link_restored()
        self.assertEqual(h.core.state, udprxtx.RECOVERING)

    def test_recover_timeout(self):
        h = CoreHarness(recover_sec=15)
        h.clock.now += 14.9
        h.core.tick()
        self.assertEqual(h.core.state, udprxtx.RECOVERING)
        h.clock.now += 0.2
        h.core.tick()
        self.assertEqual(h.core.state, udprxtx.READY)

    def test_bad_order(self):
        h = CoreHarness().ready()
        h.core.on_app_message("ORDER %s P9 B2" % ID)
        h.core.on_app_message("garbage")
        self.assertEqual(h.sent, ["REJECTED %s bad_order" % ID])
        self.assertEqual(h.written, [])

    def test_cancel_is_informational(self):
        h = CoreHarness().ready()
        h.core.on_app_message("CANCEL %s" % ID)
        h.core.on_app_message("ORDER %s P1 B2" % ID)
        h.core.on_app_message("CANCEL %s" % ID)
        self.assertEqual(h.written, ["12"])
        self.assertEqual(h.core.state, udprxtx.DISPENSING)
        self.assertEqual(h.sent, [])


class PosixSerialTests(unittest.TestCase):
    def test_posix_serial_on_pty(self):
        master, slave = pty.openpty()
        tty.setraw(master)
        path = os.ttyname(slave)
        s = PosixSerial(path)
        s.open()
        try:
            s.write_line("12")
            select.select([master], [], [], 1)
            self.assertEqual(os.read(master, 100), b"12\n")
            self.assertEqual(s.read_lines(), [], "nothing yet (non-blocking)")
            os.write(master, b"Homing\r\nSTATUS:")
            select.select([s.fileno()], [], [], 1)
            self.assertEqual(s.read_lines(), ["Homing"], "partial line buffered")
            os.write(master, b"DONE\r\n\r\n")
            select.select([s.fileno()], [], [], 1)
            self.assertEqual(s.read_lines(), ["STATUS:DONE"], "completed; blank dropped")
            os.close(master)
            master = -1
            select.select([s.fileno()], [], [], 1)
            with self.assertRaises(LinkLost):
                s.read_lines()
        finally:
            s.close()
            os.close(slave)
            if master >= 0:
                os.close(master)


class RunLoopTests(unittest.TestCase):
    def test_run_loop_end_to_end(self):
        master, slave = pty.openpty()
        tty.setraw(master)
        results = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        results.bind(("127.0.0.1", 0))
        results.settimeout(3)
        args = udprxtx.build_parser().parse_args([
            "--serial", os.ttyname(slave), "--order-port", "0",
            "--result-port", str(results.getsockname()[1]), "--recover-sec", "0.1", "--deadline", "5"])
        stop = threading.Event()
        ports = []
        t = threading.Thread(target=udprxtx.run, args=(args, stop, ports.append),
                             kwargs={"logger": lambda _m: None})
        t.start()
        try:
            for _ in range(50):
                if ports:
                    break
                time.sleep(0.05)
            time.sleep(0.4)  # serial open + recover_sec
            sender = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            sender.sendto(("ORDER %s P3 B2" % ID).encode(), ("127.0.0.1", ports[0]))
            ready, _, _ = select.select([master], [], [], 2)
            self.assertTrue(ready, "command reached the serial side")
            self.assertEqual(os.read(master, 100), b"32\n")
            os.write(master, b"Mix Done\r\nSTATUS:DONE\r\n")
            data, _ = results.recvfrom(1024)
            self.assertEqual(data.decode(), "DONE %s" % ID)
            sender.close()
        finally:
            stop.set()
            t.join(3)
            results.close()
            os.close(master)
            os.close(slave)
        self.assertFalse(t.is_alive(), "stops cleanly")

    def test_help_and_stdlib_only(self):
        here = os.path.dirname(os.path.abspath(__file__))
        out = subprocess.run([sys.executable, os.path.join(here, "udprxtx.py"), "--help"],
                             capture_output=True, text=True, timeout=10)
        self.assertEqual(out.returncode, 0)
        self.assertIn("--serial", out.stdout)
        with open(os.path.join(here, "udprxtx.py")) as f:
            imports = {line.split()[1].split(".")[0] for line in f
                       if line.startswith("import ") or line.startswith("from ")}
        self.assertLessEqual(imports, set(sys.stdlib_module_names) if hasattr(sys, "stdlib_module_names") else {
            "argparse", "collections", "datetime", "os", "re", "select", "signal", "socket", "sys",
            "termios", "threading", "time", "typing"}, imports)


if __name__ == "__main__":
    unittest.main()
