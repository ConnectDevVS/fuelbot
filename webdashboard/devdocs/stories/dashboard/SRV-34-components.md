# SRV-34: Display components (antd wrappers) and the gallery

**As a** developer building pages, **I want** one set of components for
tables, statuses, money, time, ids, empty/loading/error states and
dialogs, built on Ant Design, **so that** every page looks and behaves the
same and tenant screens can't show a platform status by accident.

- **Refs:** DP §0.1 row 10 (Ant Design), §2.8 (palette, antd theme), §2.9
  (tables → cards on phone), §2.10 (money, time, names), §4 (the antd
  mapping table, and patterns 1–9 and 14–15).
- **Depends on:** SRV-33.

## Deliverables (`src/ui/`; each wraps antd, and pages never import these antd pieces directly)

1. `PageHeader`: `.overline` + `.page-title` + actions (antd `Space`), and
   `RefreshButton` (antd `Button` + `ReloadOutlined`) with "Updated
   hh:mm" (from the newest `dataUpdatedAt` of the queries passed in).
2. `DataTable`:
   - antd `Table` on tablet and desktop (columns `{key, title, render,
     align, priority, sorter}`, `rowKey`, row links via `onRow`);
   - **below 760 px** (`Grid.useBreakpoint()`) a list of antd `Card`s
     showing `priority ≤ 2` columns;
   - `LoadMore` (a `Button`) for cursor pages. antd pagination isn't used,
     because the API pages by cursor.
3. States:
   - `Skeleton` (antd `Skeleton` presets: table, cards, KPI row);
   - `EmptyState` (antd `Empty` + action);
   - `ErrorPanel` (antd `Alert type="error"` + Retry, message from
     `messageFor`);
   - `NotFoundState` / `NotAvailableState` (antd `Result` 404 / 403 with
     our text).
4. Chips (antd `Tag` + icon; never colour alone):
   - `StatusBadge` takes the **machine object**. It renders the platform
     badge only if `status` is present in the object, else Online/Offline +
     In/Out of service. It can't show what the view doesn't contain.
   - `StockChip`, `DispensedChip` (shows `dispensing_result`/`reason` only
     when present in the sale object).
5. `KpiTile` (antd `Card` + `Statistic`, warning variant with the warn
   surface).
6. `lib/money.js` + `Money` (`₹` + `en-IN` grouping, whole rupees; the
   `was` prop renders the struck-through list price).
7. `lib/time.js` + `lib/dayjs.js`:
   - dayjs with the `utc`/`timezone` plugins and the `en-gb` locale;
   - `formatDateTime(iso, tz)`, `formatDate`, `relativeTime(iso, now)`;
   - `DateTime` and `RelativeTime` (antd `Tooltip` with the full IST time).
8. `lib/names.js`:
   - `machineName(m)` = `name || location_label || id`;
   - `useFlavorNames(tid)` (products with `archived=true`, 5 min);
   - `useMachineNames(tid)`.
9. `Id` and `CopyField` (antd `Typography.Text copyable={{text: canonical}}`):
   - the copied text is the canonical value (`SHC816DJ`, not `S H C …`);
   - the "Copied" tooltip is antd's;
   - on clipboard denial, the value is selected.
10. `useConfirm()`: `App.useApp().modal.confirm` with the danger button and
    the DP §4.9 consequence texts. `useToast()`: `App.useApp().message`.
11. `Sheet`: antd `Drawer`, `placement="right"` (width 480) on tablet and
    desktop, `placement="bottom"` (height 92%) on phone.
12. `src/pages/Gallery.jsx` at `/dashboard/_gallery`:
    - only when `import.meta.env.DEV` **or** `?gallery` with a signed-in
      platform user;
    - shows every component in every state, with fixed sample data shaped
      like the captured API responses (DP §9).

## Spec notes

- **No colour literals** in component code or CSS: the palette /
  `tokens.css` only (the SRV-30 test). antd colours come from the theme.
- **`relativeTime`:** < 60 s "just now"; < 60 min "n min ago"; < 24 h
  "n h ago"; else `28 Sep, 12:42`. `null` → "never".
- **Phone cards:** the first column becomes the card title; the rest are
  label/value pairs.
- **Every dialog and toast goes through `App.useApp()`**, which carries the
  theme and the CSP nonce (the SRV-30 lint rule bans the static calls).

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
- [ ] `src/ui/DataTable.test.jsx` › "renders antd Table ≥ 760 px and cards
      below" (via a `matchMedia` stub).
- [ ] `src/ui/CopyField.test.jsx` › "copies the canonical value".
- [ ] `e2e/gallery.spec.js` › "gallery renders every component with no CSP
      violation" (staff, `?gallery`; the harness guard covers the modal,
      drawer, toast and tooltip, all opened in the test). Screenshots at 3
      sizes. **Looked at:** chip contrast, card layout on phone, the lime
      buttons.
- [ ] `e2e/gallery.spec.js` › "confirm dialog traps focus and closes on
      Escape" (antd Modal).

## Out of scope

Charts (SRV-37) and form components (SRV-35).
