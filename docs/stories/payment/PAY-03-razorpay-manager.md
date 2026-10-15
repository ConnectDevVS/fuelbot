# PAY-03 — `RazorpayManager` autoload

**As the** payment screen, **I want** one service that creates a UPI QR for an
order, downloads its image, reports payment progress and closes the QR,
**so that** the screen only handles presentation.

Plan refs: §2.2.3–4 (port the working logic, credentials out of source),
§3.5; README decisions 2, 3, 5, 6, 11, 14.
Depends on: PAY-01 (order ID), PAY-02 (mock routes).

## Deliverables

```
autoload/RazorpayManager.gd
project.godot                    # register after OrderCounter, above DevCapture
config/local_settings.json       # + api.razorpay_base_url, payments block (below)
tools/dev_setup.gd               # + --payments=mock|razorpay-test
tests/unit/test_razorpay_manager.gd
```

## Spec

### Settings

In `config/local_settings.json`:

```json
"api": { …, "razorpay_base_url": "https://api.razorpay.com" },
"payments": { "allow_live_keys": false, "credentials_path": "user://razorpay_credentials.cfg" }
```

Timing already exists: `payment_poll_interval_sec` (3), `payment_poll_timeout_sec`
(180), `qr_expiry_sec` (180).

### Credentials

`user://razorpay_credentials.cfg` is a `ConfigFile`:

```ini
[razorpay]
key_id="rzp_test_…"
key_secret="…"
```

- It's read in `_ready()` (and again in `reload_credentials()`, for tests).
  If the file is missing or either value is empty → `is_configured() == false`
  and `push_warning("[Razorpay] no credentials at <path>")`.
- `func mode() -> String`: `"test"` if `key_id` begins with `rzp_test_`,
  `"live"` for `rzp_live_`, `"mock"` for anything else (dev_setup's mock
  keys), `""` if not configured.
- **Live-key guard:** if `mode() == "live"` and
  `not payments.allow_live_keys`, the manager is **not usable**: `create_qr`
  emits `qr_create_failed("live_keys_disallowed")`.
- Log `"[Razorpay] ready (mode=test)"`. **Never log `key_id` or
  `key_secret`**, and never put them in error messages. The auth header is
  built once and kept in memory only.
- `*.cfg` provisioning files are already gitignored (`razorpay_credentials.cfg`
  is listed explicitly).

### Public API (plan §3.5, extended)

```gdscript
signal qr_created(qr_id: String, image_path: String, amount_rupees: int)
signal qr_create_failed(reason: String)            # "not_configured" | "live_keys_disallowed" | "http_<code>" | "network" | "bad_response" | "image_download"
signal payment_received(payment_id: String, amount_paise: int)
signal payment_failed(reason: String)              # "failed" | "timeout"

func is_configured() -> bool
func mode() -> String
func create_qr(amount_rupees: int, order_id: String, order_number: int, description: String) -> void
func check_now() -> void            # one immediate poll; same signals as polling (used by Cancel)
func stop_polling() -> void
func close_qr() -> void             # POST …/close for the current QR; fire-and-forget; safe to call twice
func current_qr_id() -> String
```

It **never touches `OrderState`** (plan §3.5). The caller passes everything
in.

### Behaviour

- **One `HTTPRequest` per concern:** `_http_create`, `_http_image`,
  `_http_poll`, `_http_close`. Timeout is `api.request_timeout_sec`.
- **Base URL** comes from `api.razorpay_base_url` (the override can point it
  at the mock). Paths: `POST /v1/payments/qr_codes`,
  `GET /v1/payments/qr_codes/<id>/payments`,
  `POST /v1/payments/qr_codes/<id>/close`.
- **Create body** (port of `second.gd`, **with the fixes noted**):
  ```json
  {"type": "upi_qr", "name": "<tenant display_name, ≤ 50 chars>", "usage": "single_use",
   "fixed_amount": true, "payment_amount": <rupees × 100>, "description": "<description>",
   "close_by": <now + qr_expiry_sec>,
   "notes": {"order_id": "<ULID>", "order_number": "<n>", "tenant_id": "<ConfigManager.tenant_id>"}}
  ```
  The old code used `close_by = now + 900`. It must be `now + qr_expiry_sec`
  (180) so Razorpay closes the QR when the screen gives up. Razorpay rejects a
  `close_by` that's too soon (the mock's `bad_request` mirrors this); PAY-06
  confirms the real minimum, and `qr_expiry_sec` must stay above it.
- **On create 200:** read `id` and `image_url`. If either is missing, emit
  `qr_create_failed("bad_response")`. Otherwise download the image with
  `_http_image` into `user://qr_current.png` (the `download_file` property).
  On success emit `qr_created(id, "user://qr_current.png", amount_rupees)` and
  **start polling**. Download failure → `qr_create_failed("image_download")`
  and `close_qr()`.
