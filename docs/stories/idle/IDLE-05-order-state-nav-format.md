# IDLE-05 — `OrderState`, `Nav` & formatting helpers

**As a** developer, **I want** one place for the in-progress order, one place
for scene changes, and shared text formatting, **so that** screens don't
reach into each other and navigation can be tested.

Plan refs: §2.2.5 and §3.4 (OrderState replaces the `static var` hack), §3.6.
Depends on: IDLE-04.

## Deliverables

```
autoload/OrderState.gd
autoload/Nav.gd
scenes/scene_paths.gd          # class_name ScenePaths
ui/format.gd                   # class_name Fmt
project.godot                  # autoloads appended AFTER ConfigManager
tests/unit/test_order_state_nav.gd
tests/unit/test_format.gd
```

## Spec

### `project.godot`

```ini
ConfigManager="*res://autoload/ConfigManager.gd"
OrderState="*res://autoload/OrderState.gd"
Nav="*res://autoload/Nav.gd"
DevCapture="*res://autoload/DevCapture.gd"
```

### `autoload/OrderState.gd` (plan §3.4, verbatim fields)

```gdscript
extends Node
## The single in-progress order. Replaces the old `protein.protein_value` static var.

signal order_reset

var selected_flavor: Dictionary = {}   # set by flavor_select on tap
var selected_base_id: String = ""      # set by payment (later story)
var charged_price: int = 0             # set by payment (later story)
var transaction_id: String = ""        # set by payment on success (later story)

func select_flavor(flavor: Dictionary) -> void:
	selected_flavor = flavor.duplicate(true)

func has_selection() -> bool:
	return not selected_flavor.is_empty()

func reset() -> void:
	selected_flavor = {}
	selected_base_id = ""
	charged_price = 0
	transaction_id = ""
	order_reset.emit()
```

### `scenes/scene_paths.gd`

```gdscript
class_name ScenePaths
const IDLE := "res://scenes/idle/Idle.tscn"
const FLAVOR_SELECT := "res://scenes/flavor_select/FlavorSelect.tscn"
const FLAVOR_DETAIL := "res://scenes/flavor_detail/FlavorDetail.tscn"
const MAINTENANCE := "res://scenes/maintenance/Maintenance.tscn"
```

### `autoload/Nav.gd`

```gdscript
extends Node
## All scene changes go through here so tests can observe navigation.

signal navigated(path: String)

var dry_run := false          # tests: record, don't change scene
var last_requested := ""

func go(path: String) -> void:
	last_requested = path
	navigated.emit(path)
	if dry_run:
		return
	get_tree().change_scene_to_file.call_deferred(path)

## Idle is the only scene that decides between attract and maintenance.
func go_idle() -> void:
	OrderState.reset()
	go(ScenePaths.IDLE)
```

The rule for all later stories: **no direct `change_scene_to_file` calls
outside `Nav`.** Anything that returns to idle (inactivity, back, complete)
uses `Nav.go_idle()` so the order is always reset (plan §3.4 "called when flow
returns to idle").

### `ui/format.gd`

```gdscript
class_name Fmt

static func rupees(amount: int) -> String          # 180 → "₹180"; 1250 → "₹1,250" (Indian grouping not needed below 1 lakh)
static func count_word(n: int) -> String           # 0..12 → "Zero".."Twelve"; otherwise str(n)
static func clock_12h(t: Dictionary) -> String     # {"hour": 6, "minute": 42} → "06:42 AM"; hour 0 → "12:.. AM"; 12 → "12:.. PM"; 18 → "06:.. PM"
static func datetime_short(unix: float) -> String  # local time "2026-09-24 06:42 IST" (see below)
static func time_short(unix: float) -> String      # local time "06:11 IST" (same zone rules)
static func ago(seconds: float) -> String          # <60 → "4 s ago"; <3600 → "31 min ago"; else "2 h ago"
static func iso_to_unix(iso: String) -> float      # "2026-09-24T00:41:00Z" → unix; "" or bad → 0.0
```

- `datetime_short` and `time_short` use `Time.get_datetime_dict_from_unix_time(unix + bias*60)`,
  where `bias` comes from `Time.get_time_zone_from_system()`. The zone suffix
  is the system zone `name` if it is 2–5 characters, otherwise `UTC±HH:MM`
  from the bias. (macOS may report long names such as "India Standard Time".)
- `iso_to_unix` uses `Time.get_unix_time_from_datetime_string()` after
  stripping a trailing `Z`. The input is treated as UTC.

## Acceptance criteria

`tests/unit/test_order_state_nav.gd`:
- [ ] `select_flavor` stores a **copy**: mutating the source dict afterwards
      doesn't change `OrderState.selected_flavor`.
- [ ] `reset()` clears all four fields and emits `order_reset`.
- [ ] With `Nav.dry_run = true`, `Nav.go_idle()` sets
      `last_requested == ScenePaths.IDLE`, emits `navigated`, resets
      `OrderState`, and the test runner scene is still the current scene.
      Restore `dry_run = false` in `after_each`.
- [ ] Every `ScenePaths` constant except the ones created by later stories
      (`FLAVOR_SELECT`, `FLAVOR_DETAIL`, `MAINTENANCE`) resolves with
      `ResourceLoader.exists`. Later stories extend this test to cover theirs.

`tests/unit/test_format.gd`:
- [ ] `rupees(75) == "₹75"`, `rupees(1250) == "₹1,250"`.
- [ ] `count_word(4) == "Four"`, `count_word(6) == "Six"`, `count_word(13) == "13"`.
- [ ] `clock_12h` for hours 0, 6, 12, 18 → `12:05 AM`, `06:42 AM`, `12:00 PM`,
      `06:30 PM`.
- [ ] `ago(4) == "4 s ago"`, `ago(1860) == "31 min ago"`, `ago(7300) == "2 h ago"`.
- [ ] `iso_to_unix("1970-01-01T00:01:00Z") == 60.0`; `iso_to_unix("") == 0.0`.

General:
- [ ] `tools/run_tests.sh` and `tools/check_boot.sh` pass.
- [ ] `git grep -n "change_scene_to" -- '*.gd' ':!autoload/Nav.gd'` returns
      nothing.

## Out of scope

Payment fields beyond their declaration; UDP sends.
