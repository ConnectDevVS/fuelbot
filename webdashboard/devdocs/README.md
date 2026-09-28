# Web dashboard docs

The docs for the FuelBot web dashboard (Milestone S7). The code is one
level up ([../README.md](../README.md), rules in [../CLAUDE.md](../CLAUDE.md)).

- [plans/dashboard-plan.md](plans/dashboard-plan.md): the design brief and
  page-by-page spec, decisions, wireframes, spikes, risks.
- [stories/dashboard/](stories/dashboard/README.md): the story set, SRV-27
  to SRV-49, and the SIGNOFF.
- [design/](design/): the visual design for S7, light theme only. Together
  with the plan's wireframes this is the design; no separate design session
  is needed. The app is built with **Ant Design** themed to the same
  palette (plan §2.8), so the mock-ups are layout and hierarchy guides, not
  pixel targets. The mock-ups:
  - `home-desktop.png`, `home-tablet.png`, `home-phone.png`: tenant Home;
  - `provisioning-desktop.png`, `provisioning-phone.png`: register a
    machine, step 3, the key shown once;
  - `menu-desktop.png`: the Menu editor (unsaved changes, a price override,
    a duplicate-hopper warning);
  - `stock-phone.png`, `stock-refill-phone.png`: the Stock tab and the
    Record refill sheet on a phone;
  - `sales-filters-phone.png`: the Sales filter sheet on a phone.
  - [claude-design-prompt.md](design/claude-design-prompt.md) is
    **optional**, for a fuller visual design later.

The backend's source of truth is
[server/devdocs/plans/server-plan.md](../../server/devdocs/plans/server-plan.md).
Its §4.10 points here.
