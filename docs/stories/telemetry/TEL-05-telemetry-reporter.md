# TEL-05 — `TelemetryReporter` and the durable report queue

**As the** operations team, **I want** every telemetry event from the machine
to reach the backend eventually, even across network outages and restarts,
**so that** cycle times and faults can be monitored per machine.

Plan refs: §3.8 (`TelemetryReporter`), §3.12 (the queue pattern Milestone 6
reuses); README decisions 5, 7–10, the event table.
Depends on: TEL-03 (the event shapes). The fake bridge from TEL-04 is used
for the manual check.

## Deliverables

```
core/report_queue.gd                     # class_name ReportQueue (reused by M6 SalesReporter)
autoload/TelemetryReporter.gd            # 4246 listener, enrichment, queue, fault hook (TEL-06)
autoload/ConfigManager.gd                # get_api_endpoint(path_key): base_url + api.<path_key> ("" if unset)
autoload/Bridge.gd                       # order context: send_order_paid(..., context := {}); get_order_context(id)
scenes/payment/payment.gd                # passes the context
scenes/dispensing/dispensing.gd          # records the app-side NO_RESPONSE event at the safety cap
project.godot                            # TelemetryReporter after Bridge, before DevCapture
config/local_settings.json               # api.telemetry_path, bridge.telemetry_port, timing.telemetry_retry_interval_sec
mockserver/routes.json + responses/telemetry/{default,server_error,bad_request}.json
mockserver/test_server.py                # the route
tests/unit/test_report_queue.gd
tests/unit/test_telemetry_reporter.gd
```

## Spec

### `ReportQueue` (`RefCounted`, needs a host `Node` for its `HTTPRequest` and `Timer`)

```gdscript
func _init(host: Node, queue_path: String, url_provider: Callable, headers_provider: Callable,
		retry_sec: float, max_records := 5000)
func enqueue(record: Dictionary) -> void     # persist first (atomic), then try to send
func flush() -> void                         # send the oldest if nothing is in flight
func size() -> int
signal delivered(record: Dictionary)
signal dropped(record: Dictionary, why: String)   # "rejected_<status>" | "overflow"
```

- **Durable before network:** `enqueue` writes the whole queue to
  `queue_path` via `path.tmp` + `DirAccess.rename_absolute` (the CLAUDE.md
  atomic write) **before** any request.
- **Loads on creation.** A corrupt file is renamed to `<path>.corrupt` with
  a warning, and the queue starts empty. It's never deleted silently.
- **One request in flight;** records are sent oldest first, one per POST (a
  JSON body, `Content-Type: application/json`, plus the given headers).
- **2xx:** remove, persist, emit `delivered`, send the next one.
  **408 / 429 / 5xx / connection error:** keep it, and retry after
  `retry_sec` (a `Timer`, plus a `flush()` on each new `enqueue`).
  **Other 4xx:** remove, emit `dropped("rejected_<code>")`, `push_error`.
- **Over `max_records`:** drop the oldest with a warning and
  `dropped("overflow")`.
- **An empty URL or headers provider result** (e.g. no tenant yet) → no
  request; it stays queued.

### `TelemetryReporter` autoload

- `_ready`: create `ReportQueue(self, "user://telemetry_queue.json",
  ConfigManager.get_api_endpoint("telemetry_path"), {X-Tenant-Id}, retry)`
  (the URL and headers are read at send time, so a tenant provisioned later
  still works),
  bind UDP `bridge.listen_host:telemetry_port` (the same bind-retry pattern
  as `Bridge`), and `flush()` (flush-on-boot).
- `_process`: drain the listener. Parse JSON. Reject non-dicts and unknown
  `event_type`s with a log line.
- `bridge_status` → `_apply_health(machine_fault)` (TEL-06), **not queued**.
- Every other event → `report_event(event, "bridge")`.
- `report_event(event: Dictionary, source := "app")`: stamps `event_id`
  (`Ulid.generate()`), `tenant_id`, `timestamp`
  (`get_datetime_string_from_system(true) + "Z"`) and `source`. For a
  `dispense_cycle` it merges `Bridge.get_order_context(order_id)`:
  `transaction_id`, `flavor_id`, `base_id`, `order_number`. Then it
  enqueues. `machine_fault` / `machine_ok` also go to `_apply_health`
  (TEL-06).
