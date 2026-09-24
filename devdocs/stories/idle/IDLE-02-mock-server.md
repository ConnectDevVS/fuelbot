# IDLE-02 — Mock server (`mockserver/`)

**As a** developer, **I want** a local stand-in for the backend that serves
tenant config from JSON files, **so that** the kiosk can be built and tested
before any real API exists.

Plan refs: §2.1.1 (no backend yet), §3.1 (schema), §3.3 (`X-Tenant-Id`),
§3.11 (maintenance poll), §5 M1 (`tools/mock_config_server.py`). This story
**replaces** that single script with a self-contained `mockserver/` folder.
Depends on: nothing (Python 3 standard library only, no pip installs).

## Deliverables

```
mockserver/
├── .gdignore               # empty: keep Godot from importing/exporting this folder
├── README.md
├── server.py                 # stdlib ThreadingHTTPServer
├── routes.json               # route table → scenario directories
├── scenario.sh               # helper: switch the active scenario on a running server
├── test_server.py            # unittest, starts server on an ephemeral port
└── responses/
    └── config/
        ├── default.json
        ├── maintenance_on.json
        ├── maintenance_no_message.json
        ├── price_change.json
        ├── invalid_duplicate_hopper.json
        ├── malformed_json.json
        ├── server_error.json
        └── slow.json
```

## Spec

### `routes.json`

```json
{
  "routes": [
    {
      "method": "GET",
      "path": "/fuelbot/config",
      "scenarios_dir": "responses/config",
      "default_scenario": "default",
      "require_tenant_header": true
    }
  ]
}
```

Later stories (sales §3.12, telemetry §3.8) add routes here with their own
`responses/<name>/` folders. `server.py` must not special-case any route.

### Scenario file format

Each `responses/<route>/<name>.json` is an **envelope**:

| Key | Type | Meaning |
|-----|------|---------|
| `description` | string | One line, shown in `GET /__mock/state` |
| `status` | int | HTTP status, default `200` |
| `delay_ms` | int | Sleep before responding, default `0` |
| `headers` | object | Extra response headers |
| `body` | any JSON | Response body, serialised as JSON |
| `extends` | string | Name of a sibling scenario to start from |
| `body_patch` | object | Deep-merged onto the extended scenario's `body` |
| `raw_body` | string | Sent verbatim instead of `body`, for malformed-JSON tests |

**Deep-merge rules** for `body_patch`:
- objects merge recursively
- arrays whose elements are **all objects with an `id`** merge element-wise by
  `id` (patch fields into the matching element; unmatched patch elements are
  appended)
- any other value (scalars, other arrays, `null`) **replaces**
- `extends` chains are resolved recursively. Detect cycles and respond `500`.

Files are **re-read on every request**. Editing a JSON file takes effect on the
next request, with no restart.

### `server.py`

`python3 mockserver/server.py [--host 127.0.0.1] [--port 8787] [--scenario PATH=NAME ...]`

- All paths are resolved relative to `server.py`'s own directory, so it works
  from any working directory.
- For a matching route:
  - If `require_tenant_header` is set and `X-Tenant-Id` is missing or blank,
    respond `400 {"error": "missing X-Tenant-Id header"}`. This enforces plan
    §3.3.
  - Load the active scenario, sleep `delay_ms`, then send `status` +
    `headers` + body with `Content-Type: application/json`.
  - Unknown scenario name: `500 {"error": "unknown scenario <name>"}`.
- No matching route: `404 {"error": "no route"}`.
- One log line per request to stdout, flushed:
  `[mock] GET /fuelbot/config tenant=machine-042 scenario=default -> 200 (3 ms)`
- **Admin endpoints** (never require the tenant header):
  - `GET /__mock/state` returns
    `{"active": {"/fuelbot/config": "default"}, "scenarios": {"/fuelbot/config": {"default": "<description>", ...}}, "request_counts": {"/fuelbot/config": 3}, "last_tenant": {"/fuelbot/config": "machine-042"}}`
  - `POST /__mock/scenario` with body `{"path": "/fuelbot/config", "scenario": "maintenance_on"}`
    returns `200` with the new state, or `400` if the path or scenario is
    unknown.
  - `POST /__mock/reset` restores default scenarios and zeroes counts and
    `last_tenant`.
- Uses `http.server.ThreadingHTTPServer` so a `slow` response doesn't block the
  admin endpoints. State access is guarded by a `threading.Lock`.
