#!/usr/bin/env python3
"""Fake Arduino for the Level 1 test rig (plan §6): mimics hardware/firmware/VM_code.ino
over a PTY, so the real bridge (hardware/bridge/udprxtx.py) can run with no board.

Usage: python3 tools/fake_arduino_serial.py [--time-scale 1.0]
           [--fault none|never_done|silent|disconnect] [--assigned 1,2,3,4] [--link PATH]
Prints "SERIAL <pty path>" first; point the bridge at it (or at --link):
    python3 hardware/bridge/udprxtx.py --serial /tmp/fuelbot-arduino
Stdlib only. No socat needed: the fake owns the PTY pair.
"""
import argparse
import os
import pty
import select
import signal
import sys
import threading
import time
import tty
from typing import Callable, List, Optional, Tuple

# Firmware timing model (VM_code.ino; dispensing README decision 8).
STEP_X = 110e-6   # X axis: 2 x delayMicroseconds(50) + digitalWrite overhead
STEP_Z = 147e-6   # Z axis: 2 x delayMicroseconds(70) + overhead
POSITIONS = {1: 0, 2: 18000, 3: 36000, 4: 54000, 5: 72000, 6: 72000}   # 5-6: placeholders
DISPENSE_SEC = {1: 1.5, 2: 7.5, 3: 0.5, 4: 6.0, 5: 1.0, 6: 1.0}
BOOT_SEC = 1.0    # bootloader + setup() before the banner after a watchdog reset
BOOT_BANNER = [" ", "Reset!", "Homing", "Home reached"]
FAULTS = ("none", "never_done", "silent", "disconnect")


def cycle_script(hopper: int) -> List[Tuple[float, str]]:
    """(seconds after the command, line) for one full cycle, ending STATUS:DONE."""
    t = 0.0
    out = []

    def at(delay: float, line: Optional[str] = None) -> None:
        nonlocal t
        t += delay
        if line is not None:
            out.append((t, line))

    pos = POSITIONS[hopper]
    at(26000 * STEP_X)                                    # moveTo(26000)
    at(4.0 + 1.0, "Water Filled in Cup")                  # pump 4 s + 1 s
    at(abs(26000 - pos) * STEP_X)                         # moveTo(hopper)
    at(DISPENSE_SEC[hopper], "Protein %d Dispensed" % hopper)
    at(1.0)
    at(abs(26000 - pos) * STEP_X)                         # moveTo(26000)
    at(5.0 + 1.0, "Water Filled in Cup")                  # pump 5 s + 1 s
    at(51000 * STEP_X + 0.5 + 30000 * STEP_Z + 0.5)       # moveTo(77000), frother down
    at(256 * 0.04 + 15.0, "Shake Frothing Done")          # ramp + mix
    at(30000 * STEP_Z + 1.0 + 77000 * STEP_X, "Homing")   # frother up, moveTo(0)
    at(0.0, "Home reached")
    at(0.5, "Mix Done")
    at(0.0, "STATUS:DONE")
    return out


def cycle_seconds(hopper: int) -> float:
    return cycle_script(hopper)[-1][0]


