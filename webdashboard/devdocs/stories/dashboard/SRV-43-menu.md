# SRV-43: Menu tab and config preview

**As an** operator or admin, **I want** to arrange a machine's menu (which
products, which hopper, badge, sold out, enabled, order), with price
overrides for admins only, and see exactly what the machine will get,
**so that** the kiosk shows the right drinks at the right prices and never
receives a menu it would reject.

- **Refs:**
  - product owner: prices only by tenant_admin/platform_admin (operators
    read-only); "reaches the machine at its next restart";
  - SP §3.2 (config build and rules), §4.4 (menus, `If-Match`, copy);
  - catalog-admin decisions 2–5;
  - DP §5.6.1, §5.6.2 (+ wireframe), §4.10–4.12;
  - mock-up `design/menu-desktop.png`;
  - captured 422 `invalid_config`.
- **Depends on:** SRV-42.

## Deliverables

1. `src/pages/machine/MenuTab.jsx`, `MenuItemRow.jsx`, `ProductPicker.jsx`,
   `CopyMenuDialog.jsx`.
2. `src/pages/machine/menuModel.js`: pure functions for reorder, add,
   remove, `toPayload` (it keeps `low_portions`), and client warnings.
3. `src/pages/machine/ConfigTab.jsx`, `KioskPreview.jsx`.

## Spec

- **Load:** the machine (`menu`, `menu_version`) and
  `GET /tenants/:tid/products` (non-archived, for the picker and default
  prices).
- **Row:** DP §5.6.1.
  - Price column: "Product price" (the product's `offer_price`/
    `actual_price`), or an override via `PriceField` ×2.
  - The override toggle is shown only with `price:write`. An operator sees
    the effective price with a lock.
- **Reorder:** drag handles with `@dnd-kit/core` + `@dnd-kit/sortable`
  (added to `package.json` in this story; antd has no drag-and-drop, and
  its docs use dnd-kit), plus ↑/↓ buttons (keyboard/touch). The order is
  the list order in the payload. Rows are antd `Form.List` items, so field
  errors map by index (`menu[2].hopper`).
- **Add:**
  - a picker of non-archived products not on the menu;
  - the new item defaults to hopper = the lowest free hopper, enabled,
    not sold out, no badge, no override;
  - at most 12 items.
- **Client warnings** (they don't block Save):
  - a duplicate hopper among enabled items;
  - an empty menu (the server refuses "at least one product" with 400);
  - hoppers 5–6: "need wiring on real machines".
- **Save:**
  - `PUT …/menu {menu}` with `If-Match: menu_version` via
    `useVersionedSave`;
  - `RestartNote` + `UnsavedBar`;
  - 422 → `InvalidConfigPanel`, with errors mapped to rows by the
    `"<product_id>:"` prefix;
  - 403 `forbidden_field` (price) → the price cells marked;
  - success: invalidate the machine, config, stock, `fleet` and
    `products`; toast "Menu saved. Reaches <machine> at its next restart".
- **Copy from:** `POST …/menu/copy-from/:src` (If-Match); a confirm names
  both machines and warns that price overrides are copied too. 400
  `source_not_configured` → a message.
- **Config preview:** `GET …/machines/:mid/config` → `{configured, config, errors}`.
  - An errors panel if non-empty.
  - `KioskPreview`: dark kiosk-style cards (name, `Money` offer/actual,
    hopper, badge, sold out greyed), with disabled items hidden.
  - A Raw JSON toggle with Copy.
  - Tenant users get no maintenance block. Staff do (a small "Maintenance:
    off/on" line).
- **Roles:**
  - viewer: everything read-only (no handles, toggles or Save);
  - limited operator: on their machines only (others 404 at the machine
    page).

## Acceptance criteria

- [ ] `src/pages/machine/menuModel.test.js` › "toPayload keeps low_portions
      and order"; "lowest free hopper"; "warns on duplicate enabled
      hopper but not on a disabled duplicate".
- [ ] `e2e/menu.spec.js` › "operator reorders and marks sold out; price is
      locked": desk on `DEV00001` → Save → the config preview shows the new
      order and sold out; the price inputs are absent; the request has
      unchanged price objects.
- [ ] `e2e/menu.spec.js` › "owner sets a price override; kiosk config has
      it": the override ₹85/₹70 → `GET …/config` flavor
      `actual_price: 85, offer_price: 70`.
- [ ] `e2e/menu.spec.js` › "duplicate hopper: warning, then the server's
      422 in the panel, nothing saved" (the captured message "chocolate:
      hopper 1 already used by guava" appears on the chocolate row).
- [ ] `e2e/menu.spec.js` › "conflict: two tabs edit the menu; the second
      Save opens the Conflict dialog; Keep mine saves".
- [ ] `e2e/menu.spec.js` › "copy menu from Bay 02 to Bay 4 makes it
      configured".
- [ ] `e2e/menu.spec.js` › "viewer sees a read-only menu"; "tenant config
      preview has no maintenance block" (the response and the page text).
- [ ] `e2e/menu.spec.js` › "unsaved changes block leaving the tab".
- [ ] Screenshots: the menu (owner, operator, viewer), 422 state, conflict
      dialog, config preview, 3 sizes. Looked at: phone row
      layout.

## Out of scope

Per-item `PATCH` quick toggles (a whole-menu Save keeps one model),
scheduling menu changes, and pushing to machines (SP §8).
