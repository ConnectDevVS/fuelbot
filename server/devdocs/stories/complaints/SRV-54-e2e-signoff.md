# SRV-54: End-to-end and sign-off

**As the** product owner, **I want** complaints proved for every role at
every width, with nothing platform-only leaking, **so that** it can ship
with the dashboard.

- **Refs:** README goals; DP §5.20; SP §4.15.
- **Depends on:** SRV-50 to SRV-53.

## Deliverables

1. `webdashboard/e2e/leak-scan.spec.js`: the complaint list and page in
   each tenant role's walk; no staff email, `user_id` or IP in any
   complaint response or page; globex sees no powerfuel complaint
   number, title or name.
2. `webdashboard/e2e/walkthrough.spec.js`: the complaint pages in every
   role's walk.
3. A live run on the dev stack (`npm run seed`, server, dashboard):
   look raises a complaint on a phone width; staff answer, set With
   service, then Closed; look reopens it; owner sees the whole thread.
4. `SIGNOFF.md` in this folder (automated results, screenshots looked at,
   the live run table, anything left out).
5. Docs: SP §0 status + §6 S10 row "done"; DP §5.20 "built";
   `server/README.md`, `webdashboard/README.md`; root `CLAUDE.md` "Open
   items" only if something is carried forward.

## Acceptance criteria

- [ ] `cd server && npm test` PASS; `cd webdashboard && npm run lint &&
      npm test && npm run build && npm run e2e` PASS at 390 / 820 / 1440,
      twice in a row.
- [ ] Leak scan PASS for owner, ops, desk, look, boss, including the
      complaint pages.
- [ ] Live run: every step PASS, recorded in SIGNOFF.md.
- [ ] Kiosk untouched: `git diff main -- kiosk/ hardware/` is empty.
