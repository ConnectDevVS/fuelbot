# FuelBot v2 — combined rewrite plan & specification

This document merges the original config-driven-catalog design with the
greenfield-rewrite decision to start from a fresh project. It is meant to be
the single source of truth — nothing here should require flipping to another
document.

## 0. Status & decision log

**Status (2026-09-24).** Milestones 0, 1 and 3 are done: the idle screens
(attract, listing, maintenance) and the details page (Ingredients &
Allergens) run against a local mock backend. **Milestone 2 (payment) is
built and verified against the mock. Its real Razorpay test-mode check is
pending the product owner** ([payment SIGNOFF](../stories/payment/SIGNOFF.md)).
Per-milestone status is in Section 5. Work is executed as story sets under
`devdocs/stories/`. Each set's README lists its detailed decisions, and its
`SIGNOFF.md` records the verification evidence.

**Decision log.** Decisions made after this plan was written. The sections
they touch have been edited in place; this list is the index. Newest last.

| Date | Decision | Why | Where |
|------|----------|-----|-------|
| 2026-09-24 | Project lives at the repo root (`Sourcegit/fuelbot`), not a `fuelbotsource-v2/` sibling | The repo was already the fresh, git-initialised project | idle README §1 |
| 2026-09-24 | **Six hoppers / six drinks** (`MAX_HOPPER = 6`); previously 4 | Confirmed hardware direction. Firmware and wiring for motors 5–6 still to do (Milestone 4) | §2.1.3, §3.2, §3.3 |
| 2026-09-24 | `sold_out` flag: sold-out drinks are **shown greyed, not tappable**; `enabled:false` still **hides** | Matches the on-device design | §3.1, §3.3 |
| 2026-09-24 | Optional schema additions: `tenant` block (branding), per-flavor `sold_out`/`badge`/`description`/`volume_ml`/`nutrition`, `maintenance.flagged_by/flagged_at/faults` | Needed by the designed screens | §3.1 |
| 2026-09-24 | API URL lives in `local_settings.json` → `api` (plus an untracked `user://local_settings.override.json`), replacing `const CONFIG_URL` | Point dev/Pi at a mock without code edits; the URL is build-level, not tenant-level | §3.1, §3.3 |
| 2026-09-24 | New **Ingredients & Allergens** screen (`scenes/flavor_detail/`) between listing and payment. The allergen banner is hidden when none are declared (never "allergen-free"); nutrition hides when absent | On-device design, page 3 | §3.6 |
| 2026-09-24 | **Proceed to Pay is the order commitment point.** It sets `charged_price` and `selected_base_id` (first enabled base, since the design has no base step) and creates the order ID | Design goes details → payment directly | §3.4, §3.6 |
| 2026-09-24 | **Hopper command (`P<hopper>`) is sent after payment succeeds**, not on flavor selection | An abandoned payment must never start the hardware; with the details step, a tap is no longer a commitment | §3.2, §3.6 |
| 2026-09-24 | **Order ID = ULID generated on the machine at Proceed**, carried in the Razorpay QR `notes`, the sale report and telemetry; plus a **display-only per-machine order number** ("ORDER #4821") | Fleet-unique and offline-safe without coordination. It also identifies abandoned/failed payments, which have no Razorpay ID, so the full funnel is measurable. A plain counter would collide across machines and repeat after a re-image | §3.4, §3.5, §3.8, §3.12 |
| 2026-09-24 | Razorpay **test-mode keys** for Milestone 2 (from `user://razorpay_credentials.cfg`); automated tests use the mock server | Real integration without live money; tests stay offline | §3.5 |
| 2026-09-24 | QR expiry **180 s** (`timing.qr_expiry_sec`) | Confirmed | §3.1, §3.5 |
| 2026-09-24 | `Nav` autoload owns all scene changes; `DevCapture` autoload (dev-only screenshots); headless test harness | Testable navigation, verifiable UI | §3.3, §4, §7 |
| 2026-09-24 | Maintenance screen shows technician diagnostics and **re-checks the flag on entry** | Design page 6; fixes a race where the flag clears mid-redirect | §3.11 |
| 2026-09-24 | **Cancel race rule:** Cancel does one final payment check and dispenses if the customer already paid | Charging someone and cancelling their drink is the worst outcome | §3.5, payment README |
| 2026-09-24 | **Bridge sequence:** `P<hopper>`, `B<n>` on 4242, **≥ 0.3 s wall-clock gap**, then `Y` on 4243; `X` on cancel/failure/expiry | The current `udprxtx.py` drops a `Y` that arrives while it's still collecting P/B. Milestone 4's bridge rewrite should take one atomic order message | §3.2, §3.7 |
| 2026-09-24 | **Live-key guard:** `rzp_live_` keys refused unless `payments.allow_live_keys` | A dev machine can't take real money by accident | §3.5 |

## 1. Context

FuelBot is a Godot 4 vending-machine kiosk app. The current build
(`fuelbotsource/`, this repo) is a flat, ungrouped project (~150 files at the
root, no folder structure, no git history) with real problems beyond just
"messy folders":

- Flavor names, prices, ingredients, images, hopper-motor mapping, and every
  user-facing message are hardcoded and scattered across scripts:
  `node_2d.gd` (`class_name protein`) hardcodes `N==1..4` to fixed texture
  `load()` calls, clamped to 1-4; `second.gd`'s `_on_water_pressed()`
  hardcodes prices per `protein.protein_value` (75/180/35/140);
  `_on_milk_pressed()` is dead code.
- **Live Razorpay API key/secret hardcoded in `second.gd`** (`rzp_live_...`),
  a second, different (and broken — wrong endpoint) key pair hardcoded in the
  unused `RazorpayManager.gd` autoload.
- **State is threaded through a `static var` on a carousel script**
  (`class_name protein`, `protein.protein_value`) instead of any real
  singleton — a global-variable hack other scripts reach into by name.
- **`third.gd`'s "dispensing" screen is a fixed 85s timer**, not connected to
  the Arduino at all — it doesn't know if the machine actually finished. The
  Arduino↔Godot link today is one-way (Godot/`udprxtx.py` write, nothing
  reads back).
- `Second.tscn` has the only hardcoded UI string in the project ("QR Code
  Generation in Progress"); `Third.tscn` has zero success/error UI at all;
  `Three_n.tscn` has four unwired, textless Label nodes left over from an
  earlier draft.
- Inactivity timeouts and poll intervals are magic numbers duplicated across
  `node_2d.gd`, `second.gd`, and `RazorpayManager.gd`.
- No existing `FileAccess`/`user://`/`ConfigFile` usage anywhere — no local
  caching exists yet.
- Dead code throughout: TTS `speak()` helpers shelling out to binaries not on
  the kiosk, a duplicate/broken Razorpay implementation, a no-op Milk button,
  three orphaned scenes (`Three.tscn`, `Three_n.tscn`, `Payment.tscn`) never
  reached by any transition, and two stale duplicate `.ino` firmware files
  superseded by `VM_code.ino`.

**The goal**: pull the catalog into one JSON document fetched over HTTP GET
at boot, cached locally so the machine stays usable offline, so
flavors/prices/ingredients/hopper assignments/messages can all be changed
centrally without touching code or reflashing the machine — plus a real
hardware-confirmed dispensing signal, sale reporting, fault/telemetry
reporting, and maintenance mode, all built on top of that same foundation.

**Out of scope** (separately-tracked, deliberately not touched): the dead
milk button's hardware trigger, and **general** sensor-based fault detection
(cup presence, motor stall/jam) beyond the one narrow signal this plan adds
(did the Arduino's dispense routine finish within budget, or time out — not
real fault sensing; there are still no sensors on the machine today). True
fault detection is planned as a future roadmap (Section 3.9) but not built
here.

**Why a rewrite instead of a patch**: the project is **prelaunch** — no
machine in the field depends on the current build — so there's no cutover
risk. Rather than retrofitting this design onto the old flat codebase, it
gets built in from day one in a fresh project: config-driven catalog, the
real hardware dispensing-confirmation signal, maintenance mode, sale
reporting, and fault/telemetry reporting are all part of the initial
architecture, not follow-up work.

New project: the repo root of `Sourcegit/fuelbot` (git-initialised, fresh). The
old tree stays untouched as reference at
`/Volumes/Professional/Professional/FuelBot/Source/fuelbotsource_og`. *(Updated
2026-09-24: originally planned as a `fuelbotsource-v2` sibling.)*

## 2. Decisions locked in

### 2.1 Config & backend architecture

1. No backend exists yet — design schema + Godot loader against a
   placeholder URL constant.
2. Fallback chain: fresh fetch → last successfully cached copy on `user://`
   → baked-in default config, so the machine is never fully unusable.
3. Each flavor entry includes an explicit `"hopper": 1-6` field (the machine
   has **six** hoppers, `ConfigManager.MAX_HOPPER = 6`; the JSON decouples
   *which* flavor maps to *which* hopper from array order). *(Updated
   2026-09-24: was 4. The firmware (`VM_code.ino`, pins `M1–M4`) still needs
   motors 5–6, tracked in Milestone 4.)*
4. The config API is multi-tenant: each machine identifies itself via a
   **tenant ID**, read from a local provisioning file at boot and sent as an
   `X-Tenant-Id` HTTP header (not a query param, so the URL itself stays
   identical across every deployed machine).
5. Messages and timing values are **not** part of the remote/tenant-fetched
   JSON — they live in a separate local file read at machine start,
   independent of any network call. Only catalog data (flavors, bases,
   allergens, pricing, hopper mapping) comes from the remote tenant config.
6. A tenant-wide **maintenance flag** in the remote config can force the
   machine into a maintenance screen, blocking new orders, via a lightweight
   periodic poll (separate from the boot-time catalog fetch) so it takes
   effect without a reboot.
7. Sale completion is reported to a second remote API as JSON. Failed
   reports are queued locally to disk and retried, never silently dropped.
8. The sale report fires only on a **real hardware-confirmed** dispensing
   outcome, not a UI timer proxy — this is why the plan adds the minimal
   Arduino→bridge-script→Godot channel needed to produce that signal
   (Section 3.7).
9. **Fault/telemetry reporting is scoped to what the existing hardware can
   actually detect — no new sensors are added.** Two things become
   machine-parseable and get POSTed to a new server endpoint: (a) per-stage
   timing for each dispense cycle, from the same status lines `VM_code.ino`
   already prints today, just reformatted consistently; and (b) one real
   fault condition the existing limit switch can already surface —
   `homeAxis()` currently loops forever if the switch never triggers, which
   becomes a bounded timeout emitting `FAULT:HOMING_TIMEOUT` instead of
   hanging the board. Cup-presence/motor-stall/ingredient-level detection
   still needs new physical sensors that don't exist and stays out of scope
   (full list planned as a future roadmap in Section 3.9, not built now).

### 2.2 Rewrite execution

1. **Fresh sibling directory**, git-initialized from the first commit — not
   an in-place rewrite of `fuelbotsource`.
2. **`pinelabs.py` ported forward, inactive** — moved into the new structure
   as-is, still unwired (nothing sends to its UDP port), not deleted. It's a
   self-contained alternate (Pine Labs POS) payment backend, currently dead
   code — not imported anywhere, nothing feeds its UDP port.
3. **Port the *working* Razorpay logic** (the inline implementation
   currently in `second.gd` — correct `qr_codes` endpoint, live UDP wiring)
   into a single clean `RazorpayManager` autoload. **Discard** the existing
   `RazorpayManager.gd` — it's a broken, never-invoked prototype (wrong
   endpoint — `qr-codes` with a hyphen instead of `qr_codes` — dead code
   path).
