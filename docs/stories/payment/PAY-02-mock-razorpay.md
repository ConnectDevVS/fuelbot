# PAY-02 — Mock Razorpay & mock-server upgrades

**As a** developer, **I want** the mock server to imitate Razorpay's UPI QR
API, including multi-step payment progress, **so that** the whole payment flow
can be built and tested without a Razorpay account or network.

Plan refs: §3.5; README decisions 5, 13.
Depends on: nothing in this set (it extends the idle set's `mockserver/`).

## Deliverables

```
mockserver/server.py                        # generic features below (no Razorpay-specific code)
mockserver/routes.json                      # + 3 Razorpay routes
mockserver/assets/qr_demo.png               # placeholder QR pattern (generated, committed)
mockserver/make_demo_qr.py                  # stdlib generator for the PNG (zlib + struct)
mockserver/responses/rzp_qr_create/{default,bad_request,server_error}.json
mockserver/responses/rzp_qr_payments/{default,paid,paid_after_3,failed,server_error}.json
mockserver/responses/rzp_qr_close/default.json
mockserver/test_server.py                   # + tests below
mockserver/README.md                        # + new features and routes
```

## Spec

### Generic server features (all route-agnostic)

1. **Path parameters.** A route path may contain `{name}` segments, which
   match exactly one non-empty path segment. Exact routes take precedence over
   patterns. Captured values appear in the log line (`params={"qr_id": …}`).
2. **Basic-auth check.** `"require_basic_auth": true` → respond
   `401 {"error": {"code": "BAD_REQUEST_ERROR", "description": "The api key provided is invalid"}}`
   unless the `Authorization` header is `Basic <base64 of "id:secret">` with a
   non-empty id and secret. The mock accepts **any** such pair. Log only
   `auth=basic` or `auth=missing`, never the value.
3. **Response sequences.** An envelope may contain `"sequence": [env, env, …]`
   instead of a single response. Each request to that route serves the next
   element; the last one repeats. The position resets on scenario switch and
   `/__mock/reset`. Elements may use every envelope key except `extends`.
4. **Request echo / templating.** In a response body (after `extends` and
   `body_patch`), the string placeholders `{{origin}}` (for example
   `http://127.0.0.1:8787`, from the `Host` header) and `{{request.<key>}}`
   (a top-level key of the JSON request body, substituted with its JSON value,
   so a number stays a number when the placeholder is the whole string) are
   replaced. `{{now}}` is Unix seconds.
5. **Last request capture.** `/__mock/state` gains `last_body` per route (the
   parsed JSON request body, or `null`), so tests can assert what the app sent
   (amount in paise, `notes.order_id`, `close_by`).
6. **Static assets.** `GET /__mock/assets/<file>` serves files from
   `mockserver/assets/` with a content type guessed from the extension. It
   needs no auth or tenant header. Reject `..` path traversal with 404.

### Routes (`routes.json`), mirroring Razorpay paths exactly

```json
{"method": "POST", "path": "/v1/payments/qr_codes",                   "scenarios_dir": "responses/rzp_qr_create",   "default_scenario": "default", "require_basic_auth": true},
{"method": "GET",  "path": "/v1/payments/qr_codes/{qr_id}/payments",  "scenarios_dir": "responses/rzp_qr_payments", "default_scenario": "default", "require_basic_auth": true},
{"method": "POST", "path": "/v1/payments/qr_codes/{qr_id}/close",     "scenarios_dir": "responses/rzp_qr_close",    "default_scenario": "default", "require_basic_auth": true}
```

Route keys in `/__mock/state` and `/__mock/scenario` are the path strings as
written above, including `{qr_id}`.

### Scenarios

**`rzp_qr_create/default.json`**, shaped like Razorpay's QR entity:

```json
{
  "description": "QR created (image is a placeholder pattern, not scannable)",
  "status": 200,
  "body": {
    "id": "qr_MockQr00000001",
    "entity": "qr_code",
    "created_at": "{{now}}",
    "name": "{{request.name}}",
    "usage": "single_use",
    "type": "upi_qr",
    "image_url": "{{origin}}/__mock/assets/qr_demo.png",
    "payment_amount": "{{request.payment_amount}}",
    "status": "active",
    "description": "{{request.description}}",
    "fixed_amount": true,
    "notes": "{{request.notes}}",
    "close_by": "{{request.close_by}}"
  }
}
```

- `bad_request.json`: `400 {"error": {"code": "BAD_REQUEST_ERROR", "description": "close_by should be at least 2 minutes after current time"}}`
- `server_error.json`: `500`

**`rzp_qr_payments/`** (collection shape
`{"entity": "collection", "count": n, "items": [...]}`):
- `default.json`: pending forever, `items: []`.
- `paid.json`: one captured item right away:
  `{"id": "pay_MockPay0000001", "entity": "payment", "amount": 7500, "currency": "INR", "status": "captured", "method": "upi"}`.
- `paid_after_3.json`: a **sequence**: pending, pending, then the captured
  item (repeats). This makes "waiting then paid" realistic.
- `failed.json`: one item with `"status": "failed"`.
- `server_error.json`: `500`.

Mock captured amounts are fixed at 7500 paise (guava ₹75). Tests that check
the amount use guava. README decision 11 covers mismatches.

**`rzp_qr_close/default.json`**: `{"id": "qr_MockQr00000001", "entity": "qr_code", "status": "closed", "close_reason": "on_demand"}`.

### `qr_demo.png`

`make_demo_qr.py` writes a 600×600 PNG using only the standard library (zlib
+ struct): a white quiet zone, three finder squares, and a pseudo-random module
grid (fixed seed, deterministic), so it reads as "a QR" on screen. Commit
both the script and its output. It is not scannable (README decision 13).

## Acceptance criteria

`mockserver/test_server.py` additions:
- [ ] Pattern route: `GET /v1/payments/qr_codes/qr_ABC/payments` matches, and
      the log shows `params` with `qr_id=qr_ABC`. `GET /v1/payments/qr_codes//payments` → 404.
- [ ] Missing auth → 401. `Basic` with `id:secret` → 200. `Basic` of `":"` → 401.
- [ ] Create echoes the request: POST
      `{"payment_amount": 7500, "notes": {"order_id": "01J…"}, "close_by": 123, "name": "x", "description": "y"}`
      → `payment_amount` is the **number** 7500, `notes.order_id` echoes,
      `image_url` starts with the server origin, and `last_body` in state
      equals the request.
- [ ] `paid_after_3`: three GETs return `count` 0, 0, 1, and a fourth also
      returns 1. After `/__mock/scenario` re-selects it, the sequence starts
      again.
- [ ] `GET /__mock/assets/qr_demo.png` → 200, `image/png`, a valid PNG
      signature. `/__mock/assets/../server.py` → 404.
- [ ] All existing tests still pass. The config route behaviour is unchanged,
      and the tenant-header check still applies there.
- [ ] Every new scenario file resolves (extend the "every scenario resolves"
      test across all route folders).

General:
- [ ] Still standard library only.
- [ ] `tools/run_tests.sh` and `tools/check_boot.sh` still pass (no Godot
      changes).

## Out of scope

Razorpay webhooks, refunds, and payment-link APIs.
