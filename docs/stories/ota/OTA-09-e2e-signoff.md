# OTA-09 — End-to-end and sign-off

**As** the product owner, **I want** proof on a real Pi that releases install,
roll back and recover as designed, **so that** OTA can be trusted with the
fleet.

Depends on: OTA-01 to OTA-08. Needs a Pi built per OTA-08 (on the bench, with
the fake Arduino or a real board) and the server reachable from it (a dev
server on the same network is enough until hosting is decided).

## Runs (each recorded PASS / FAIL with what was seen in SIGNOFF.md)

1. **Ordinary update:** release 1.0.1 (`.pck` only) → published to the
   bench Pi as the test machine → installs in the window (window set to the
   next few minutes) → healthy; the dashboard shows it.
2. **Never mid-order:** start an order, force the update → it waits; it
   installs right after the order ends.
3. **Update now:** a forced update outside the window installs within about
   5 minutes plus the download.
4. **Engine change:** a release with `--with-engine` installs; the next
   `.pck`-only release keeps that engine.
5. **Bad release:** a release whose app crashes at start → 3 restarts →
   rolled back automatically; the release pauses; the dashboard shows the
   reason and the log tail.
6. **Withdraw:** withdrawing a healthy release sends the machine back to the
   previous one.
7. **Tampering:** a bundle with a changed byte, and one signed with another
   key → refused by the server upload and by the updater.
8. **Power cuts:** pull the power during the download, right after the
   switch, and during the health check → the machine ends up healthy on one
   version or the other, `current` valid.
9. **Offline:** the server unreachable for a day → the machine keeps
   working; it catches up when the server is back.
10. **System step:** an OS-update step with an exact package list; a step
    needing a reboot.
11. **USB stick:** a rescue release, `wifi.txt` and `identity.txt` on a
    spare card.
12. **Timing:** measure bundle sizes (`.pck`, engine) and the out-of-service
    time during a restart; update README's estimates.

## Also

- `SIGNOFF.md` filled in; `RELEASING.md` finished as the runbook (build,
  sign, upload, publish, promote, pause, withdraw, retry; what to do when a
  machine is behind; replacing a lost or leaked signing key).
- Kiosk plan §0/§5 (Milestone 9 status), server plan §0, dashboard plan
  status, root CLAUDE.md (the "writes only under `user://`" rule; how to cut
  a release), README.
