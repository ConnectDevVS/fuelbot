# OTA-02 — Runtime state and safe restart

**As** the updater, **I want** to know whether the app is idle and healthy,
and to ask it to step aside, **so that** an update never interrupts a
customer and a broken update is noticed.

Refs: README decisions 3, 14, 15; root CLAUDE.md (idle is the only
enforcement point; atomic writes; sandboxed tests).
Depends on: OTA-01 (the version in the state file).

## Deliverables

```
autoload/RuntimeState.gd            # new autoload (between the others and DevCapture)
autoload/ConfigManager.gd           # the UPDATING local fault; config_ok time
config/local_settings.json          # messages: fault_updating ("Updating, back in a minute"); timing
project.godot                       # autoload order
tools/run_tests.sh                  # "the app writes only under user://" check
tests/unit/test_runtime_state.gd
tests/test_runner.gd                # isolation: state files under the test folder
```

## Spec

### `user://runtime_state.json` (written by the app, read by the updater)

Written atomically (temporary file, then rename) on every scene change
(`Nav.navigated`), on config success, on each bridge heartbeat (at most
every 10 s), and every 60 s otherwise:

```json
{"v": 1, "version": "1.4.0", "pid": 1234, "written_at": "2026-10-09T02:10:00Z",
 "scene": "Idle", "order_id": null, "idle_since": "2026-10-09T01:52:13Z",
 "config_ok_at": "2026-10-09T02:09:41Z", "bridge_seen_at": "2026-10-09T02:09:58Z",
 "updating": false}
```

- `scene` is the current scene's file base name. **Idle** means `scene` is
  `Idle` or `Maintenance` and `order_id` is null. `idle_since` resets on any
  other scene.
- `written_at` lets the updater tell a live app from a stale file (older
  than 2 minutes = the app isn't running properly).
- Times are UTC with `Z` (root CLAUDE.md: Godot omits it).

### `user://update_request.json` (written by the updater, read by the app)

`{"v": 1, "version": "1.4.1", "requested_at": "…"}`. The app checks for it
every 2 s, **only while idle**. When it finds one:

1. it sets the local fault **`UPDATING`**
   (`ConfigManager.set_local_hardware_fault(true, "UPDATING")`), so idle
   shows the maintenance screen with "Updating, back in a minute" and no new
   order can start;
2. it writes `runtime_state.json` with `"updating": true`. That's the
   updater's go-ahead to switch and restart.

If the request file disappears (the updater gave up or finished without a
restart), the app clears `UPDATING`. The app never quits by itself for an
update: the updater restarts it through systemd, so a crashed updater can't
leave the machine without its app.

### Sandbox and tests

Both paths go through `ConfigManager.user_path()` so tests and
`check_boot.sh` use `user://sandbox/` (root CLAUDE.md: a new autoload that
keeps a `user://` file maps its default through `user_path()`).
`tests/test_runner.gd` points them at `user://test_runner/`.

### The "writes only under `user://`" check

`tools/run_tests.sh` fails when app code (`autoload/`, `core/`, `scenes/`,
`ui/`) opens a file for writing with a path that isn't built from
`user://` or `ConfigManager.user_path()`. The app must never write next to
its binary: the release folders are replaced on update.

## Acceptance criteria

- [ ] The state file is written atomically on scene changes and on the
      timers above, with the fields above (unit test with a fresh instance
      and its own path).
- [ ] Idle and maintenance count as idle; listing, details, payment and
      dispensing don't; an order id makes it not idle.
- [ ] An update request on idle → `UPDATING` fault, maintenance screen with
      the message, `"updating": true`; a request during an order is acted on
      only after the order ends (scene test with `Nav.dry_run`).
- [ ] Removing the request clears `UPDATING`.
- [ ] Sandboxed runs never touch the real `user://` files (fingerprint check
      as in root CLAUDE.md).
- [ ] `run_tests.sh` fails on a test file that writes outside `user://`
      (prove the check with a deliberate bad sample, then remove it).
- [ ] Screenshot of the "Updating" maintenance screen, looked at.