4. **Razorpay credentials move out of source entirely** — read from an
   untracked local file at runtime, same pattern used for `TENANT_ID_PATH`
   (a provisioning-time file, not git-tracked). The already-exposed live key
   (`rzp_live_Sjz0kAySedgQjK`) should be rotated in the Razorpay dashboard
   once this lands — flagged here, not something fixable from the codebase.
5. **New `OrderState` autoload** replaces the `static var protein_value` /
   `class_name protein` global-hack — the one architectural addition beyond
   what the original config-driven-catalog design specified (that design
   assumed the existing static-var pattern would stay).
6. **Only `VM_code.ino` is ported forward** as firmware — `vmcode.ino` and
   `vmcode/vmcode.ino` are confirmed byte-identical stale duplicates of an
   older hardware revision (different pin map, no stepper carousel, no
   watchdog reset).
7. **Drop**: TTS `speak()` dead code (shells out to `gtts-cli`/`mpg123`,
   binaries not on the kiosk), the duplicate commented-out legacy code block
   in `second.gd`, and `Three.tscn`/`Three_n.tscn`/`Payment.tscn` (confirmed
   unreachable from any transition — orphaned prototypes).
8. **Milk stays config-driven, not hardcoded dead-end**: `bases` config
   already models `milk` as `enabled: false` in the schema (Section 3.1) —
   the UI disables/hides it based on that flag instead of shipping a button
   that silently does nothing.

## 3. Specification

### 3.1 Remote/tenant config schema

Two separate JSON documents, sourced differently — this split matters (see
2.1.5 above).

**Remote/tenant config** (fetched via GET at boot, cached to
`user://config_cache.json`):

```json
{
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
      "id": "guava",
      "name": "Prymor Guava",
      "hopper": 1,
      "actual_price": 90,
      "offer_price": 75,
      "image": "res://assets/images/flavors/prymor_guava.png",
      "description": "Cold-blended whey isolate with real guava and electrolytes.",
      "volume_ml": 400,
      "nutrition": {"kcal": 210, "protein_g": 24, "carbs_g": 12, "fat_g": 2},
      "ingredients": ["Whey protein isolate", "Guava pulp", "Electrolyte blend"],
      "allergens": ["Milk", "Soy"],
      "badge": "POPULAR",
      "sold_out": false,
      "enabled": true
    },
    {
      "id": "chocolate",
      "name": "MMN Chocolate",
      "hopper": 2,
      "actual_price": 180,
      "offer_price": null,
      "image": "res://assets/images/flavors/mmn_chocolate.png",
      "ingredients": ["Whey Protein", "Cocoa"],
      "allergens": ["Milk"],
      "enabled": true
    }
  ],
  "bases": [
    { "id": "water", "name": "Water", "code": "B2", "enabled": true },
    { "id": "milk", "name": "Milk", "code": "B1", "enabled": false }
  ],
  "maintenance": {
    "enabled": false,
    "message": "",
    "flagged_by": null,
    "flagged_at": null,
    "faults": []
  },
  "idle_video_url": null
}
```

**Optional fields** (added 2026-09-24; `ConfigManager.normalise()` fills
defaults, so older payloads stay valid):
- `tenant`: header branding. Missing keys fall back to the bundled default
  tenant (`FuelBot` / `FB`).
- per flavor: `description`, `volume_ml`, `nutrition`
  (`kcal`/`protein_g`/`carbs_g`/`fat_g`), `badge` (string or null, e.g.
  `"POPULAR"`), and `sold_out` (bool). **`enabled: false` hides a flavor;
  `sold_out: true` shows it greyed and not tappable.**
- `maintenance.flagged_by`, `flagged_at` (ISO-8601 UTC) and `faults`
  (`[{code, description}]`), shown on the maintenance diagnostics panel.

(Flavor images live at `assets/images/flavors/` with snake_case names, ported
from the old tree's plain, non-`(1)` files. Provenance is in
`assets/ASSETS.md`.)

`maintenance.enabled` is the tenant-wide kill switch; `maintenance.message`
is shown on the maintenance screen when set, falling back to a local default
(Section 3.11) when empty.

`allergens` is a plain string list per flavor, same shape as `ingredients`.
No allergen-to-icon mapping is in scope. *(Updated 2026-09-24:)* The listing
shows the charge price, protein and kcal per card. The Ingredients &
Allergens screen shows ingredients as chips, allergens in a warning banner
(hidden when the list is empty, never rendered as "allergen-free"), and
nutrition tiles (the section hides when `nutrition` is absent). Showing
"actual price struck through, offer price highlighted" is still a follow-up
(Section 8).

`idle_video_url` is the future-scope field for remotely-managed ad video —
see Section 3.13. Optional/nullable; `null` (as shown here) or absent means
"use the bundled default video."

`hopper` is what gets sent to the Arduino as the first digit of the 2-digit
serial command — decoupled from `id`/array order so reassigning a flavor to
a different physical hopper is a config change, not a code change.

**Local settings** (bundled with the app as `res://config/local_settings.json`,
read at machine start — never fetched over the network, never
tenant-specific; an untracked `user://local_settings.override.json` is
deep-merged on top if present, for dev/Pi API URLs and poll intervals):

```json
{
  "api": {
    "base_url": "https://example.invalid/fuelbot",
    "config_path": "/config",
    "request_timeout_sec": 10
  },
  "messages": {
    "qr_generating": "QR Code Generation in Progress",
    "payment_failed": "Payment failed. Please try again.",
    "payment_timeout": "Payment timed out. Please try again.",
    "dispensing_success": "Enjoy your shake!",
    "dispensing_timeout": "Something went wrong. Please contact support if you were charged.",
    "maintenance_default": "This machine is temporarily out of service.",
    "config_fetch_failed": "Running in offline mode."
  },
  "timing": {
    "flavor_screen_inactivity_sec": 60,
    "payment_screen_inactivity_sec": 180,
    "payment_poll_interval_sec": 3,
    "payment_poll_timeout_sec": 180,
    "qr_expiry_sec": 180,
    "maintenance_poll_interval_sec": 120,
    "sale_report_retry_interval_sec": 60
  }
}
```

The shipped file holds **all** user-facing copy (no string literals in
scenes) and more timing keys (`detail_screen_inactivity_sec`,
`attract_tap_debounce_sec`, …); the block above is an excerpt.
`qr_expiry_sec` is confirmed at **180 s**.

Rationale for the split: messages/timing/API URL are UI/behavior tuning that ship
with a given build and don't vary per tenant/location, whereas the flavor
catalog is exactly the thing operators need to change centrally per machine
without a rebuild. Keeping messages/timing local also means they're always
available with zero network dependency and zero fallback-chain complexity.

### 3.2 Price resolution & hopper-vs-index rules

Each flavor carries two price fields: `actual_price` (regular/MRP, always
present) and `offer_price` (discounted, `null` when no offer is running).
The **amount actually charged** is `offer_price` when non-null, otherwise
`actual_price` — `ConfigManager.get_charge_price(flavor: Dictionary) -> int`
implements this single resolution rule so no caller duplicates the
null-check.

**Hopper vs. list position**: a flavor's position on the listing and its
physical `hopper` can differ — flavor order in the JSON might not match
hopper wiring order. The hopper command must send
`"P" + str(OrderState.selected_flavor["hopper"])`, **never** a list position,
so the Arduino receives the correct physical hopper digit regardless of how
flavors are ordered/filtered (e.g. by `enabled`) in the JSON. *(Updated
2026-09-24: the command is sent **after payment succeeds**, from the payment
flow, not on flavor selection, so an abandoned payment never starts the
hardware.)* This is the one place the
hardware wire format and the config schema directly interact — everything
else (price, ingredients, images, messages, timing) is UI-only.

### 3.3 `ConfigManager.gd` — autoload

