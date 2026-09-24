# Idle screens — story set

Stories that take this repo from empty to a **launchable Godot 4.7 project**
covering the idle part of the kiosk: the attract loop, the item listing, and
the maintenance screen that idle redirects to. Source material:

- Plan: [devdocs/plans/greenfield-rewrite.md](../../plans/greenfield-rewrite.md)
  (§3.1 schema, §3.3 ConfigManager, §3.4 OrderState, §3.6 idle scene,
  §3.11 maintenance, §3.13 idle video, §5 Milestones 0/1/3, §7 verification)
- Designs: [designs/GMRFuelBot-OnDevice-SsampleScreens.pdf](../../../designs/GMRFuelBot-OnDevice-SsampleScreens.pdf)
  - page 1 — **00 Attract / Tap to Start** → `scenes/idle/`
  - page 2 — **01 Item Listing / Idle** → `scenes/flavor_select/`
  - page 6 — **05 Maintenance (unbranded)** → `scenes/maintenance/`
  - pages 3–5 (Ingredients, Payment, Dispensing) are **out of scope** here

## Execution order

Each story is independently verifiable and leaves the project bootable.
Run them in order; a story's dependencies are always earlier stories.

| # | Story | Depends on | Produces |
|---|-------|-----------|----------|
| 01 | [Project skeleton & test harness](IDLE-01-project-skeleton.md) | — | `project.godot`, folders, `tests/`, `tools/*.sh` |
| 02 | [Mock server](IDLE-02-mock-server.md) | — | `mockserver/` (stdlib Python + JSON scenarios) |
| 03 | [Bundled config fixtures & assets](IDLE-03-config-fixtures-and-assets.md) | 01 | `config/*.json`, flavor images, idle video |
| 04 | [ConfigManager autoload](IDLE-04-config-manager.md) | 02, 03 | `autoload/ConfigManager.gd`, dev provisioning |
| 05 | [OrderState, Nav & formatting helpers](IDLE-05-order-state-nav-format.md) | 04 | `autoload/OrderState.gd`, `autoload/Nav.gd`, `ui/format.gd` |
| 06 | [Theme & shared UI components](IDLE-06-theme-and-components.md) | 03, 05 | fonts, generated theme, header/card/footer/dot components |
| 07 | [Maintenance screen](IDLE-07-maintenance-screen.md) | 06 | `scenes/maintenance/` |
| 08 | [Item listing screen](IDLE-08-item-listing-screen.md) | 06 | `scenes/flavor_select/`, `scenes/flavor_detail/` stub |
| 09 | [Attract (idle) screen](IDLE-09-attract-screen.md) | 07, 08 | `scenes/idle/`, becomes main scene |
| 10 | [Launch script & end-to-end verification](IDLE-10-launch-and-e2e.md) | 01–09 | `tools/dev_run.sh`, root `README.md`, sign-off |

02 has no Godot dependency and can run in parallel with 01/03.

When 10 is done: `tools/dev_run.sh` starts the mock server, provisions a dev
tenant, and opens the app. Pressing F5 in the Godot editor works the same way
(start the mock server first).

## Conventions (apply to every story)

**Paths.** The Godot project root is the **repo root** (`project.godot` sits
next to `devdocs/`). Every `res://` path in these stories is relative to it.

**Godot binary.** `godot` on `PATH` (verified: `4.7.2.stable.official`). Scripts
read `${GODOT:-godot}` so another binary can be substituted.

**GDScript style.** Tabs, static typing (`var x: int`, `-> void`), `snake_case`
files, `PascalCase.tscn` scenes, one script per scene next to it.
**Autoload scripts never declare `class_name`**: Godot rejects a class name
that shadows an autoload singleton. Non-autoload helpers may use `class_name`.

**Logging.** Use `print("[Tag] ...")` for info. Use `push_warning("[Tag] ...")`
for *expected* degraded states (offline, no tenant, stale cache). Reserve
`push_error` for programmer errors. `tools/check_boot.sh` fails on script and
parse errors, so don't use `push_error` for normal offline operation.

