# SAL-03 — `SalesReporter`: one durable sale record per paid order

**As the** business, **I want** every paid order reported to the backend with
what was charged and whether the drink was dispensed, **so that** revenue,
failed dispenses and refunds can be reconciled per machine.

Plan refs: §3.12, §7 step 9; README decisions 2–5 and the record.
Depends on: `ReportQueue` (TEL-05) and the dispensing outcomes (DSP-05).

## Deliverables

```
autoload/SalesReporter.gd              # report_sale(record); ReportQueue on user://sales_queue.json
project.godot                          # SalesReporter after TelemetryReporter, before DevCapture
scenes/dispensing/dispensing.gd        # records the sale on entering DONE / FAILED, once per order
config/local_settings.json             # api.sales_path
mockserver/routes.json + responses/sales/{default,server_error,bad_request}.json
mockserver/test_server.py
tests/unit/test_sales_reporter.gd
```

## Spec

- **`SalesReporter` autoload** mirrors `TelemetryReporter`'s queue setup:
  `ReportQueue(self, "user://sales_queue.json",
  ConfigManager.get_api_endpoint("sales_path"), get_backend_headers,
  timing.sale_report_retry_interval_sec, 5000, "[Sales]")`, flushed on boot.
  Test hooks: `queue_path`, `start_queue()`, `queue`.
- **`report_sale(order: Dictionary)`:** builds the record from the argument,
  not global state, and adds `tenant_id` and `timestamp`
  (`get_datetime_string_from_system(true) + "Z"`). It keeps the last 64
  reported `order_id`s and ignores a second report for the same order (logged).
- **`SalesReporter.sale_from_order_state(result: String, reason: String) ->
  Dictionary`** builds the record fields from `OrderState` and the selected
  flavor: `order_id`, `order_number`, `transaction_id`, `flavor_id`,
  `hopper`, `base_id`, `actual_price`, `offer_price`, `charged_price`,
  `currency`, `payment_method`, `dispensing_result`, `dispensing_reason`.
- **The trigger** is `dispensing.gd._enter()`:
  - DONE → `success`, `""`;
  - FAILED on `TIMEOUT` → `timeout` + the bridge's reason;
  - FAILED on `REJECTED` → `rejected` + reason;
  - FAILED at the safety cap → `no_response`, `safety_cap`.
  - It's called once, before `Nav.go_idle()` can reset `OrderState`. A late
    result doesn't re-enter (the existing first-outcome-wins rule).
- **Mock:** route `POST /fuelbot/sales`, `require_tenant_header`; scenarios
  `default` (201), `server_error` (500), `bad_request` (400).

## Acceptance criteria

`tests/unit/test_sales_reporter.gd` (the real autoload, queue under
`user://test_sales/`, backend at the mock on :8788, dispensing with short
timings, the Bridge on a free port):
- [ ] `test_done_reports_success`: DONE → exactly one POST. Body for mock
      guava: `hopper 1`, `actual_price 90`, `offer_price 75`,
      `charged_price 75`, `currency INR`, `payment_method upi`,
      `dispensing_result success`, `dispensing_reason ""`, a timestamp
      ending in `Z`, and `transaction_id`, `order_number` and `order_id`
      from `OrderState`.
- [ ] `test_timeout_reports_timeout`: `TIMEOUT <id> deadline` → `timeout` /
      `deadline`.
- [ ] `test_rejected_reports_rejected`: `REJECTED <id> machine_fault` →
      `rejected` / `machine_fault`.
- [ ] `test_safety_cap_reports_no_response`.
- [ ] `test_once_per_order`: TIMEOUT then DONE for the same order, and a
      direct second `report_sale` → one POST.
- [ ] `test_offline_then_flush` (§7 step 9): `server_error` → the record is
      kept in the queue file; `default` → posted once; no duplicate after a
      further retry interval.
- [ ] `test_prices_from_order`: the catalog price changes after Proceed →
      the record still has the committed `charged_price`.
- [ ] `mockserver/test_server.py`: the sales route requires `X-Tenant-Id`,
      and every scenario loads.
- [ ] The dispensing, telemetry and payment tests still pass.

## Out of scope

Refunds, reconciliation, a real sales backend.
