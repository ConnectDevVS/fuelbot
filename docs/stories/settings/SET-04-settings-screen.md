# SET-04 — Settings screen: grid, Wi-Fi list, password

**As** a technician at a gym, **I want** to pick the gym's Wi-Fi from a
list and type its password, **so that** the machine is online in under a
minute, with no instructions needed.

Refs: README decisions 2–4, 10, 13, 14, 16; the flow and messages in the
README.
Depends on: SET-01, SET-02, SET-03.

## Deliverables

```
scenes/settings/Settings.tscn
scenes/settings/settings.gd              # the three pages, the notice, the inactivity return
ui/components/net_icon.gd                # class_name NetIcon: Wi-Fi fan, signal bars, lock, tick, cross, spinner
scenes/maintenance/maintenance.gd        # network name and signal in diag_network
config/local_settings.json               # messages wifi_*, settings_tile_network, maintenance_network_cable/none;
                                         # timing.settings_success_return_sec
tests/test_runner.gd                     # the Wifi autoload never runs the system's nmcli in tests
tests/unit/test_settings_screen.gd
tests/unit/test_maintenance_screen.gd    # the network cell
```

## Spec

One scene, `Settings.tscn` (one script, replacing SET-02's placeholder),
with three pages swapped in place (no `Nav` between them, so going back is
instant and the inactivity timer is one timer). Unbranded, in the
maintenance screen's style: `BG`, `DisplayM` titles, `Mono` labels,
`GhostButton` rows and tiles, `BackPill` header buttons. Every touch target
is at least 96 px tall (rows 140). Icons are drawn by `NetIcon` (no bundled
font has them; README).

### Page 1: the grid

```
┌──────────────────────────────┐
│ SETTINGS              Exit ✕  │
│                               │
│  ┌──────────┐                 │
│  │   ((•))  │                 │   one square tile, 420 × 420 px,
│  │          │                 │   Wi-Fi icon drawn in code + label
│  │ Network  │                 │   below it: the current network name
│  │ GymStaff │                 │   (or "Connected by cable" / nothing)
│  └──────────┘                 │
│                               │
└──────────────────────────────┘
```

- A `GridContainer` with 2 columns, so the next tile has a place to go;
  v1 has one tile.
- Exit → `Nav.go_idle()`.

### Page 2: the Wi-Fi list

```
┌──────────────────────────────┐
│ ‹ Back   WI-FI      Refresh ⟳ │
│ ──────────────────────────── │
│ ✓ GymStaff          ▂▄▆█  🔒  │   connected network, always on top,
│   Connected                   │   accent colour
│   FuelBot server reachable    │
│ ──────────────────────────── │
│   GymGuest          ▂▄▆_      │
│   Office-5G         ▂▄__  🔒  │   rows 140 px, name in Body,
│   Cafe              ▂___  🔒  │   signal bars (4 steps), lock if secured
│ ──────────────────────────── │
└──────────────────────────────┘
```

- On opening: show the status at once from `Wifi.get_status()`, then
  `Wifi.refresh_status()` and `Wifi.scan()`. While scanning,
  `wifi_searching` under the rows (the list stays usable if it's already
  filled). Refresh scans again.
- Scrolls if the list is long (a `ScrollContainer`, touch drag).
- The connected row isn't tappable (a panel, not a button: accent border
  and name, a tick). Its second line is `wifi_connected · wifi_server_ok`
  when `ConfigManager.is_online`, else `… · wifi_server_down` (so
  "connected to Wi-Fi but the gym blocks us" is visible). It follows
  `connectivity_changed`. On a cable: the top row says `wifi_ethernet`, and the Wi-Fi
  networks are listed below as usual.
- No networks → `wifi_none_found`. `Wifi.is_available() == false` →
  `wifi_error_unavailable` and no list. **A failed scan is never "none
  found"**: `Wifi.last_error == "not_authorized"` → `wifi_error_permission`,
  any other failure → `wifi_error_scan` (the connected row still shows;
  Refresh tries again). A connect refused for permission shows
  `wifi_error_permission` too.
