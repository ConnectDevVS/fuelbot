#!/usr/bin/env python3
"""FuelBot hardware bridge: app (UDP) <-> Arduino (serial). Protocol v2.

  app -> bridge  UDP 4242  ORDER <order_id> P<hopper> B<n>   paid order (sent once)
                           CANCEL <order_id>                 informational, never interrupts a cycle
  bridge -> app  UDP 4245  DONE <order_id>
                           TIMEOUT <order_id> <reason>       deadline | serial_lost | fault:<CODE>
                           REJECTED <order_id> <reason>      busy | bad_order | serial_unavailable
  bridge -> Arduino        "<hopper><n>\\n"
  Arduino -> bridge        free text, STATUS:DONE, FAULT:<CODE>, "Home reached" (ready)

Single-cup machine: one order at a time. Never blocks without a deadline.
Standard library only (termios serial; no pyserial). Python 3.9+.
See devdocs/stories/dispensing/README.md for the full protocol.

Usage: python3 hardware/bridge/udprxtx.py [--serial /dev/arduino] [--deadline 110] ...
"""
import argparse
import collections
import datetime
import os
import re
import select
import signal
import socket
import sys
import termios
import threading
import time
from typing import Callable, List, Optional, Tuple

ORDER_PORT = 4242
RESULT_PORT = 4245
DEFAULT_SERIAL = "/dev/arduino"
DEFAULT_BAUD = 9600
DEADLINE_SEC = 110.0   # > the firmware's ~68-78 s cycle (dispensing README decision 8)
RECOVER_SEC = 15.0     # max wait for "Home reached" after a cycle / (re)open
REOPEN_SEC = 5.0
MAX_HOPPER = 6

ULID = r"[0-7][0-9A-HJKMNP-TV-Z]{25}"
ORDER_RE = re.compile(r"^ORDER (%s) P([1-%d]) B([1-9])$" % (ULID, MAX_HOPPER))
CANCEL_RE = re.compile(r"^CANCEL (%s)$" % ULID)
ORDER_ID_RE = re.compile(r"^ORDER (%s)(?: |$)" % ULID)
FAULT_RE = re.compile(r"^FAULT:([A-Z_]+)")
DONE_LINE = "STATUS:DONE"
READY_LINE = "Home reached"

RECOVERING = "RECOVERING"
READY = "READY"
DISPENSING = "DISPENSING"


def log(message: str) -> None:
    stamp = datetime.datetime.now().strftime("%H:%M:%S.%f")[:-3]
    print("%s %s" % (stamp, message), flush=True)


def parse_app_message(text: str) -> Optional[Tuple]:
    """("ORDER", order_id, hopper, base) | ("CANCEL", order_id) | None."""
    text = text.strip()
    m = ORDER_RE.match(text)
    if m:
        return ("ORDER", m.group(1), int(m.group(2)), int(m.group(3)))
    m = CANCEL_RE.match(text)
    if m:
        return ("CANCEL", m.group(1))
    return None


def parse_order_id_only(text: str) -> Optional[str]:
    """The order id of an ORDER whose body is malformed, so it can be REJECTED."""
    m = ORDER_ID_RE.match(text.strip())
    return m.group(1) if m else None


class LinkLost(Exception):
    pass


class PosixSerial:
    """Raw 8N1 serial port via termios. Works for /dev/ttyACM* and PTYs."""

    def __init__(self, path: str, baud: int = DEFAULT_BAUD):
        self.path = path
        self.baud = baud
        self._fd = -1
        self._buf = b""

    def open(self) -> None:
        speed = getattr(termios, "B%d" % self.baud)
        fd = os.open(self.path, os.O_RDWR | os.O_NOCTTY | os.O_NONBLOCK)
        try:
            attrs = termios.tcgetattr(fd)
            attrs[0] &= ~(termios.IGNBRK | termios.BRKINT | termios.PARMRK | termios.ISTRIP
                          | termios.INLCR | termios.IGNCR | termios.ICRNL | termios.IXON
                          | termios.IXOFF | termios.IXANY)
            attrs[1] &= ~termios.OPOST
            attrs[2] &= ~(termios.CSIZE | termios.PARENB | termios.CSTOPB | termios.HUPCL)
            attrs[2] |= termios.CS8 | termios.CLOCAL | termios.CREAD
            attrs[3] &= ~(termios.ECHO | termios.ECHONL | termios.ICANON | termios.ISIG | termios.IEXTEN)
            attrs[4] = attrs[5] = speed
            # VMIN=1, not 0: with O_NONBLOCK and VMIN=0, macOS returns b"" when there is
            # simply no data, which is indistinguishable from EOF. VMIN=1 gives EAGAIN.
            attrs[6][termios.VMIN] = 1
            attrs[6][termios.VTIME] = 0
            termios.tcsetattr(fd, termios.TCSANOW, attrs)
        except (termios.error, OSError):
            os.close(fd)
            raise
        self._fd = fd
        self._buf = b""

    def is_open(self) -> bool:
        return self._fd >= 0

    def fileno(self) -> int:
        return self._fd

    def write_line(self, text: str) -> None:
        data = (text + "\n").encode("ascii")
        try:
            while data:
                written = os.write(self._fd, data)
                data = data[written:]
        except OSError as e:
            raise LinkLost("write failed: %s" % e)

    def read_lines(self) -> List[str]:
        """Complete lines received so far (non-blocking). EOF/error -> LinkLost."""
        try:
            chunk = os.read(self._fd, 4096)
        except BlockingIOError:
            return []
        except OSError as e:
            raise LinkLost("read failed: %s" % e)
        if not chunk:
            raise LinkLost("EOF (device closed)")
        self._buf += chunk
        *lines, self._buf = self._buf.split(b"\n")
        out = []
        for raw in lines:
            line = raw.decode("utf-8", "replace").strip()
            if line:
                out.append(line)
        return out

    def close(self) -> None:
        if self._fd >= 0:
            try:
                os.close(self._fd)
            except OSError:
                pass
        self._fd = -1
        self._buf = b""


