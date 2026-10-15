# OTA-03 — Release bundle and signing

**As** the person who builds releases, **I want** one command that turns a
tagged commit into a signed bundle, **so that** every machine installs
exactly what was tested and nothing else.

Refs: README decisions 10, 11, 13, 16; kiosk plan Milestone 8 (arm64 export,
ETC2/ASTC textures).
Depends on: OTA-01 (versions).

## Deliverables

```
export_presets.cfg              # "Linux arm64" preset: Embed PCK off; .gdignore'd folders excluded
tools/make_release.sh           # export, pack, manifest, sign
tools/verify_release.sh         # the same checks the updater makes, for the release Mac
tools/test_release.py           # tests for the two scripts (temporary folders, a throwaway key)
tools/run_tests.sh              # leak grep extended to the signing key's marker
devdocs/stories/ota/RELEASING.md   # how to build, sign and publish (first draft; OTA-09 finishes it)
```

## Spec

### The bundle: `fuelbot-<version>.tar`

| File | When | Notes |
|---|---|---|
| `manifest.json` | always | see below |
| `manifest.json.sig` | always | Ed25519 signature of `manifest.json`'s exact bytes |
| `fuelbot.pck` | always | `godot --headless --export-pack "Linux arm64"` |
| `fuelbot.arm64` | only when the Godot version changes (`--with-engine`) | the release export template, renamed |
| `udprxtx.py` | always (20 KB) | the bridge |
| `steps/<name>.sh` | only with system steps (OTA-07) | |

Uncompressed `.tar`: the `.pck`'s video and images are already compressed.

### `manifest.json`

```json
{"v": 1, "version": "1.4.0", "created_at": "2026-10-09T10:00:00Z", "commit": "abc1234",
 "godot_version": "4.7.2", "bridge_version": "1.0.0", "firmware_version": 1,
 "min_from_version": null,
 "files": {"fuelbot.pck": {"sha256": "…", "size": 9812345},
           "udprxtx.py": {"sha256": "…", "size": 20480}},
 "engine": null,
 "steps": [],
 "notes": "Fix the payment retry after a network drop."}
```

- `engine` is `{"file": "fuelbot.arm64", "sha256": …, "size": …}` when the
  bundle carries the engine, else null: the machine keeps its engine,
  **which must be `godot_version`** (the updater refuses a mismatch).
- `firmware_version` is informational in this set (README decision 4).
- `min_from_version`: a machine below it must first install that version
  (rare; null almost always).
- Only `manifest.json` is signed; every file is checked against its
  `sha256` in it.

### `tools/make_release.sh <version> [--with-engine] [--notes "…"]`

1. Refuses unless the working tree is clean, `HEAD` is tagged `v<version>`,
   and `application/config/version` equals `<version>`.
2. Runs the release gate: `tools/run_tests.sh && tools/check_boot.sh` and
   the Python tests.
3. Exports the `.pck` (and the engine with `--with-engine`), copies the
   bridge, writes the manifest, signs it with
   `openssl pkeyutl -sign -rawin -inkey <key>` (OpenSSL 3 from Homebrew; the
   key path comes from `FUELBOT_RELEASE_KEY`, read from a file outside the
   repo, never echoed), then runs `tools/verify_release.sh` on the result.
4. Prints the bundle path, its size and its sha256. Never prints or logs
   the key.

### Keys

- The **private key** lives offline (a password manager or a hardware key),
  with a backup; it's on the release Mac only while signing.
- The **public key** (`release_pub.pem`) is committed
  (`deploy/updater/release_pub.pem`, OTA-04) and baked into the Pi image.
- `run_tests.sh`'s leak grep fails on `BEGIN PRIVATE KEY` anywhere in the
  repo.

## Acceptance criteria

- [ ] A bundle built from a throwaway key verifies with `verify_release.sh`
      and with the updater's check (OTA-04).
- [ ] A changed byte in any file, a changed manifest, a wrong key, or a
      missing file → verification fails, naming what failed.
- [ ] Without `--with-engine` there's no engine file and `engine` is null;
      with it, the engine is in and hashed.
- [ ] Refusals: dirty tree, missing tag, version mismatch, failing gate.
- [ ] The exported `.pck` runs with the matching engine on the Pi (checked
      in OTA-09; this story checks the export locally).
- [ ] The key never appears in output (test greps the script's output for
      the key's text).