class FakeArduino:
    """Protocol behaviour with an injectable clock: feed() bytes in, due() lines out."""

    def __init__(self, time_scale: float = 1.0, fault: str = "none",
                 assigned=(1, 2, 3, 4), logger: Callable[[str], None] = None):
        if fault not in FAULTS:
            raise ValueError("fault must be one of %s" % (FAULTS,))
        self.time_scale = time_scale
        self.fault = fault
        self.assigned = set(assigned)
        self.commands: List[str] = []     # every complete line received
        self.disconnect_at: Optional[float] = None
        self._log = logger or (lambda m: print(m, file=sys.stderr, flush=True))
        self._rx = b""
        self._out: List[Tuple[float, str]] = []
        self._busy_until = 0.0            # inf while stuck

    def boot(self, now: float) -> None:
        self._schedule(now, [(0.0, line) for line in BOOT_BANNER])

    def feed(self, data: bytes, now: float) -> None:
        self._rx += data
        *lines, self._rx = self._rx.split(b"\n")
        for raw in lines:
            text = raw.decode("ascii", "replace").strip()
            self.commands.append(text)
            if now < self._busy_until:
                self._log("fake: dropped %r (board busy)" % text)
                continue
            self._handle(text, now)

    def due(self, now: float) -> List[str]:
        ready = [line for t, line in self._out if t <= now]
        self._out = [(t, line) for t, line in self._out if t > now]
        return ready

    def next_due(self) -> Optional[float]:
        return min((t for t, _ in self._out), default=None)

    def _handle(self, text: str, now: float) -> None:
        if text == "":
            return
        if len(text) != 2 or not text.isdigit():
            self._schedule(now, [(0.0, "FAULT:BAD_COMMAND")])
            return
        hopper, base = int(text[0]), int(text[1])
        if 1 <= hopper <= 6 and hopper not in self.assigned and 1 <= base <= 2:
            self._schedule(now, [(0.0, "FAULT:HOPPER_UNASSIGNED %d" % hopper)])
            return
        if not (1 <= hopper <= 6 and 1 <= base <= 2):
            self._schedule(now, [(0.0, "FAULT:BAD_COMMAND")])
            return
        script = cycle_script(hopper)
        if self.fault == "never_done":
            cut = [i for i, (_, line) in enumerate(script) if line == "Homing"][0]
            self._schedule(now, script[:cut + 1])   # stuck in homeAxis(): no Home reached, no DONE
            self._busy_until = float("inf")
            return
        if self.fault == "disconnect":
            half = script[len(script) // 2][0]
            self._schedule(now, [(t, line) for t, line in script if t < half])
            self.disconnect_at = now + half * self.time_scale
            self._busy_until = float("inf")
            return
        end = script[-1][0]
        reboot = [(end + BOOT_SEC, line) for line in BOOT_BANNER]   # watchdog reset, then setup()
        self._schedule(now, script + reboot)
        self._busy_until = now + (end + 0.1) * self.time_scale

    def _schedule(self, now: float, items: List[Tuple[float, str]]) -> None:
        if self.fault == "silent":
            return
        self._out.extend((now + t * self.time_scale, line) for t, line in items)
        self._out.sort(key=lambda item: item[0])


def serve(fake: FakeArduino, stop: threading.Event, on_path: Callable[[str], None],
          link: Optional[str] = None, logger: Callable[[str], None] = None) -> None:
    """Runs the fake on a fresh PTY until stop is set (or a 'disconnect' fault fires)."""
    log = logger or (lambda m: print(m, file=sys.stderr, flush=True))
    master, slave = pty.openpty()
    tty.setraw(master)
    tty.setraw(slave)   # no echo, even before the bridge opens it
    path = os.ttyname(slave)
    if link:
        if os.path.islink(link):
            os.unlink(link)
        os.symlink(path, link)
    on_path(path)
    fake.boot(time.monotonic())
    try:
        while not stop.is_set():
            now = time.monotonic()
            if fake.disconnect_at is not None and now >= fake.disconnect_at:
                log("fake: disconnect fault, closing the port")
                break
            for line in fake.due(now):
                log("fake -> %s" % line)
                os.write(master, (line + "\r\n").encode("ascii"))
            wait = 0.1
            nxt = fake.next_due()
            if nxt is not None:
                wait = max(0.0, min(wait, nxt - now))
            readable, _, _ = select.select([master], [], [], wait)
            if readable:
                try:
                    data = os.read(master, 1024)
                except OSError:
                    data = b""
                if data:
                    log("fake <- %r" % data)
                    fake.feed(data, time.monotonic())
    finally:
        os.close(master)
        os.close(slave)
        if link and os.path.islink(link):
            os.unlink(link)


def main(argv: List[str]) -> int:
    p = argparse.ArgumentParser(description="Fake Arduino (VM_code.ino) on a PTY, Level 1 test rig")
    p.add_argument("--time-scale", type=float, default=1.0, help="1.0 = firmware timing (~68-78 s cycle)")
    p.add_argument("--fault", choices=FAULTS, default="none")
    p.add_argument("--assigned", default="1,2,3,4", help="hoppers with a wired motor")
    p.add_argument("--link", help="also symlink this path to the PTY, e.g. /tmp/fuelbot-arduino")
    args = p.parse_args(argv)
    assigned = [int(x) for x in args.assigned.split(",") if x.strip()]
    fake = FakeArduino(args.time_scale, args.fault, assigned)
    stop = threading.Event()
    for sig in (signal.SIGINT, signal.SIGTERM):
        signal.signal(sig, lambda *_: stop.set())
    serve(fake, stop, lambda path: print("SERIAL %s" % path, flush=True), args.link)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
