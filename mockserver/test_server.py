"""Tests for the mock server. Run: python3 -m unittest mockserver/test_server.py -v"""
import json
import os
import sys
import threading
import unittest
import urllib.error
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import server  # noqa: E402

CONFIG = "/fuelbot/config"
SCENARIO_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "responses", "config")
INVALID_ON_PURPOSE = {"invalid_duplicate_hopper", "malformed_json", "server_error"}


class MockServerTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.httpd = server.make_server("127.0.0.1", 0, {})
        cls.base = "http://127.0.0.1:%d" % cls.httpd.server_address[1]
        threading.Thread(target=cls.httpd.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()
        cls.httpd.server_close()

    def setUp(self):
        self._post("/__mock/reset", {})

    def _request(self, path, tenant=None, data=None):
        req = urllib.request.Request(self.base + path, data=data)
        if tenant:
            req.add_header("X-Tenant-Id", tenant)
        if data is not None:
            req.add_header("Content-Type", "application/json")
        try:
            with urllib.request.urlopen(req, timeout=5) as resp:
                return resp.status, resp.read().decode("utf-8")
        except urllib.error.HTTPError as e:
            return e.code, e.read().decode("utf-8")

    def _post(self, path, body):
        return self._request(path, data=json.dumps(body).encode("utf-8"))

    def _scenario(self, name):
        return self._post("/__mock/scenario", {"path": CONFIG, "scenario": name})

    def _config(self):
        status, text = self._request(CONFIG, tenant="t-1")
        return status, text

    def test_missing_tenant_header_is_400(self):
        status, _ = self._request(CONFIG)
        self.assertEqual(status, 400)

    def test_default_config_with_tenant(self):
        status, text = self._config()
        self.assertEqual(status, 200)
        self.assertEqual(len(json.loads(text)["flavors"]), 6)
        state = json.loads(self._request("/__mock/state")[1])
        self.assertEqual(state["last_tenant"][CONFIG], "t-1")

    def test_price_change_merges_by_id(self):
        self.assertEqual(self._scenario("price_change")[0], 200)
        flavors = {f["id"]: f for f in json.loads(self._config()[1])["flavors"]}
        self.assertEqual(flavors["chocolate"]["actual_price"], 199)
        self.assertFalse(flavors["electro"]["enabled"])
        self.assertEqual(len(flavors), 6)
        for fid in ("guava", "vanilla", "cookie", "coffee"):
            self.assertTrue(flavors[fid]["enabled"])
        self.assertEqual(flavors["chocolate"]["name"], "MMN Chocolate")

    def test_malformed_json_body(self):
        self._scenario("malformed_json")
        status, text = self._config()
        self.assertEqual(status, 200)
        with self.assertRaises(ValueError):
            json.loads(text)

    def test_server_error(self):
        self._scenario("server_error")
        self.assertEqual(self._config()[0], 500)

    def test_unknown_scenario_and_reset(self):
        self.assertEqual(self._scenario("nope")[0], 400)
        self._scenario("price_change")
        self._config()
        state = json.loads(self._post("/__mock/reset", {})[1])
        self.assertEqual(state["active"][CONFIG], "default")
        self.assertEqual(state["request_counts"][CONFIG], 0)

    def _all_resolved(self):
        for fname in sorted(os.listdir(SCENARIO_DIR)):
            name = fname[:-5]
            yield name, server.load_scenario("responses/config", name)

    def test_every_scenario_resolves(self):
        for name, env in self._all_resolved():
            if name == "slow":
                continue
            self._scenario(name)
            status, _ = self._config()
            self.assertEqual(status, env.get("status", 200), name)

    def test_valid_scenarios_have_unique_hoppers_and_res_images(self):
        for name, env in self._all_resolved():
            if name in INVALID_ON_PURPOSE:
                continue
            flavors = env["body"]["flavors"]
            hoppers = [f["hopper"] for f in flavors if f["enabled"]]
            self.assertEqual(len(hoppers), len(set(hoppers)), name)
            self.assertTrue(all(1 <= h <= 6 for h in hoppers), name)
            for f in flavors:
                self.assertTrue(f["image"].startswith("res://assets/images/flavors/"), name)


if __name__ == "__main__":
    unittest.main()