class BridgeCore:
    """The whole order policy, no I/O of its own (unit-testable with a fake clock).

    send(msg) -> app; write_serial(cmd) -> bool (False = link lost);
    serial_ok() -> bool; clock() -> seconds (monotonic).
    """

    def __init__(self, send: Callable[[str], None], write_serial: Callable[[str], bool],
                 serial_ok: Callable[[], bool], clock: Callable[[], float] = time.monotonic,
                 deadline: float = DEADLINE_SEC, recover_sec: float = RECOVER_SEC,
                 logger: Callable[[str], None] = log):
        self._send = send
        self._write_serial = write_serial
        self._serial_ok = serial_ok
        self._clock = clock
        self._log = logger
        self.deadline = deadline
        self.recover_sec = recover_sec
        self.state = RECOVERING
        self.active = None           # order id being dispensed
        self._deadline_at = 0.0
        self._recover_until = clock() + recover_sec
        self._finished = collections.deque(maxlen=32)

    # --- inputs --------------------------------------------------------------

    def on_app_message(self, text: str) -> None:
        text = text.strip()
        parsed = parse_app_message(text)
        if parsed is None:
            order_id = parse_order_id_only(text)
            if order_id:
                self._log("malformed order '%s'" % text)
                self._reply("REJECTED", order_id, "bad_order")
            else:
                self._log("ignored app message %r" % text)
            return
        if parsed[0] == "CANCEL":
            if parsed[1] == self.active:
                self._log("CANCEL %s ignored: a cycle in progress can't be interrupted" % parsed[1])
            else:
                self._log("CANCEL %s: no active order" % parsed[1])
            return
        _, order_id, hopper, base = parsed
        if order_id == self.active or order_id in self._finished:
            self._log("duplicate ORDER %s ignored" % order_id)
            return
        if not self._serial_ok():
            self._log("ORDER %s rejected: serial unavailable" % order_id)
            self._reply("REJECTED", order_id, "serial_unavailable")
            return
        if self.state != READY:
            self._log("ORDER %s rejected: busy (%s, active=%s)" % (order_id, self.state, self.active))
            self._reply("REJECTED", order_id, "busy")
            return
        command = "%d%d" % (hopper, base)
        if not self._write_serial(command):
            self._log("ORDER %s rejected: serial write failed" % order_id)
            self._reply("REJECTED", order_id, "serial_unavailable")
            return
        self.active = order_id
        self.state = DISPENSING
        self._deadline_at = self._clock() + self.deadline
        self._log("ORDER %s -> serial %s (deadline %.0f s)" % (order_id, command, self.deadline))

    def on_serial_line(self, line: str) -> None:
        self._log("serial: %s" % line)
        fault = FAULT_RE.match(line)
        if self.state == DISPENSING:
            if line == DONE_LINE:
                self._finish("DONE", "")
            elif fault:
                self._finish("TIMEOUT", "fault:" + fault.group(1))
        elif self.state == RECOVERING and line == READY_LINE:
            self.state = READY
            self._log("ready")
        elif fault:
            self._log("fault outside an order: %s" % line)

    def on_link_lost(self) -> None:
        if self.state == DISPENSING:
            self._finish("TIMEOUT", "serial_lost")
        self.state = RECOVERING

    def on_link_restored(self) -> None:
        self.state = RECOVERING
        self._recover_until = self._clock() + self.recover_sec

    def tick(self) -> None:
        now = self._clock()
        if self.state == DISPENSING and now >= self._deadline_at:
            self._log("no %s within %.0f s" % (DONE_LINE, self.deadline))
            self._finish("TIMEOUT", "deadline")
        elif self.state == RECOVERING and now >= self._recover_until and self._serial_ok():
            self.state = READY
            self._log("ready (no '%s' within %.0f s)" % (READY_LINE, self.recover_sec))

    # --- internals -----------------------------------------------------------

    def _finish(self, kind: str, reason: str) -> None:
        self._reply(kind, self.active, reason)
        self._finished.append(self.active)
        self.active = None
        self.state = RECOVERING
        self._recover_until = self._clock() + self.recover_sec

    def _reply(self, kind: str, order_id: str, reason: str) -> None:
        message = "%s %s%s" % (kind, order_id, " " + reason if reason else "")
        self._log("-> app %s" % message)
        self._send(message)


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="FuelBot hardware bridge (protocol v2)")
    p.add_argument("--serial", default=DEFAULT_SERIAL, help="serial device (default %(default)s)")
    p.add_argument("--baud", type=int, default=DEFAULT_BAUD)
    p.add_argument("--listen-host", default="127.0.0.1")
    p.add_argument("--order-port", type=int, default=ORDER_PORT)
    p.add_argument("--app-host", default="127.0.0.1")
    p.add_argument("--result-port", type=int, default=RESULT_PORT)
    p.add_argument("--deadline", type=float, default=DEADLINE_SEC, help="seconds to wait for STATUS:DONE")
    p.add_argument("--recover-sec", type=float, default=RECOVER_SEC, help="max wait for 'Home reached'")
    p.add_argument("--reopen-sec", type=float, default=REOPEN_SEC, help="serial reopen interval")
    return p


