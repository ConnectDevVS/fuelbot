"""Tests for the stand-in nmcli (tools/fake_nmcli.py). Run: python3 -m unittest tools/test_fake_nmcli.py"""
import json
import os
import subprocess
import sys
import tempfile
import time
import unittest

FAKE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fake_nmcli.py")


class FakeNmcliTest(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.state = os.path.join(self.dir.name, "state.json")
        self.env = dict(os.environ, FUELBOT_FAKE_NMCLI_STATE=self.state)

    def tearDown(self):
        self.dir.cleanup()

    def nmcli(self, *args):
        return subprocess.run([FAKE, *args], env=self.env, capture_output=True, text=True)

    def read(self):
        with open(self.state) as f:
            return json.load(f)

    def write(self, patch):
        self.nmcli("device", "status")   # creates the sample state
        state = self.read()
        state.update(patch)
        with open(self.state, "w") as f:
            json.dump(state, f)

    def test_device_status_and_list_are_terse(self):
        out = self.nmcli("-t", "-f", "DEVICE,TYPE,STATE,CONNECTION", "device", "status").stdout
        self.assertIn("wlan0:wifi:connected:GymStaff", out)
        self.assertIn("eth0:ethernet:unavailable:", out)
        out = self.nmcli("-t", "-f", "IN-USE,SSID,SIGNAL,SECURITY", "device", "wifi", "list",
                         "ifname", "wlan0", "--rescan", "yes").stdout.splitlines()
        self.assertIn("*:GymStaff:82:WPA2", out)
        self.assertIn(" :GymGuest:64:", out)

    def test_colons_are_escaped(self):
        self.write({"networks": [{"ssid": "a:b\\c", "signal": 50, "security": "WPA2", "password": "x"}]})
        out = self.nmcli("-t", "device", "wifi", "list").stdout
        self.assertIn(" :a\\:b\\\\c:50:WPA2", out)

    def test_add_and_up_with_passwd_file(self):
        out = self.nmcli("connection", "add", "type", "wifi", "ifname", "wlan0", "con-name", "Office-5G",
                         "ssid", "Office-5G", "autoconnect", "yes", "wifi-sec.key-mgmt", "wpa-psk").stdout
        new_uuid = out.split("(")[1].split(")")[0]
        secret = os.path.join(self.dir.name, "secret")
        with open(secret, "w") as f:
            f.write("802-11-wireless-security.psk:wrongpass\n")
        bad = self.nmcli("-w", "30", "connection", "up", "uuid", new_uuid, "passwd-file", secret)
        self.assertEqual(bad.returncode, 4)
        self.assertIn("Secrets were required", bad.stderr)
        with open(secret, "w") as f:
            f.write("802-11-wireless-security.psk:office2026\n")
        ok = self.nmcli("-w", "30", "connection", "up", "uuid", new_uuid, "passwd-file", secret)
        self.assertEqual(ok.returncode, 0)
        state = self.read()
        self.assertEqual(state["active"], new_uuid)
        self.assertNotIn("office2026", json.dumps(state["calls"]), "the call log never has the password")

    def test_open_network_and_not_found(self):
        out = self.nmcli("connection", "add", "con-name", "GymGuest", "ssid", "GymGuest").stdout
        self.assertEqual(self.nmcli("connection", "up", "uuid", out.split("(")[1][:36]).returncode, 0)
        out = self.nmcli("connection", "add", "con-name", "Gone", "ssid", "Gone").stdout
        res = self.nmcli("connection", "up", "uuid", out.split("(")[1][:36])
        self.assertEqual(res.returncode, 4)
        self.assertIn("could not be found", res.stderr)

    def test_delete_and_active(self):
        active = self.nmcli("-t", "connection", "show", "--active").stdout.strip()
        uuid = active.split(":")[1]
        self.assertTrue(active.endswith(":802-11-wireless:wlan0"))
        self.assertEqual(self.nmcli("connection", "delete", "uuid", uuid).returncode, 0)
        self.assertIsNone(self.read()["active"])
        self.assertIn("wlan0:wifi:disconnected:", self.nmcli("-t", "device", "status").stdout)

    def test_secrets_scrubbed_from_calls(self):
        self.nmcli("connection", "add", "con-name", "x", "ssid", "x", "wifi-sec.psk", "SENTINEL9")
        self.nmcli("device", "wifi", "connect", "x", "password", "SENTINEL9")
        self.assertNotIn("SENTINEL9", json.dumps(self.read()["calls"]))

    def test_fail_next_once_and_targeted_delay(self):
        self.write({"fail_next": {"code": 8, "stderr": "NetworkManager is not running."},
                    "delay": {"sec": 0.5, "on": "list", "times": 1}})
        res = self.nmcli("device", "status")
        self.assertEqual(res.returncode, 8)
        self.assertIn("not running", res.stderr)
        self.assertEqual(self.nmcli("device", "status").returncode, 0, "only once")
        start = time.time()
        self.nmcli("device", "wifi", "list")
        self.assertGreaterEqual(time.time() - start, 0.5, "delayed")
        start = time.time()
        self.nmcli("device", "wifi", "list")
        self.assertLess(time.time() - start, 0.5, "the delay was used up")


if __name__ == "__main__":
    unittest.main()
