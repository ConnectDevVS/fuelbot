#!/usr/bin/env python3
"""Fake hardware bridge for the Level 0 test rig (plan §6): stands in for
hardware/bridge/udprxtx.py so the app's dispensing flow runs with no hardware.

Usage: python3 tools/fake_dispense_bridge.py [--mode done|timeout|reject|silent] [--delay 8]
Binds the order port (4242) like the real bridge, so it can't run alongside
udprxtx.py or tools/udp_monitor.py. Replies to the app on 4245:
  done    -> DONE <id>              after --delay
  timeout -> TIMEOUT <id> deadline  after --delay
  reject  -> REJECTED <id> busy     at once
  silent  -> nothing (exercises the app's safety cap)
Stdlib only; the protocol parser is shared with the real bridge.
"""
import argparse
import datetime
import os
import select
import signal
import socket
import sys
import threading
import time
from typing import Callable, List, Optional, Tuple

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "hardware", "bridge"))
import udprxtx  # noqa: E402

MODES = ("done", "timeout", "reject", "silent")


def log(message: str) -> None:
    stamp = datetime.datetime.now().strftime("%H:%M:%S.%f")[:-3]
    print("%s %s" % (stamp, message), flush=True)


class FakeBridge:
    """handle() an app message; due() returns replies whose time has come."""

    def __init__(self, mode: str = "done", delay: float = 8.0, logger: Callable[[str], None] = log):
        if mode not in MODES:
            raise ValueError("mode must be one of %s" % (MODES,))
        self.mode = mode
        self.delay = delay
        self._log = logger
        self._scheduled: List[Tuple[float, str]] = []

    def handle(self, text: str, now: float) -> None:
        parsed = udprxtx.parse_app_message(text)
        if parsed is None:
            order_id = udprxtx.parse_order_id_only(text)
            if order_id:
                self._log("malformed order %r" % text.strip())
                self._scheduled.append((now, "REJECTED %s bad_order" % order_id))
            else:
                self._log("ignored %r" % text.strip())
            return
        if parsed[0] == "CANCEL":
            self._log("CANCEL %s" % parsed[1])
            return
        _, order_id, hopper, base = parsed
        self._log("ORDER %s hopper %d base %d (mode %s)" % (order_id, hopper, base, self.mode))
        if self.mode == "done":
            self._scheduled.append((now + self.delay, "DONE %s" % order_id))
        elif self.mode == "timeout":
            self._scheduled.append((now + self.delay, "TIMEOUT %s deadline" % order_id))
        elif self.mode == "reject":
            self._scheduled.append((now, "REJECTED %s busy" % order_id))

    def due(self, now: float) -> List[str]:
        ready = [msg for t, msg in self._scheduled if t <= now]
        self._scheduled = [(t, msg) for t, msg in self._scheduled if t > now]
        return ready

    def next_due(self) -> Optional[float]:
        return min((t for t, _ in self._scheduled), default=None)


def serve(fake: FakeBridge, args: argparse.Namespace, stop: threading.Event,
          on_listening: Optional[Callable[[int], None]] = None,
          logger: Callable[[str], None] = log) -> None:
    udp = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    udp.bind((args.listen_host, args.order_port))
    out = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    port = udp.getsockname()[1]
    logger("fake bridge (mode %s, delay %.1f s) on %s:%d -> %s:%d" % (
        fake.mode, fake.delay, args.listen_host, port, args.app_host, args.result_port))
    if on_listening:
        on_listening(port)
    try:
        while not stop.is_set():
            now = time.monotonic()
            for msg in fake.due(now):
                logger("-> app %s" % msg)
                out.sendto(msg.encode("ascii"), (args.app_host, args.result_port))
            wait = 0.1
            nxt = fake.next_due()
            if nxt is not None:
                wait = max(0.0, min(wait, nxt - now))
            readable, _, _ = select.select([udp], [], [], wait)
            if readable:
                data, _addr = udp.recvfrom(1024)
                fake.handle(data.decode("utf-8", "replace"), time.monotonic())
    finally:
        udp.close()
        out.close()


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="Fake hardware bridge (Level 0 test rig)")
    p.add_argument("--mode", choices=MODES, default="done")
    p.add_argument("--delay", type=float, default=8.0, help="seconds before DONE/TIMEOUT")
    p.add_argument("--listen-host", default="127.0.0.1")
    p.add_argument("--order-port", type=int, default=udprxtx.ORDER_PORT)
    p.add_argument("--app-host", default="127.0.0.1")
    p.add_argument("--result-port", type=int, default=udprxtx.RESULT_PORT)
    return p


def main(argv: List[str]) -> int:
    args = build_parser().parse_args(argv)
    stop = threading.Event()
    for sig in (signal.SIGINT, signal.SIGTERM):
        signal.signal(sig, lambda *_: stop.set())
    serve(FakeBridge(args.mode, args.delay), args, stop)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
