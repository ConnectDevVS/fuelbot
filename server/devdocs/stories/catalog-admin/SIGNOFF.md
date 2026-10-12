# Admin catalog API — sign-off (Milestone S3)

**Date:** 2026-09-27. **Branch:** `server-backend`. **Result: PASS.**

## Automated (`cd server && npm test`: 126 / 126)

| Area | Covered |
|---|---|
| Machine ids | 8 characters `A–Z0–9`, varied; a clash retries; ids can't be chosen through the API |
| Input checks | every unknown field / wrong type at once (400 `invalid_body`); whole rupees; nested objects and lists; `If-Match` 428 / 409 with the current version |
| Tenants | scoped lists with machine counts; platform creates (slug ids, unique); tenant_admin edits name/branding (merged, bumps `catalog_version`); only platform disables; audited |
| Products | list with the machines using each (only visible machines); create tenant_admin+; `If-Match: <rev>`; operators edit text, never prices; limited operators edit nothing; a change breaking machines is 422 naming each; archive refused while on a menu |
| Machines | register (generated id, default base, not configured → kiosk 409); scoped list/read; **tenant views never contain status, faults, maintenance or IP**; status (fault / offline); settings with `If-Match`; config preview with the app's verdict; bases rules; maintenance platform-only, `flagged_by/at` set and cleared, reaches the kiosk without milliseconds |
| Menus | PUT (order, hoppers, overrides reach the kiosk), PATCH one item, copy-from (overrides included); operator price changes refused (incl. via copy); unknown/archived/repeated products; the app's hopper rule (422); a filled menu can't be emptied, even on the model |
| Unregistered | ids seen on ingest per claimed tenant, with counts and where the id is actually registered; platform only |
| RBAC table | 20 routes × 4 roles |

## End-to-end: a machine configured only through the API, then the real app

Setup: `npm run db`, `npm run seed`, `create-admin`, `npm start`; mock on
:8787 for Razorpay. A script drove the admin API as the platform admin and
as a new operator; the app was provisioned with the generated id
(`dev_setup.gd --machine=<id> --api=… --razorpay-api=…`) and booted by a
temporary walker (not committed).

| # | Step | Result |
|---|---|---|
| 1 | Register a machine | **PASS**: 201, generated id `Q6ZUWV91`; the kiosk got 409 before it had a menu |
| 2 | Copy DEV00001's menu, override guava to ₹99 (platform) | **PASS** |
| 3 | New operator (limited to that machine): temporary password gate, then own password | **PASS**: 403 `password_change_required` until changed |
| 4 | Operator: chocolate sold out, vanilla back in stock; a price change | **PASS**: 200, 200; price 403 `forbidden_field`; DEV00001 → 404; operator view had no platform-only fields |
| 5 | The real app boots with `Q6ZUWV91` | **PASS**: `source=remote`, header "FUELBOT · BAY 07", guava ₹99, chocolate SOLD OUT, vanilla available (screenshot checked) |
| 6 | Maintenance through the API (platform) | **PASS**: on at 10 s → maintenance screen at ~10 s; off at 22 s → idle by ~30 s |

Note from the run: the app enforces maintenance only on idle (by design: an
order in progress is never interrupted), so the watcher has to be on idle.
The first attempt watched from the listing and correctly saw no change.