- `Ctrl+C` exits cleanly with code 0.
- Expose a `make_server(host, port, overrides) -> ThreadingHTTPServer` function
  so `test_server.py` can run it in a thread on port `0`.

### `scenario.sh`

`mockserver/scenario.sh <scenario> [path=/fuelbot/config] [port=${MOCK_PORT:-8787}]`
POSTs to `/__mock/scenario` with `curl -sf` and pretty-prints the JSON result
using `python3 -m json.tool`. `mockserver/scenario.sh reset` calls
`/__mock/reset`.

### Scenario content

`default.json` is the demo tenant from the design: **six drinks on hoppers
1–6**, filling the design's 2×3 grid. It uses real product images from the old
build. There is one popular item and one sold-out item so every card state is
visible. Nutrition values are
**sample data** (README decision 12).

```json
{
  "description": "PowerFuel Gym demo tenant: 6 flavors on hoppers 1-6, one popular, one sold out",
  "status": 200,
  "body": {
    "version": 1,
    "tenant": {
      "display_name": "PowerFuel Gym",
      "logo_text": "PF",
      "location_label": "FUELBOT · BAY 02",
      "site": "PowerFuel Gym / Bay 02",
      "support_phone": "1800 419 0142"
    },
    "flavors": [
      {
        "id": "guava", "name": "Prymor Guava", "hopper": 1,
        "actual_price": 90, "offer_price": 75,
        "image": "res://assets/images/flavors/prymor_guava.png",
        "description": "Cold-blended whey isolate with real guava and electrolytes.",
        "volume_ml": 400,
        "nutrition": {"kcal": 210, "protein_g": 24, "carbs_g": 12, "fat_g": 2},
        "ingredients": ["Whey Isolate", "Guava Flavor", "Electrolytes"],
        "allergens": ["Milk", "Soy"],
        "badge": "POPULAR", "sold_out": false, "enabled": true
      },
      {
        "id": "chocolate", "name": "MMN Chocolate", "hopper": 2,
        "actual_price": 180, "offer_price": null,
        "image": "res://assets/images/flavors/mmn_chocolate.png",
        "description": "Classic chocolate whey shake.",
        "volume_ml": 400,
        "nutrition": {"kcal": 310, "protein_g": 24, "carbs_g": 30, "fat_g": 6},
        "ingredients": ["Whey Protein", "Cocoa"],
        "allergens": ["Milk"],
        "badge": null, "sold_out": false, "enabled": true
      },
      {
        "id": "electro", "name": "Prymor Electro", "hopper": 3,
        "actual_price": 35, "offer_price": null,
        "image": "res://assets/images/flavors/prymor_electro.png",
        "description": "Light electrolyte recovery drink.",
        "volume_ml": 400,
        "nutrition": {"kcal": 60, "protein_g": 0, "carbs_g": 14, "fat_g": 0},
        "ingredients": ["Electrolytes", "Citrus Flavor"],
        "allergens": [],
        "badge": null, "sold_out": false, "enabled": true
      },
      {
        "id": "vanilla", "name": "ON Vanilla", "hopper": 4,
        "actual_price": 140, "offer_price": null,
        "image": "res://assets/images/flavors/on_vanilla.png",
        "description": "Gold Standard vanilla whey.",
        "volume_ml": 400,
        "nutrition": {"kcal": 240, "protein_g": 24, "carbs_g": 8, "fat_g": 3},
        "ingredients": ["Whey Protein", "Vanilla Flavor"],
        "allergens": ["Milk", "Soy"],
        "badge": null, "sold_out": true, "enabled": true
      },
      {
        "id": "cookie", "name": "Prymor Cookies & Cream", "hopper": 5,
        "actual_price": 160, "offer_price": null,
        "image": "res://assets/images/flavors/prymor_cookie.png",
        "description": "Cookies-and-cream whey shake.",
        "volume_ml": 400,
        "nutrition": {"kcal": 290, "protein_g": 25, "carbs_g": 26, "fat_g": 5},
        "ingredients": ["Whey Protein", "Cookie Crumb", "Cocoa"],
        "allergens": ["Milk", "Gluten"],
        "badge": null, "sold_out": false, "enabled": true
      },
      {
        "id": "coffee", "name": "Beast Coffee", "hopper": 6,
        "actual_price": 190, "offer_price": null,
        "image": "res://assets/images/flavors/beast_coffee.png",
        "description": "Cold-brew coffee protein shake.",
        "volume_ml": 400,
        "nutrition": {"kcal": 260, "protein_g": 25, "carbs_g": 18, "fat_g": 4},
        "ingredients": ["Whey Protein", "Cold Brew Coffee"],
        "allergens": ["Milk"],
        "badge": null, "sold_out": false, "enabled": true
      }
    ],
    "bases": [
      {"id": "water", "name": "Water", "code": "B2", "enabled": true},
      {"id": "milk", "name": "Milk", "code": "B1", "enabled": false}
    ],
    "maintenance": {
      "enabled": false, "message": "",
      "flagged_by": null, "flagged_at": null, "faults": []
    },
    "idle_video_url": null
  }
}
```

