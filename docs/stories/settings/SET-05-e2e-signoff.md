# SET-05 — End-to-end and sign-off

**As** the product owner, **I want** the whole flow run against the real
app, and once on a real Pi, **so that** I know a technician can connect a
machine at a gym.

Refs: README goals 1–4.
Depends on: SET-01 to SET-04.

## Deliverables

```
docs/stories/settings/SIGNOFF.md
docs/plans/greenfield-rewrite.md       # §0 decision log, §3.11, §4 layout
docs/release_notes.md                  # "Settings and Wi-Fi"
kiosk/CLAUDE.md                        # Wifi autoload, settings rules, the fake nmcli
server/devdocs/plans/server-plan.md    # §3 event table: the five settings/Wi-Fi events
docs/deployment_guide.md               # "Connecting a machine at a gym" (technician steps)
```

## Runs

### On the Mac (real app, the fake `nmcli`, a walker)

Use a temporary walker scene (kiosk/CLAUDE.md "Real-flow walkthroughs"),
never committed. Capture each step.

| # | Flow | Expect |
|---|------|--------|
| 1 | Hold the corner 5 s on idle | PIN pad; no order started |
| 2 | Wrong PIN ×5 | message each time; locked; still locked after an app restart |
| 3 | Right PIN | the grid with the Network tile |
| 4 | Network | the list, connected network on top, server line right |
| 5 | Secured network, right password | Connecting → success 2 s → list, new network on top |
| 6 | Secured network, wrong password | error 3 s → list; the old network still connected |
| 7 | Open network | connects without the password page |
| 8 | Enterprise network | unsupported, 3 s |
| 9 | Leave it alone 60 s | back to idle |
| 10 | Maintenance on, hold the corner | PIN pad → settings → Exit → maintenance again |
| 11 | Leak check | sentinel password and PIN: 0 matches in logs, telemetry queue, fake call log; no `passwd-file` left |

### On a real Pi (Bookworm, the polkit rule, the kiosk user)

| # | Check | Expect |
|---|-------|--------|
| 1 | The SET-01 spike's choice | the password is saved; not in `ps -ef` or `journalctl` |
| 2 | Connect to a phone hotspot from the screen | success; `nmcli` shows it active; the dashboard shows the machine online |
| 3 | Reboot | reconnects by itself |
| 4 | Wrong password | the previous network comes back; no new profile saved |
| 5 | The kiosk user without the polkit rule | `unavailable` / an error, never a crash (proves the rule is what grants it) |
| 6 | Touch feel | keys and rows easy to hit at arm's length; a rescan doesn't freeze the screen |

If no Pi is available when 01–04 are done, sign off the Mac runs and leave
the Pi table open in SIGNOFF.md, as a carried-forward item in the root
CLAUDE.md (like hardware Levels 2/3).

## Acceptance criteria

- [ ] All Mac flows pass and are recorded with evidence in SIGNOFF.md.
- [ ] The Pi table is either passed or explicitly open.
- [ ] The product owner has looked at the screenshots (decision 16).
- [ ] The plan, CLAUDE.md, the server plan's event table, the deployment
      guide and the release notes are updated.
- [ ] Temporary walker and capture folders deleted; nothing untracked left.
