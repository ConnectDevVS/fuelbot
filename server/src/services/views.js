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
