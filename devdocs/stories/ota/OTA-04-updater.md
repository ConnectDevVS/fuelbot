# OTA-04 — The updater

**As** a deployed machine, **I want** to install the release FuelBot chose
for me safely and by myself, **so that** no one has to visit, no customer
is interrupted, and a bad release undoes itself.

Refs: README decisions 2, 3, 5, 6, 13, 15, 16; server plan §3.8–3.10.
Depends on: OTA-02 (runtime state, update request), OTA-03 (bundle).

## Deliverables

```
deploy/.gdignore
deploy/updater/fuelbot_updater.py     # standard library only, Python 3.9+ (like the bridge)
deploy/updater/release_pub.pem        # the public signing key (OTA-03)
deploy/updater/test_updater.py        # fake server, temporary /opt/fuelbot, fake systemctl, fake clock
deploy/systemd/fuelbot-updater.service, fuelbot-updater.timer   # installed by OTA-08
```

## Spec

### Layout it manages

```
/opt/fuelbot/releases/1.4.0/  fuelbot.arm64  fuelbot.pck  udprxtx.py  manifest.json
/opt/fuelbot/releases/1.4.1/  …
/opt/fuelbot/current -> releases/1.4.1          # atomic: symlink current.new, then rename
/opt/fuelbot/state/updater.json                 # what it's doing, survives reboots
/opt/fuelbot/state/downloads/                   # partial downloads (resumed)
```

It reads the machine's identity from the app's `user://` files
(`tenant_id.txt`, `machine_id.txt`, `machine_key.txt`) and never logs the
key.

### One run (the timer fires every 5 minutes, with up to 60 s of jitter)

1. **Ask:** `GET /fuelbot/update` (server plan §3.8) with the machine
   headers, the current version, and the OS version. The answer is `stay`
   or `install <version>` with `force`, the window and the manifest URL.
2. **Fetch:** download `manifest.json` and its signature; verify the
   signature with `openssl pkeyutl -verify -pubin -rawin` against
   `release_pub.pem`. Refuse, and report `failed: bad_signature`, if it
   doesn't verify. Check `godot_version` against the installed engine when
   the bundle has none, and `min_from_version`.
3. **Space:** at least 3 × the download size free on `/opt`, else report
   `failed: no_space` (after first deleting releases older than the two
   kept, below).
4. **Download** each file with HTTP range resume; check sizes and sha256s;
   unpack into `releases/<version>.tmp/`, copy the engine from `current`
   when the bundle has none, then rename to `releases/<version>/`. Report
   `downloaded`.
5. **Wait for the moment:** install when the app is idle
   (`runtime_state.json`, OTA-02; fresh within 2 minutes) **and** either
   `force` is set, or it's inside the window, or the release has been
   waiting 7 days. Otherwise stop; the next run tries again.
6. **Step aside:** write `user://update_request.json`; wait up to 5 minutes
   for `"updating": true`; if the app doesn't acknowledge (an order started),
   remove the request and try at the next run.
7. **Switch:** remember the previous version in `updater.json`, swap
   `current`, `systemctl restart fuelbot-bridge` then
   `systemctl restart fuelbot-app`. Report `installed`.
8. **Health check** (README decision 15), within 5 minutes:
   - `runtime_state.json` shows the new version, idle, written after the
     switch;
   - `bridge_seen_at` after the switch (when `bridge.require_heartbeat` is
     on);
   - `config_ok_at` after the switch, **unless** the updater itself can't
     reach the server (then the local checks decide);
   - the app unit restarted fewer than 3 times since the switch (the
     boot-loop guard: `systemctl show -p NRestarts`).

   All good → remove the update request, report `healthy`, keep the two
   newest earlier releases and delete older ones (never the previous one).
   Otherwise → swap `current` back, restart both, report `rolled_back` with
   the reason and the last 200 lines of the app's and the bridge's logs
   (`journalctl -u … -n 200`, with any line that looks like a key masked),
   and don't try this version again until the server sends it with a new
   `attempt` number.
9. **Power cut anywhere above:** `updater.json` says where it was. On the
   next run it finishes the switch and runs the health check, or rolls
   back. `current` is always a valid symlink (rename is atomic).

### What it never does

- Restart the app or bridge while the app isn't idle.
- Delete the running release or the previous one.
- Install anything whose manifest signature or hashes don't check out.
- Print or log the machine key or a signed URL.

## Acceptance criteria

`deploy/updater/test_updater.py` (fake server on an ephemeral port,
temporary folders, a fake `systemctl` that records calls, a fake clock):
- [ ] `stay` → nothing happens; `install` outside the window → downloads
      but doesn't switch; inside the window and idle → switches.
- [ ] `force` → switches outside the window, still only when idle.
- [ ] Waited 7 days → switches at the first idle moment.
- [ ] Not idle (dispensing, an order id, a stale state file) → no request,
      no switch; the app not acknowledging in 5 minutes → request removed.
- [ ] Bad signature, wrong hash, wrong engine version, `min_from_version`
      not met, no space → refused with the right report, nothing switched.
- [ ] Resumed download after a cut connection.
- [ ] Health check passes → `healthy`, cleanup keeps current + 2.
- [ ] No idle state, no bridge, no config (server reachable), or 3 restarts
      → rolled back, the reason and a masked log tail reported, the version
      not retried without a new attempt.
- [ ] Server unreachable during the check → the local checks decide.
- [ ] Simulated power cut after the download, after the switch, mid-health
      check → the next run ends in a healthy or rolled-back state with a
      valid `current`.
- [ ] Nothing it prints contains the machine key.
