# SET-02 — PIN and hidden entry

**As** a FuelBot technician, **I want** to open settings by holding a corner
of the screen and typing a PIN, **so that** I can reach them at any machine
without tools, and customers can't.

Refs: README decisions 5–10, 15.
Depends on: —. (Until SET-04, the right PIN opens a placeholder that
returns to idle.)

## Deliverables

```
ui/components/settings_hold.gd          # class_name SettingsHold: the 5 s corner hold
scenes/idle/idle.gd                     # adds a SettingsHold; swallows the hold's release
scenes/maintenance/maintenance.gd       # adds a SettingsHold (its only input)
scenes/settings_pin/SettingsPin.tscn
scenes/settings_pin/settings_pin.gd
scenes/scene_paths.gd                   # SETTINGS_PIN (and SETTINGS, used by SET-04)
core/settings_pin.gd                    # class_name SettingsPin: check, lockout, file format
config/local_settings.json              # messages settings_pin_*, timing.settings_*, settings.*
tools/set_settings_pin.sh               # writes the PIN's identity file (used by provision.sh)
tools/dev_setup.gd                      # dev PIN 123456, only in the dev user:// folder
.gitignore                              # settings_pin.txt, settings_pin_lock.json beside tenant_id.txt, machine_key.txt …
tests/unit/test_settings_pin.gd
tests/unit/test_settings_hold.gd
docs/stories/ota/OTA-04-updater.md            # the identity the updater reads: the PIN file is part of it, never sent
docs/stories/ota/OTA-07-system-steps-usb.md   # identity.txt: tenant=, machine=, key=, pin=
docs/stories/ota/OTA-08-pi-image.md           # provision.sh: the identity step asks for the PIN
```

## Spec

### The hold (`SettingsHold`)

- A node that watches `_input` for a press (mouse or touch) inside the
  top-left `settings.hold_zone_px` (200) square, in viewport coordinates.
  If the same press is still down, and hasn't moved out of the square,
  after `timing.settings_hold_sec` (5 s), it emits `triggered` **while the
  finger is still down**, and marks that press as consumed.
- Nothing is drawn. No sound, no hint.
- `consumed_release() -> bool`: true for the release that ends a consumed
  press. **Idle checks it first** and ignores that release, so the hold
  never starts an order. A short tap in the corner still starts an order.
- Idle and maintenance: on `triggered`, `Nav.go(ScenePaths.SETTINGS_PIN)`.
  Idle stops its video first, as `_start()` does.

### The PIN, part of the identity (`SettingsPin`)

The PIN is the fourth identity field (README decision 5). The identity is
one small file per field in `user://`, and the PIN follows the same pattern:

| Field | File | Stored as |
|-------|------|-----------|
| tenant | `tenant_id.txt` | plain |
| machine | `machine_id.txt` | plain |
| key | `machine_key.txt` | plain (never logged) |
| **pin** | **`settings_pin.txt`** | **`<salt>:<hash>`**: 32 hex characters of salt, a colon, the SHA-256 hex of salt + PIN. Never the PIN itself |

- **Provisioning:** `provision.sh` (OTA-08) asks for the PIN in its identity
  step, right after the key, and writes it with
  `tools/set_settings_pin.sh [--user-dir <dir>] [--stdin]`. The script asks
  twice (input not echoed), or reads one line with `--stdin`. It refuses
  anything but exactly 6 digits, makes a random salt
  (`openssl rand -hex 16`), writes the file with mode 600 and prints nothing
  about the PIN.
- **USB stick:** `identity.txt` (OTA-07) carries `tenant=`, `machine=`,
  `key=` and `pin=`. The updater turns `pin=` into `settings_pin.txt` through
  the same script (`--stdin`). Like every identity field, it's written only
  when missing and never overwrites an existing one. A machine provisioned
  before this set gets its PIN that way, without touching the rest of its
  identity.
