# SRV-42: Machines list, register a machine, provisioning card, Keys tab

**As a** tenant admin (or staff), **I want** to register a machine and get
its tenant id, machine id and key in a form I can copy, print and type
without mistakes, knowing the key is shown only once, and to rotate keys
later, **so that** provisioning never fails because of a typo.

- **Refs:**
  - product owner: server-generated 8-character ids; the key issued
    separately, shown once, typed by hand, `XXXX-XXXX-XXXX-XXXX-XXXX`;
    foolproof provisioning;
  - SP §4.3, §4.4 (machines, keys);
  - machine-keys decisions 1–6; catalog-admin decisions 1, 3;
  - `server/README.md` "Setting up a machine";
  - DP §5.4, §5.5, §5.6.7 (+ wireframes);
  - mock-ups `design/provisioning-desktop.png`, `provisioning-phone.png`.
- **Depends on:** SRV-41 (the machine page frame).

## Deliverables

1. `src/pages/machines/MachinesPage.jsx` (`/t/:tid/machines`). It reuses
   `MachineStatusList` in a full table.
2. `src/pages/machines/RegisterMachinePage.jsx`
   (`/t/:tid/machines/new`, `machines:manage`): step 1 details → step 2
   menu (copy / build / later) → step 3 key.
3. `src/pages/machines/ProvisioningCard.jsx`: the tenant id, machine id and
   key; copy buttons, typing tips, a Print button, and an
   acknowledgement.
4. `src/pages/machine/KeysTab.jsx`: list, Issue (→ the card), Revoke.
5. `src/lib/issueKey.js`:
   - a plain `api('POST', …/keys)`, **not** React Query;
   - it returns `{key, machine_key}`.
   - The caller keeps `key` in component state and clears it on unmount.

## Spec

- **Machines list:** `GET /fleet?tenant=<tid>`.
  - Columns per DP §5.4 wireframe.
  - "Register a machine" (`machines:manage`).
  - Empty states by role.
- **Register:**
  - `POST /tenants/:tid/machines {name, location_label?, site?}` → 201
    `{machine}` (id generated; `configured:false`; default base water).
  - Step 2 copy: `POST …/machines/<new>/menu/copy-from/<src>` with
    `If-Match: 0` (the new `menu_version`). The source list is the tenant's
    configured machines.
  - "Build the menu" opens the Menu tab (SRV-43) in a new step. "Later"
    skips.
- **Key:**
  - `POST …/keys {label}` (default label = the machine name) → `key` shown
    in the card;
  - the key is never passed to React Query, `console`, the URL or storage.
- **Card** (DP §5.5):
  - JetBrains Mono 28/22 px;
  - the machine id is shown with letter-spacing (`S H C 8 1 6 D J`) and
    copied without spaces;
  - the key is shown `7KQM - 2XPA - …` and copied as
    `7KQM-2XPA-9TRD-4WZC-HN3B`;
  - tips per DP §5.5;
  - **Print** prints only the card (no checkbox);
  - "I've written down or printed the key" enables Done;
  - leaving early → a confirm.
- **Keys tab** (`keys:manage`):
  - `GET …/keys`; columns per DP §5.6.7;
  - `created_by` resolved via the users list if `users:manage`, else "—";
  - Revoke → `ConfirmDialog` (DP §4.9) → `DELETE …/keys/:kid`, then
    refetch;
  - the guidance line for rotation.
- **Roles:**
  - operators and viewers: no Register button; `/t/:tid/machines/new` →
    NotAvailable; no Keys tab.

## Acceptance criteria

- [ ] `src/pages/machines/ProvisioningCard.test.jsx` › "copies canonical
      values"; "Done disabled until acknowledged"; "unmount clears the key
      from the DOM and state".
- [ ] `e2e/machines.spec.js` › "list shows every visible machine with
      status and menu state" (owner: 4 powerfuel machines, Bay 4 "Not
      configured", Old bay "Disabled"; desk: 1).
- [ ] `e2e/machines.spec.js` › "owner registers a machine, copies a menu,
      issues a key":
      - the card shows `powerfuel`, an 8-character `[A-Z0-9]` id, and a key
        matching `^[A-HJ-KM-NP-Z2-9]{4}(-[A-HJ-KM-NP-Z2-9]{4}){4}$`;
      - the new machine is `configured: true`;
      - **then** `GET /fuelbot/config` with the three values read back
        from the card's text (`X-Tenant-Id`, `X-Machine-Id`,
        `Authorization: Bearer`; the e2e server runs `MACHINE_AUTH=required`)
        → 200. That's the end-to-end proof that the card is right.
- [ ] `e2e/machines.spec.js` › "the key never leaves the card": during the
      flow, no request URL contains the key; `localStorage`,
      `sessionStorage` and the page's history entries don't contain it;
      after Done, the DOM doesn't contain it.
- [ ] `e2e/machines.spec.js` › "print shows only the card" (print
      emulation screenshot; looked at).
- [ ] `e2e/machines.spec.js` › "revoke asks, then marks the key Revoked;
      the kiosk call with it → 401".
- [ ] `e2e/machines.spec.js` › "operators and viewers can't register or
      see keys".
- [ ] Screenshots: the list, each register step, the card (phone and
      desktop, compared with the provisioning mock-ups), the Keys tab. Looked at: key legibility on
      phone.

## Out of scope

Claiming unregistered ids (ids come only from the server; SP §4.4), moving
a machine between tenants (SP §8), and QR codes on the card (a later idea,
since the key is typed anyway).
