# Prompt for claude.design: FuelBot web dashboard

**Optional.** S7 doesn't need a claude.design session (product owner,
2026-09-28): the plan's wireframes and the mock-ups in this folder are the
design. Use this prompt later if a fuller visual design is wanted (e.g.
before launch).

Paste everything below the line into claude.design. Attach the mock-ups
from this folder:
- `home-desktop.png`, `home-tablet.png`, `home-phone.png`;
- `provisioning-desktop.png`, `provisioning-phone.png`;
- `menu-desktop.png`;
- `stock-phone.png`, `stock-refill-phone.png`;
- `sales-filters-phone.png`.

They're styled mock-ups of the key screens, and they set the direction.

The full spec behind this prompt is
[../plans/dashboard-plan.md](../plans/dashboard-plan.md). If the design
changes a decision there, update the plan.

---

## What you're designing

A responsive web dashboard for **FuelBot**, a company that runs
protein-shake vending machines in gyms in India. A customer taps a drink on
the machine's touchscreen, pays by UPI QR, and the machine blends it.

The dashboard is where two kinds of people manage those machines:

- **FuelBot staff** operate the whole fleet across every client company.
- **Client companies ("tenants")**, e.g. a gym chain, see their own
  machines, sales and stock. They have three roles:
  - **Tenant admin**: runs everything for their company, including prices,
    users and machine setup.
  - **Operator**: edits menus (which drinks, sold out) but never prices.
    They may be limited to some machines.
  - **Viewer**: read-only.

Please design a complete, consistent screen set and a small component
library. The app will be built in React with **Ant Design 6**, themed with
the tokens below (lime primary buttons with dark text; dark green
`#4D7C0F` for links, focus and selection). So design with Ant Design's
components and patterns (Table, Form, Drawer, Modal, Tag, Segmented,
DatePicker, Steps, Statistic) rather than inventing new controls. Use
flat colours, 1 px borders and radii; no blur or glass effects, and no
gradients except the hatch pattern described below.

## Brand and visual language (keep this)

The dashboard must feel like the same product as the machine's own
touchscreen, carried into a **light** office UI: one electric-lime accent,
heavy uppercase display type, and small monospace labels. **Light theme
only: don't design a dark mode.** The attached mock-ups show the direction.
Refine them; don't replace them.

**Fonts** (both OFL, already licensed):
- **Archivo** (variable, weights 100–900, width 62–125%):
  - headings are 900 weight and UPPERCASE, slightly wide (e.g. "TODAY",
    "SALES", "FLEET");
  - body text is 400–600.
- **JetBrains Mono**: small uppercase labels with 0.06em tracking
  ("REVENUE TODAY", "TENANT · POWERFUEL"), plus ids, keys and codes.

**Colours** (the only theme; also used for printing):

| Token | Hex |
|---|---|
| bg | #F4F5F2 |
| surface | #FFFFFF |
| raised | #FAFAF8 |
| border | #E1E3E6 |
| text | #111215 |
| muted | #4B5159 |
| dim | #6B717A |
| accent (lime) | #C8FF3E, used **only as a fill** behind dark text (primary buttons, the company badge, the selected segment), never as text on white |
| text on accent | #111215 |
| ok | #15803D |
| warning | #A16207 on #FEF7E6 (border #F2D58A) |
| bad | #B91C1C on #FDECEC |

**Chart colours** (validated for colour-blind separation; don't change
them without re-checking):
- Main series ("Dispensed", and single-series bars): #4D7C0F.
- "Not dispensed": #9D3FD6 with a 135° hatch.
- The bright lime is **not** a chart colour.
- Bars are ≤ 24 px wide with 4 px rounded tops and square bottoms.
- A 2 px gap separates stacked segments.
- Gridlines are 1 px, solid and quiet.
- One y-axis only.
- Always show a legend when there are two series.

**Shape and space:**
- 16 px card radius; 10 px control radius; 1 px borders; shadows only on
  dialogs and sheets.
- 8 px spacing grid.
- Numbers use tabular figures and are right-aligned in tables.

**Money and time:**
- Money is Indian rupees in whole numbers with Indian digit grouping:
  **₹1,23,456** (never decimals).
- Times are India Standard Time, shown like "12:42", "28 Sep 12:42", "4 min
  ago", with "IST" where context helps.

