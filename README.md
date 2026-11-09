# FuelBot

Software for the FuelBot protein-shake vending machine: the touchscreen kiosk
app, the machine's firmware and hardware bridge, the backend and the web
dashboard.

| Folder | What | Start here |
|--------|------|------------|
| [kiosk/](kiosk/README.md) | The Godot 4.7 kiosk app (1080×1920 portrait touchscreen, Raspberry Pi), its mock backend and dev tools | `kiosk/tools/dev_run.sh` |
| [hardware/](hardware/README.md) | Arduino Mega firmware, the bridge between the app and the board, and fakes for testing without one | `python3 hardware/tools/fake_dispense_bridge.py --mode done` |
| [server/](server/README.md) | Backend (Node/Express/MongoDB): config, sales, telemetry, machine keys, admin API | `cd server && npm start` |
| [webdashboard/](webdashboard/README.md) | Web dashboard for staff and tenants (React + Vite + Ant Design), served by the backend at `/dashboard/` | `cd webdashboard && npm run dev` |
| `docs/` | Kiosk plan ([greenfield-rewrite.md](docs/plans/greenfield-rewrite.md)), story sets, on-device designs, [deployment guide](docs/deployment_guide.md), [release notes](docs/release_notes.md), [flavor image spec](docs/image-spec.md) | — |

The server and dashboard keep their own plans and stories in their
`devdocs/` folders. Contributor rules for each part are in its `CLAUDE.md`.

## Quick start (no hardware)

```bash
kiosk/tools/dev_run.sh                                         # terminal 1: mock backend + dev tenant + app window
python3 hardware/tools/fake_dispense_bridge.py --mode done     # terminal 2: a fake bridge that dispenses every order
```

Requirements: Godot **4.7.x** on `PATH` (or `GODOT=/path/to/godot`) and
Python 3 (standard library only). The server and dashboard need Node; see
their READMEs.
