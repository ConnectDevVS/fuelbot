# IDLE-04 — `ConfigManager` autoload

**As a** kiosk, **I want** to load my catalog from the tenant config API, with a
cache and bundled fallback, and watch the maintenance flag live, **so that**
the idle screens always have data and can react when an operator takes the
machine offline.

Plan refs: §3.1, §3.2, §3.3 (boot sequence, validation, atomic cache,
accessors), §3.10 (local hardware-fault flag), §3.11 (maintenance poll), §7
steps 1–4.
Depends on: IDLE-02 (mock server), IDLE-03 (fixtures).

## Deliverables

```
autoload/ConfigManager.gd
project.godot                         # [autoload] ConfigManager registered FIRST
tools/dev_setup.gd                    # provisions user:// for development
tools/run_tests.sh                    # now starts/stops mock server on :8788
tests/test_case.gd                    # + mock-server helpers
tests/unit/test_config_manager.gd
```

## Spec

### Registration

```ini
[autoload]

; ORDER MATTERS: autoloads initialise top to bottom. Everything after
; ConfigManager reads ConfigManager.tenant_id / current_config in _ready().
ConfigManager="*res://autoload/ConfigManager.gd"
DevCapture="*res://autoload/DevCapture.gd"    ; from IDLE-01, always last
```

The script starts with the plan's refresh-cadence comment block (§3.3):
`current_config` refreshes on restart only, `local_settings` never changes
after boot, and the maintenance flag refreshes every
`maintenance_poll_interval_sec`. No `class_name` (README conventions).

### Public surface

```gdscript
signal config_ready(config: Dictionary)          # once per boot(), success OR fallback
signal maintenance_changed(enabled: bool, message: String)
signal connectivity_changed(online: bool)

# Overridable for tests: plain vars, not consts.
var tenant_id_path := "user://tenant_id.txt"
var cache_path := "user://config_cache.json"
var default_config_path := "res://config/default_config.json"
var local_settings_path := "res://config/local_settings.json"
var local_settings_override_path := "user://local_settings.override.json"
var auto_boot := true                            # tests set false before add_child()

const MAX_HOPPER := 6                            # physical hoppers (README decision 5)

var tenant_id: String = ""
var current_config: Dictionary = {}              # always normalised (see below)
var local_settings: Dictionary = {}
var config_source: String = ""                   # "remote" | "cache" | "default"
var config_loaded := false                       # config_ready has fired
var is_online := false                           # last HTTP attempt (boot or poll) succeeded
var last_successful_fetch_unix := 0.0
var remote_maintenance_enabled := false
var local_hardware_fault_active := false

func boot() -> void
func get_flavors() -> Array                      # enabled == true only (sold-out INCLUDED)
func is_orderable(flavor: Dictionary) -> bool    # enabled and not sold_out
func get_flavor_by_hopper(n: int) -> Dictionary  # {} if none
func get_charge_price(flavor: Dictionary) -> int # offer_price if non-null else actual_price
func get_min_charge_price() -> int               # over orderable flavors; 0 if none
func get_base(id: String) -> Dictionary
func get_tenant() -> Dictionary
func get_message(key: String, params: Dictionary = {}) -> String
func get_timing(key: String, fallback: float = 0.0) -> float
func get_api_url() -> String                     # api.base_url (no trailing /) + api.config_path
func is_in_maintenance() -> bool                 # remote_maintenance_enabled or local_hardware_fault_active
func get_maintenance_info() -> Dictionary
func normalise(raw: Dictionary) -> Dictionary     # see below
func set_local_hardware_fault(active: bool) -> void
func refresh_maintenance_now() -> bool           # false if a poll is already in flight or no tenant
static func validate_config(data: Variant) -> PackedStringArray   # empty = valid
```

`_ready()`: `if auto_boot: boot()`.

### `boot()`: plan §3.3, with this story's additions

1. **Local settings.** Parse `local_settings_path`. If
   `local_settings_override_path` exists and parses, **deep-merge** it on top
   (objects merge recursively, everything else replaces). A broken override
   triggers `push_warning` and is ignored.