- Tap a secured (`psk`) network → page 3. Tap an `open` network → connect
  straight away (the "Connecting…" notice, then success or error as below).
  Tap an `enterprise` network → `wifi_error_unsupported` for 3 s.
- Back → page 1.

### Page 3: the password page

```
┌──────────────────────────────┐
│ ‹ Back                        │
│                               │
│ Password for GymStaff         │
│ ┌──────────────────────┐      │
│ │ ••••••••••       Show │      │   field 140 px tall; Show / Hide
│ └──────────────────────┘      │
│                               │
│ ┌───────────────────────────┐ │
│ │      on-screen keyboard   │ │   SET-03, submit key "Connect",
│ │                           │ │   disabled below 8 characters
│ └───────────────────────────┘ │
└──────────────────────────────┘
```

- Opens with an empty field, the keyboard ready (no extra tap).
- **Show** reveals the password as typed; **Hide** masks it again. It
  starts hidden. Screenshots in tests and SET-05 are taken hidden.
- Connect → `Wifi.connect_to(ssid, text)`; the keyboard's text is cleared
  as soon as it's handed over.
- Back → page 2, text cleared.

### The notice (success, error, connecting)

A full-screen overlay on top of the current page:

- **Connecting:** `wifi_connecting` with a spinning indicator; all input
  blocked; no inactivity return while it shows.
- **Success:** `wifi_success` in `SUCCESS`, with a large ✓, for
  `timing.settings_success_return_sec` (2 s); then page 2, re-scanned,
  with the new network on top.
- **Error:** the reason's `wifi_error_*` message in `WARNING`, with a large
  ✕, for `timing.settings_error_return_sec` (**3 s**); it hides itself and
  shows page 2, scanned again. A tap doesn't need to dismiss it. Reasons
  without their own message (`busy`, `failed`) show `wifi_error_generic`.

### Inactivity

`timing.settings_inactivity_sec` (60 s) without a touch on any page →
`Nav.go_idle()`. Any touch restarts it; the "Connecting…" notice pauses it.

### Maintenance screen: the network cell

`diag_network` keeps its online/offline word and colour, followed by the
network: `ONLINE · GymStaff 72%`, `ONLINE · CABLE`
(`maintenance_network_cable`), or `OFFLINE · NO NETWORK`
(`maintenance_network_none`). The screen calls `Wifi.refresh_status()` on open and every 10 s,
and re-renders on `Wifi.status_changed`. With `Wifi` unavailable (a Mac
without the fake), the cell is as before.

## Acceptance criteria

`tests/unit/test_settings_screen.gd` drives the real scene with `Wifi`
pointed at the fake `nmcli` (its own state file), `Nav.dry_run = true`, and
`snapshot_app_state()` / `restore_app_state()`. Small getters for tests
(`get_page()`, `get_rows()`, `get_notice()`), not node-tree walking.

- [ ] Grid: one tile, labelled `Network` with the current network's name;
      tap → the Wi-Fi list; Exit → idle.
- [ ] List: the connected network is first, marked, not tappable; the rest
      by signal; server line follows `ConfigManager.is_online`.
- [ ] Secured network → password page with its name in the title; open
      network → connects without it; enterprise → unsupported error 3 s.
- [ ] Connect is disabled under 8 characters; Show/Hide toggles masking.
- [ ] Right password → "Connecting…", then success for 2 s, then the list
      with the new network on top.
- [ ] Wrong password → error for 3 s, hides itself, the list; the
      previous network is still connected (fake state).
- [ ] Timeout and not-found give their own messages.
- [ ] 60 s idle on any page → idle; no return while connecting.
- [ ] Maintenance cell shows the network name and signal; unchanged when
      `Wifi` is unavailable.
- [ ] Layout: the list's rows and the tile fit at 1080 × 1920; the password
      page fits the keyboard and the field without overlap.
- [ ] Screenshots of all three pages and both notices, looked at and
      compared with the maintenance screen's style.
