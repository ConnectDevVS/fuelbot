#!/usr/bin/env python3
"""FuelBot mock backend: serves JSON scenario files per route (stdlib only).

Usage: python3 mockserver/server.py [--host 127.0.0.1] [--port 8787] [--scenario PATH=NAME ...]
See mockserver/README.md for the scenario envelope format and admin endpoints.
"""
import argparse
import base64
import copy
import json
import mimetypes
import os
import re
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.join(ROOT, "assets")
PLACEHOLDER = re.compile(r"\{\{([a-zA-Z0-9_.]+)\}\}")


class ScenarioError(Exception):
    pass


def deep_merge(base, patch):
    """Objects merge recursively; arrays of id-objects merge by id; anything else replaces."""
    if isinstance(base, dict) and isinstance(patch, dict):
        out = copy.deepcopy(base)
        for key, value in patch.items():
            out[key] = deep_merge(out[key], value) if key in out else copy.deepcopy(value)
        return out
    if _is_id_list(base) and _is_id_list(patch):
        out = copy.deepcopy(base)
        index = {item["id"]: i for i, item in enumerate(out)}
        for item in patch:
            if item["id"] in index:
                out[index[item["id"]]] = deep_merge(out[index[item["id"]]], item)
            else:
                out.append(copy.deepcopy(item))
        return out
    return copy.deepcopy(patch)


def _is_id_list(value):
    return isinstance(value, list) and len(value) > 0 and all(isinstance(v, dict) and "id" in v for v in value)


def load_scenario(scenarios_dir, name, _seen=None):
    """Returns the fully resolved envelope for a scenario (extends/body_patch applied)."""
    seen = _seen or []
    if name in seen:
        raise ScenarioError("extends cycle: " + " -> ".join(seen + [name]))
    path = os.path.join(ROOT, scenarios_dir, name + ".json")
    if not os.path.isfile(path):
        raise ScenarioError("unknown scenario " + name)
    with open(path, encoding="utf-8") as f:
        env = json.load(f)
    parent_name = env.get("extends")
    if parent_name:
        parent = load_scenario(scenarios_dir, parent_name, seen + [name])
        merged = dict(parent)
        merged.pop("description", None)
        for key, value in env.items():
            if key not in ("extends", "body_patch"):
                merged[key] = value
        if "body_patch" in env:
            merged["body"] = deep_merge(parent.get("body"), env["body_patch"])
        env = merged
    return env


def list_scenarios(scenarios_dir):
    out = {}
    folder = os.path.join(ROOT, scenarios_dir)
    for fname in sorted(os.listdir(folder)):
        if fname.endswith(".json"):
            name = fname[:-5]
            try:
                with open(os.path.join(folder, fname), encoding="utf-8") as f:
                    out[name] = json.load(f).get("description", "")
            except (OSError, ValueError) as e:
                out[name] = "UNREADABLE: %s" % e
    return out


def render(value, context):
    """Replaces {{origin}}, {{now}} and {{request.<key>}} in string leaves.
    A string that is exactly one placeholder takes the placeholder's JSON value."""
    if isinstance(value, dict):
        return {k: render(v, context) for k, v in value.items()}
    if isinstance(value, list):
        return [render(v, context) for v in value]
    if not isinstance(value, str):
        return value
    whole = PLACEHOLDER.fullmatch(value)
    if whole:
        return _lookup(whole.group(1), context)
    return PLACEHOLDER.sub(lambda m: _as_text(_lookup(m.group(1), context)), value)


def _lookup(key, context):
    if key == "origin":
        return context["origin"]
    if key == "now":
        return int(time.time())
    if key.startswith("request."):
        body = context.get("request") or {}
        return body.get(key[len("request."):]) if isinstance(body, dict) else None
    return None


def _as_text(value):
    if value is None:
        return ""
    return value if isinstance(value, str) else json.dumps(value)


def _pattern(path):
    parts = []
    for segment in path.strip("/").split("/"):
        m = re.fullmatch(r"\{([a-zA-Z_][a-zA-Z0-9_]*)\}", segment)
        parts.append("(?P<%s>[^/]+)" % m.group(1) if m else re.escape(segment))
    return re.compile("^/" + "/".join(parts) + "$")


def _basic_auth_ok(header):
    if not header or not header.startswith("Basic "):
        return False
    try:
        user, _, secret = base64.b64decode(header[6:].strip()).decode("utf-8").partition(":")
    except (ValueError, UnicodeDecodeError):
        return False
    return bool(user) and bool(secret)


class MockState:
    def __init__(self, overrides):
        with open(os.path.join(ROOT, "routes.json"), encoding="utf-8") as f:
            self.routes = json.load(f)["routes"]
        for r in self.routes:
            r["_regex"] = _pattern(r["path"])
            r["_is_pattern"] = "{" in r["path"]
        self.overrides = dict(overrides)
        self.lock = threading.Lock()
        self.reset()

    def reset(self):
        with self.lock:
            self.active = {r["path"]: r["default_scenario"] for r in self.routes}
            self.active.update(self.overrides)
            self.request_counts = {r["path"]: 0 for r in self.routes}
            self.last_tenant = {r["path"]: None for r in self.routes}
            self.last_body = {r["path"]: None for r in self.routes}
            self.sequence_pos = {r["path"]: 0 for r in self.routes}

    def match(self, method, path):
        """Exact routes win over pattern routes. Returns (route, params) or (None, None)."""
        for want_pattern in (False, True):
            for r in self.routes:
                if r["method"] != method or r["_is_pattern"] != want_pattern:
                    continue
                m = r["_regex"].match(path)
                if m:
                    return r, m.groupdict()
        return None, None

    def snapshot(self):
        with self.lock:
            return {
                "active": dict(self.active),
                "scenarios": {r["path"]: list_scenarios(r["scenarios_dir"]) for r in self.routes},
                "request_counts": dict(self.request_counts),
                "last_tenant": dict(self.last_tenant),
                "last_body": copy.deepcopy(self.last_body),
            }