**Status is never colour alone:** always a word or icon too ("Online",
"Out of service", "LOW", "Not dispensed").

## Layout and devices (fully responsive)

| Width | Navigation | Content |
|---|---|---|
| ≥ 1100 px | left sidebar, 232 px, icon + label | multi-column: 4 KPI tiles in a row; cards in a 1.5 : 1 grid |
| 760–1099 px | 72 px icon rail with tooltips | KPIs 2 per row, cards stacked |
| < 760 px (design at 390 × 844) | top bar + bottom tab bar (4 pages + "More") | one column; tables become cards; side drawers become full-screen sheets; filters open in a bottom sheet behind a "Filters (2)" button |

- **Top bar:** the company badge (a lime square with 2–4 letters, e.g.
  "PF"), the company name, and the
  user menu (name, role, Change password, Sign out).
- **Staff** get a **tenant switcher** there instead: "All tenants", then
  each company.
- **Touch targets** are ≥ 44 px. No horizontal page scrolling at any width.

## Navigation per role

- **Tenant admin:** Home, Sales, Stock, Machines, Products, Users, Company.
- **Operator / Viewer:** Home, Sales, Stock, Machines, Products.
- **FuelBot staff:**
  - Fleet;
  - inside a chosen company, the tenant pages above;
  - a "Platform" group: Tenants, Faults, Telemetry, Audit, Unregistered
    machines, All sales, All users.
- **Phone tab bar:** Home (staff: Fleet), Sales, Stock, Machines, More.

## Hard content rules (important)

1. **Company users must never see operational internals.** On any screen
   designed for a tenant role, there's no maintenance switch or message, no
   fault codes, no error reasons, no telemetry, no IP addresses, no audit
   log. They see only:
   - **Online / Offline**;
   - **Last seen**;
   - **In service / Out of service** (no reason why).
2. **A paid sale that failed to dispense** is labelled **"Not dispensed"**
   for tenants. Staff also see the technical result ("timeout") and reason
   ("no DONE within deadline").
3. **Operators see prices read-only:** a lock icon and the tooltip "Only
   tenant admins change prices".
4. **Next to every Save that changes what a machine shows** (menu,
   products, settings, branding), show: *"Changes reach the machine at its
   next restart."* Maintenance instead says *"Takes effect within about 2
   minutes."*
5. **No auto-refresh.** Every data page has a **Refresh** button and an
   "Updated 12:42 IST" stamp.

## Screens to design

