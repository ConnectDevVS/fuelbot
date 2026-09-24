#!/usr/bin/env python3
"""Fake hardware bridge for the Level 0 test rig (plan §6): stands in for
hardware/bridge/udprxtx.py so the app's dispensing flow runs with no hardware.

Usage: python3 tools/fake_dispense_bridge.py [--mode done|timeout|reject|silent] [--delay 8]
           [--homing-fault-sec N] [--heartbeat-sec 10]
Binds the order port (4242) like the real bridge, so it can't run alongside
udprxtx.py or tools/udp_monitor.py. Replies to the app on 4245:
  done    -> DONE <id>              after --delay
  timeout -> TIMEOUT <id> deadline  after --delay
  reject  -> REJECTED <id> busy     at once
  silent  -> nothing (exercises the app's safety cap)
and sends JSON telemetry on 4246 like the real bridge: a dispense_cycle per order
(synthetic stages), a bridge_status heartbeat, and with --homing-fault-sec N a
HOMING_TIMEOUT machine fault for N s after every DONE (orders REJECTED machine_fault
meanwhile), then machine_ok. Stdlib only; the parser is shared with the real bridge.
"""
import argparse
import datetime
import json
import os
import select
import signal
import socket
import sys
import threading
import time
from typing import Callable, List, Optional, Tuple

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "hardware", "bridge"))
sys.path.insert(0, HERE)
import udprxtx  # noqa: E402
import fake_arduino_serial  # noqa: E402

MODES = ("done", "timeout", "reject", "silent")


def log(message: str) -> None:
    stamp = datetime.datetime.now().strftime("%H:%M:%S.%f")[:-3]
    print("%s %s" % (stamp, message), flush=True)


def synthetic_stages(hopper: int, seconds: float, upto: Optional[int] = None) -> List[dict]:
    """The firmware's stage sequence for this hopper, squeezed into `seconds`."""
    script = fake_arduino_serial.cycle_script(hopper)
    scale = seconds / script[-1][0] if script[-1][0] else 0.0
    stages = [{"stage": line.split(" ")[0][len("STATUS:"):], "t_offset_ms": int(round(t * scale * 1000))}
              for t, line in script]
    return stages if upto is None else stages[:upto]


class FakeBridge:
    """handle() an app message; due() returns 4245 replies, due_events() 4246 JSON events."""

    def __init__(self, mode: str = "done", delay: float = 8.0, logger: Callable[[str], None] = log,
                 homing_fault_sec: float = 0.0):
        if mode not in MODES:
            raise ValueError("mode must be one of %s" % (MODES,))
        self.mode = mode
        self.delay = delay
        self.homing_fault_sec = homing_fault_sec
        self._log = logger
        self._scheduled: List[Tuple[float, str]] = []
        self._events: List[Tuple[float, dict]] = []
        self._fault_until = 0.0
        self._started = None

    def machine_fault(self, now: float) -> Optional[str]:
        return udprxtx.HOMING_FAULT if now < self._fault_until else None

    def status(self, now: float) -> dict:
        if self._started is None:
            self._started = now
        return {"v": 1, "event_type": "bridge_status", "state": "READY", "serial": True,
                "machine_fault": self.machine_fault(now), "uptime_s": int(now - self._started)}

    def handle(self, text: str, now: float) -> None:
        parsed = udprxtx.parse_app_message(text)
        if parsed is None:
            order_id = udprxtx.parse_order_id_only(text)
            if order_id:
                self._log("malformed order %r" % text.strip())
                self._reply(now, order_id, "REJECTED", "bad_order", None, None, [])
            else:
                self._log("ignored %r" % text.strip())
            return
        if parsed[0] == "CANCEL":
            self._log("CANCEL %s" % parsed[1])
            return
        _, order_id, hopper, base = parsed
        self._log("ORDER %s hopper %d base %d (mode %s)" % (order_id, hopper, base, self.mode))
        if self.machine_fault(now):
            self._reply(now, order_id, "REJECTED", "machine_fault", hopper, base, [])
        elif self.mode == "done":
            self._reply(now + self.delay, order_id, "DONE", "", hopper, base,
                        synthetic_stages(hopper, self.delay))
            if self.homing_fault_sec > 0:
                self._fault_until = now + self.delay + self.homing_fault_sec
                self._events.append((now + self.delay, {"v": 1, "event_type": "machine_fault",
                                                        "fault": udprxtx.HOMING_FAULT, "order_id": order_id}))
                self._events.append((self._fault_until, {"v": 1, "event_type": "machine_ok",
                                                         "cleared": udprxtx.HOMING_FAULT}))
        elif self.mode == "timeout":
            self._reply(now + self.delay, order_id, "TIMEOUT", "deadline", hopper, base,
                        synthetic_stages(hopper, self.delay, upto=4))
        elif self.mode == "reject":
            self._reply(now, order_id, "REJECTED", "busy", hopper, base, [])

    def _reply(self, at: float, order_id: str, kind: str, reason: str, hopper, base, stages) -> None:
        self._scheduled.append((at, "%s %s%s" % (kind, order_id, " " + reason if reason else "")))
        duration = stages[-1]["t_offset_ms"] if stages else 0
        self._events.append((at, {"v": 1, "event_type": "dispense_cycle", "order_id": order_id,
                                  "hopper": hopper, "base": base, "result": kind, "reason": reason,
                                  "stages": stages, "fault": None, "duration_ms": duration}))

    def due(self, now: float) -> List[str]:
        ready = [msg for t, msg in self._scheduled if t <= now]
        self._scheduled = [(t, msg) for t, msg in self._scheduled if t > now]
        return ready

    def due_events(self, now: float) -> List[dict]:
        ready = [e for t, e in self._events if t <= now]
        self._events = [(t, e) for t, e in self._events if t > now]
        return ready

    def next_due(self) -> Optional[float]:
        return min([t for t, _ in self._scheduled] + [t for t, _ in self._events], default=None)