def make_handler(state):
    class Handler(BaseHTTPRequestHandler):
        server_version = "FuelBotMock/1.0"

        def log_message(self, fmt, *args):  # silence default access log
            pass

        def _send(self, status, body=None, raw=None, headers=None, content_type="application/json"):
            if isinstance(raw, bytes):
                data = raw
            elif raw is not None:
                data = raw.encode("utf-8")
            else:
                data = json.dumps(body).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(data)))
            for key, value in (headers or {}).items():
                self.send_header(key, value)
            self.end_headers()
            self.wfile.write(data)

        def _read_body(self):
            length = int(self.headers.get("Content-Length") or 0)
            return self.rfile.read(length) if length else b""

        def do_GET(self):
            self._dispatch("GET")

        def do_POST(self):
            self._dispatch("POST")

        def _dispatch(self, method):
            path = self.path.split("?", 1)[0]
            raw_body = self._read_body()
            if path.startswith("/__mock/"):
                return self._admin(method, path, raw_body)
            route, params = state.match(method, path)
            if route is None:
                return self._send(404, {"error": "no route"})
            try:
                request_json = json.loads(raw_body) if raw_body else None
            except ValueError:
                request_json = None
            started = time.monotonic()
            key = route["path"]
            tenant = (self.headers.get("X-Tenant-Id") or "").strip()
            with state.lock:
                state.request_counts[key] += 1
                state.last_tenant[key] = tenant or None
                state.last_body[key] = request_json
                scenario = state.active[key]
            auth = "-"
            if route.get("require_basic_auth"):
                auth = "basic" if _basic_auth_ok(self.headers.get("Authorization")) else "missing"
            if route.get("require_tenant_header") and not tenant:
                status = 400
                self._send(status, {"error": "missing X-Tenant-Id header"})
            elif auth == "missing":
                status = 401
                self._send(status, {"error": {"code": "BAD_REQUEST_ERROR",
                                              "description": "The api key provided is invalid"}})
            else:
                env = self._envelope(route, key, scenario)
                time.sleep(env.get("delay_ms", 0) / 1000.0)
                status = env.get("status", 200)
                context = {"origin": "http://" + (self.headers.get("Host") or "127.0.0.1"),
                           "request": request_json}
                try:
                    self._send(status, render(env.get("body"), context), env.get("raw_body"), env.get("headers"))
                except (BrokenPipeError, ConnectionResetError):
                    status = "client-gone"
            elapsed = int((time.monotonic() - started) * 1000)
            print("[mock] %s %s tenant=%s auth=%s%s scenario=%s -> %s (%d ms)"
                  % (method, path, tenant or "-", auth,
                     (" params=%s" % json.dumps(params)) if params else "",
                     scenario, status, elapsed), flush=True)

        def _envelope(self, route, key, scenario):
            try:
                env = load_scenario(route["scenarios_dir"], scenario)
            except (ScenarioError, ValueError) as e:
                return {"status": 500, "body": {"error": str(e)}}
            sequence = env.get("sequence")
            if not sequence:
                return env
            with state.lock:
                pos = state.sequence_pos[key]
                state.sequence_pos[key] = pos + 1
            return sequence[min(pos, len(sequence) - 1)]

        def _admin(self, method, path, raw_body):
            if method == "GET" and path.startswith("/__mock/assets/"):
                return self._asset(path[len("/__mock/assets/"):])
            if method == "GET" and path == "/__mock/state":
                return self._send(200, state.snapshot())
            if method == "POST" and path == "/__mock/reset":
                state.reset()
                print("[mock] reset", flush=True)
                return self._send(200, state.snapshot())
            if method == "POST" and path == "/__mock/scenario":
                try:
                    req = json.loads(raw_body or b"{}")
                except ValueError:
                    req = {}
                route_path, name = req.get("path"), req.get("scenario")
                route = next((r for r in state.routes if r["path"] == route_path), None)
                if route is None:
                    return self._send(400, {"error": "unknown path %s" % route_path})
                if name not in list_scenarios(route["scenarios_dir"]):
                    return self._send(400, {"error": "unknown scenario %s" % name})
                with state.lock:
                    state.active[route_path] = name
                    state.sequence_pos[route_path] = 0
                print("[mock] scenario %s = %s" % (route_path, name), flush=True)
                return self._send(200, state.snapshot())
            return self._send(404, {"error": "no admin route"})

        def _asset(self, name):
            full = os.path.realpath(os.path.join(ASSETS, name))
            if not name or ".." in name.split("/") or not full.startswith(ASSETS + os.sep) or not os.path.isfile(full):
                return self._send(404, {"error": "no asset"})
            with open(full, "rb") as f:
                data = f.read()
            ctype = mimetypes.guess_type(full)[0] or "application/octet-stream"
            return self._send(200, raw=data, content_type=ctype)

    return Handler


def make_server(host, port, overrides):
    return ThreadingHTTPServer((host, port), make_handler(MockState(overrides)))


def main(argv):
    parser = argparse.ArgumentParser(description="FuelBot mock backend")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8787)
    parser.add_argument("--scenario", action="append", default=[], metavar="PATH=NAME",
                        help="initial scenario for a route, e.g. /fuelbot/config=maintenance_on")
    args = parser.parse_args(argv)
    overrides = {}
    for item in args.scenario:
        path, _, name = item.partition("=")
        overrides[path] = name
    server = make_server(args.host, args.port, overrides)
    print("[mock] listening on http://%s:%d" % (args.host, server.server_address[1]), flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
