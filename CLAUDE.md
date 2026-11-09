# CLAUDE.md

FuelBot is a protein-shake vending machine. This repo holds every part of it,
one folder per part, each with its own rules. Read the part's CLAUDE.md before
changing it; this file covers only what spans parts.

| Folder | What | Rules |
|--------|------|-------|
| `kiosk/` | The Godot 4.7 kiosk app (the Godot project; 1080×1920 portrait, Raspberry Pi target), its mock backend and dev tools | [kiosk/CLAUDE.md](kiosk/CLAUDE.md) |
| `hardware/` | Arduino Mega firmware, the Pi-side bridge (app UDP ↔ board serial), fakes and checks | [hardware/CLAUDE.md](hardware/CLAUDE.md) |
| `server/` | The backend (Node/Express/MongoDB): config, sales, telemetry, machine keys, admin API, OTA | [server/CLAUDE.md](server/CLAUDE.md) |
| `webdashboard/` | The web dashboard for staff and tenants (React + Vite + Ant Design) | [webdashboard/CLAUDE.md](webdashboard/CLAUDE.md) |
| `docs/` | Kiosk and hardware plans, story sets, designs, deployment guide, release notes | — |

- Architecture: [docs/plans/greenfield-rewrite.md](docs/plans/greenfield-rewrite.md)
  (the kiosk plan; §0 is the status and decision log, §4 the folder layout).
- The kiosk ↔ backend API contract is owned by
  [server/devdocs/plans/server-plan.md](server/devdocs/plans/server-plan.md) §3.
  The server and dashboard keep their plans and stories in their own `devdocs/`.
- Work is planned as story sets (`docs/stories/<set>/`,
  `server/devdocs/stories/`, `webdashboard/devdocs/stories/`). Each set has a
  README with decisions and deviations from its plan, plus a `SIGNOFF.md`.
  Completed sets are records: their commands use the paths of their time
  (before 2026-10-15 the Godot project was at the repo root).
- Designs: `docs/designs/GMRFuelBot-OnDevice-SsampleScreens.pdf` (6 raster
  pages; render with PyMuPDF in a scratch venv; poppler isn't installed).

## Rules for every part

- **Definition of done is per part** (in each CLAUDE.md). A change that
  crosses parts runs each part's checks. Changes to the mock fixtures
  (`kiosk/mockserver/responses/config/`) also run the server's tests and the
  dashboard's e2e seed, which read them.
- **One commit per story** (`IDLE-NN:`, `OTA-NN:`, `SRV-NN: title` …).
  **Chain the commit with `&&`, never `;`**: `tools/run_tests.sh …; git
  commit` committed a failing test once (`1baba35`).
- **Never commit a key or provisioning file** (credentials, machine keys,
  tenant/machine ids, overrides). They live in the Godot `user://` folder or
  the server's environment and are gitignored. The old build's
  `fuelbotsource_og/second.gd` contains a live Razorpay key: port logic from
  it, never text, and mask `rzp_(live|test)_…` when grepping it.
- Never `git add -A`; temporary capture or walker folders stay untracked and
  are deleted before finishing.

## Working on this machine

- **The shell is zsh.** Bash-only expansions fail (`${var^^}` →
  "bad substitution"), and an unquoted `$var` isn't word-split (use
  `${=var}`). Scripts with a bash shebang are fine; this bites inline
  one-liners.
- There's no `timeout` binary on macOS.
- Dev and capture windows pop up in front of the user (see kiosk/CLAUDE.md).

## Open items carried forward

- **Refund policy** for paid-but-failed dispenses: undecided (support
  message only).
- **Hardware Levels 2/3** (Milestones 4 and 5) pending a board; details in
  hardware/CLAUDE.md.
- **Settings & Wi-Fi** (kiosk, [docs/stories/settings/](docs/stories/settings/README.md),
  2026-11-09): built and signed off on the Mac against a fake nmcli; the
  **real-Pi checks are open** (how the password reaches NetworkManager, the
  polkit rule, reconnect after a reboot): setup and checks in
  [deploy/README.md](deploy/README.md), by hand on any Pi or with
  Milestone 8. Technicians follow `docs/technician-guide.md`.
- Next: Milestone 8 (Raspberry Pi: export, systemd, kiosk boot, udev rule),
  built together with Milestone 9, over-the-air updates (planned 2026-10-09:
  [docs/stories/ota/](docs/stories/ota/README.md); our own updater,
  signed releases, idle-only installs, no remote access, no read-only disk).
- **Real backend:** built in `server/` (config, sales, telemetry, machine keys,
  admin API) and run end to end with the app
  (`kiosk/tools/dev_run.sh --backend=server`). **Not deployed yet** (hosting
  undecided); the app's tests still use the mock. The web dashboard
  (`webdashboard/`, S7) is done too (its SIGNOFF, 2026-09-30); its
  real-app run changed prices, maintenance and a new machine's menu on
  the app from the dashboard.
- **Flavor images:** the real S3 bucket and the server's upload endpoint
  (server S5, deferred) are pending. The content team follows
  `docs/image-spec.md`.
- The plan doc quotes the old Razorpay key ID. Rotate the key as the plan
  says.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
