#!/usr/bin/env python3
"""Stand-in for NetworkManager's nmcli (settings set, SET-01), stdlib only.

Answers exactly the commands autoload/Wifi.gd runs, in nmcli's terse (-t) form, from a JSON
state file named by FUELBOT_FAKE_NMCLI_STATE (created with sample networks if missing):

  {"wifi_device": "wlan0", "ethernet": false,
   "networks": [{"ssid", "signal", "security": "WPA2" | "" | "WPA2 802.1X", "password"}],
   "connections": [{"name", "uuid", "ssid", "psk"}], "active": <uuid or null>,
   "delay": null | {"sec", "on": <word in the args, e.g. "up">, "times"},
   "fail_next": null | {"code", "stderr", "on": <optional word in the args>},
   "calls": [[args...], ...]}

Every call is recorded in "calls" with secrets replaced by ***; a passwd-file's content is never
recorded or printed. "delay" makes the next `times` commands containing `on` slow (a scan
or connect timing out); fail_next makes the next command (containing `on`, if given) exit with
that code and message, once.
"""
import json
import os
import sys
import time
import uuid

SAMPLE = {
    "wifi_device": "wlan0",
    "ethernet": False,
    "networks": [
        {"ssid": "GymStaff", "signal": 82, "security": "WPA2", "password": "staffpass1"},
        {"ssid": "GymGuest", "signal": 64, "security": "", "password": ""},
        {"ssid": "Office-5G", "signal": 41, "security": "WPA1 WPA2", "password": "office2026"},
        {"ssid": "Corp", "signal": 30, "security": "WPA2 802.1X", "password": ""},
    ],
    "connections": [{"name": "GymStaff", "uuid": "0b9e1c2e-0000-4000-8000-000000000001",
                     "ssid": "GymStaff", "psk": "staffpass1"}],
    "active": "0b9e1c2e-0000-4000-8000-000000000001",
    "delay": None,
    "fail_next": None,
    "calls": [],
}
SECRET_AFTER = {"password", "wifi-sec.psk", "802-11-wireless-security.psk"}


def esc(value):
    return str(value).replace("\\", "\\\\").replace(":", "\\:")


def load(path):
    if not os.path.exists(path):
        return json.loads(json.dumps(SAMPLE))
    with open(path) as f:
        return json.load(f)


def save(path, state):
    tmp = path + ".tmp"
    with open(tmp, "w") as f:
        json.dump(state, f, indent=2)
    os.replace(tmp, path)


def scrub(args):
    out, hide = [], False
    for a in args:
        out.append("***" if hide else a)
        hide = a in SECRET_AFTER
    return out


def fail(code, message):
    print("Error: " + message, file=sys.stderr)
    return code


def by(state, key, value):
    return next((c for c in state["connections"] if c[key] == value), None)


def network(state, ssid):
    return next((n for n in state["networks"] if n["ssid"] == ssid), None)


def active_ssid(state):
    conn = by(state, "uuid", state.get("active"))
    return conn["ssid"] if conn else None


def device_status(state):
    lines = []
    conn = by(state, "uuid", state.get("active"))
    lines.append("%s:wifi:%s:%s" % (state["wifi_device"], "connected" if conn else "disconnected",
                                     esc(conn["name"]) if conn else ""))
    lines.append("eth0:ethernet:%s:%s" % (("connected", "Wired connection 1") if state["ethernet"]
                                          else ("unavailable", "")))
    lines.append("lo:loopback:connected (externally):lo")
    return lines


def wifi_list(state):
    current = active_ssid(state)
    return ["%s:%s:%d:%s" % ("*" if n["ssid"] == current else " ", esc(n["ssid"]), n["signal"],
                             esc(n["security"])) for n in state["networks"]]


def connection_up(state, args):
    target = by(state, "uuid", args[args.index("uuid") + 1]) if "uuid" in args \
        else by(state, "name", args[args.index("id") + 1])
    if target is None:
        return fail(10, "unknown connection.")
    net = network(state, target["ssid"])
    if net is None:
        return fail(4, "Connection activation failed: The Wi-Fi network could not be found.")
    psk = target.get("psk", "")
    if "passwd-file" in args:
        with open(args[args.index("passwd-file") + 1]) as f:
            for line in f.read().splitlines():
                if line.startswith("802-11-wireless-security.psk:"):
                    psk = line.split(":", 1)[1]
    if "802.1X" in net["security"]:
        return fail(4, "Connection activation failed: 802-1X supplicant failed.")
    if net["security"] and psk != net["password"]:
        return fail(4, "Connection activation failed: Secrets were required, but not provided.")
    target["psk"] = psk          # NetworkManager saves the secret with the profile
    state["active"] = target["uuid"]
    print("Connection successfully activated (D-Bus active path: /org/freedesktop/NetworkManager/ActiveConnection/7)")
    return 0


def run(state, args):
    while args and args[0].startswith("-"):   # -t, -f <fields>, -w <sec>: output is always terse
        if args.pop(0) in ("-f", "--fields", "-w", "--wait"):
            args.pop(0)
    if args[:2] == ["device", "status"]:
        print("\n".join(device_status(state)))
        return 0
    if args[:3] == ["device", "wifi", "list"]:
        print("\n".join(wifi_list(state)))
        return 0
    if args[:2] == ["connection", "show"]:
        conns = state["connections"]
        if "--active" in args:
            conns = [c for c in conns if c["uuid"] == state.get("active")]
            rows = ["%s:%s:802-11-wireless:%s" % (esc(c["name"]), c["uuid"], state["wifi_device"]) for c in conns]
        else:
            rows = ["%s:%s:802-11-wireless" % (esc(c["name"]), c["uuid"]) for c in conns]
        print("\n".join(rows))
        return 0
    if args[:2] == ["connection", "add"]:
        opts = dict(zip(args[2::2], args[3::2]))
        new = {"name": opts.get("con-name", ""), "uuid": str(uuid.uuid4()), "ssid": opts.get("ssid", ""),
               "psk": opts.get("wifi-sec.psk", "")}
        state["connections"].append(new)
        print("Connection '%s' (%s) successfully added." % (new["name"], new["uuid"]))
        return 0
    if args[:2] == ["connection", "up"]:
        return connection_up(state, args)
    if args[:2] == ["connection", "delete"]:
        target = by(state, "uuid", args[args.index("uuid") + 1]) if "uuid" in args else None
        if target is None:
            return fail(10, "unknown connection.")
        state["connections"].remove(target)
        if state.get("active") == target["uuid"]:
            state["active"] = None
        print("Connection '%s' (%s) successfully deleted." % (target["name"], target["uuid"]))
        return 0
    return fail(2, "argument '%s' not understood." % " ".join(args))


def main(argv):
    path = os.environ.get("FUELBOT_FAKE_NMCLI_STATE") or os.path.expanduser("~/.fuelbot_fake_nmcli.json")
    state = load(path)
    state.setdefault("calls", []).append(scrub(argv))
    delay = state.get("delay")
    if delay and delay.get("times", 1) > 0 and delay.get("on", "") in argv:
        delay["times"] = delay.get("times", 1) - 1
        save(path, state)
        time.sleep(delay["sec"])
        state = load(path)
    failure = state.get("fail_next")
    if failure and (not failure.get("on") or failure["on"] in argv):
        state["fail_next"] = None
        save(path, state)
        return fail(failure.get("code", 1), failure.get("stderr", "failed."))
    code = run(state, list(argv))
    save(path, state)
    return code


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