def run(args: argparse.Namespace, stop: Optional[threading.Event] = None,
        on_listening: Optional[Callable[[int], None]] = None,
        logger: Callable[[str], None] = log) -> None:
    """The bridge loop. Returns when stop is set."""
    stop = stop or threading.Event()
    udp = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    udp.bind((args.listen_host, args.order_port))
    out = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    port = udp.getsockname()[1]
    logger("listening for orders on %s:%d; results to %s:%d; serial %s"
           % (args.listen_host, port, args.app_host, args.result_port, args.serial))
    if on_listening:
        on_listening(port)

    link = {"serial": None, "next_open": 0.0, "warned": False}

    def send(message: str) -> None:
        try:
            out.sendto(message.encode("ascii"), (args.app_host, args.result_port))
        except OSError as e:
            logger("send to app failed: %s" % e)

    def lose(reason: str) -> None:
        logger("serial link lost: %s" % reason)
        link["serial"].close()
        link["serial"] = None
        link["next_open"] = time.monotonic() + args.reopen_sec
        core.on_link_lost()

    def write_serial(command: str) -> bool:
        try:
            link["serial"].write_line(command)
            return True
        except LinkLost as e:
            lose(str(e))
            return False

    core = BridgeCore(send, write_serial, lambda: link["serial"] is not None,
                      deadline=args.deadline, recover_sec=args.recover_sec, logger=logger)
    try:
        while not stop.is_set():
            if link["serial"] is None and time.monotonic() >= link["next_open"]:
                serial = PosixSerial(args.serial, args.baud)
                try:
                    serial.open()
                    link["serial"] = serial
                    link["warned"] = False
                    logger("serial open: %s @ %d" % (args.serial, args.baud))
                    core.on_link_restored()
                except OSError as e:
                    if not link["warned"]:
                        logger("serial unavailable (%s); retrying every %.0f s" % (e, args.reopen_sec))
                        link["warned"] = True
                    link["next_open"] = time.monotonic() + args.reopen_sec
            fds = [udp] + ([link["serial"].fileno()] if link["serial"] else [])
            readable, _, _ = select.select(fds, [], [], 0.2)
            if udp in readable:
                data, _addr = udp.recvfrom(1024)
                core.on_app_message(data.decode("utf-8", "replace"))
            if link["serial"] is not None and link["serial"].fileno() in readable:
                try:
                    lines = link["serial"].read_lines()
                except LinkLost as e:
                    lose(str(e))
                    lines = []
                for line in lines:
                    core.on_serial_line(line)
            core.tick()
    finally:
        if link["serial"] is not None:
            link["serial"].close()
        udp.close()
        out.close()
        logger("stopped")


def main(argv: List[str]) -> int:
    args = build_parser().parse_args(argv)
    stop = threading.Event()
    for sig in (signal.SIGINT, signal.SIGTERM):
        signal.signal(sig, lambda *_: stop.set())
    run(args, stop)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