Design each at **desktop 1440**, and the key ones also at **phone 390**
(light theme only). Use the sample data given (it's real data shape).

1. **Sign in:**
   - centred card: FuelBot logo, "SIGN IN", Email, Password (show/hide),
     button;
   - error state "Email or password is wrong";
   - **Change password (forced):** "Choose your own password to continue",
     with Current / New / Repeat and the rule "10 or more characters". No
     navigation shown.
2. **Fleet (staff landing):**
   - summary chips: Offline 1 · Fault 1 · Maintenance 0 · OK 5 (clickable
     filters);
   - a tenant filter and search;
   - sections per company, e.g. "PowerFuel Gym · 4 machines";
   - machine rows sorted worst first: status badge (OFFLINE / FAULT /
     MAINTENANCE / OK), name + id ("Bay 02 · DEV00001"), fault "HOMING_TIMEOUT
     since 09:42", last seen, today "₹1,705 · 18 orders · 1 not dispensed";
   - chips "Not configured", "Disabled";
   - a collapsed "Refill soon (4)" panel at the bottom.
3. **Home (company landing):** the attached mock-up. Refine it:
   - KPI tiles: Revenue today ₹2,280; Orders 24; Not dispensed 1 · ₹95
     (warning style, "see list →"); Machines 2/2 online · 1 out of service;
   - Revenue chart (14 days, a Day/Week/Month switch; not-dispensed
     hatched);
   - Flavor mix (horizontal bars);
   - Machines list;
   - Refill soon (top 5).
4. **Sales:**
   - filter row: Period (Last 30 days ▾), Group Day | Week | Month,
     Machine, Flavor, All | Dispensed | Not dispensed; Export CSV; Print;
   - KPIs: Revenue ₹17,385 · Orders 183 · Average ₹95 · Not dispensed 16 ·
     ₹1,540;
   - Revenue chart by day, week ("Week 39 · 22–28 Sep") or month;
   - Flavor mix; breakdown tables By flavor and By machine (orders,
     revenue, share %, not dispensed);
   - the sales table: Time, Order no. (4181), Machine, Flavor, Base,
     Charged (₹75 with ~~₹90~~ struck through), Payment (UPI), Transaction
     id with a copy icon ("pay_QqR8xYz3vN2Kw1"), Status (Dispensed / Not
     dispensed); "Load more";
   - a second tab: **"Not dispensed (16)"**, a work list with the note
     "Paid orders that weren't dispensed. Refunds are done in the Razorpay
     dashboard; this list doesn't track them."
   - Also: a **print version** (A4 portrait, light): header with company,
     period and "Generated … by …", KPIs, both charts, breakdown tables,
     not-dispensed list.
5. **Stock: refill soon:**
   - state chips: Empty, Low, Refill needed, Unknown, Not estimated;
   - rows: state chip, product ("Prymor Guava"), "Bay 02 · hopper 1",
     portions left, ≈ days, last refill, and a **Record refill** button;
   - on phone, big tappable cards (a technician uses this at the machine).
6. **Machine page:** a header with name, id (copy), status and last seen,
   then tabs: **Menu · Config preview · Stock · Sales · Settings · Bases ·
   Keys**, plus for staff **Maintenance · Telemetry · Faults**.
   - **Stock tab:**
     - one card per hopper (1–6): product, state chip, **portions left**
       (big number), "≈ 1.5 days", a level bar (390 / 2,000 g);
     - "Last refill 2,000 g · 26 Sep 18:10 · by owner@powerfuel…";
     - "Low below 15 portions";
     - buttons **Record refill** / **Adjust**, and a History list;
     - on phone, a sticky bottom "Record refill";
     - design the **Record refill dialog**: hopper, "Product in this
       hopper: Electrolyte", "Level after filling (g)", note.
   - **Menu tab:**
     - an ordered list of drinks with drag handles; per row: product image
       + name, Hopper (1–6), Price ("Product price ₹75 ~~₹90~~" or an
       override), Badge ("POPULAR"), Sold out toggle, Enabled toggle,
       remove;
     - "+ Add product"; "Copy menu from…";
     - a sticky **Unsaved changes** bar with the restart note, Discard and
       Save;
     - the error state "The machine would reject this menu:
       chocolate: hopper 1 already used by guava".
   - **Config preview:** how the machine's touchscreen will list the
     drinks (mini dark kiosk cards), and a Raw JSON toggle.
   - **Keys tab:** a table (Prefix "SU8B…", Label, Created, Last used,
     Active/Revoked, Revoke) and "Issue a new key".
   - **Maintenance tab (staff):** an on/off switch with a confirm ("The
     kiosk shows Out of service within about 2 minutes and takes no
     payments"), message, a fault list, and machine-reported faults shown
     separately.
   - **Telemetry tab (staff):** an event list; a dispense cycle expands to
     a horizontal **stage timeline** (HOMING 0 s → PROTEIN_DISPENSED 9 s →
     DONE 70 s).
7. **Register a machine** (a 3-step flow) and the **Provisioning card.**
   This is the most important screen to get right.
   - The technician must type three values into the machine by hand:
     - `tenant_id.txt` → `powerfuel`
     - `machine_id.txt` → `SHC816DJ` (8 characters, A–Z and 0–9)
     - `machine_key.txt` → `7KQM-2XPA-9TRD-4WZC-HN3B` (shown **once**)
   - Show them large in JetBrains Mono (its zero has a dot inside), spaced
     for reading, each with a Copy button.
   - A strong warning: "The key is shown ONCE. Write it down or print this
     card now."
   - Typing tips: "Keys never contain 0, O, 1, I or L. Case, spaces and
     dashes don't matter."
   - A checkbox "I've written down or printed the key" that enables Done,
     and a Print button (a clean printable card).
   - Design it on phone too.
8. **Products:**
   - a table (image, name + id, price, portion size, "on 2 machines",
     Archived);
   - a **right-side edit drawer** (a full-screen sheet on phone) with Name,
     Description, Volume, Nutrition (kcal / protein / carbs / fat),
     Ingredients and Allergens as tag inputs, Price + Offer (locked for
     operators), Portion size (g), the image preview, "On machines: Bay 02,
     Bay 3", Archive, and Save with the restart note.
9. **Users:**
   - a table (name/email, role, machines, status Active / Disabled / "Must
     change password", last sign-in);
   - a create dialog with a **Generate temporary password** button (the
     password shown once with Copy);
   - the per-row menu: Edit, Reset password, Disable.
10. **Company:** company name; kiosk display name; logo text (max 4
    letters) with a live preview of the lime badge; support phone.
11. **Staff pages:** Tenants (list + New tenant), Faults log (open faults
    first, with durations), Telemetry explorer, Audit log (a row expands to
    a before/after diff), Unregistered machines (ids that reported but
    aren't registered, with a hint that it's a typo on the machine).

## States to show (at least once each, in the component sheet)

- Loading: skeleton blocks shaped like the content.
- Empty, e.g. "No machines yet. Register your first machine", or "Nothing
  needs refilling".
- Error panel with Retry; "You're offline".
- Not found / "You don't have access".
- **Conflict dialog:** "Someone else changed this since you opened it",
  with a table of the fields that differ (theirs vs yours) and the buttons
  **Keep my changes** / **Discard mine**.
- Confirm dialogs for destructive actions (red button repeating the verb):
  Revoke key, Disable user, Disable machine, Disable tenant, Maintenance
  on.
- Field errors under inputs, plus a summary at the top of long forms.
- Toast ("Menu saved. Reaches Bay 02 at its next restart").
- Session-ending banner ("Your session ends at 14:05. Save your work, then
  sign in again.").

## Components to include in a component sheet

- Buttons: primary (lime fill), secondary, ghost, danger; icon buttons.
- Inputs: text, number (₹ prefix), select, toggle, segmented control
  (Day/Week/Month), tag input, date range.
- Chips and badges: machine status (OK / MAINTENANCE / FAULT / OFFLINE for
  staff; Online / Offline + In service / Out of service for tenants);
  stock states (EMPTY / LOW / REFILL NEEDED / UNKNOWN / NOT ESTIMATED / OK);
  Dispensed / Not dispensed.
- KPI tile (with a warning variant); data table and its phone card form;
  "Load more".
- CopyField (a mono value + copy button + "Copied" state); the id
  display.
- Drawer / sheet, modal dialog, toast, unsaved-changes bar.
- Both charts, with tooltip, legend and the "Show as table" toggle.
- Page header: mono overline + huge uppercase title + actions (Refresh,
  "Updated 12:42 IST").

## Sample data (use these names and numbers)

- **Company:** PowerFuel Gym (badge "PF"), tenant id `powerfuel`. A second
  company: Globex Fitness ("GX").
- **Machines:**
  - "Bay 02" `DEV00001`: online; out of service for tenants, HOMING_TIMEOUT
    fault for staff;
  - "Bay 3 by the lockers" `SHC816DJ`: online, in service;
  - "Bay 4" `K7Q2M9XA`: offline, never seen, not configured.
- **Drinks:** Prymor Guava ₹75 (was ₹90), MMN Chocolate ₹180, Electrolyte
  ₹115, Vanilla (sold out), Cookies & Cream, Beast Coffee ₹115.
- **Today:** ₹2,280 from 24 orders, 1 not dispensed (₹95).
- **Last 30 days:** ₹17,385, 183 orders, 16 not dispensed (₹1,540).
- **Stock on Bay 02:** hopper 1 Guava EMPTY (0); hopper 2 Chocolate LOW
  (12 portions, ≈ 1.5 days); hopper 3 Electrolyte OK (61); hopper 4
  NOT ESTIMATED; hopper 5 Cookies & Cream UNKNOWN (no refill recorded).
- **People:** Owner (tenant admin), Desk (operator, Bay 02 only), Look
  (viewer), Ops Staff (FuelBot staff).

## Deliverables

1. The screen set above, desktop + phone where listed.
2. A component sheet with all states.
3. Notes on anything you changed from the reference mock-up and why.

Keep it calm and operational: this is a tool people check several times a
day. The data is the loud part; the chrome stays quiet.