`autoload/ConfigManager.gd`, following the established `HTTPRequest` child
node + `JSON.new()`/`.parse()`/`.get_data()` pattern (matches
`RazorpayManager.gd`'s idiom).

Registered first in `project.godot`'s `[autoload]`, since every other new
autoload reads `ConfigManager.tenant_id` at boot:

```
[autoload]
ConfigManager="*res://autoload/ConfigManager.gd"
OrderState="*res://autoload/OrderState.gd"
RazorpayManager="*res://autoload/RazorpayManager.gd"
SalesReporter="*res://autoload/SalesReporter.gd"
TelemetryReporter="*res://autoload/TelemetryReporter.gd"
```

**Ordering matters**: `SalesReporter` and `TelemetryReporter` both read
`ConfigManager.tenant_id`, which only works if `ConfigManager` has already
run `_ready()` — Godot initializes autoloads in listed order. Worth a
comment in `project.godot` and at the top of each dependent autoload so this
survives a future reshuffle.

Responsibilities:
- API URL = `local_settings.api.base_url + api.config_path` (placeholder
  `https://example.invalid/fuelbot/config`, one fixed URL shared by every
  machine). *(Updated 2026-09-24: replaces `const CONFIG_URL`; dev points it at
  the mock server via `user://local_settings.override.json`.)*
- `const TENANT_ID_PATH = "user://tenant_id.txt"` — plain-text file
  containing the tenant/machine identifier, written once during
  provisioning/imaging (not git-tracked — each physical unit gets its own
  value dropped onto it at setup time).
- `const CACHE_PATH = "user://config_cache.json"`.
- `var tenant_id: String = ""` — read from `TENANT_ID_PATH` at the very
  start of `_ready()`. If missing/empty, log an error and skip straight to
  the cache/default fallback chain — there's no way to identify this machine
  to the server without it, so no fetch is even attempted.
- Bundle `res://config/default_config.json` (same shape as the remote schema
  — flavors/bases only, current hardcoded values as content) as the final
  fallback.
- Bundle `res://config/local_settings.json` — loaded directly via
  `FileAccess`, no fetch, no caching, no fallback chain needed.
- `signal config_ready(config: Dictionary)` — emitted once remote-config
  loading finishes, so scenes that need catalog data (which may load before
  the fetch completes) can wait on it instead of racing `_ready()` order.
- `signal maintenance_changed(enabled: bool, message: String)` — see Section
  3.11.
- `var current_config: Dictionary = {}` — the active catalog config
  (flavors/bases), always populated synchronously with *something* by the
  end of `_ready()` (cache or bundled default) even before the network fetch
  resolves, then hot-swapped if a fresh fetch succeeds.
- `var local_settings: Dictionary = {}` — messages/timing, populated once in
  `_ready()`, never changed afterward.

Add a short comment block at the top of the file documenting each piece of
state's refresh cadence, since it's not obvious from the code alone:
`current_config` only refreshes on app restart; `local_settings` never
changes after boot; the maintenance flag (Section 3.11) refreshes live,
every `maintenance_poll_interval_sec`.

**Boot sequence in `_ready()`**:
1. Load `res://config/local_settings.json` into `local_settings` via
   `FileAccess` — always succeeds since it's a bundled resource.
2. Read `TENANT_ID_PATH`. If missing/empty, log an error and jump straight
   to step 3 — never attempt the fetch without a tenant ID.
3. Load `CACHE_PATH` if it exists → parse. If parsing fails (corrupt/
   truncated file, e.g. from a power loss during an earlier write), treat it
   the same as "no cache" and fall through to step 4 instead of crashing. On
   successful parse, set as `current_config` immediately.
4. If no usable cache was loaded in step 3, load bundled
   `res://config/default_config.json` as `current_config`.
5. If a tenant ID was found in step 2, fire the HTTPRequest GET to
   the config URL (`get_api_url()`) in the background with header `"X-Tenant-Id: " + tenant_id`,
   and an explicit `timeout` (e.g. 10s) on the `HTTPRequest` node so a
   stalled connection can't hang indefinitely — the UI is already usable
   from step 3/4 regardless.
6. On success (200 + valid JSON): run a validation pass before accepting it
   — every flavor has `hopper` in 1-6 (`MAX_HOPPER`), no two *enabled* flavors share the
   same `hopper`, `actual_price` is a positive number, `image` is a
   non-empty string. If validation fails, discard the response entirely
   (keep whatever step 3/4 loaded) and log the failure. If it passes:
   overwrite `current_config`, then write the cache **atomically** — write
   to `user://config_cache.json.tmp`, close it, then
   `DirAccess.rename("user://config_cache.json.tmp", "user://config_cache.json")`
   — so a power loss mid-write leaves the previous good cache intact.
   Also check `idle_video_url` here (Section 3.13). Emit
   `config_ready(current_config)`.
7. On failure (no tenant ID, timeout, non-200, parse error, or failed
   validation): keep whatever was loaded in step 3/4, emit
   `config_ready(current_config)` anyway so callers aren't blocked, and log
   the `messages.config_fetch_failed` text.

**Helper accessors**:
- `get_flavors() -> Array` — only `enabled == true` entries, **including
  sold-out ones** (they render greyed). Will also exclude any locally
  hopper-faulted flavor once Section 3.9's future roadmap item 4 lands.
- `is_orderable(flavor) -> bool` — `enabled and not sold_out`.
- `get_min_charge_price() -> int` — over orderable flavors.
- `get_tenant() -> Dictionary`, `get_api_url() -> String`.
- `normalise(raw) -> Dictionary` — the one place JSON floats become ints and
  optional fields get defaults; scenes trust its output.
- `get_flavor_by_hopper(n: int) -> Dictionary`
- `get_charge_price(flavor: Dictionary) -> int` — Section 3.2's rule.
- `get_base(id: String) -> Dictionary`
- `get_message(key: String) -> String` — reads from `local_settings`.
- `get_timing(key: String) -> float` — reads from `local_settings`.
- `is_in_maintenance() -> bool` — see Section 3.11 for its exact definition
  (composed of a remote flag and a local hardware-fault flag).
- `set_local_hardware_fault(active: bool) -> void` — see Section 3.11.

### 3.4 `OrderState.gd` — autoload

New autoload, `autoload/OrderState.gd`, replacing the old `static var
protein_value` / `class_name protein` global-hack entirely. Fields:
- `selected_flavor: Dictionary` — set by `flavor_select.gd` on selection.
- `selected_base_id: String` — set on **Proceed to Pay** (details screen) to
  the first enabled base; the design has no base-selection step.
- `charged_price: int` — set on **Proceed to Pay** via
  `ConfigManager.get_charge_price(selected_flavor)`.
- `order_id: String` — **ULID** generated on the machine on **Proceed to
  Pay**. Fleet-unique without coordination, works offline, time-sortable. The
  analytics key for every order, including abandoned/failed payments that
  never get a Razorpay ID. Sent in the Razorpay QR `notes`, the sale report
  and telemetry.
- `order_number: int` — **display-only**, per-machine counter persisted in
  `user://`, shown as "ORDER #4821". Never used as a key (it collides across
  machines and restarts after a re-image).
- `transaction_id: String` — set by `payment.gd`'s
  `RazorpayManager.payment_received` handler, right when payment succeeds.
  This is the single source `TelemetryReporter` (3.8) and `SalesReporter`
  (3.12) both read from, rather than each tracking their own copy.
- `func reset() -> void` — called when flow returns to idle (`Nav.go_idle()`
  does this) and when the customer goes Back from details.

*(Updated 2026-09-24: price/base now committed on Proceed instead of in
`payment.gd`; `order_id`/`order_number` added.)*

### 3.5 `RazorpayManager.gd` — autoload

Single implementation, ported from `second.gd`'s *working* inline logic
(correct `qr_codes` endpoint — not the broken autoload's `qr-codes` typo),
exposing:
- `signal qr_created(qr_id, image_url, amount)`
- `signal qr_create_failed(error)`
- `signal payment_received(payment_id, amount)`
- `signal payment_failed(reason)`

Public functions: `create_qr(amount_rupees: int, order_id: String) -> void`
(the order ID goes in the QR's `notes` so Razorpay payments join to orders),
`stop_polling() -> void`, plus (as built) `check_now()` (the final check on
Cancel), `close_qr()`, `abort()` (also closes a QR whose create is still in
flight) and the `poll_completed(status)` signal. Transient poll errors keep
polling; only the timeout ends an order. QR expiry: `timing.qr_expiry_sec` =
**180 s** (`close_by = now + qr_expiry_sec`; the old code used 900 s).
Razorpay's minimum `close_by` lead time is to be confirmed in the real
test-mode check.
Milestone 2 runs against **Razorpay test-mode keys**; automated tests run
against the mock server's payment routes. Internally: builds/POSTs to
`https://api.razorpay.com/v1/payments/qr_codes`, polls
`qr_codes/<id>/payments` every few seconds up to a timeout, emits
`payment_received`/`payment_failed` on `captured`/`failed`.

Reads `key_id`/`key_secret` from `user://razorpay_credentials.cfg`
(`ConfigFile` format, not git-tracked — same provisioning-file pattern as
`TENANT_ID_PATH`) at `_ready()`; if missing, logs an error and blocks
payment rather than falling back to any baked-in key. `RazorpayManager`
itself stays payment-only and never touches `OrderState` directly —
`payment.gd`'s `payment_received` handler is the one place that bridges the
two, stashing `payment_id` into `OrderState.transaction_id`.

### 3.6 New scenes — how they use `ConfigManager`/`OrderState`

**`scenes/idle/` (`Idle.tscn`/`idle.gd`)**: attract-loop video (Section
3.13) + tap-to-start, plus the maintenance check/redirect
(`ConfigManager.is_in_maintenance()` in `_ready()`, subscribe to
`maintenance_changed`) — this is the *only* screen that checks maintenance
mid-session (Section 3.11 explains why).

**`scenes/flavor_select/` (`FlavorSelect.tscn`/`flavor_select.gd`)**: a
2-column grid of product cards (design page 2) built from
`ConfigManager.get_flavors()` in `_ready()` and rebuilt on `config_ready`
(no per-frame `load()`, unlike the old `node_2d.gd`). Sold-out cards are greyed
and not tappable. A tap writes `OrderState.selected_flavor` and goes to
details. No UDP here (Section 3.2). Inactivity → idle.

**`scenes/flavor_detail/` (`FlavorDetail.tscn`/`flavor_detail.gd`)** *(added
2026-09-24, design page 3)*: Ingredients & Allergens. Back clears the
selection and returns to the listing. **Proceed to Pay** commits
`charged_price`, `selected_base_id` and `order_id` (Section 3.4), then goes to
payment. A catalog refresh while open re-resolves the flavor by id and bails
to the listing if it's gone or sold out.

**`scenes/payment/` (`Payment.tscn`/`payment.gd`)**: "Scan to pay" (design page
4). Reads the already-committed `OrderState.charged_price` / `order_id`
(Section 3.4); there is no base picker (milk stays config-disabled, and the
first enabled base is used). This replaces the old
`if protein_value==1: 75 / ==2: 180 / ...` chain entirely. On
`payment_received` it stores the transaction ID and **then** sends the hopper
command (Section 3.2). Payment via
`RazorpayManager` (3.5). Real failure-path UI via
`ConfigManager.get_message("payment_failed")` — the old `_finish(false)`
sends `"X"` and dead-ends with no UI at all; this plan makes the label
visible with real text instead of leaving the screen stuck. All timing
constants (`INACTIVITY_LIMIT`, `POLL_INTERVAL`, `MAX_POLL_TIME`,
`QR_EXPIRY_SEC` in the old code) come from `ConfigManager.get_timing(...)`.
The QR-generating label text comes from
`ConfigManager.get_message("qr_generating")` instead of a scene's static
`text` property.

### 3.7 Hardware dispensing-confirmation signal

Today the Arduino↔Godot link is one-way and the dispensing screen is a pure
fixed-duration timer with no relationship to what the hardware is actually
doing. This adds the minimal signal needed for the sale/telemetry reports to
fire on a real outcome: **did the dispense routine finish, or time out.**
Nothing here adds fault sensing (no cup/motor sensors exist) — it's purely
"did we hear back in time."

**`hardware/firmware/VM_code.ino`**: right before the existing end-of-cycle
sequence (`Serial.println("Mix Done"); Serial.flush(); delay(100);
resetArduino();` at the end of `loop()`), print one additional,
machine-parseable line: `Serial.println("STATUS:DONE");` — then flush and
reset as today. Only `VM_code.ino` is touched (2.2.6) — no new sensors, no
new pins, no change to the dispense sequence itself.

**`hardware/bridge/udprxtx.py`**: after writing the `"PB\n"` command to the
Arduino on payment success (today it immediately loops back to "Ready" with
no wait), block reading `arduino.readline()` in a loop with an overall
deadline (e.g. 60s, comfortably above the firmware's worst-case cycle time)
looking for a line containing `"STATUS:DONE"`.
- If received in time: send UDP `"DONE"` to a **new port, 4245**, then
  proceed to "Ready".
- If the deadline elapses: send UDP `"TIMEOUT"` to port 4245 instead, then
  proceed to "Ready" (don't hang the bridge script forever on one order).

This is a real behavior change worth flagging: blocking for up to 60s is
safe because the machine is physically single-cup/single-order — the
Arduino's own `loop()` is itself blocked by `delay()` calls throughout the
dispense sequence and won't read a new command until `resetArduino()`
restarts it, so there was never a real second order this could have
serialized in parallel with.

**`scenes/dispensing/` (`Dispensing.tscn`/`dispensing.gd`)**: add a
`PacketPeerUDP` bound (not connected — the first *receiving* socket in the
project; existing sockets only ever `connect_to_host()` to send) to listen
on port 4245. Replaces the fixed 85s timer. In `_process()`, alongside the
progress-bar animation, poll for an incoming packet:
- On `"DONE"`: stop the progress bar at 100%, show
  `ConfigManager.get_message("dispensing_success")`, fire the sale report
  (3.12) and telemetry report (3.8) with the matching result, proceed to
  `scenes/complete/`.
- On `"TIMEOUT"`: stop the progress bar, show
  `ConfigManager.get_message("dispensing_timeout")` instead, fire both
  reports with `dispensing_result: "timeout"` / no success stage, proceed
  onward.
- **Safety cap**: if *no* packet arrives at all within ~90s (UDP packet
  loss, bridge script crash, etc.), treat it the same as a local
  `"TIMEOUT"` rather than hanging the screen indefinitely.

**`scenes/complete/` (`Complete.tscn`/`complete.gd`)**: ported forward
as-is (10s auto-return to idle).

This keeps the change surface small: one new `Serial.println`, one new
blocking read with a timeout in a script that already opens the serial
port, one new UDP port, one new receiving socket in Godot.

### 3.8 Fault/telemetry reporting — `TelemetryReporter.gd`

Scoped, per decision 2.1.9, to what the *current* hardware can detect:
per-stage timing plus one homing-timeout fault. The fuller fault list is
planned in Section 3.9 but not built now.

**`hardware/firmware/VM_code.ino`**: reformat the status lines it already
prints (`Homing`, `Home reached`, `Water Filled in Cup`,
`Protein n Dispensed`, `Shake Frothing Done`) into a consistent, parseable
`STATUS:<STAGE>` format — `STATUS:HOMING_START`, `STATUS:HOMING_DONE`,
`STATUS:WATER_FILL_1_DONE`, `STATUS:PROTEIN_DISPENSED`,
`STATUS:WATER_FILL_2_DONE`, `STATUS:MIX_DONE`, `STATUS:DONE` (from 3.7). Add
a bounded timeout around `homeAxis()`'s wait-for-limit-switch loop
(currently unbounded — a real infinite-loop risk if the switch fails or a
wire comes loose): on timeout, print `FAULT:HOMING_TIMEOUT` and still call
`resetArduino()` rather than hanging until someone power-cycles the board.

**`hardware/bridge/udprxtx.py`**: while doing the blocking read for
`STATUS:DONE` (3.7), also collect every `STATUS:*`/`FAULT:*` line seen and
its wall-clock arrival time into a per-cycle list. When the cycle ends,
assemble one telemetry record — stage timestamps plus a `fault` field
(`null` unless a `FAULT:*` line appeared) — and send it as a single UDP
packet on a new port, **4246**, alongside (not instead of) the `DONE`/
`TIMEOUT` send on 4245. `udprxtx.py` has no idea what a Razorpay transaction
ID is, so it can't fill in `transaction_id` itself — `TelemetryReporter`
stamps that in from `OrderState.transaction_id` when the packet arrives.

**`autoload/TelemetryReporter.gd`** — mirrors `SalesReporter.gd`'s pattern
(3.12): own queue file (`user://telemetry_queue.json`), atomic
temp-then-rename writes, a retry `Timer`, flush-on-boot, records never
dropped on failure. Kept as its own autoload rather than folded into
`SalesReporter` since fault/telemetry data is operationally distinct
(likely a different backend/dashboard, and can fire even when a cycle never
becomes a completed sale). `const TELEMETRY_REPORT_URL`, same placeholder
spirit as `CONFIG_URL`/`SALE_REPORT_URL`.

Payload carries an `event_type` discriminator from the start, even though
this build only ever sends one value for it — Section 3.9's future roadmap
adds more without changing this shape:

```json
{
  "event_type": "dispense_cycle",
  "tenant_id": "machine-042",
  "cycle_id": "8f1c2a4e-9b3d-4a11-9c2e-7e6d5f4a3b2c",
  "order_id": "01J8Z6Q4M9X3T7C2V5B8N1K4RD",
  "transaction_id": "pay_QqR8xYz3vN2Kw1",
  "flavor_id": "guava",
  "hopper": 1,
  "base_id": "water",
  "stages": [
    {"stage": "HOMING_START", "t_offset_ms": 0},
    {"stage": "HOMING_DONE", "t_offset_ms": 1820},
    {"stage": "WATER_FILL_1_DONE", "t_offset_ms": 6100},
    {"stage": "PROTEIN_DISPENSED", "t_offset_ms": 7600},
    {"stage": "WATER_FILL_2_DONE", "t_offset_ms": 13700},
    {"stage": "MIX_DONE", "t_offset_ms": 43900},
    {"stage": "DONE", "t_offset_ms": 44050}
  ],
  "fault": null,
  "timestamp": "2026-09-19T10:22:31Z"
}
```

`fault` is a string (e.g. `"HOMING_TIMEOUT"`) on a fault cycle instead of
`null`; `timestamp` via `Time.get_datetime_string_from_system(true)` —
explicit UTC, since a multi-tenant fleet can span timezones.
`TelemetryReporter` itself owns the UDP listener on port 4246 (bound in its
own `_ready()`, not inside `scenes/dispensing/`) and calls
`report_event(record)` directly on receipt — deliberate even though this
build only ever produces cycle-scoped events, since Section 3.9's roadmap
adds events that can occur while the machine is idle (a door opening, a
leak) with no dispensing scene loaded to catch them.

Extend `tools/mock_config_server.py` (or add a sibling mock) to also serve
`TELEMETRY_REPORT_URL`, same as it does for `SALE_REPORT_URL`, so telemetry
can be exercised without a real backend.

### 3.9 Future hardware fault/telemetry roadmap (needs new sensors — not this build)

This section plans the fuller fault list irrespective of what's on the
machine today, so it's tracked rather than lost — building any of these is
a separate, later effort once the sensor is actually sourced and wired, not
part of the initial rewrite. All of them reuse the exact transport already
built in Section 3.8 — Arduino → serial line → `udprxtx.py` → UDP 4246 →
`TelemetryReporter.gd` → durable queue → POST to `TELEMETRY_REPORT_URL` —
just with new `STATUS:*`/`FAULT:*` line vocabulary and new `event_type`
values flowing through the same pipe. No new POST mechanism, server
endpoint, or queue/retry logic needs inventing later.

**Generalized envelope**: every event has `event_type` as the first field.
Section 3.8 only ever sends `"dispense_cycle"`. This roadmap adds two more
shapes:
- `"fault"` — a standalone event, not tied to any dispense cycle (the
  machine can be sitting idle when a door opens or a leak starts):
  ```json
  {
    "event_type": "fault",
    "tenant_id": "machine-042",
    "fault_type": "DOOR_OPEN",
    "detail": null,
    "timestamp": "2026-09-19T10:22:31Z"
  }
  ```
- `"payment_confirmed"` — fired the instant payment succeeds, before the
  dispensing scene even loads (see item 6 below):
  ```json
  {
    "event_type": "payment_confirmed",
    "tenant_id": "machine-042",
    "order_id": "01J8Z6Q4M9X3T7C2V5B8N1K4RD",
    "transaction_id": "pay_QqR8xYz3vN2Kw1",
    "timestamp": "2026-09-19T10:22:31Z"
  }
  ```

**The faults**:

1. **Cup-not-present.** New sensor: IR break-beam or mechanical switch at
   the dispense point. Read by `VM_code.ino` right before starting the
   motor sequence — if no cup, skip the whole dispense, print
   `FAULT:CUP_MISSING`, still `resetArduino()`. Reported as a
   `dispense_cycle` event with `fault: "CUP_MISSING"` and an
   empty/truncated `stages` list. Payment already completes *before* this
   check in the current flow, so a missing cup means a paid-but-undispensed
   order — the refund/retry UX is a product decision to make when this
   sensor is actually built, not solved here.
2. **Leak/moisture detection.** New sensor: a moisture probe near the
   enclosure base. `VM_code.ino` polls it continuously regardless of cycle
   state; on trigger, immediately print `FAULT:LEAK_DETECTED` (and
   `FAULT:LEAK_CLEARED` when it dries out) as a standalone `fault` event —
   and, as a safety interlock, latch the pump relay off until a technician
   physically clears it, don't auto-resume.
3. **Door/panel-open (tamper).** New sensor: a reed switch on the service
   door. Polled continuously; `FAULT:DOOR_OPEN`/`FAULT:DOOR_CLOSED` as
   standalone `fault` events. Interlock: refuse to start a new cycle while
   open — checked alongside the existing maintenance-flag check in
   `scenes/idle/`.
4. **Hopper-empty per flavor.** New sensor: a load cell (HX711) or IR
   break-beam per hopper (×4). `VM_code.ino` polls periodically (e.g. every
   5s), reports `FAULT:HOPPER_EMPTY:<n>` / `STATUS:HOPPER_OK:<n>` as
   standalone `fault` events. Godot-side: `ConfigManager` needs a new local
   override — a machine-local "hopper faulted by index" map, updated live
   by these events — that `get_flavors()` filters against *in addition to*
   the remote `enabled` flag, so a customer never sees a flavor that's
   physically empty even if the remote catalog still lists it enabled.
5. **Auger/motor stall.** New sensor: a current sensor (ACS712/INA219) per
   motor (×4). `VM_code.ino` samples current during that motor's active
   window; out-of-band current aborts that phase, prints
   `FAULT:AUGER_STALL:<n>`. Reported as a `dispense_cycle` event, `fault`
   field set — tied to a specific order, unlike the door/leak/hopper
   faults.
6. **Charged-but-never-dispensed reconciliation.** No new sensor — a Godot
   logic gap. `scenes/payment/` fires a `payment_confirmed` event the
   instant `RazorpayManager.payment_received` fires, carrying the Razorpay
   `transaction_id`, before the dispensing scene even loads. Backend-side
   reconciliation: every `payment_confirmed` should have a matching
   `dispense_cycle` event with the same `transaction_id` within a few
   minutes — an unmatched one is the fault. This is why `dispense_cycle`'s
   schema already carries `transaction_id` (3.8) even though this build has
   no reconciliation logic yet — the join key needs to exist on day one for
   this to be addable later without a schema migration.
7. **Water/base delivery verification.** New sensor: a pulse-output flow
   sensor (e.g. YF-S201) on the water line. `VM_code.ino` counts pulses
   during the `PU`-active window, compares to the expected count. Always
   includes a measured `water_volume_ml` field on the `dispense_cycle`
   event (success or not), plus `FAULT:WATER_UNDERFILL` when below
   tolerance.
8. **Actual dispensed weight vs expected.** New sensor: a load cell under
   the cup station. `VM_code.ino` tares before the cycle, weighs after mix
   completes. Always includes a measured `dispensed_weight_g` field, plus
   `FAULT:WEIGHT_MISMATCH` when the delta is outside tolerance — catches
   slow auger-wear calibration drift before customers notice.
9. **Repeated-watchdog-reset alerting.** No new sensor — firmware/EEPROM
   logic only. `VM_code.ino` already reboots itself via watchdog after
   every completed cycle by design; the fault case is rebooting *without*
   completing one. Write a "cycle in progress" flag to EEPROM when a cycle
   starts, clear it right after `STATUS:DONE`. On boot, if that flag is
   still set across N consecutive boots, print `FAULT:WATCHDOG_LOOP` before
   continuing normal init.
10. **Prolonged-offline alerting.** No client-side POST possible — a
    machine that's offline can't report its own silence. Purely a backend
    requirement: every tenant already has a natural "last seen" timestamp
    from any of `ConfigManager`'s boot fetches, its maintenance polls,
    `SalesReporter`, or `TelemetryReporter` POSTs — alerting when that goes
    stale for a given `tenant_id` is a server-side rule against data this
    plan already produces, not new client work.

**Explicitly deferred, not just missing**: enclosure over-temperature
monitoring — considered and dropped.

### 3.10 Fault → screen mapping

Not every fault belongs on a customer-facing screen, and not every
screen-facing one belongs on the *same* screen. Three buckets, plus a
`ConfigManager` change needed to support the middle one.

**`ConfigManager` change — local hardware-fault flag alongside the remote
one.** `is_in_maintenance()` becomes
`remote_maintenance_enabled or local_hardware_fault_active`, where the local
half is set by `ConfigManager.set_local_hardware_fault(active: bool)`,
called by `TelemetryReporter` when it sees one of the Bucket C fault types
below. `maintenance_changed` fires when either source flips. `scenes/idle/`
needs **no new call site** — it already checks `is_in_maintenance()` and
subscribes to `maintenance_changed` (3.6, 3.11); this is exactly why that
design keeps a single enforcement point instead of scattering the check.
`Maintenance.tscn` picks its message source based on *why* it's showing:
the remote `maintenance.message` when `remote_maintenance_enabled` is
what's true, otherwise `ConfigManager.get_message("maintenance_default")` —
there's no operator-authored copy for a fault nobody planned.

**Bucket A — order-scoped, customer sees an actionable/generic message,
machine stays in service:**
- **Cup-not-present**: dedicated message ("Please place a cup") with a
  retry-check, ideally gated before payment rather than surfaced as a
  failure after charging — an open product question (3.9, item 1).
- **Auger stall**, **water underfill**: no dedicated message — both route
  into the dispensing screen's existing failure path
  (`ConfigManager.get_message("dispensing_timeout")`, the same text used
  for a plain hardware timeout). The customer doesn't need the mechanical
  distinction, only that it failed and to contact support if charged.

**Bucket B — filtered out of the picker, no fault message at all:**
- **Hopper-empty per flavor**: handled entirely by `flavor_select`'s
  existing `ConfigManager.get_flavors()` filtering — the roadmap's local
  "hopper faulted by index" override is just one more reason a flavor is
  excluded, same code path as a remotely `enabled: false` flavor. No new UI.

**Bucket C — whole-machine, routes to `Maintenance.tscn` via the local
flag:**
- **`FAULT:HOMING_TIMEOUT`** (already built, Section 3.8, not the future
  roadmap) — this can fire either at boot or at the end of a completed
  cycle's re-homing step; either way, the carriage position for the *next*
  order is unreliable, so it sets the local fault flag rather than only
  being logged.
- **Leak detected**: sets the flag; deliberately **does not auto-clear** on
  `FAULT:LEAK_CLEARED` — a leak that stops on its own can restart, so this
  one stays down until a technician acknowledges it (mechanism TBD when the
  sensor is actually built — e.g. a debug-menu clear action).
- **Repeated-watchdog-reset loop**: sets the flag; same manual-clear
  reasoning as leak — a machine that was crash-looping needs inspection,
  not just a lucky boot.
- **Door/tamper open**: sets the flag while open, auto-clears on
  `FAULT:DOOR_CLOSED` (unambiguous, unlike a leak). **Open question, not
  resolved by this plan**: a technician standing at an open door mid-service
  may not want the public Maintenance screen taking over their own test
  display — worth deciding whether door-open should swap the visible screen
  or just silently refuse new orders while the technician's own workflow
  keeps the screen as-is.

**Bucket D — never reaches a screen:**
- **Dispensed-weight mismatch**: telemetry/calibration only — the shake is
  already made and handed over by the time this is known.
- **Charged-but-never-dispensed reconciliation**: detected after the fact by
  comparing `payment_confirmed`/`dispense_cycle` events, not in the moment.
- **Prolonged-offline alerting**: backend-only by definition.

### 3.11 Maintenance mode

**Periodic poll**: `ConfigManager` gets a second `Timer`, interval from
`local_settings.timing.maintenance_poll_interval_sec` (e.g. 120s),
independent of the boot-time catalog fetch. Both the boot fetch and the
poll hit the same config URL (`get_api_url()`) with the same `X-Tenant-Id` header, but use
**separate `HTTPRequest` nodes** — a dedicated `_http_maintenance_poll`
distinct from the boot-fetch request node. `HTTPRequest` only handles one
in-flight request at a time; if the boot fetch is still pending (slow
network) when the first poll timer fires, a shared node would race two
callers against each other. Two small, single-purpose request/handler pairs
(matching `RazorpayManager`'s existing pattern of one `HTTPRequest` node per
concern) avoid that race:
- **Boot fetch**: validates and applies the full catalog (3.3, step 6) *and*
  checks `maintenance`.
- **Poll fetch**: only reads `data.maintenance` — deliberately does **not**
  overwrite `current_config`'s catalog, so a mid-session price/flavor change
  from a poll can't disrupt a customer already mid-order. Catalog changes
  still only take effect on the next boot; only the maintenance flag is
  "live."

`signal maintenance_changed(enabled: bool, message: String)` fires whenever
a fetch (boot or poll) sees the flag's value differ from what
`ConfigManager` last saw, so listeners aren't spammed every poll interval
when nothing changed. `is_in_maintenance() -> bool` is now
`remote_maintenance_enabled or local_hardware_fault_active` (3.10) — the
composition of the remote flag with the new local hardware-fault flag.

**`scenes/maintenance/` (`Maintenance.tscn`/`maintenance.gd`)**: an
unbranded out-of-service screen (design page 6) with a technician
diagnostics panel (machine ID, site, flagged by/at, app version, network,
last heartbeat, payments disabled) and the active `faults` list. No buttons,
no interaction. It **re-checks `is_in_maintenance()` on entry** and returns
to idle if the flag already cleared (a race found in testing). Shows `maintenance.message` from the
config if non-empty and remotely triggered, else
`ConfigManager.get_message("maintenance_default")` (locally triggered, or
remote message empty). Subscribes to `maintenance_changed`; when it flips to
`false`, navigates back to `scenes/idle/`.

**Enforcement point — idle screen only**: `scenes/idle/` is the *only*
place that checks `ConfigManager.is_in_maintenance()` (in `_ready()`) or
subscribes to `maintenance_changed` while active, and redirects to
`Maintenance.tscn` when true. No other screen checks this mid-flow — an
order already in progress is never interrupted by a maintenance flag
flipping on. A machine that goes into maintenance mid-order will only
actually show the maintenance screen once that order finishes and control
returns to idle (success, failure, or inactivity timeout all already route
there).

### 3.12 Sale reporting — `SalesReporter.gd`

**New autoload `autoload/SalesReporter.gd`** (separate from `ConfigManager`
— a distinct concern, an outbound write path with its own local
queue/retry, not config reading). Registered after `ConfigManager`, same
ordering requirement `TelemetryReporter` has (3.8), for the same reason:
`ConfigManager.tenant_id` must already be resolved.

- `const SALE_REPORT_URL = "https://example.invalid/fuelbot/sales"` —
  placeholder, same spirit as `CONFIG_URL`/`TELEMETRY_REPORT_URL`.
- `const QUEUE_PATH = "user://sales_queue.json"` — a JSON array of
  not-yet-successfully-reported sale records, written with the same atomic
  temp-file-then-rename pattern used for the config cache.

Payload per sale, sourced entirely from `OrderState` (3.4) — not the old
`protein.selected_flavor` static var:

```json
{
  "tenant_id": "machine-042",
  "order_id": "01J8Z6Q4M9X3T7C2V5B8N1K4RD",
  "order_number": 4821,
  "transaction_id": "pay_QqR8xYz3vN2Kw1",
  "flavor_id": "guava",
  "hopper": 1,
  "base_id": "water",
  "actual_price": 90,
  "offer_price": 75,
  "charged_price": 75,
  "dispensing_result": "success",
  "timestamp": "2026-09-19T10:22:31Z"
}
```

`order_id` (ULID, Section 3.4) is the primary join key across sale,
telemetry and Razorpay records, present even for orders that never got
paid; `order_number` is display-only. `transaction_id` is the exact same
value `TelemetryReporter`'s
`dispense_cycle` event carries for the same order (3.8) — deliberately
shared via `OrderState.transaction_id`, so a backend can join a sale record
to its telemetry record without extra plumbing on either side. `timestamp`
must be UTC, explicitly — built with
`Time.get_datetime_string_from_system(true)` — a multi-tenant fleet can
span timezones and an audit trail with ambiguous local timestamps is a real
problem to untangle later.

`func report_sale(record: Dictionary) -> void`:
1. Append `record` to the in-memory queue and persist the whole queue to
   `QUEUE_PATH` immediately (atomic write) — durable on disk before any
   network attempt, so a crash/power-loss right after can't lose it.
2. Attempt the POST to `SALE_REPORT_URL` with header
   `"X-Tenant-Id: " + ConfigManager.tenant_id`.
3. On success (2xx): remove that record from the queue, rewrite
   `QUEUE_PATH`.
4. On failure: leave it queued — nothing else to do, the retry timer picks
   it up.

**Retry**: a `Timer` (interval from
`local_settings.timing.sale_report_retry_interval_sec`, e.g. 60s)
periodically flushes every record currently in the queue, oldest first.
Also one flush attempt in `_ready()` at boot, in case the machine was
rebooted while records were still queued from a prior offline session. No
record is ever dropped on failure — only removed once a 2xx response is
received.

**Trigger point**: `scenes/dispensing/`'s UDP listener (3.7, extended for
telemetry in 3.8) calls **both** `TelemetryReporter.report_event(...)` and
`SalesReporter.report_sale(...)` from the same `DONE`/`TIMEOUT` handler —
one call each, `dispensing_result` set to `"success"` or `"timeout"`
accordingly. The two reporters are structural twins but stay separate
autoloads on purpose: different backend/dashboard, different operational
meaning — a sale record is a billing fact, a telemetry record is a
diagnostic one — and once Section 3.9's `CUP_MISSING`/`AUGER_STALL` faults
exist, a cycle can abort with a telemetry record but no sale (or vice
versa) — that asymmetry is exactly why they were never merged into one
reporter.

### 3.13 Idle-screen ad video

**Bundled (this build)**: single bundled clip, **`.ogv` (Theora) only** —
port `mmgc.ogv` forward into `assets/video/`; drop the duplicate
`mmgc (1).ogv` unless a diff shows it's actually different content, same
duplicate-asset treatment Milestone 7 applies to images. Do **not** port
`mmgc.mp4`/`PreparationVideo.webm` forward as playable assets — see the
spike results below. `VideoStreamPlayer` has no native seamless-loop flag
even for Theora, so looping is explicit: connect its `finished` signal to
call `.play()` again. This is a real gap in the current
`video_stream_player.gd` — it only kicks off the first `play()` after one
deferred frame and never wires `finished`, so today's build likely just
plays once and stops on the last frame. Stop playback on the transition
away from idle (tap-to-start → flavor select) rather than leaving it
decoding in the background — matters more on the Pi target (Milestone 8)
than on a dev machine. Restart from the beginning whenever idle is
(re-)entered. No runtime toggle needed to keep it off during maintenance —
`Idle.tscn` and `Maintenance.tscn` are separate scenes, so the video simply
isn't in that scene's tree at all.

**Future scope — remotely managed via S3**: deferred, kept deliberately
simple per direction: **no separate manifest endpoint, no checksum, no
periodic poll, no dedicated autoload.** The video URL (`idle_video_url`,
3.1) rides in the same config response `ConfigManager` already fetches at
boot, and the video's own filename is the version signal — if ops needs to
change the ad, they upload a new file under a new name; the client never
compares anything smarter than "have I already got a file by this name."

`ConfigManager`'s boot sequence (step 6) gets one more step:
- After a successful, validated catalog fetch, check whether
  `idle_video_url` is present. If so, extract just the **filename** from
  its path (`summer_promo_v3.ogv`) — comparing the filename rather than the
  full URL matters if the bucket ever serves presigned URLs, whose
  query-string signature changes on every fetch even when the object
  itself hasn't; comparing only the path's filename stays correct either
  way, with no extra design cost.
- If `user://idle_video_cache/<that filename>` already exists on disk,
  done — no download, no network beyond the config fetch that already
  happened.
- If not, download it in the background (a dedicated `HTTPRequest` child,
  same pattern used to download the Razorpay QR image) to
  `user://idle_video_cache/<filename>.tmp`, and on a successful response
  (200, non-empty body) rename it into place, then delete any other file
  already sitting in `user://idle_video_cache/` (only ever one cached video
  at a time). On failure, leave whatever's already cached untouched and log
  it — retried on the **next boot**, matching the fetch-once-per-boot
  cadence the catalog itself already uses.
- Never blocks reaching the idle screen — something is always playable from
  whichever tier is already on disk while the download happens in the
  background.
- `Idle.tscn` reads the current video path fresh on every loop restart (a
  plain file-existence check, not a network call, so this is free) —
  meaning if the background download finishes partway through the current
  idle session, the next loop restart already picks up the new file without
  waiting for a reboot.
- Fallback order: cached video matching the current `idle_video_url`'s
  filename → whatever's already in `user://idle_video_cache/` even if stale
  → bundled default (`res://assets/video/idle_ad_default.ogv`) if the cache
  directory is empty entirely (true first boot, no successful fetch yet).

**Accepted operational constraint, not solved in software**: since there's
no checksum, correctness depends entirely on whoever uploads to S3 always
using a new filename for new content and never silently overwriting an
existing one in place. Worth a line in whatever runbook governs the S3
bucket, not a client-side problem given the "no over-engineering"
direction.

**Spike results (resolved 2026-09-19, editor, Godot 4.7.2)**: a `.ogv` file
dropped directly into a project's `user://` data directory (never imported,
simulating exactly what a background S3 download produces) loads and plays
correctly — confirmed via both plain `load("user://test.ogv")` and by
directly constructing `VideoStreamTheora.new()` with `.file` set to the
`user://` path, both giving `is_playing() == true` with `stream_position`
actually advancing. **The direct-construction approach is the one to
implement**:
```gdscript
var stream := VideoStreamTheora.new()
stream.file = "user://idle_video_cache/%s" % filename
video_player.stream = stream
video_player.play()
```
**Neither WebM nor MP4 is viable, on any path.** Testing both `.webm` and
`.mp4` files, each both raw at `user://` and bundled/imported as `res://`
(four combinations), gave the identical error
(`"No loader found for resource"` / `load()` returning null), and
`ClassDB.get_class_list()` has zero classes matching webm/vp8/vp9/mp4/h264
in this build. Neither format is compiled into this Godot 4.7.2 build at
all, bundled or not. MP4/H.264 specifically has never shipped in official
Godot builds regardless of version, due to H.264's licensing terms — not
something a future Godot upgrade would fix. **Consequence**: the S3-hosted
ad video must be `.ogv` (Theora), no exceptions — whoever runs the upload
pipeline needs to encode to Theora, not the more common MP4/WebM.

Two things the spike did **not** cover, still open:
1. **The actual arm64/Pi export template** (Milestone 8) — this spike only
   confirmed editor/desktop behavior. Theora is a core built-in format
   rather than an optional module, which makes export-template divergence
   unlikely, but that's a reasonable expectation, not a confirmed fact —
   re-verify once that export preset exists.
2. **A real `HTTPRequest` download**, not a manually copied file. Low risk
   — `HTTPRequest` saving a response body to disk is already an established
   pattern in this codebase (the Razorpay QR image download) — but worth a
   quick confirmation once `ConfigManager`'s download step is actually
   built.

## 4. Target folder structure

*(Updated 2026-09-24 to the as-built layout; ✓ = exists.)*

```
fuelbot/ (repo root)
├── project.godot                ✓
├── CLAUDE.md, README.md         ✓ conventions, gotchas, how to run
├── autoload/
│   ├── ConfigManager.gd         ✓
│   ├── OrderState.gd            ✓ replaces the static-var hack
│   ├── Nav.gd                   ✓ all scene changes (testable)
│   ├── DevCapture.gd            ✓ dev-only screenshots, always last
│   ├── RazorpayManager.gd       # rewritten clean, single implementation
│   ├── SalesReporter.gd
│   └── TelemetryReporter.gd     # fault/stage-timing reports, own queue+retry
├── scenes/
│   ├── idle/{Idle.tscn, idle.gd}                          ✓
│   ├── flavor_select/{FlavorSelect.tscn, flavor_select.gd} ✓
│   ├── flavor_detail/{FlavorDetail.tscn, flavor_detail.gd} ✓ Ingredients & Allergens
│   ├── payment/{Payment.tscn, payment.gd}                  ✓ stub until Milestone 2
│   ├── dispensing/{Dispensing.tscn, dispensing.gd}
│   ├── complete/{Complete.tscn, complete.gd}
│   ├── maintenance/{Maintenance.tscn, maintenance.gd}      ✓
│   └── scene_paths.gd                                      ✓
├── ui/                          ✓ components/, theme/palette.gd, format.gd, gallery/
├── config/
│   ├── default_config.json      ✓
│   └── local_settings.json      ✓
├── assets/
│   ├── images/flavors/          ✓
│   ├── fonts/                   ✓ Archivo + JetBrains Mono (OFL)
│   ├── theme/                   ✓ generated by tools/build_theme.gd
│   └── video/                   ✓ idle_ad_default.ogv
├── hardware/
│   ├── firmware/VM_code.ino
│   ├── bridge/udprxtx.py
│   └── pos/{pinelabs.py, transactions.xlsx}   # ported, inert
├── mockserver/                  ✓ replaces tools/mock_config_server.py: stdlib server + JSON scenarios
├── tests/                       ✓ headless harness (TestRunner.tscn) + unit/test_*.gd
├── tools/
│   ├── run_tests.sh, check_boot.sh, screenshot.sh, dev_run.sh, dev_setup.gd, build_theme.gd  ✓
│   ├── fake_arduino_serial.py   # Level 1 harness — full STATUS:* sequence + --fault mode
│   └── fake_dispense_bridge.py  # Level 0 harness — fakes DONE/TIMEOUT + telemetry on 4246
├── designs/GMRFuelBot-OnDevice-SsampleScreens.pdf   ✓
└── devdocs/
    ├── plans/greenfield-rewrite.md   # this document
    └── stories/<set>/                # executable story sets + SIGNOFF.md
```

Scene/script names are renamed off the old `One`/`node_2d`/`Second`/`Third`/
`Fourth` placeholders (numbered/generic names left over from early
prototyping) to describe what each screen actually does, now that there's no
existing external reference (docs, muscle memory) to preserve.

## 5. Build order (each milestone independently buildable/testable)

**Status (2026-09-24):**

| Milestone | Status | Evidence |
|-----------|--------|----------|
| 0 — Skeleton | ✅ Done | [idle SIGNOFF](../stories/idle/SIGNOFF.md) |
| 1 — Core data & state | ✅ Done (config, OrderState, mock server) | [idle SIGNOFF](../stories/idle/SIGNOFF.md) |
| 2 — Payment layer | 🟡 Built; mock end-to-end PASS; **real test-mode check pending** (product owner) | [payment SIGNOFF](../stories/payment/SIGNOFF.md) |
| 3 — Idle, listing, details, payment screens | ✅ Idle, listing, details done; payment screen is a stub pending M2 | [idle](../stories/idle/SIGNOFF.md), [details](../stories/details/SIGNOFF.md) |
| 4 — Hardware bridge + dispensing | Not started. Includes **motors 5–6** in firmware/wiring | — |
| 5 — Telemetry | Not started | — |
| 6 — Maintenance + sale reporting | Maintenance screen/poll ✅ done early (idle set); sale reporting not started | [idle SIGNOFF](../stories/idle/SIGNOFF.md) |
| 7 — Asset migration | Partly done: flavor images, video, fonts ported. The flavor PNGs need padding trimmed | [assets/ASSETS.md](../../assets/ASSETS.md) |
| 8 — Raspberry Pi | Not started | — |

**Milestone 0 — Skeleton**
- `git init` the new directory; `.gitignore` covering `.godot/`, `.import`
  cache noise, and the credential/provisioning files below by pattern
  (`*.local.cfg`, `tenant_id.txt`, `razorpay_credentials.cfg`) so they can
  never land in git even by accident.
- `project.godot`: port the real settings confirmed by inventory — 1080×1920
  portrait viewport, fullscreen, `gl_compatibility` renderer, portrait
  orientation. Drop `text_to_speech=true` (only used by the dead TTS code).
- Create the folder tree above; this document lives at
  `devdocs/plans/greenfield-rewrite.md`.

**Milestone 1 — Core data & state (no UI yet)**
- `autoload/ConfigManager.gd`: full boot sequence per Section 3.3.
- `config/default_config.json` / `config/local_settings.json`: bundled
  fixtures. Flavor/price/message/timing values ported from the magic
  numbers found in the inventory (4 flavors — guava/chocolate/electro/
  vanilla; prices ₹75/180/35/140; `flavor_screen_inactivity_sec: 60`,
  `payment_screen_inactivity_sec: 180`, etc.).
- `autoload/OrderState.gd` per Section 3.4.
- `mockserver/` (built instead of `tools/mock_config_server.py`): config route
  done; sales and telemetry routes added by their milestones (asserts
  `X-Tenant-Id` present).
- Register `ConfigManager` then `OrderState` in `project.godot`'s
  `[autoload]` (ordering matters — later autoloads read `ConfigManager` at
  boot).
- Verify (Section 7, steps 1–4): fetch, tenant-ID fallback, cache fallback,
  bundled-default fallback, live price/flavor change with no code edit.

**Milestone 2 — Payment layer**
- `autoload/RazorpayManager.gd` per Section 3.5.
- Verify: exercise `create_qr()`/poll/success/failure manually against
  Razorpay test keys dropped into the local cfg file.

**Milestone 3 — Idle, flavor select, base select/payment screens**
- `scenes/idle/`, `scenes/flavor_select/`, `scenes/payment/` per Section
  3.6, including the ad-video loop per Section 3.13 (bundled variant).
- Verify: walk flavor → base → QR generation in the editor against the mock
  config server + Razorpay test keys. Separately, let `Idle.tscn` sit
  through a full video playthrough and confirm it restarts on its own
  (`finished` → `.play()` actually fires) instead of freezing on the last
  frame, and confirm it stops decoding once you tap through to
  `flavor_select`.

**Milestone 4 — Hardware bridge + real dispensing signal**
- `hardware/firmware/VM_code.ino`, `hardware/bridge/udprxtx.py`,
  `scenes/dispensing/`, `scenes/complete/` per Section 3.7.
- `hardware/pos/pinelabs.py` + `transactions.xlsx`: ported forward inert,
  unwired, per decision 2.2.2.
- Verify (Section 7, steps 5, 7, 8): hopper-vs-position check, real
  `STATUS:DONE`/`TIMEOUT` on the serial monitor, 90s safety cap.

**Milestone 5 — Fault/telemetry reporting**
- `hardware/firmware/VM_code.ino`, `hardware/bridge/udprxtx.py`,
  `autoload/TelemetryReporter.gd` per Section 3.8.
- Verify: run a normal cycle end-to-end and confirm one telemetry POST
  arrives with a full, ordered `stages` list and `fault: null`; then disable
  the limit switch (Level 2 rig, Section 6) and confirm `FAULT:HOMING_TIMEOUT`
  is both printed on serial and shows up as the `fault` field in the posted
  record instead of hanging the board. Also confirm the on-screen
  consequence (Section 3.10): that same `FAULT:HOMING_TIMEOUT` should flip
  `ConfigManager.is_in_maintenance()` to true and route the idle screen to
  `Maintenance.tscn`, not just log silently.

**Milestone 6 — Maintenance mode + sale reporting**
- `scenes/maintenance/` per Section 3.11; `autoload/SalesReporter.gd` per
  Section 3.12.
- Verify (Section 7, steps 9, 10): one sale POST fires per completed order
  (success or timeout) with `charged_price`/`dispensing_result` matching
  reality; kill the mock server mid-order, confirm the record persists in
  `user://sales_queue.json`, confirm it flushes without duplication once
  the server's back; maintenance flag flip/redirect behavior, including the
  mid-order non-interruption check.

**Milestone 7 — Asset migration**
- Copy over only assets actually referenced by the kept scenes — grep each
  new `.tscn` for its real `res://` texture paths before copying, rather
  than bulk-copying the old asset dump. Inventory flagged several images
  with no reference in any reachable scene (`BeastCoffee (1).png` vs
  `BeastCoffee.png` duplicates, `Scene1–4.png`, `output-onlinepngtools.png`,
  `protein_jar_mockup.png`, `ESSENTIAL WHEY.png`/`PRIME PROTEIN.png`/
  `WHEY ISOLATE.png`/`WellCreatine*.png`) — these are left behind unless a
  reference turns up during the actual port.

**Milestone 8 — Raspberry Pi deployment**
- Target Pi 4/5, 64-bit Raspberry Pi OS (Bookworm). Keep the
  `gl_compatibility` renderer — already the right choice for the Pi's GPU.
- Add a second export preset (`arm64` architecture) alongside the existing
  `x86_64` Linux preset — export templates are per-engine-version (`4.7`),
  so the Pi build must be exported from/for the same version.
- Enable `textures/vram_compression/import_etc2_astc=true` and reimport all
  textures before the ARM export — the current project only enables
  `import_s3tc_bptc` (a desktop-GPU format); without ETC2/ASTC, textures
  fall back to uncompressed on the Pi's GPU.
- Two `systemd` services: the exported Godot binary, and
  `hardware/bridge/udprxtx.py` — bridge starts first (Godot expects UDP
  4242/4243 reachable at boot), both `Restart=on-failure`.
- Kiosk boot: autologin into a minimal single-app session (a kiosk-mode
  compositor like `cage`/`labwc` running only the Godot binary, no desktop
  chrome), screen blanking/DPMS disabled.
- Write a udev rule aliasing the Arduino's vendor/product ID to
  `/dev/arduino` as part of Pi provisioning — `udprxtx.py` hardcodes that
  path, and raw `/dev/ttyACM0`/`ttyUSB0` enumeration isn't stable across
  reboots/reconnects without it.
- Verify the attract-loop video (`.ogv`, software Theora decode — `.webm`/
  `.mp4` aren't options at all, per Section 3.13's spike) holds framerate on
  the Pi before relying on it — flag early if not, since it's on the
  machine's most-visible idle screen.

## 6. Hardware-in-the-loop test rig

A staged rig so the full mechanical assembly isn't required just to check
whether Godot/the bridge/the firmware agree on the protocol. Each level is
cheaper to debug in than the one after it — don't skip to Level 3 to find a
bug Level 0 would have caught in seconds.

- **Level 0 — pure software, no hardware.** `tools/fake_dispense_bridge.py`:
  listens on the same UDP ports `udprxtx.py` uses (4242 selection, 4243
  payment result), and after a short delay sends `DONE`/`TIMEOUT` back on
  port 4245 plus a synthetic telemetry record (`fault: null`, a plausible
  `stages` list) on port 4246 — exercises the entire Godot flow (flavor →
  base → payment → dispensing screen reacting to `DONE`/`TIMEOUT` and
  calling `TelemetryReporter`) with zero physical hardware involved,
  runnable on a laptop alongside `mock_config_server.py`.
- **Level 1 — real bridge script, fake Arduino, no board.** Use
  `socat -d -d pty,raw,echo=0 pty,raw,echo=0` to create a linked virtual
  serial pair; point `udprxtx.py`'s `SERIAL_PORT` at one end,
  `tools/fake_arduino_serial.py` at the other — it mimics `VM_code.ino`'s
  full protocol (reads the 2-digit `"<protein><base>\n"` line, then prints
  the whole `STATUS:*` stage sequence with realistic delays between each,
  ending in `STATUS:DONE`). Give it a `--fault homing_timeout` mode that
  instead never emits `STATUS:HOMING_DONE`, to exercise `udprxtx.py`'s side
  of the fault path. Validates the real bridge script's parsing, per-stage
  telemetry assembly, 60s-timeout/restart-on-early-`X` logic, and the
  port-4246 telemetry send, with no board on the bench.
- **Level 2 — real Arduino, no motors/pumps.** Flash `VM_code.ino` to the
  real board with LEDs (current-limited) wired to `M1–M4`, `PU`, `MIX`,
  `ENA`/`DIR`/`Z`/`X` in place of the actual actuators. Confirms real pin
  sequencing, stepper homing/positioning, and that `STATUS:DONE` actually
  prints — driven either by hand via the serial monitor or by Level 1's
  bridge script — before any ingredient/liquid is at risk. Also disconnect
  the limit-switch wire here and confirm `FAULT:HOMING_TIMEOUT` prints and
  the board still resets, instead of hanging forever — the one fault case
  this plan can actually exercise on real hardware before the full
  mechanical bench exists.
- **Level 3 — full mechanical bench, no packaging.** Real motors/pump/
  stepper on a bench rig outside the enclosure, cup on a scale. This is
  where real dispense timing gets measured against the firmware's
  ~35–55s estimate (to tune the dispensing screen's progress bar and the
  90s safety cap against actual numbers), and where `SalesReporter`'s real
  trigger point first gets exercised end-to-end.

Only after Level 3 passes does it go in the actual enclosure.

## 7. Verification

*(Updated 2026-09-24:)* A headless test suite now exists (`tools/run_tests.sh`,
`tests/unit/`, run against `mockserver/` on :8788), plus a boot check and
real-time screenshots compared against the designs. See `CLAUDE.md`. There is
still no CI. The manual steps below remain the acceptance checklist; steps
1–4 and 10 were verified for the idle milestone (idle SIGNOFF):

1. Write a test tenant ID to `user://tenant_id.txt` (Godot editor's
   `user://` maps to a real folder on disk — locate it via
   `OS.get_user_data_dir()` or the editor's "Open User Data Folder" menu
   item). Run the mock config server locally (have it assert the
   `X-Tenant-Id` header is present and log its value), point
   `api.base_url` at it (`tools/dev_setup.gd` writes the override), launch the
   project (F5). Confirm the listing shows images/prices sourced from the mock
   JSON, not a hardcoded list.
1b. Delete/empty `tenant_id.txt` and relaunch: confirm no fetch is
    attempted (mock server sees no request) and the app falls back to
    cache/bundled default per the fallback chain.
2. Kill the mock server, relaunch: confirm it falls back to the last cached
   `user://config_cache.json` (check the file exists after step 1, inspect
   its contents).
3. Delete `user://config_cache.json` and kill the mock server, relaunch:
   confirm it falls back to the bundled `config/default_config.json` for
   flavors/bases and the app remains usable with no network at all —
   messages/timing unaffected either way since they come from the
   always-local `local_settings.json`.
4. Change a price/ingredient/image in the mock JSON, restart the app,
   confirm the change is reflected with no code edits.
5. Walk the full flow end-to-end (listing → details → payment → dispensing)
   and confirm the UDP `"P<hopper>"` message is sent only after payment
   succeeds and uses the config's `hopper` field, not the listing position, by temporarily setting a
   flavor's `hopper` to a different value than its array position in the
   mock JSON and confirming the correct digit is sent.
6. Trigger a payment failure (e.g. let the QR poll timeout) and confirm the
   `payment_failed` message actually displays instead of a dead-end.
7. Flash the updated `VM_code.ino` to real hardware (or a bench-wired
   Arduino, motors optional) and confirm `STATUS:DONE` appears on the
   serial monitor at the end of a cycle. Run updated `udprxtx.py` and
   confirm it sends UDP `"DONE"` on port 4245 within the expected time, and
   `"TIMEOUT"` if you unplug the Arduino mid-cycle so it never responds.
8. Run the full flow through to `Dispensing.tscn` with `udprxtx.py` running
   against real/bench hardware: confirm the progress bar screen waits for
   and reacts to the real `"DONE"`/`"TIMEOUT"` UDP message rather than
   finishing on its own timer, and shows the correct message for each case.
   Confirm the 90s safety cap fires correctly if you block all UDP traffic
   on port 4245 entirely.
9. Confirm a sale report POST fires exactly once per completed order
   (success or timeout), with the mock sales-report server logging the
   received payload — check `charged_price`/`dispensing_result` match what
   actually happened. Kill the mock server before completing an order:
   confirm the record persists in `user://sales_queue.json`, then restart
   the mock server and confirm the queued record gets flushed without
   duplicating already-sent records.
10. Flip `maintenance.enabled` to `true` in the mock config server's
    response while the app is idle: confirm it redirects to
    `Maintenance.tscn` within one poll interval, showing
    `maintenance.message`. Flip it back to `false`: confirm it returns to
    idle. Separately, start an order, flip the flag to `true` mid-order,
    and confirm the in-progress order is *not* interrupted — the
    maintenance screen should only appear once that order finishes.
11. One completed dispense cycle produces exactly one telemetry POST with a
    complete, correctly-ordered `stages` list, and the forced
    `FAULT:HOMING_TIMEOUT` case (Level 2 rig) produces a record with
    `fault` set instead of a silently missing/incomplete one.
12. `git grep -i "rzp_live\|rzp_test\|api_secret"` over the new repo returns
    nothing — confirms no credential ever lands in version control.

## 8. Explicitly out of scope

- Milk hardware dispensing (Arduino `base==1` logic stays commented out;
  config just marks it disabled).
- Sensor-based fault detection requiring new hardware (cup presence, leak,
  door/tamper, hopper-empty, motor-stall/current-sensing, water-flow,
  dispensed-weight) — only the already-detectable homing-timeout fault and
  stage timing are built in this rewrite (Section 3.8); the rest are
  planned but deferred to whenever that hardware is sourced (Section 3.9).
- Enclosure over-temperature monitoring — considered and explicitly
  dropped, not just deferred.
- Activating Pine Labs as a real payment path (ported inert only).
- Struck-through actual/offer price UI (data flows through, no new Label).
