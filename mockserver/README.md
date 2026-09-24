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

| Method | Path | Scenarios | Checks |
|--------|------|-----------|--------|
| GET | `/fuelbot/config` | `responses/config/` | `X-Tenant-Id` |
| POST | `/v1/payments/qr_codes` | `responses/rzp_qr_create/` | Basic auth |
| GET | `/v1/payments/qr_codes/{qr_id}/payments` | `responses/rzp_qr_payments/` | Basic auth |
| POST | `/v1/payments/qr_codes/{qr_id}/close` | `responses/rzp_qr_close/` | Basic auth |

The Razorpay routes mirror Razorpay's real paths, so the app talks to the mock
or to `https://api.razorpay.com` through the same code (switched by
`api.razorpay_base_url`). Basic auth accepts any non-empty `id:secret`. Only
`auth=basic`/`auth=missing` is logged, never the value.

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
| `sequence` | List of envelopes served in order, one per request; the last repeats; restarts on scenario switch/reset |

**Placeholders** in response bodies: `{{origin}}` (e.g. `http://127.0.0.1:8787`),
`{{now}}` (Unix seconds), and `{{request.<key>}}` (a top-level key of the JSON
request body). A string that is exactly one placeholder takes the value's JSON
type, so `"{{request.payment_amount}}"` stays a number.

**Route paths** may contain `{name}` segments (one path segment each). Exact
routes win over patterns, and captured values are logged as `params=`.

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

## Razorpay scenarios

| Route | Scenario | Purpose |
|-------|----------|---------|
| create | `default` | QR created; echoes amount/notes/close_by; `image_url` → placeholder PNG |
| create | `bad_request` | 400 (e.g. `close_by` too soon) |
| create | `server_error` | 500 |
| payments | `default` | Pending forever |
| payments | `paid` | Captured immediately (7500 paise) |
| payments | `paid_after_3` | Pending, pending, captured (a sequence) |
| payments | `failed` | Payment failed |
| payments | `server_error` | 500 |
| close | `default` | Closed on demand |

`assets/qr_demo.png` comes from `make_demo_qr.py`. It looks like a QR but is
**not scannable**: real QRs come only from Razorpay.

## Admin endpoints

```bash
curl -s localhost:8787/__mock/state | python3 -m json.tool
mockserver/scenario.sh maintenance_on          # POST /__mock/scenario
mockserver/scenario.sh reset                   # POST /__mock/reset
curl -s -X POST localhost:8787/__mock/scenario \
     -d '{"path": "/fuelbot/config", "scenario": "price_change"}'
```

`/__mock/state` reports, for each route: the active scenario, the available
scenarios, request counts, the last tenant ID seen, and `last_body` (the
last parsed JSON request body, for asserting what the app sent).
`GET /__mock/assets/<file>` serves `mockserver/assets/` with no auth.

For pattern routes, pass the path exactly as written in `routes.json`:
`mockserver/scenario.sh paid_after_3 '/v1/payments/qr_codes/{qr_id}/payments'`.
