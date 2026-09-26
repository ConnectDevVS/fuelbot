"""Tests for the mock server. Run: python3 -m unittest mockserver/test_server.py -v"""
import base64
import json
import os
import sys
import threading
import time
import zlib
import unittest
import urllib.error
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import server  # noqa: E402
import make_flavor_images  # noqa: E402

CONFIG = "/fuelbot/config"
SCENARIO_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "responses", "config")
INVALID_ON_PURPOSE = {"invalid_duplicate_hopper", "malformed_json", "server_error"}
CREATE = "/v1/payments/qr_codes"
PAYMENTS = "/v1/payments/qr_codes/{qr_id}/payments"
CLOSE = "/v1/payments/qr_codes/{qr_id}/close"
AUTH = "Basic " + base64.b64encode(b"mock_key:mock_secret").decode()


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

    def _request(self, path, tenant=None, data=None, auth=None, raw=False):
        req = urllib.request.Request(self.base + path, data=data)
        if tenant:
            req.add_header("X-Tenant-Id", tenant)
        if auth:
            req.add_header("Authorization", auth)
        if data is not None:
            req.add_header("Content-Type", "application/json")
        try:
            with urllib.request.urlopen(req, timeout=5) as resp:
                body = resp.read()
                if raw:
                    return resp.status, body, resp.headers.get("Content-Type")
                return resp.status, body.decode("utf-8")
        except urllib.error.HTTPError as e:
            if raw:
                return e.code, e.read(), e.headers.get("Content-Type")
            return e.code, e.read().decode("utf-8")

    def _post(self, path, body):
        return self._request(path, data=json.dumps(body).encode("utf-8"))

    def _scenario(self, name, path=CONFIG):
        return self._post("/__mock/scenario", {"path": path, "scenario": name})

    def _state(self):
        return json.loads(self._request("/__mock/state")[1])

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

    def test_every_scenario_in_every_route_loads(self):
        with open(os.path.join(os.path.dirname(SCENARIO_DIR), "..", "routes.json")) as f:
            routes = json.load(f)["routes"]
        for r in routes:
            for name in server.list_scenarios(r["scenarios_dir"]):
                env = server.load_scenario(r["scenarios_dir"], name)
                self.assertTrue("body" in env or "raw_body" in env or "sequence" in env, "%s/%s" % (r["path"], name))

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
                self.assertTrue(f["image_url"].startswith("{{origin}}/__mock/assets/flavors/"), name)


    # --- Razorpay mock (PAY-02) -------------------------------------------------

    def test_pattern_route_and_empty_segment(self):
        status, _ = self._request("/v1/payments/qr_codes/qr_ABC/payments", auth=AUTH)
        self.assertEqual(status, 200)
        self.assertEqual(self._request("/v1/payments/qr_codes//payments", auth=AUTH)[0], 404)

    def test_basic_auth(self):
        path = "/v1/payments/qr_codes/qr_ABC/payments"
        self.assertEqual(self._request(path)[0], 401)
        empty = "Basic " + base64.b64encode(b":").decode()
        self.assertEqual(self._request(path, auth=empty)[0], 401)
        self.assertEqual(self._request(path, auth=AUTH)[0], 200)

    def test_create_echoes_request(self):
        req = {"payment_amount": 7500, "notes": {"order_id": "01J8Z6Q4M9X3T7C2V5B8N1K4RD"},
               "close_by": 123, "name": "x", "description": "y"}
        status, text = self._request(CREATE, data=json.dumps(req).encode(), auth=AUTH)
        self.assertEqual(status, 200)
        body = json.loads(text)
        self.assertEqual(body["payment_amount"], 7500)
        self.assertIsInstance(body["payment_amount"], int)
        self.assertEqual(body["notes"]["order_id"], "01J8Z6Q4M9X3T7C2V5B8N1K4RD")
        self.assertTrue(body["image_url"].startswith(self.base + "/__mock/assets/"))
        self.assertIsInstance(body["created_at"], int)
        self.assertEqual(self._state()["last_body"][CREATE], req)

    def test_paid_after_3_sequence(self):
        self._scenario("paid_after_3", PAYMENTS)
        path = "/v1/payments/qr_codes/qr_X/payments"
        counts = [json.loads(self._request(path, auth=AUTH)[1])["count"] for _ in range(4)]
        self.assertEqual(counts, [0, 0, 1, 1])
        self._scenario("paid_after_3", PAYMENTS)
        self.assertEqual(json.loads(self._request(path, auth=AUTH)[1])["count"], 0)

    def test_close_route(self):
        status, text = self._request("/v1/payments/qr_codes/qr_X/close", data=b"{}", auth=AUTH)
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(text)["status"], "closed")
        self.assertEqual(self._state()["request_counts"][CLOSE], 1)

    def test_static_asset(self):
        status, body, ctype = self._request("/__mock/assets/qr_demo.png", raw=True)
        self.assertEqual(status, 200)
        self.assertEqual(ctype, "image/png")
        self.assertTrue(body.startswith(b"\x89PNG\r\n\x1a\n"))
        self.assertEqual(self._request("/__mock/assets/../server.py", raw=True)[0], 404)

    # --- Flavor images (IMG-01) ------------------------------------------------

    GUAVA = "/__mock/assets/flavors/prymor_guava-20260926a.png"

    def test_flavor_asset_subfolder(self):
        status, body, ctype = self._request(self.GUAVA, raw=True)
        self.assertEqual((status, ctype), (200, "image/png"))
        self.assertTrue(body.startswith(b"\x89PNG\r\n\x1a\n"))
        self.assertEqual(self._request("/__mock/assets/flavors/nope-1.png", raw=True)[0], 404)
        self.assertEqual(self._request("/__mock/assets/flavors/../../server.py", raw=True)[0], 404)

    def test_asset_counts(self):
        self._request(self.GUAVA, raw=True)
        self._request(self.GUAVA + "?sig=abc", raw=True)
        self._request("/__mock/assets/flavors/nope-1.png", raw=True)
        state = self._state()
        self.assertEqual(state["asset_counts"], {"flavors/prymor_guava-20260926a.png": 2, "flavors/nope-1.png": 1})
        self.assertIsNone(state["asset_last_tenant"])
        self._request(self.GUAVA, tenant="t-1", raw=True)
        self.assertEqual(self._state()["asset_last_tenant"], "t-1")
        self._post("/__mock/reset", {})
        self.assertEqual(self._state()["asset_counts"], {})

    def test_asset_delay_ms(self):
        plain = self._request(self.GUAVA, raw=True)[1]
        started = time.monotonic()
        status, body, _ = self._request(self.GUAVA + "?delay_ms=300", raw=True)
        self.assertGreaterEqual(time.monotonic() - started, 0.3)
        self.assertEqual((status, body), (200, plain))

    def test_default_image_urls_point_at_existing_assets(self):
        for name in ("default", "images_v2"):
            env = server.load_scenario("responses/config", name)
            for f in env["body"]["flavors"]:
                url = f["image_url"]
                prefix = "{{origin}}/__mock/assets/"
                self.assertTrue(url.startswith(prefix), url)
                rel = url[len(prefix):].split("?", 1)[0]
                self.assertTrue(os.path.isfile(os.path.join(server.ASSETS, rel)), "%s: %s" % (name, rel))

    def test_generated_images_are_reproducible(self):
        def pixels(data):
            """IHDR + decompressed IDAT (independent of the zlib build's compressed bytes)."""
            if not data.startswith(b"\x89PNG"):
                return data
            out, pos = [], 8
            while pos < len(data):
                length = int.from_bytes(data[pos:pos + 4], "big")
                tag, chunk = data[pos + 4:pos + 8], data[pos + 8:pos + 8 + length]
                if tag in (b"IHDR", b"IDAT"):
                    out.append(chunk if tag == b"IHDR" else zlib.decompress(chunk))
                pos += 12 + length
            return b"".join(out)

        for name, data in make_flavor_images.images().items():
            with open(os.path.join(server.ASSETS, "flavors", name), "rb") as f:
                self.assertEqual(pixels(f.read()), pixels(data), name)

    def test_telemetry_route(self):
        path = "/fuelbot/telemetry"
        record = {"event_type": "dispense_cycle", "order_id": "01J8Z6Q4M9X3T7C2V5B8N1K4RD", "stages": []}
        self.assertEqual(self._request(path, data=json.dumps(record).encode())[0], 400, "needs X-Tenant-Id")
        status, text = self._request(path, data=json.dumps(record).encode(), tenant="t-1")
        self.assertEqual((status, json.loads(text)), (201, {"ok": True}))
        state = self._state()
        self.assertEqual(state["last_body"][path], record)
        self.assertEqual(state["request_counts"][path], 2, "the 400 without a tenant counts too")
        for scenario, code in (("server_error", 500), ("bad_request", 400)):
            self._scenario(scenario, path)
            self.assertEqual(self._request(path, data=b"{}", tenant="t-1")[0], code, scenario)

    def test_sales_route(self):
        path = "/fuelbot/sales"
        sale = {"order_id": "01J8Z6Q4M9X3T7C2V5B8N1K4RD", "charged_price": 75, "dispensing_result": "success"}
        self.assertEqual(self._request(path, data=json.dumps(sale).encode())[0], 400, "needs X-Tenant-Id")
        status, text = self._request(path, data=json.dumps(sale).encode(), tenant="t-1")
        self.assertEqual((status, json.loads(text)), (201, {"ok": True}))
        self.assertEqual(self._state()["last_body"][path], sale)
        for scenario, code in (("server_error", 500), ("bad_request", 400)):
            self._scenario(scenario, path)
            self.assertEqual(self._request(path, data=b"{}", tenant="t-1")[0], code, scenario)

    def test_config_route_unchanged_by_auth(self):
        self.assertEqual(self._request(CONFIG)[0], 400)
        self.assertEqual(self._config()[0], 200)


if __name__ == "__main__":
    unittest.main()
