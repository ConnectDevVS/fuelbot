# SRV-41: Stock (refill soon, machine page frame, Stock tab)

**As a** technician (tenant_admin) at the machine with a phone, **I want**
to see each hopper's estimated portions and days left and record a refill
in a few taps. **As** anyone in the tenant, **I want** a list of what needs
refilling. **So that** machines don't run empty.

- **Refs:**
  - product owner: a per-machine Stock page with the states; Record refill
    and Adjust for tenant_admin+; a fleet-wide refill-soon list;
  - SP §4.13 (the estimate, API), §4.7 (`stock:write`); stock decisions
    1–7;
  - DP §5.6 (the machine page frame), §5.6.3, §5.10 (+ wireframes).
- **Depends on:** SRV-35 (forms), SRV-38 (`RefillSoonList`).

## Deliverables

1. `src/pages/machine/MachinePage.jsx`:
   - the frame: header (name, `Id`, `StatusBadge`, last seen, location,
     chips);
   - a tab bar built from DP §5.6's table, filtered by `can()` and by
     which tabs exist so far; tabs are routes.
   - `GET /tenants/:tid/machines/:mid`; 404 → Not found.
2. `src/pages/machine/StockTab.jsx`, `HopperCard.jsx`, `StockHistory.jsx`.
3. `src/pages/stock/RecordLevelDialog.jsx`: `mode: refill | adjust`. It's
   used by the tab and by the refill-soon page.
4. `src/pages/stock/RefillSoonPage.jsx` at `/t/:tid/stock`.
5. The threshold editor: an inline number next to "Low below n portions"
   (`stock:write`).

## Spec

- **Stock tab:**
  - `GET …/machines/:mid/stock` (captured fields, DP §5.6.3);
  - `GET …/stock/history?limit=20` + cursor.
- **Hopper card:**
  - `StockChip`, product name;
  - portions left (big), "≈ n days" (`days_left`, or "—");
  - a bar of `left_g / last_refill.level_g`;
  - the last refill line: "Refill 2,000 g · 26 Sep 18:10 · by
    owner@powerfuel.test";
  - threshold, portion size.
  - State texts per DP §5.6.3.
- **Record refill / Adjust:**
  - `POST …/stock/refills` / `…/adjustments {hopper, level_g, note?}`;
  - `level_g` is a whole number 0–50,000; the note ≤ 200;
  - the dialog shows "Product in this hopper: <menu product>" (the server
    records that);
  - on success: invalidate the machine's stock, the history, `['stock', tid]`
    and Home's refill list; toast "Hopper 2 set to 2,000 g".
  - Errors: 400 `invalid_body` (e.g. "not on this machine's menu") →
    fields.
- **Threshold:**
  - `PATCH …/menu/:pid {low_portions}` with `If-Match: <menu_version>`
    through `useVersionedSave`;
  - a whole number 0–1,000; empty = the default (`null`);
  - no `RestartNote` (it's dashboard-only).
- **Refill soon page:**
  - `GET /stock?tenant=<tid>&state=<chips>`;
  - chips default to every non-ok state;
  - rows per DP §5.10, with inline Record refill (`stock:write`);
  - a row opens the machine's Stock tab.
- **Roles:**
  - `stock:write` (tenant_admin, staff): buttons and threshold edit;
  - operator and viewer: read-only, and no buttons are rendered.
- **Phone:** on the Stock tab, a sticky bottom "Record refill" (a hopper
  select inside the dialog).

## Acceptance criteria

- [ ] `src/pages/stock/RecordLevelDialog.test.jsx` › "validates 0–50000
      whole grams; sends numbers; never sends product_id".
- [ ] `e2e/stock.spec.js` › "states render as seeded": on `DEV00001`
      hopper 1 EMPTY, 2 LOW, 3 OK, 4 NOT ESTIMATED, 5 UNKNOWN; on
      `E2E00002` hopper 1 REFILL NEEDED with its explanation.
- [ ] `e2e/stock.spec.js` › "owner records a refill on a phone": phone
      project, hopper 1 to 2,000 g → the card shows OK and ~61 portions;
      the history's top row is that refill by `owner@`; Home's refill list
      no longer lists hopper 1. Reset afterwards.
- [ ] `e2e/stock.spec.js` › "adjust changes the level": an adjustment →
      history kind "Adjust".
- [ ] `e2e/stock.spec.js` › "threshold edit uses If-Match and handles a
      conflict": change the menu in another context first → the Conflict
      dialog; Keep mine → saved.
- [ ] `e2e/stock.spec.js` › "operators and viewers see no stock actions"
      (desk, ops, look: no Record refill/Adjust buttons, threshold
      read-only).
- [ ] `e2e/stock.spec.js` › "refill soon lists every non-ok hopper, most
      urgent first, and filters by chip".
- [ ] `e2e/stock.spec.js` › "machine page frame": tabs present per role so
      far (Stock for all); `desk@` at `/t/powerfuel/machines/E2E00002/stock`
      → Not found.
- [ ] Screenshots: the Stock tab (owner, viewer), the dialog, the refill
      page, 3 sizes × 2 themes. **Looked at on phone:** the sticky button
      doesn't cover the content.

## Out of scope

Automatic sold-out on empty (SP §9.7, open), sensors, notifications, and
editing `portion_g` here (a link to the product instead; SRV-45).
