# SRV-35: Forms and write patterns (antd Form)

**As** someone editing a product, menu or setting, **I want** clear field
errors, a safe way through conflicts with a colleague's edit, price fields
I can see but not change if I'm not an admin, and a reminder of when the
machine will pick up my change, **so that** I never save something wrong
or lose work.

- **Refs:**
  - SP §4.4 (`If-Match`, 409, 428, 422, "reaches the machine at its next
    restart"), §4.7 (`price:write`, `forbidden_field`);
  - catalog-admin decisions 2, 4, 5;
  - DP §4.10–4.13, §7.
  - Captured shapes: 400 `invalid_body` `details[{field, error}]`, 409
    `details.current`, 422 `details[{machine_id, errors[]}]`.
- **Depends on:** SRV-34.

## Deliverables (`src/ui/forms/`, on antd `Form`)

1. Forms use antd `Form` / `Form.Item` with antd inputs: `Input`,
   `Input.TextArea`, `InputNumber` (`precision={0}` for rupees and grams,
   decimals for `portion_g`), `Select` (`showSearch`), `Switch`, and
   `Select mode="tags"` for ingredients and allergens. Our additions:
   - `FormError`: an antd `Alert` summary with links that scroll to the
     fields (`form.scrollToField`);
   - `useFormDirty(form)`: dirty tracking from `onValuesChange`, for the
     unsaved bar.
2. `PriceField` (antd `InputNumber` with a `₹` prefix, `min={1}`,
   `precision={0}`):
   - `{value, onChange, editable}`;
   - editable = `can('price:write')`;
   - read-only shows `₹75` + a lock icon + the tooltip "Only tenant admins
     change prices";
   - validates whole rupees > 0 (offer optional).
3. `RestartNote` (variants `restart` / `maintenance`) and `UnsavedBar`
   (sticky; Discard / Save; `useBlocker` + `beforeunload` while dirty).
4. `useVersionedSave({load, save, version, fields})`:
   - holds the loaded version and sends `If-Match`;
   - on 409, opens `ConflictDialog`;
   - on success, invalidates the given query keys and toasts.
5. `ConflictDialog`:
   - refetches the resource and shows a table of fields that differ
     (field, theirs, yours);
   - **Keep my changes** re-bases your edits on theirs and saves with the
     new version;
   - **Discard mine** reloads.
6. `applyServerError(error, form)`:
   - `invalid_body` → field errors by path, set with antd
     `form.setFields([{name, errors}])`; the path `menu[2].hopper` becomes
     antd's name path `['menu', 2, 'hopper']`;
   - users codes → fields (DP §7);
   - `forbidden_field` → marks the fields in `details`;
   - anything else → `FormError`.
7. `InvalidConfigPanel` (antd `Alert type="error"`): "The machine would
   reject this" + per machine (name via `machineName`) the app's error
   strings.
8. `ConflictDialog` and the unsaved-changes confirm use
   `App.useApp().modal` (theme + nonce context).

## Spec notes

- Field paths use the server's syntax: `name`, `nutrition.kcal`,
  `menu[2].hopper`. A path the form doesn't know goes in the summary.
- **Client checks mirror the server's rules** (DP §5 per page), but only
  to warn early. The server stays the judge, so a client check never
  blocks a request the server would accept.
- **Numbers:** inputs are `inputmode="numeric"` / `"decimal"`; values go
  over the wire as JSON numbers, never strings.
  - Mongoose would cast `"75"`, but the raw-body check refuses it:
    catalog-admin decision 4.

## Acceptance criteria

- [ ] `src/ui/forms/applyServerError.test.js` › "maps invalid_body details
      to fields, unknown paths to the summary" (the captured 400:
      `colour` unknown, `name`, `actual_price`); "`menu[2].hopper` →
      antd name path `['menu', 2, 'hopper']`".
- [ ] `src/ui/forms/useVersionedSave.test.jsx`:
      - "sends If-Match";
      - "409 opens the conflict dialog with changed fields";
      - "Keep mine re-saves with the new version";
      - "428 shows the generic error".
- [ ] `src/ui/forms/PriceField.test.jsx` › "read-only without price:write
      and still reports its value".
- [ ] `src/ui/forms/InvalidConfigPanel.test.jsx` › "lists each machine's
      app errors" (the captured 422).
- [ ] `e2e/forms.spec.js` › "gallery forms: field errors, conflict, 422"
      (the gallery's form section against a stub API route in the gallery
      only; no server writes); screenshots, looked at.
- [ ] `e2e/forms.spec.js` › "unsaved changes block navigation" (a confirm
      appears; Cancel stays).

## Out of scope

Page-specific forms (their stories), and autosave (every save is
explicit).
