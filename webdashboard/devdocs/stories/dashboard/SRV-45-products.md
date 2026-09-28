# SRV-45: Products (library, edit drawer, create, archive, portion size)

**As a** tenant admin, **I want** to manage the product library (text,
nutrition, allergens, default prices, portion size) and see which machines
sell each product, **so that** one edit updates every machine. **As an**
operator with all machines, I edit text but never prices.

- **Refs:**
  - product owner: prices only by tenant_admin/platform_admin;
  - SP §4.1 (`Product`), §4.4 (products API: operator+ edit, only with all
    machines; `If-Match: rev`; 422 per affected machine; archive), §4.8
    (images: S5 deferred), §4.13 (`portion_g`, `stock:write`);
  - catalog-admin decisions 5–7;
  - DP §5.11 (+ wireframe);
  - captured: a limited operator's PATCH → 403 `forbidden`.
- **Depends on:** SRV-35.

## Deliverables

1. `src/pages/products/ProductsPage.jsx` (`/t/:tid/products`): table,
   search, "Show archived", New product.
2. `src/pages/products/ProductDrawer.jsx`: view/edit/create at `?p=<id>` /
   `?new=1`.
3. `src/pages/products/productForm.js`: from the product view to form
   values and back (numbers as numbers; empty optional → `null`; lists
   trimmed).

## Spec

- **API:**
  - `GET /tenants/:tid/products[?archived=true]`;
  - `GET …/products/:pid` (for a fresh `rev` when the drawer opens);
  - `POST …/products` (create: `product_id` slug, `name`,
    `actual_price` required; 409 `product_exists`);
  - `PATCH …/products/:pid` with `If-Match: rev`.
- **Fields and limits** (the server's `FIELDS`):
  - `name` ≤ 80
  - `description` ≤ 500
  - `volume_ml` 0–5,000
  - `nutrition` {kcal, protein_g, carbs_g, fat_g} ≥ 0
  - `ingredients`/`allergens` ≤ 50 items of ≤ 200
  - `image` `res://…`
  - `actual_price` whole > 0; `offer_price` whole > 0 or null
  - `portion_g` > 0 ≤ 500 or null
- **Image:**
  - preview `image_url` if set, with a placeholder on load error (CSP);
  - else "Bundled kiosk image: `<file name>`";
  - "Image upload comes with product images (S5)", with no upload control.
- **Edit rights:**
  - Text fields: `can('products:edit')`. This is already false for a
    limited operator, whose drawer is read-only with a note: "Products are
    shared by every machine; editing needs access to all machines."
  - Prices: `PriceField` (`price:write`).
  - Portion size: `stock:write`, read-only otherwise, with the help text.
  - New product: `products:create`.
- **Save:**
  - `useVersionedSave`; `RestartNote` ("Changes reach every machine using
    it at its next restart");
  - 422 → `InvalidConfigPanel` listing each affected machine (e.g. "Bay 02:
    guava: image or image_url required");
  - 403 `forbidden_field` → the price or portion fields marked.
- **Archive/Unarchive:**
  - `PATCH {archived}`;
  - 409 `product_in_use` → "Remove it from these machines' menus first:
    <names from `machines`>".
- **The "On machines" column and section** use `machines[]` (only the
  caller's visible machines, catalog-admin decision 7).

## Acceptance criteria

- [ ] `src/pages/products/productForm.test.js` › "round-trips a captured
      product"; "empty optional fields become null"; "numbers stay
      numbers".
- [ ] `e2e/products.spec.js` › "owner edits a price and portion size; the
      config preview shows the price" (guava ₹95 → `GET …/config`).
- [ ] `e2e/products.spec.js` › "operator with all machines edits the
      description; prices and portion are locked; the request carries
      unchanged prices" → 200.
- [ ] `e2e/products.spec.js` › "limited operator and viewer see a
      read-only drawer" (no Save; desk sees the shared-product note).
- [ ] `e2e/products.spec.js` › "create a product; a duplicate id → 'That
      id is taken'".
- [ ] `e2e/products.spec.js` › "archive a product on a menu → the
      product_in_use message names the machines; archive an unused one →
      hidden unless Show archived".
- [ ] `e2e/products.spec.js` › "conflict on rev opens the Conflict dialog".
- [ ] `e2e/products.spec.js` › "a change that breaks a machine shows the
      422 panel" (clear `image` on a product without `image_url` that's on
      a menu).
- [ ] Screenshots: the library, the drawer (owner, operator, viewer),
      create, 422, 3 sizes (the drawer as a full-screen sheet
      on phone). Looked at.

## Out of scope

Image upload (S5, deferred), bulk edits, and product deletion (archived,
never deleted).