- **Polling:** a `Timer` every `payment_poll_interval_sec`, with only one poll
  in flight at a time. It stops after `payment_poll_timeout_sec`, then emits
  `payment_failed("timeout")`.
  - `items[0].status == "captured"` → `stop_polling()`, emit
    `payment_received(items[0].id, items[0].amount)`.
  - `"failed"` → `stop_polling()`, emit `payment_failed("failed")`.
  - Empty, other status, HTTP error or network error → keep polling. A
    transient error must not fail a paid order; only the timeout ends it.
- **`check_now()`:** fires one poll immediately (even when polling is stopped)
  and emits the same signals. If a poll is already in flight, wait for it.
- **`close_qr()`:** POST close for `current_qr_id()`, ignoring the response.
  It's a no-op without a current QR, and it clears the current QR ID.
- **Exactly once:** after `payment_received` or `payment_failed`, ignore any
  further poll results for that QR.
- **Guard:** `create_qr` while a QR is active → `stop_polling()` and
  `close_qr()` the old one first.

### `tools/dev_setup.gd`: `--payments=mock|razorpay-test`

- `mock` (the default when the flag is given without a value, **and** for
  plain `dev_setup.gd` from now on): writes `user://razorpay_credentials.cfg`
  with `key_id="mock_key"`, `key_secret="mock_secret"` (mode `mock`), and adds
  `api.razorpay_base_url = <mock origin>` to the override
  (`http://127.0.0.1:8787`).
- `razorpay-test`: **removes** `razorpay_base_url` from the override (so the
  real Razorpay is used) and **does not write credentials**. If the credentials
  file is missing or has mock keys, print the path and the exact file format
  to create by hand, and exit 1. It never accepts keys as arguments (README
  decision 14).
- `--clear` also removes `razorpay_credentials.cfg` and `qr_current.png`.

## Acceptance criteria

`tests/unit/test_razorpay_manager.gd` uses a **fresh instance** (like the
ConfigManager tests). It sets a test `credentials_path` under
`user://test_rzp/`, writes mock creds, and points `razorpay_base_url` at
`MOCK_ORIGIN` (:8788) via the manager's settings override for tests (inject
`base_url` / `credentials_path` / timing through overridable vars; don't
mutate the real autoload).
- [ ] No creds file → `is_configured() == false`; `create_qr` →
      `qr_create_failed("not_configured")` with no request made
      (`request_counts` unchanged).
- [ ] `rzp_live_x` creds with `allow_live_keys=false` → `mode() == "live"`,
      `create_qr` → `qr_create_failed("live_keys_disallowed")`.
- [ ] `rzp_test_x` → `mode() == "test"`. `mock_key` → `"mock"`.
- [ ] Happy path (`rzp_qr_payments` = `paid_after_3`, poll interval 0.2 s):
      `qr_created` fires with an existing PNG file at `image_path`; then
      `payment_received("pay_MockPay0000001", 7500)` within 2 s. `last_body` of
      the create route has `payment_amount == 7500`, `notes.order_id ==` the
      passed ULID, `usage == "single_use"`, `type == "upi_qr"`, and
      `close_by - now` within `qr_expiry_sec ± 5`.
- [ ] Captured is emitted **once** even though the mock keeps returning it.
- [ ] `failed` → `payment_failed("failed")`.
- [ ] Timeout: `default` (pending), poll timeout 0.6 s →
      `payment_failed("timeout")`.
- [ ] A transient poll error (`server_error`, then switch to `paid`) doesn't
      fail the order and ends in `payment_received`.
- [ ] `bad_request` create → `qr_create_failed("http_400")`. `server_error` →
      `qr_create_failed("http_500")`.
- [ ] `close_qr()` hits the close route (the count increases) and clears
      `current_qr_id()`. A second call makes no request.
- [ ] `check_now()` after `stop_polling()` with `paid` → `payment_received`.
- [ ] **No secret in logs:** capture the test's own print/warning output
      around a create with creds `key_id="rzp_test_SENTINEL1"` /
      `key_secret="SENTINEL2"` and assert neither sentinel appears. If
      capturing engine output isn't feasible in GDScript, assert the manager
      has no code path formatting `_key_id`/`_key_secret` into strings: grep
      in the test runner script (`run_tests.sh`) for
      `print.*key_(id|secret)|push_.*key_(id|secret)` in `autoload/RazorpayManager.gd`
      and fail on a match.
- [ ] `dev_setup.gd` (default) writes mock creds and the base-URL override.
      `--payments=razorpay-test` without real creds exits 1 with instructions.
      `--clear` removes creds.
- [ ] `tools/run_tests.sh`, `tools/check_boot.sh` and the mock tests pass.
      `git grep -nE "rzp_(live|test)_[A-Za-z0-9]{6,}" -- ':!devdocs'` is empty.

## Out of scope

UI (PAY-05), the bridge (PAY-04), refunds and webhooks.
