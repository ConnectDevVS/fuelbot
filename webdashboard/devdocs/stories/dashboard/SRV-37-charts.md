# SRV-37: Charts (revenue over time, flavor mix)

**As an** owner, **I want** a revenue chart by day, week or month that shows
money from sales that weren't dispensed, and a flavor mix, **so that** I
see trends and what sells at a glance, on any screen and on paper.

- **Refs:**
  - product owner (2026-09-28): revenue over time + flavor mix only;
  - SP §4.9 (summary shape, revenue includes not-dispensed);
  - DP §0.3.3 (hand-written SVG), §2.8 (chart palette), §5.3, §5.7;
  - spikes D (fluid SVG) and F (palette validated).
- **Depends on:** SRV-34.

## Deliverables (`src/charts/`)

1. `RevenueChart.jsx`:
   - `{items: [{key, revenue, not_dispensed_amount, count, not_dispensed}], group, from, to, tz}`;
   - fills missing buckets with zeros via `lib/time.js` bucket keys.
2. `FlavorMixChart.jsx`: `{items: [{key, revenue, count}], names}`.
   Horizontal bars, sorted by revenue.
3. `scales.js`: nice ticks (1-2-5 steps) and `₹` formatting (₹1.2k on the
   axis on phone).
4. `ChartTooltip.jsx`: follows hover/focus. Each bar is focusable
   (`tabindex=0`, `aria-label`).
5. `ChartTable.jsx`: a "Show as table" toggle under each chart (a data
   table of the same numbers).
6. `lib/time.js` additions:
   - `bucketKeys(group, from, to, tz)`: `YYYY-MM-DD` / `GGGG-Www` /
     `YYYY-MM`, identical to Mongo's `%Y-%m-%d`, `%G-W%V`, `%Y-%m`;
   - `bucketLabel(key, group)`: "28 Sep", "Week 39 · 22–28 Sep",
     "Sep 2026".

## Spec

- **Revenue chart:**
  - vertical bars. The dispensed part is `revenue − not_dispensed_amount`;
    the not-dispensed part is stacked on top, hatched at 135°, with a 2 px
    surface gap.
  - Bars ≤ 24 px wide with 4 px rounded tops, square at the baseline.
  - 1 px solid gridlines one step off the surface.
  - Legend: "■ Dispensed ▨ Not dispensed".
  - One y-axis (₹).
  - x labels thinned to fit (first, last, and evenly spaced).
- **Flavor mix:**
  - single series, so no legend: the title says "revenue";
  - values labelled at the bar end (₹);
  - more than 8 flavors → the top 7 + "Other".
- **Tokens:** `--chart-a` / `--chart-b` from `tokens.css` (`#4D7C0F` /
  `#9D3FD6`). Text uses text tokens, never the series colour.
- **Sizing:** SVG `viewBox` + `width: 100%` (the spike D lesson); the
  height is fixed per breakpoint (200 / 180 / 160).
- **Hover:** a tooltip with the bucket label, revenue, orders, and not
  dispensed (n, ₹). Touch: tap a bar.
- **Empty:** "No sales in this period" in place of the plot.

## Acceptance criteria

- [ ] `src/lib/time.test.js` › "bucket keys match the server": day, week
      and month keys for 2026-12-28 → 2027-01-10 in Asia/Kolkata equal the
      server's (`2026-W53`, `2027-W01`, …); a DST zone
      (`Europe/London`, the last Sunday of October) gives no duplicate or
      missing day.
- [ ] `src/charts/RevenueChart.test.jsx` › "fills gaps with zero bars";
      "stacks not-dispensed on top"; "bar width ≤ 24"; "every bar has an
      aria-label with ₹ values".
- [ ] `src/charts/FlavorMixChart.test.jsx` › "folds more than 8 flavors into
      Other"; "uses names, falls back to ids".
- [ ] `src/charts/scales.test.js` › "nice ticks".
- [ ] `e2e/charts.spec.js` (gallery charts section) › "no overflow at 390";
      "tooltip on hover and on focus"; "table toggle shows the same
      totals".
- [ ] Screenshots: both charts, 3 sizes + print emulation.
      **Looked at:** hatching visible on screen and in print, labels not
      colliding on phone.

## Out of scope

A machine comparison chart (product owner: no; it's a table on Sales),
line charts, zoom, and exporting chart images.
