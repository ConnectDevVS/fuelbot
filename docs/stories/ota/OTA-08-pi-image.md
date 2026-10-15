# OTA-08 — On the Pi image

**As** FuelBot, **I want** every Pi to leave the workshop with the updater
running and the app installed as a release, **so that** the first deployed
machine can already be updated without a visit.

Refs: kiosk plan Milestone 8 (export, systemd, kiosk boot, udev, textures);
README decisions 6, 7, 12.
Depends on: OTA-04, OTA-07, and Milestone 8's image work (built together).

## Deliverables

```
deploy/systemd/fuelbot-bridge.service, fuelbot-app.service      # run from /opt/fuelbot/current
deploy/systemd/fuelbot-updater.service, fuelbot-updater.timer   # (from OTA-04)
deploy/provision.sh            # one Pi: install units, key, first release, identity
deploy/README.md               # building a machine, step by step
devdocs/plans/greenfield-rewrite.md   # Milestone 8 updated to match
```

## Spec

### Units

- `fuelbot-bridge.service`: `ExecStart=/usr/bin/python3
  /opt/fuelbot/current/udprxtx.py`, `Restart=always`; starts before the app.
- `fuelbot-app.service`: the engine from `/opt/fuelbot/current/` under the
  kiosk compositor (Milestone 8), as the kiosk user, `Restart=always`,
  `After=fuelbot-bridge.service`.
- `fuelbot-updater.timer` every 5 minutes (jitter 60 s) and at boot;
  the service runs as root (it restarts units and writes `/opt/fuelbot`);
  it knows the app's `user://` folder through `FUELBOT_USER_DIR` and writes
  `update_request.json` there readable by the kiosk user.

### The system (README decision 7: not read-only)

- **Fewer writes:** the journal capped (`SystemMaxUse=50M`), no swap file
  (zram if memory needs it), automatic OS updates and update timers off
  (OS updates come as system steps, OTA-07).
- **Clock:** `fake-hwclock` on; the app starts without waiting for time
  sync (it must run offline), and the first config fetch may fail until the
  clock is right (it retries).
- **No remote access:** SSH off; Raspberry Pi Connect off (decision 6).
- **Per-machine uniqueness:** the image is generalised before copying (SSH
  host keys and `/etc/machine-id` regenerated on first boot).
- **Secrets:** none in the image except the release *public* key; the
  identity (tenant, machine, key) is written per machine by `provision.sh`
  or the USB stick.

### `provision.sh`

1. Installs the units, the updater, `release_pub.pem`, the udev rules
   (`/dev/arduino`, the USB stick).
2. Installs the first release from a bundle file (the same code path as
   the updater: verify, unpack, `current`).
3. Writes the machine's identity (prompting; the key is never echoed).
4. Starts everything and waits for the health check; prints the versions.

## Acceptance criteria

- [ ] A Pi built with `deploy/README.md` boots into the kiosk from
      `/opt/fuelbot/current` with the bridge and updater running.
- [ ] A reboot, a killed app and a killed bridge each recover by themselves.
- [ ] The updater, run by hand, reaches the server and reports the versions.
- [ ] Two Pis from the same image have different SSH host keys and machine
      ids; no private key or identity is in the image.
- [ ] The Milestone 8 checks (textures, video frame rate, `/dev/arduino`)
      pass on the same image.
