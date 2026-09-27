// What each audience may see of a resource (plan §4.7): responses are built from allowlists,
// never by deleting fields from a fuller object. Later stories add platform/tenant projections.

/** A user as the dashboard shows it. Never the hash or token_version. */
export function userView(user) {
  return {
    id: String(user._id),
    email: user.email,
    name: user.name ?? '',
    role: user.role,
    tenant_id: user.tenant_id ?? null,
    machines: [...(user.machines ?? [])],
    disabled: Boolean(user.disabled),
    must_change_password: Boolean(user.must_change_password),
    last_login_at: user.last_login_at ?? null,
    created_at: user.created_at ?? null,
  };
}

const menuItemView = (item) => ({
  product_id: item.product_id,
  hopper: item.hopper,
  enabled: item.enabled ?? true,
  sold_out: item.sold_out ?? false,
  badge: item.badge ?? null,
  price: item.price ? { actual_price: item.price.actual_price, offer_price: item.price.offer_price ?? null } : null,
  low_portions: item.low_portions ?? null,
});

/**
 * A machine for the dashboard. `status` is machineStatus(). Tenant users never get faults,
 * maintenance, the reason it's out of service or the machine's IP (plan §4.7).
 */
export function machineView(machine, status, { platform }) {
  const view = {
    id: machine._id,
    tenant_id: machine.tenant_id,
    name: machine.name ?? '',
    location_label: machine.location_label ?? null,
    site: machine.site ?? null,
    support_phone: machine.support_phone ?? null,
    idle_video_url: machine.idle_video_url ?? null,
    disabled: Boolean(machine.disabled),
    configured: (machine.menu ?? []).length > 0,
    menu_version: machine.menu_version ?? 0,
    menu: (machine.menu ?? []).map(menuItemView),
    bases: (machine.bases ?? []).map((b) => ({ id: b.id, name: b.name, code: b.code, enabled: b.enabled })),
    last_seen_at: machine.last_seen_at ?? null,
    online: status.online,
    in_service: status.in_service,
  };
  if (!platform) return view;
  const m = machine.maintenance ?? {};
  return {
    ...view,
    status: status.status,
    faults: status.faults,
    maintenance: {
      enabled: Boolean(m.enabled),
      message: m.message ?? '',
      flagged_by: m.flagged_by ?? null,
      flagged_at: m.flagged_at ?? null,
      faults: (m.faults ?? []).map((f) => ({ code: f.code ?? null, description: f.description ?? null })),
    },
    last_seen_ip: machine.last_seen_ip ?? null,
  };
}

/** The config preview: what the machine gets, without `maintenance` for tenant users. */
export function configView(config, { platform }) {
  if (platform) return config;
  const { version, tenant, flavors, bases, idle_video_url: idle } = config;
  return { version, tenant, flavors, bases, idle_video_url: idle };
}

// --- Sales (plan §4.9, stories/read-apis decision 4) --------------------------------------------

/** The tenant view: money and product facts, "dispensed" instead of the technical outcome. */
export function tenantSaleView(s) {
  return {
    order_id: s.order_id,
    order_number: s.order_number ?? null,
    transaction_id: s.transaction_id ?? null,
    machine_id: s.machine_id,
    flavor_id: s.flavor_id ?? null,
    base_id: s.base_id ?? null,
    hopper: s.hopper ?? null,
    actual_price: s.actual_price ?? null,
    offer_price: s.offer_price ?? null,
    charged_price: s.charged_price ?? null,
    currency: s.currency ?? null,
    payment_method: s.payment_method ?? null,
    dispensed: s.dispensing_result === 'success',
    ts: s.ts,
  };
}

/** The platform view: the whole stored record. */
export function platformSaleView(s) {
  const { _id, __v, ...rest } = s;
  return { id: String(_id), ...tenantSaleView(s), ...rest };
}