The other scenarios all use `"extends": "default"` unless noted:

| File | Envelope content | Used to verify |
|------|------------------|----------------|
| `maintenance_on.json` | `body_patch.maintenance` = `{"enabled": true, "message": "This machine is temporarily unavailable. No payment will be taken. Service has been notified remotely.", "flagged_by": "Remote console · ops@fuelbot", "flagged_at": "2026-09-24T00:41:00Z", "faults": [{"code": "E-204", "description": "Blender motor temperature above threshold"}, {"code": "E-118", "description": "Hopper 3 (electro) level low"}]}` | redirect to maintenance, remote message, diagnostics |
| `maintenance_no_message.json` | `maintenance` = `{"enabled": true, "message": "", "flagged_by": "Remote console", "flagged_at": "2026-09-24T00:41:00Z", "faults": []}` | fallback to local `maintenance_default` |
| `price_change.json` | `flavors: [{"id": "chocolate", "actual_price": 199}, {"id": "electro", "enabled": false}]` | plan §7 step 4: live catalog change, no code edit. Electro disappears. |
| `invalid_duplicate_hopper.json` | `flavors: [{"id": "chocolate", "hopper": 1}]` | validation rejects the payload (plan §3.3 step 6) |
| `malformed_json.json` | no `extends`; `"raw_body": "{\"version\": 1, \"flavors\": ["` | parse-error fallback |
| `server_error.json` | no `extends`; `"status": 500, "body": {"error": "internal"}` | non-200 fallback |
| `slow.json` | `"delay_ms": 15000` | HTTP timeout fallback (client timeout is 10 s) |

### `test_server.py`

`python3 -m unittest mockserver/test_server.py -v`. It starts
`make_server("127.0.0.1", 0, {})` in a daemon thread and uses `urllib.request`.
Cases:
1. `GET /fuelbot/config` without the header → 400.
2. With `X-Tenant-Id: t-1` → 200. The body parses, has 6 flavors, and
   `last_tenant` in state is `t-1`.
3. Switch to `price_change` via the admin endpoint → chocolate `actual_price`
   is 199, electro `enabled` is false, and the other four flavors are
   unchanged (merge by id works).
4. `malformed_json` → body is not valid JSON (`json.loads` raises).
5. `server_error` → 500.
6. Unknown scenario via admin → 400. `reset` restores `default` and counts go
   to 0.
7. Every file in `responses/config/` resolves (loop over the directory, switch
   to each, and request it; `slow` excepted). This catches broken
   `extends`/patches.
8. Every resolved 200 body (except `invalid_duplicate_hopper` and
   `malformed_json`) has unique hoppers 1–6 among enabled flavors, and every
   `image` starts with `res://assets/images/flavors/`.

### `README.md` (in `mockserver/`)

Keep it short: how to run, the envelope format, the merge rules, the scenario
table above, the admin endpoints with `curl` examples, and how to add a route.

## Acceptance criteria

- [ ] `python3 -m unittest mockserver/test_server.py -v` passes (8 tests).
- [ ] `python3 mockserver/server.py` then
      `curl -s -H 'X-Tenant-Id: machine-042' localhost:8787/fuelbot/config | python3 -m json.tool`
      prints the default config. The server log shows `tenant=machine-042`.
- [ ] `curl -si localhost:8787/fuelbot/config | head -1` shows `400`.
- [ ] `mockserver/scenario.sh maintenance_on`, then re-curl →
      `maintenance.enabled` is `true`. `mockserver/scenario.sh reset` → back to
      `false`.
- [ ] Editing `default.json` while the server runs is reflected on the next
      curl.
- [ ] No third-party imports (`grep -E "^(import|from)" mockserver/*.py` shows
      only stdlib modules).

## Out of scope

Sales/telemetry routes (their stories add them), HTTPS, auth beyond the
header-presence check.
