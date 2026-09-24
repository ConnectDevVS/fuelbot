# FuelBot mock server

A stand-in for the FuelBot backend. It serves JSON files and needs only the
Python 3 standard library.

```bash
python3 mockserver/server.py                     # http://127.0.0.1:8787
python3 mockserver/server.py --port 8788 --scenario /fuelbot/config=maintenance_on
python3 -m unittest mockserver/test_server.py -v # self-test
```

## Routes

Routes are declared in [`routes.json`](routes.json). Each route points at a
folder of **scenario** files, one response variant per file. Routes with
`require_tenant_header` answer `400` unless an `X-Tenant-Id` header is sent.

| Method | Path | Scenarios |
|--------|------|-----------|
| GET | `/fuelbot/config` | `responses/config/` |

To add a route, add an entry to `routes.json` and create a
`responses/<name>/default.json`. `server.py` has no route-specific code.

## Scenario envelope

| Key | Meaning |
|-----|---------|
| `description` | One line, shown in `/__mock/state` |
| `status` | HTTP status (default 200) |
| `delay_ms` | Sleep before responding |
| `headers` | Extra response headers |
| `body` | JSON response body |
| `raw_body` | String sent verbatim instead of `body` (for malformed-JSON tests) |
| `extends` | Start from a sibling scenario |
| `body_patch` | Deep-merged onto the extended scenario's `body` |

Merge rules: objects merge recursively. Arrays whose items all have an `id`
merge item by item using `id`. Anything else is replaced. Files are re-read on
every request, so edits apply immediately.

## Config scenarios

| Scenario | Purpose |
|----------|---------|
| `default` | PowerFuel Gym demo: 6 flavors on hoppers 1–6, guava popular, vanilla sold out. Nutrition values are **sample data**. |
| `maintenance_on` | Remote maintenance with a message and 2 faults |
| `maintenance_no_message` | Remote maintenance with an empty message (the app uses its local default) |
| `price_change` | Chocolate costs ₹199, electro disabled |
| `invalid_duplicate_hopper` | Two enabled flavors on hopper 1 (the app must reject it) |
| `malformed_json` | Truncated body |
| `server_error` | HTTP 500 |
| `slow` | Responds after 15 s (the app times out at 10 s) |

## Admin endpoints

```bash
curl -s localhost:8787/__mock/state | python3 -m json.tool
mockserver/scenario.sh maintenance_on          # POST /__mock/scenario
mockserver/scenario.sh reset                   # POST /__mock/reset
curl -s -X POST localhost:8787/__mock/scenario \
     -d '{"path": "/fuelbot/config", "scenario": "price_change"}'
```

`/__mock/state` reports the active scenario, the available scenarios, request
counts and the last tenant ID seen for each route.
