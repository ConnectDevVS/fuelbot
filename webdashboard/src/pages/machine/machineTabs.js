// The machine page's tabs (dashboard plan §5.6), as data: who sees each (all of the permissions,
// null = everyone who can open the page) and which story builds it. The bar shows the tabs the user
// may see that exist so far; each is its own route (/t/:tid/machines/:mid/<tab>).
export const MACHINE_TABS = [
  { id: 'menu', needs: null, story: 'SRV-43' },
  { id: 'config', needs: 'catalog:read', story: 'SRV-43' },
  { id: 'stock', needs: null, story: 'SRV-41' },
  { id: 'sales', needs: 'sales:read', story: 'SRV-44' },
  { id: 'settings', needs: null, story: 'SRV-44' },
  { id: 'bases', needs: null, story: 'SRV-44' },
  { id: 'keys', needs: 'keys:manage', story: 'SRV-42' },
  { id: 'maintenance', needs: 'telemetry:read', story: 'SRV-47' },   // platform only
  { id: 'telemetry', needs: 'telemetry:read', story: 'SRV-47' },
  { id: 'faults', needs: 'faults:read', story: 'SRV-47' },
];

/** The tabs to show: allowed by `can` and built (ids in `built`), in the table's order. */
export function visibleTabs(can, built) {
  return MACHINE_TABS.filter((tab) => built.has(tab.id)
    && (!tab.needs || [].concat(tab.needs).every((p) => can(p))));
}
