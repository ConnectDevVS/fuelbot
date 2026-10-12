# OTA-06 — Dashboard: software and releases

**As** FuelBot staff, **I want** to see each machine's software and run a
rollout from the dashboard, **so that** I can update the fleet, force one
machine, and spot a machine that's behind or rolled back.

Refs: README decisions 3, 8, 9; dashboard plan §5.19; webdashboard/CLAUDE.md
(the gate, three widths, platform-only data, strings, permissions).
Depends on: OTA-05.
DoD: the dashboard gate (lint, unit, build, e2e at 390 / 820 / 1440), every
screenshot looked at.

## Deliverables

```
webdashboard/src/shell/pages.js, routes.jsx        # Releases page (platform nav)
webdashboard/src/pages/machine/machineTabs.js      # a staff-only "Software" tab
webdashboard/src/pages/machine/SoftwareTab.jsx
webdashboard/src/pages/releases/ReleasesPage.jsx, ReleasePage.jsx, UploadReleaseDialog.jsx
webdashboard/src/pages/fleet/…                     # version column, "Behind" filter chip
webdashboard/src/strings.js
webdashboard/e2e/releases.spec.js, software-tab.spec.js; e2e/seed.mjs (releases, versions, history)
webdashboard/e2e/leak-scan.spec.js                 # the new platform-only keys
```

## Spec

### A machine's Software tab (staff only, like Maintenance / Telemetry / Faults)

- **Versions:** app, bridge, firmware, OS; when last reported.
- **Target:** the version it should run and why ("rollout 1.4.1, stage 10 %",
  "pinned", "withdrawn: back to 1.4.0"), and the install window.
- **State:** queued, downloading, waiting for idle, installing, healthy,
  rolled back (with the reason), failed.
- **Actions** (`releases:manage`):
  - **Update now** — confirm: "Bay 02 installs 1.4.1 at its next idle
    moment, outside the night window. It's out of service for about a
    minute while it restarts." Hint under it: switch maintenance on first to
    make it start as soon as possible.
  - **Pin to version** / **Unpin**; **Window** override.
- **History:** one row per update event; a row expands to the log tail
  (mono, scrollable in its box).

### Releases page (platform nav)

- List: version, status, stage, counts (healthy / behind / rolled back),
  published by and when.
- **Upload release** (a `.tar`; the server verifies it; errors in plain
  words: "The signature doesn't match FuelBot's release key").
- A release's page: notes, manifest summary (engine included or not, bridge
  and firmware versions), the stages, machines per state (each links to its
  Software tab), and the actions with consequence texts:
  - Publish (choose the test machines), Promote ("to 10 % of machines:
    about 4 machines will install at their next night window"), Pause,
    Resume, Withdraw ("machines on 1.4.1 go back to 1.4.0 at their next idle
    moment"), Install now (red, with the machine count), Retry.
- A paused-by-rollback release says so at the top, with the machine and
  reason.

### Fleet (staff)

A version column (priority 4: desktop only) and a "Behind" filter chip
(machines whose version isn't their target).

### Rules carried over

Platform-only: tenant roles never get the tab, the page, the requests or
the keys (the leak scan proves it). Confirm dialogs name the consequence
(DP §4 pattern 9). No auto-refresh (Refresh button). Strings in
`strings.js`.

## Acceptance criteria

- [ ] Staff see the Software tab and the Releases page; tenant roles don't
      (no nav item, Not available by URL, no request), at all three widths.
- [ ] Update now, pin and window send the right requests with `If-Match`
      where needed; the confirm texts as above.
- [ ] Upload: a good bundle appears as a draft; a bad one shows the
      server's reason.
- [ ] Publish → promote → pause → withdraw on the seeded releases, with the
      counts updating after Refresh.
- [ ] A rolled-back history row expands to its log tail.
- [ ] Leak scan passes with the new keys; screenshots at three widths
      looked at.
