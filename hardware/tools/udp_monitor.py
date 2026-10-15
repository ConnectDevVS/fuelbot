#!/usr/bin/env python3
"""Prints every UDP packet sent to the bridge ports (dev aid; stdlib only).

Usage: python3 tools/udp_monitor.py [--ports 4242] [--host 127.0.0.1]
Default: 4242, where the app sends ORDER/CANCEL (protocol v2).
Only one process may bind a port, so it can't run alongside the real bridge
or tools/fake_dispense_bridge.py. The app binds 4245 (bridge results), so
--ports 4242,4245 works only while the app isn't running.
"""
import argparse
import datetime
import selectors
import socket
import sys


def main(argv):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--ports", default="4242", help="comma-separated UDP ports")
    parser.add_argument("--host", default="127.0.0.1")
    args = parser.parse_args(argv)
    sel = selectors.DefaultSelector()
    for port in (int(p) for p in args.ports.split(",") if p.strip()):
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.bind((args.host, port))
        sel.register(sock, selectors.EVENT_READ, port)
        print("listening on %s:%d" % (args.host, port), flush=True)
    try:
        while True:
            for key, _ in sel.select():
                data, _addr = key.fileobj.recvfrom(1024)
                stamp = datetime.datetime.now().strftime("%H:%M:%S.%f")[:-3]
                print("%s :%d %s" % (stamp, key.data, data.decode("utf-8", "replace").strip()), flush=True)
    except KeyboardInterrupt:
        return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