- Test hooks: `listen_port` (0 = free port), `get_listen_port()`,
  `queue` (the `ReportQueue`), `configure_from_settings()`.

### Bridge order context

`send_order_paid(order_id, hopper, base_code, context := {})` stores
`context` alongside the sent order ID (in the same 16-entry ring);
`get_order_context(id) -> Dictionary`. Payment passes `transaction_id`,
`flavor_id`, `base_id` and `order_number`.

### App-side event

When `dispensing.gd` hits its safety cap, it calls
`TelemetryReporter.report_event({"event_type": "dispense_cycle", "v": 1,
"order_id": …, "hopper": …, "result": "NO_RESPONSE", "reason": "safety_cap",
"stages": [], "fault": null})` (decision 10).

### Example posted record

```json
{"v": 1, "event_type": "dispense_cycle", "event_id": "01J8ZA…", "source": "bridge",
 "tenant_id": "machine-042", "timestamp": "2026-09-24T11:51:11Z",
 "order_id": "01J8Z6Q4M9X3T7C2V5B8N1K4RD", "order_number": 4821, "transaction_id": "pay_QqR8…",
 "flavor_id": "guava", "base_id": "water", "hopper": 1, "base": 2,
 "result": "DONE", "reason": "", "fault": null, "duration_ms": 72740,
 "stages": [{"stage": "WATER_FILL_1_DONE", "t_offset_ms": 7860}, {"stage": "PROTEIN_DISPENSED", "t_offset_ms": 12370},
            {"stage": "WATER_FILL_2_DONE", "t_offset_ms": 22330}, {"stage": "MIX_DONE", "t_offset_ms": 57890},
            {"stage": "HOMING_START", "t_offset_ms": 72240}, {"stage": "HOMING_DONE", "t_offset_ms": 72240},
            {"stage": "DONE", "t_offset_ms": 72740}]}
```

### Mock

Route `POST /fuelbot/telemetry`, `require_tenant_header`. Scenarios:
`default` (201 `{"ok": true}`), `server_error` (500), `bad_request`
(400). `last_body` shows the latest record.

## Acceptance criteria

`test_report_queue.gd` (fresh instances, `user://test_rq/`, the mock on :8788):
- [ ] `test_persist_before_send`: `enqueue` with an unreachable URL → the
      file holds the record; a new instance on the same path loads it.
- [ ] `test_delivers_and_removes`: default → one POST (the request count),
      and the file is empty.
- [ ] `test_retry_on_500`: `server_error` → kept; switch to `default` → sent
      after `retry_sec` (0.3 s in the test); exactly one successful POST.
- [ ] `test_drop_on_400`: `bad_request` → `dropped("rejected_400")`, queue
      empty.
- [ ] `test_order_preserved`: 3 records while failing, then OK → posted in
      order (checked via `last_body` after each).
- [ ] `test_overflow`: `max_records = 3`, 5 enqueued offline → the oldest 2
      dropped.
- [ ] `test_corrupt_file`: garbage on disk → `.corrupt` kept, empty queue,
      no script error.
- [ ] `test_no_tenant_no_request`: an empty headers provider → nothing
      sent, still queued.

`test_telemetry_reporter.gd` (listener on a free port, queue path under `user://test_tel/`):
- [ ] `test_cycle_event_enriched`: a `dispense_cycle` datagram for an order
      sent via `Bridge.send_order_paid(..., context)` → the posted body has
      `event_id` (a valid ULID), `tenant_id`, a `timestamp` ending in `Z`,
      `source: bridge`, `transaction_id`, `flavor_id`, and the stages
      unchanged.
- [ ] `test_heartbeat_not_posted`: `bridge_status` → no POST.
- [ ] `test_bad_json_ignored`: garbage / unknown `event_type` → no POST, no
      script error.
- [ ] `test_flush_on_boot`: a queue file written beforehand → posted after
      `_ready`.
- [ ] `test_safety_cap_event`: the dispensing safety cap → one
      `NO_RESPONSE` record, `source: app`.
- [ ] `mockserver/test_server.py`: the telemetry route requires
      `X-Tenant-Id`, and every scenario loads.
- [ ] Payment and dispensing tests still pass (the context is passed).

## Out of scope

Batching several records per POST, compression, and backend auth beyond
`X-Tenant-Id` (same as the config route).
