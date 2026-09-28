# SRV-34: Display components and the gallery

**As a** developer building pages, **I want** one set of components for
tables, statuses, money, time, ids, empty/loading/error states and dialogs,
**so that** every page looks and behaves the same and tenant screens can't
show a platform status by accident.

- **Refs:** DP §2.8 (tokens), §2.9 (tables → cards), §2.10 (money, time,
  names), §4.1–4.9, §4.14–4.15.
- **Depends on:** SRV-33.

## Deliverables (`src/ui/`, each with a CSS module)

1. `PageHeader`: overline, H1, actions, and a `RefreshButton` with
   "Updated hh:mm" (from the newest `dataUpdatedAt` of the queries passed
   in).
2. `DataTable`:
   - columns `{key, header, render, align, priority}`;
   - on phone it renders cards showing `priority ≤ 2` columns;
   - `onRowClick` / row links;
   - `LoadMore` for cursor pages.
3. `Skeleton` (block, line, table, card), `EmptyState`, `ErrorPanel`
   (message from `messageFor`, a Retry button), `NotFoundState`.
4. Status chips:
   - `StatusBadge` takes the **machine object**. It renders the platform
     badge only if `status` is present in the object, else Online/Offline +
     In/Out of service. It can't show what the view doesn't contain.
   - `StockChip`, `DispensedChip` (shows `dispensing_result`/`reason` only
     when present in the sale object), `Chip`.
5. `lib/money.js` + `Money` (`₹` + `en-IN` grouping, whole rupees; the
   `was` prop renders the struck-through list price).
6. `lib/time.js`:
   - `formatDateTime(iso, tz)`, `formatDate`, `relativeTime(iso, now)`;
   - `DateTime` and `RelativeTime` components (a `title` attribute with the
     full IST time).
7. `lib/names.js`:
   - `machineName(m)` = `name || location_label || id`;
   - `useFlavorNames(tid)` (products with `archived=true`, 5 min);
   - `useMachineNames(tid)`.
8. `Id` (mono + copy), `CopyField`.
9. `ConfirmDialog`: a focus-trapped modal (`<dialog>` element, `showModal()`)
   with a danger variant and a consequence text.
10. `Drawer`: a side panel ≥ 760 px, a full-screen sheet below. `Toast`
    (a polite live region).
11. `src/pages/Gallery.jsx` at `/dashboard/_gallery`:
    - only when `import.meta.env.DEV` **or** `?gallery` with a signed-in
      platform user;
    - shows every component in every state, with fixed sample data
      shaped like the captured API responses (DP §9).

## Spec notes

- **No colour literals** in component CSS (tokens only; the SRV-30 test).
- **Status components:** icon + text, never colour alone.
- **`relativeTime`:** < 60 s "just now"; < 60 min "n min ago"; < 24 h
  "n h ago"; else `28 Sep, 12:42`. `null` → "never".
- **Phone cards:** the first column becomes the card title; the rest are
  label/value pairs.

## Acceptance criteria

- [ ] `src/lib/money.test.js` › "₹1,23,456 grouping; no decimals; null →
      —".
- [ ] `src/lib/time.test.js` › "formats in Asia/Kolkata" (07:12:02Z → 12:42);
      "relativeTime thresholds"; "null → never".
- [ ] `src/lib/names.test.js` › "machineName falls back to location label,
      then id".
- [ ] `src/ui/StatusBadge.test.jsx` › "tenant machine view never renders a
      platform status": given the captured tenant view (no `status`), it
      renders "Online"/"Out of service" and no fault text. Given the
      platform view, it renders "FAULT" + the code.
- [ ] `src/ui/DispensedChip.test.jsx` › "shows reasons only when present".
- [ ] `src/ui/DataTable.test.jsx` › "renders cards below 760 px" (via a
      `matchMedia` stub).
- [ ] `src/ui/CopyField.test.jsx` › "copies the canonical value; falls back
      to selecting on denial".
- [ ] `e2e/gallery.spec.js` › "gallery renders every component" (staff,
      `?gallery`); screenshots 3 sizes. **Looked at**: contrast
      of chips in light mode, card layout on phone.
- [ ] `e2e/gallery.spec.js` › "confirm dialog traps focus and closes on
      Escape".

## Out of scope

Charts (SRV-37) and form components (SRV-35).