- **Never leaves the machine:** the PIN file isn't sent to the server, the
  telemetry or the updater's reports.
- The lock state is `user://settings_pin_lock.json`
  (`{"failed": n, "locked_until": <unix>}`), so restarting the app doesn't
  reset it. A right PIN clears it. It's state, not identity: a spare card
  starts unlocked.
- The lock state is `user://settings_pin_lock.json`
  (`{"failed": n, "locked_until": <unix>}`), so restarting the app doesn't
  reset it. A right PIN clears it.
- `check(pin) -> String`: `ok`, `wrong`, `locked`, `not_set`. On the
  `pin_max_attempts`-th (5th) wrong try: locked for
  `timing.settings_pin_lockout_sec` (300 s), `failed` back to 0. Compare
  hashes in constant time (whole-string compare over equal-length hex is
  fine in GDScript; never return early on the first different character).
- The PIN, its digits and the hash are never logged.

### The PIN pad screen

```
┌──────────────────────────────┐
│ ‹ Back                        │
│                               │
│         ENTER PIN             │
│        ● ● ● ○ ○ ○            │   6 dots, filled as typed
│        Wrong PIN              │   (message line; empty when none)
│                               │
│     ┌─────┐ ┌─────┐ ┌─────┐   │
│     │  1  │ │  2  │ │  3  │   │   keys 240 × 180 px, DisplayL digits
│     └─────┘ └─────┘ └─────┘   │
│        4       5       6      │
│        7       8       9      │
│               0       ⌫       │
└──────────────────────────────┘
```

- The 6th digit submits at once (no OK key).
- `ok` → `TelemetryReporter.report_event({"event_type": "settings_opened"})`,
  then `Nav.go(ScenePaths.SETTINGS)`.
- `wrong` → `settings_pin_wrong` for `timing.settings_error_return_sec`
  (3 s), dots cleared; telemetry `settings_pin_failed` (`attempt`: n).
- `locked` → `settings_pin_locked` with the minutes left (rounded up), the
  keys disabled until the lock ends; telemetry `settings_locked` once when
  the lock starts.
- `not_set` → `settings_pin_not_set`, keys disabled. Checked on entry, so
  the technician sees it before typing.
- Back, or `timing.settings_pin_inactivity_sec` (30 s) without a touch →
  `Nav.go_idle()`.
- Unbranded, maintenance style: `BG`, `Mono`/`Display` variations, keys as
  bordered panels. A press darkens the key so the technician sees it
  registered.

## Acceptance criteria

- [ ] Hold 5 s in the corner on idle → PIN pad; the release doesn't start
      an order (`Nav.last_requested` is the PIN pad, not the listing).
- [ ] A short tap in the corner on idle → the listing, as before.
- [ ] Hold 4.9 s, or a press that moves out of the square, or a press
      outside it → nothing.
- [ ] Hold 5 s on maintenance → PIN pad; nothing else on maintenance reacts
      to input.
- [ ] Right PIN → settings; `settings_opened` queued.
- [ ] Wrong PIN → message for 3 s, dots cleared, `settings_pin_failed`.
- [ ] 5 wrong → locked for 300 s (a test-length override), still locked
      after a fresh `SettingsPin` instance (the restart case), unlocked
      after; `settings_locked` posted once.
- [ ] No `settings_pin.txt`, or a malformed one → `not_set` on entry, keys
      disabled (a malformed file logs one warning, never its content).
- [ ] Back and the 30 s timeout → idle.
- [ ] `set_settings_pin.sh` rejects 5 or 7 digits and letters, refuses to
      overwrite an existing file, and writes a file `SettingsPin` accepts
      (both the prompt and `--stdin`).
- [ ] `git check-ignore` matches `settings_pin.txt` and
      `settings_pin_lock.json` (identity files are never committed).
- [ ] Leak: with PIN `918273`, no log line, telemetry record or screenshot
      text contains it.