2. **Tenant.** Read `tenant_id_path` and `strip_edges()`. If missing or empty,
   `push_warning("[ConfigManager] no tenant id ...")` and don't fetch.
3. **Cache.** If `cache_path` exists: parse it, run `validate_config`, and if
   valid, `current_config = normalise(data)` and `config_source = "cache"`.
   Parse or validation failure means "no cache" (warn, don't crash).
4. **Default.** If step 3 found nothing, load `default_config_path` →
   `normalise` → `config_source = "default"`.
5. `remote_maintenance_enabled = current_config.maintenance.enabled`, so an
   offline reboot keeps a previously flagged machine down.
   **`current_config` is fully populated when `boot()` returns**, before any
   network result.
6. **Fetch** (only with a tenant): a dedicated `_http_boot: HTTPRequest` child,
   `timeout = float(local_settings.api.request_timeout_sec)`, headers
   `["X-Tenant-Id: " + tenant_id, "Accept: application/json"]`, `GET get_api_url()`.
   If `request()` itself returns an error, treat it as a failure (step 8).
7. **Success** (result `RESULT_SUCCESS`, code 200, body parses, and
   `validate_config` is empty): `current_config = normalise(data)`,
   `config_source = "remote"`, write the cache **atomically** (write
   `cache_path + ".tmp"`, close, `DirAccess.open("user://").rename(tmp, cache_path)`;
   POSIX rename replaces the target atomically), set online and heartbeat,
   `_apply_remote_maintenance(data.maintenance)`, then emit `config_ready`.
8. **Failure** (no tenant, timeout, non-200, parse error, invalid): keep the
   step 3/4 config, set `is_online = false` (unless there's no tenant, in which
   case leave it false without a request), `print` the
   `messages.config_fetch_failed` text plus the reason, then emit
   `config_ready` anyway. With no tenant, emit it on the **next frame**
   (`call_deferred`) so listeners connected right after `boot()` still get it.
9. Start `_poll_timer` (`wait_time = maintenance_poll_interval_sec`, repeating)
   only when there is a tenant.

`idle_video_url` download (plan §3.13 future scope) is **not** part of this
story.

### `normalise(raw: Dictionary) -> Dictionary` (public: tests and fixtures use it)

It returns a deep copy the scenes can trust without type checks:
- `tenant`: the bundled default tenant (from `default_config.json`, read once)
  with the raw `tenant` merged over it key by key.
- each flavor: `hopper`, `actual_price` → `int`; `offer_price` → `int` or
  `null`; defaults `sold_out=false`, `badge=null`, `description=""`,
  `volume_ml=0`, `nutrition={}`, `ingredients=[]`, `allergens=[]`.
- `maintenance`: defaults `enabled=false`, `message=""`, `flagged_by=""`,
  `flagged_at=""`, `faults=[]` (null → `""`/`[]`).

JSON numbers arrive as `float`, which is why the `int` conversion is done once
here.

### `validate_config(data)`

This is a pure function returning human-readable errors. Rules (plan §3.3
step 6, plus the new fields):
- `data` is a Dictionary. `flavors` is a non-empty Array. `bases` is an Array.
- every flavor: non-empty String `id` and `name`; `hopper` is a whole number in
  1–`MAX_HOPPER` (6); `actual_price` is a number > 0; `offer_price` is `null` or a number > 0;
  `image` is a non-empty String.
- no two **enabled** flavors share a `hopper`.
- optional fields, if present, have the right type: `tenant` Dictionary,
  `sold_out` bool, `badge` String or null, `nutrition` Dictionary,
  `maintenance` Dictionary, `maintenance.faults` Array.

### Maintenance

- `_apply_remote_maintenance(m)` sets `remote_maintenance_enabled` and stores
  the normalised block in **`current_config.maintenance`** (only that key; the
  catalog is untouched). `get_maintenance_info()` reads from there. It calls `_emit_maintenance_if_changed()`, which emits
  `maintenance_changed(is_in_maintenance(), get_maintenance_info().message)`
  only when the **composite** `is_in_maintenance()` value, or the displayed
  message while active, differs from what was last emitted.
- Poll: a separate `_http_poll: HTTPRequest` (plan §3.11: never share with the
  boot request). On 200 with parseable JSON it reads **only**
  `data.maintenance` and never touches the catalog in `current_config`, then
  updates online status and heartbeat. On failure it sets `is_online = false`
  and leaves maintenance unchanged.
- `set_local_hardware_fault(active)` sets the flag and calls
  `_emit_maintenance_if_changed()`.
- `get_maintenance_info()` returns:
  ```
  {"active": bool, "source": "remote" | "local" | "",
   "message": String,        # remote message if source=remote and non-empty, else messages.maintenance_default
   "flagged_by": String,     # remote flagged_by, or messages.maintenance_local_fault_by for local
   "flagged_at": String,     # ISO-8601 or ""
   "faults": Array}          # [{code, description}]
  ```
  Remote wins when both flags are set.
- `connectivity_changed` fires only when `is_online` actually flips.

### `get_message` / `get_timing`

- `get_message(key, params)`: `local_settings.messages[key].format(params)`. On
  a missing key, `push_warning` and return `"[" + key + "]"` so the gap is
  visible on screen.
- `get_timing(key, fallback)`: returns a float, or `fallback` with a warning if
  the key is missing.

### `tools/dev_setup.gd`

```
godot --headless --path . --script res://tools/dev_setup.gd -- \
    [--tenant=machine-042] [--api=http://127.0.0.1:8787/fuelbot] [--poll=10] [--clear]
```

- `extends SceneTree`. All work happens in `_initialize()`, then `quit(0)`.
- Writes `user://tenant_id.txt` and `user://local_settings.override.json`
  containing `{"api": {"base_url": <api>}, "timing": {"maintenance_poll_interval_sec": <poll>}}`.
  Defaults: `machine-042`, `http://127.0.0.1:8787/fuelbot`, `10`.
- `--clear` deletes the tenant file, the override, and `user://config_cache.json`,
  so the app goes back to "fresh machine, no network" (plan §7 step 3).
- Prints `OS.get_user_data_dir()` and what it wrote. (On macOS:
  `~/Library/Application Support/Godot/app_userdata/FuelBot/`.)

### `tests/test_case.gd`: add mock helpers

```gdscript
const MOCK_ORIGIN := "http://127.0.0.1:8788"
func mock_scenario(name: String, path: String = "/fuelbot/config") -> void   # POST /__mock/scenario
func mock_reset() -> void                                                    # POST /__mock/reset
func mock_state() -> Dictionary                                              # GET  /__mock/state
```

Each uses a temporary `HTTPRequest` child and awaits `request_completed`. It
calls `fail()` if the mock server is unreachable.

### `tools/run_tests.sh`: mock server block

- Before running Godot:
  `python3 mockserver/server.py --port 8788 >"$MOCK_LOG" 2>&1 &`, then
  `trap 'kill $MOCK_PID 2>/dev/null' EXIT`.
- Poll `curl -sf http://127.0.0.1:8788/__mock/state` up to 50 × 0.1 s. If it
  never comes up, print the mock log and exit 1. If port 8788 is already in use
  before starting, fail with a clear message rather than testing against a
  stale server.

### `tests/unit/test_config_manager.gd`

Each test builds a **fresh, isolated instance**. It never touches the real
autoload or real `user://` files:

```gdscript
func _make_cm(tenant: String = "t-test", timeout_sec: int = 2) -> Node:
	DirAccess.make_dir_recursive_absolute("user://test_cm")
	# write/remove user://test_cm/tenant_id.txt according to `tenant` ("" = remove)
	# write user://test_cm/override.json → {"api": {"base_url": MOCK_ORIGIN + "/fuelbot", "request_timeout_sec": timeout_sec}}
	var cm: Node = load("res://autoload/ConfigManager.gd").new()
	cm.auto_boot = false
	cm.tenant_id_path = "user://test_cm/tenant_id.txt"
	cm.cache_path = "user://test_cm/config_cache.json"
	cm.local_settings_override_path = "user://test_cm/override.json"
	add_child(cm)
	return cm
```

`before_each`: `await mock_reset()` and delete `user://test_cm/config_cache.json*`.
`after_each`: free the instance.

| Test | Asserts |
|------|---------|
| `test_boot_is_synchronously_usable` | right after `cm.boot()` (no await): `current_config.flavors.size() > 0`, `config_source == "default"` |
| `test_override_merges_into_local_settings` | `get_api_url() == MOCK_ORIGIN + "/fuelbot/config"`; `messages.status_ready` still present |
| `test_no_tenant_means_no_request` | tenant `""`: `config_ready` fires within 1 s, `mock_state().request_counts` unchanged, source `default`, `is_online == false` |
| `test_remote_success_writes_cache_atomically` | source `remote`; `get_tenant().display_name == "PowerFuel Gym"`; cache exists; `.tmp` does not; `mock_state().last_tenant` is `t-test` |
| `test_cache_used_when_server_errors` | boot once (cache written), then `mock_scenario("server_error")`, fresh instance: source `cache`, `is_online == false` |
| `test_corrupt_cache_falls_back_to_default` | write `"{broken"` to the cache, `server_error`: source `default`, no crash |
| `test_invalid_payload_rejected` | `invalid_duplicate_hopper`: source `default`, cache NOT written |
| `test_malformed_json_rejected` | `malformed_json`: source `default` |
| `test_timeout_still_emits_ready` | `slow` with timeout 2: `config_ready` within 4 s, source `default` |
| `test_price_change_applies_on_boot` | `price_change`: chocolate charge price 199, `electro` absent from `get_flavors()` (plan §7 step 4) |
| `test_charge_price_rule` | guava → 75 (offer), chocolate → 180 (actual) |
| `test_sold_out_listed_but_not_orderable` | vanilla is in `get_flavors()`; `is_orderable(vanilla) == false`; `get_min_charge_price() == 35` |
| `test_validate_config_rules` | direct calls: hopper 0, hopper 7, hopper 2.5, missing image, price 0, and duplicate enabled hoppers are each rejected; hopper 6 is accepted; a duplicate hopper on a **disabled** flavor is accepted |
| `test_poll_flips_maintenance_without_touching_catalog` | boot on `default`; overwrite `current_config.flavors[0].name = "SENTINEL"`; `mock_scenario("maintenance_on")`; `refresh_maintenance_now()`; `maintenance_changed` fires with `true` and the remote message; `flavors[0].name` is still `"SENTINEL"`; `get_maintenance_info().faults.size() == 2` |
| `test_maintenance_signal_not_repeated` | two polls on `maintenance_on` emit exactly one signal |
| `test_empty_remote_message_uses_default` | `maintenance_no_message` → info.message equals `messages.maintenance_default` |
| `test_local_fault_composes` | `set_local_hardware_fault(true)` emits `(true, maintenance_default)`, `info.source == "local"`; setting false emits `(false, …)` |

## Acceptance criteria

- [ ] `tools/run_tests.sh` passes (all earlier tests plus the 17 above), with
      no manual server start.
- [ ] `tools/check_boot.sh` prints `BOOT OK` **with no tenant provisioned**
      (the offline path is warnings only).
- [ ] Manual (plan §7 steps 1–3): run `python3 mockserver/server.py`,
      `godot --headless --path . --script res://tools/dev_setup.gd`, then
      `tools/check_boot.sh`. The mock log shows
      `GET /fuelbot/config tenant=machine-042 ... -> 200`. The file
      `~/Library/Application Support/Godot/app_userdata/FuelBot/config_cache.json`
      exists. Stop the server and re-run check_boot: still `BOOT OK`.
- [ ] `git grep -n "example.invalid"` shows the placeholder only in
      `config/local_settings.json`. No URL is hardcoded in GDScript.

## Out of scope

`idle_video_url` download (§3.13 future), `SalesReporter`,
`TelemetryReporter`, the hopper-fault override (§3.9 item 4).