def serve(fake: FakeBridge, args: argparse.Namespace, stop: threading.Event,
          on_listening: Optional[Callable[[int], None]] = None,
          logger: Callable[[str], None] = log) -> None:
    udp = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    udp.bind((args.listen_host, args.order_port))
    out = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    port = udp.getsockname()[1]
    logger("fake bridge (mode %s, delay %.1f s) on %s:%d -> %s:%d, telemetry :%d" % (
        fake.mode, fake.delay, args.listen_host, port, args.app_host, args.result_port, args.telemetry_port))
    if on_listening:
        on_listening(port)
    next_beat = time.monotonic()
    try:
        while not stop.is_set():
            now = time.monotonic()
            for msg in fake.due(now):
                logger("-> app %s" % msg)
                out.sendto(msg.encode("ascii"), (args.app_host, args.result_port))
            events = fake.due_events(now)
            if now >= next_beat:
                next_beat = now + args.heartbeat_sec
                events.append(fake.status(now))
            for event in events:
                if event["event_type"] != "bridge_status":
                    logger("-> telemetry %s" % event["event_type"])
                out.sendto(json.dumps(event, separators=(",", ":")).encode("utf-8"),
                           (args.app_host, args.telemetry_port))
            wait = min(0.1, max(0.0, next_beat - now))
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
    p.add_argument("--homing-fault-sec", type=float, default=0.0,
                   help="after each DONE, report a HOMING_TIMEOUT machine fault for this long (0 = off)")
    p.add_argument("--listen-host", default="127.0.0.1")
    p.add_argument("--order-port", type=int, default=udprxtx.ORDER_PORT)
    p.add_argument("--app-host", default="127.0.0.1")
    p.add_argument("--result-port", type=int, default=udprxtx.RESULT_PORT)
    p.add_argument("--telemetry-port", type=int, default=udprxtx.TELEMETRY_PORT)
    p.add_argument("--heartbeat-sec", type=float, default=udprxtx.HEARTBEAT_SEC)
    return p


def main(argv: List[str]) -> int:
    args = build_parser().parse_args(argv)
    stop = threading.Event()
    for sig in (signal.SIGINT, signal.SIGTERM):
        signal.signal(sig, lambda *_: stop.set())
    serve(FakeBridge(args.mode, args.delay, homing_fault_sec=args.homing_fault_sec), args, stop)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