**Testing.** Tests run through the scene-based harness from story 01, not
`--script` mode. (Spike finding: in `--script` mode, autoloads exist but their
`_ready()` runs *after* the script's `_initialize()`, which makes tests racy.)
Any test that navigates sets `Nav.dry_run = true` (story 05) so it can't
replace the runner scene.

**Headless vs windowed.** `--headless` uses a dummy renderer, which is fine for
logic tests and boot checks. Screenshots need a real window: they use the
dev-only `DevCapture` autoload (story 01), which waits a real-time delay and
then saves the viewport at 540×960. Movie Maker mode was rejected because it
runs faster than real time, so screens that depend on HTTP were captured
before data arrived. Spike-verified on this machine.

**Mock server ports.** Dev: `8787`. Automated tests: `8788`. Tests never
touch the dev instance.

### Definition of Done (every story)

1. All files listed under *Deliverables* exist.
2. `tools/run_tests.sh` exits 0 and prints `ALL TESTS PASSED`. This includes
   the new tests the story adds.
3. `tools/check_boot.sh` exits 0: headless boot with no script or parse
   errors.
4. UI stories only: a screenshot from `tools/screenshot.sh` has been compared
   side by side with the named PDF page, and every listed visual check holds.
5. One commit per story, message `IDLE-NN: <title>`.

## Decisions & deviations from the plan

These were decided while writing the stories. Each is small and additive.
Reverse any of them by editing the story that introduces it.

1. **Project location: repo root**, not `fuelbotsource-v2/`. This repo
   (`Sourcegit/fuelbot`) is already the fresh, git-initialised project the plan
   asks for, with a Godot `.gitignore` committed.
2. **Idle scope = Attract + Item Listing + Maintenance.** The design labels the
   listing "Item Listing / **Idle**", so both screens count as idle. Maintenance
   is included because idle is the plan's only maintenance enforcement point
   (§3.11), so the redirect needs a real target. Tapping a drink opens a
   `flavor_detail` **stub** until the Ingredients story exists.
3. **Schema extensions (all optional, additive to §3.1):**
   - top-level `tenant` block (display name, logo text, location label, site,
     support phone): the design's header branding is per-tenant data.
   - per-flavor `sold_out`, `badge`, `description`, `volume_ml`, `nutrition`:
     needed by the listing cards (and later by the Ingredients screen).
   - `maintenance.flagged_by`, `maintenance.flagged_at`, `maintenance.faults`:
     shown in the maintenance diagnostics panel.
4. **Sold-out vs disabled.** `enabled: false` still **hides** a flavor (plan
   §3.3). The new `sold_out: true` **shows it greyed and not tappable**, as in
   the design. `ConfigManager.is_orderable()` covers both.
5. **Six hoppers, six drinks** (confirmed 2026-09-24). This supersedes the
   plan's "fixed to 4 motors": `hopper` is valid from 1 to 6
   (`ConfigManager.MAX_HOPPER := 6`), and validation still rejects two
   enabled flavors on one hopper. The mock tenant serves six drinks, matching
   the design's 2×3 grid. The bundled fallback `default_config.json` keeps the
   old build's four products on hoppers 1–4, so no invented prices ship.
   **Outside idle scope, still to do:** the plan text (§2.1.3, §3.3) and the
   firmware (`VM_code.ino` wires `M1–M4`) both still assume four motors. A
   hardware story must add motors 5–6. The serial command's first digit
   already carries 1–9.
6. **API base URL lives in `local_settings.json` (`api` block)**, with an
   optional untracked `user://local_settings.override.json` deep-merged on top.
   It replaces the plan's `const CONFIG_URL`, so dev machines can point at the
   mock server and a Pi can point at a LAN mock without editing tracked files.
   The URL is build-level and identical across tenants, which is what local
   settings are for. The bundled default is still the plan's
   `https://example.invalid/...` placeholder.
7. **Window mode.** `project.godot` runs windowed with a 540×960 dev override
   of the 1080×1920 viewport. The kiosk passes `--fullscreen` on the command
   line (Milestone 8). Otherwise every F5 would take over the dev screen.
8. **`Nav` autoload.** This is a one-function wrapper around
   `change_scene_to_file`, added so scene tests can assert navigation without
   swapping out the test runner.
9. **Fonts.** The design's grotesque and mono are approximated with
   **Archivo** (variable, OFL) and **JetBrains Mono** (variable, OFL). Only
   Archivo contains `₹`, so it is also the mono font's fallback. Circular
   status dots are drawn, not typed as glyphs.
10. **UDP `P<hopper>` on selection is deferred** to the flavor-detail/payment
    stories. The idle screens touch no hardware.
11. **A lightweight headless test harness is added** (the plan says there is no
    test suite). It uses no addons and is about 80 lines, so the stories can be
    verified by machine.
12. **Sample nutrition data lives only in the mock server.** The bundled
    `default_config.json` ships with no nutrition or description fields, so
    made-up numbers can never reach a real machine. Cards hide the meta line
    when the fields are absent.

## Design tokens (measured from the PDF)

The PDF screens are 1080×1920 designs rendered at about 2.4× reduction.
Values below are scaled back to 1080-wide pixels. Colours are sampled from a
200-dpi render.

| Token | Value | Where |
|-------|-------|-------|
| `bg` | `#111215` | screen background |
| `surface` | `#17191E` | cards, panels |
| `surface_raised` | `#1A1C21` | hero panel, pressed card |
| `border` | `#262930` | card/panel 2 px borders, dividers |
| `accent` (lime) | `#C8FF3E` | logo tile, CTA, prices, ready dot, popular border |
| `on_accent` | `#111215` | text on lime |
| `text` | `#F4F5F2` | headings |
| `text_muted` | `#9AA0A8` | body copy, subtitles |
| `text_dim` | `#6B717A` | "TAP →", mono footers |
| `warning` (amber) | `#F5B014` | maintenance stripe, status dot, fault title |
| `warning_surface` | `#211A04` | active-faults panel |
| `warning_border` | `#5A4309` | active-faults panel border |
| `success` | `#4ADE80` | maintenance "ONLINE" |
| Screen side padding | 72 px | all screens |
| Card radius / panel radius | 28 px / 16 px | |
| Display XL | Archivo wght 900, 128 px, line pitch ≈ 118 px | "FRESH BLENDED PROTEIN", "OUT OF SERVICE" |
| Display L | Archivo wght 900, 100 px, line pitch ≈ 96 px | "FUEL UP", stub title |
| Screen top padding | 60 px | header row starts here |
| Product card | 424 px tall, padding 32, image area 160 px, grid gap 28 px | six cards (2×3) fit with header, title and footer |
| Heading | Archivo wght 800, 42 px | card names, tenant name |
| Body | Archivo wght 400, 34 px, muted | sublines |
| Mono | JetBrains Mono wght 500, 24 px, glyph spacing +2, dim | labels, footers |
| Price | Archivo wght 900, 60 px, accent | card prices |
