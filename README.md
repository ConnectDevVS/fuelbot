# FuelBot kiosk (v2)

Godot 4.7 app for the FuelBot protein-shake vending kiosk. It runs on a
1080×1920 portrait touchscreen. The catalog, prices and branding come from a
per-tenant config API. The machine caches it, and a bundled default config
keeps it usable offline.

The first milestone is the idle experience: the attract loop, the item listing
and the maintenance screen. The design is in
[devdocs/plans/greenfield-rewrite.md](devdocs/plans/greenfield-rewrite.md), and
the stories that built it are in [devdocs/stories/idle/](devdocs/stories/idle/).

## Requirements

- Godot **4.7.x** on `PATH`, or `GODOT=/path/to/godot`
- Python 3, standard library only, for the mock backend

## Quick start

```bash
tools/dev_run.sh                         # mock backend + dev tenant + app window
tools/dev_run.sh --scenario=maintenance_on
tools/dev_run.sh --no-mock               # offline, bundled default config
tools/dev_run.sh --editor                # open the editor instead, then press F5
```

Editor flow without the script:

```bash
python3 mockserver/server.py                                        # terminal 1
godot --headless --path . --script res://tools/dev_setup.gd         # once
godot -e --path .                                                   # then F5
```

## Everyday commands

| Command | What it does |
|---------|--------------|
| `tools/run_tests.sh [--filter=x]` | Headless GDScript tests (starts its own mock server on :8788) |
| `python3 -m unittest mockserver/test_server.py` | Mock server self-test |
| `tools/check_boot.sh` | Boots the app headless for 5 s and fails on script errors |
| `tools/screenshot.sh <res://Scene.tscn\|main> [out.png] [delay]` | Real-time screenshot into `.screenshots/` |
| `mockserver/scenario.sh <name\|reset>` | Switch the mock backend's response while the app runs |
| `godot --headless --path . --script res://tools/build_theme.gd` | Regenerate the theme after editing `ui/theme/palette.gd` |

## Local machine state (`user://`)

On macOS this is `~/Library/Application Support/Godot/app_userdata/FuelBot/`.
On Linux it is `~/.local/share/godot/app_userdata/FuelBot/`.

| File | Written by | Purpose |
|------|------------|---------|
| `tenant_id.txt` | provisioning (`tools/dev_setup.gd` in dev) | sent as `X-Tenant-Id`; no fetch happens without it |
| `local_settings.override.json` | provisioning | overrides the API URL and poll interval from `config/local_settings.json` |
| `config_cache.json` | the app | last valid remote config, used when offline |

`tools/dev_setup.gd -- --clear` removes all three, which resets the app to a
fresh machine with no network. None of these files are ever committed.

## Kiosk

Run the exported binary with `--fullscreen`. The project runs windowed at
540×960 for development.
