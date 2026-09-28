// Every user-facing string (dashboard plan §2.10): English, in one place, so it can be translated
// later. t('key', {name}) fills {name} placeholders; a missing key renders as [key].
const STRINGS = {
  'app.name': 'FuelBot dashboard',
  'brand.name': 'FuelBot',
  'brand.mark': 'FB',
  'brand.footer': 'FuelBot dashboard · Sessions 48 h',

  // Periods
  'period.day': 'Day',
  'period.week': 'Week',
  'period.month': 'Month',

  // Sign in / password (DP §5.1)
  'signin.title': 'Sign in',
  'signin.email': 'Email',
  'signin.password': 'Password',
  'signin.submit': 'Sign in',
  'signin.required.email': 'Enter your email',
  'signin.required.password': 'Enter your password',
  'password.title.forced': 'Choose your password',
  'password.title': 'Change password',
  'password.forced.lead': 'Choose your own password to continue.',
  'password.voluntary.lead': 'Your other sessions sign out when you change it.',
  'password.current': 'Current password',
  'password.current.forced': 'Temporary password',
  'password.new': 'New password',
  'password.repeat': 'Repeat new password',
  'password.rule': '10 or more characters',
  'password.mismatch': "The passwords don't match",
  'password.submit': 'Change password',
  'password.changed': 'Password changed. Your other sessions are signed out.',
  'password.back': 'Back',
  'account.signout': 'Sign out',
  'account.password': 'Change password',
  'session.ends': 'Your session ends at {time}. Save your work, then sign in again.',

  // Errors (DP §7)
  'error.invalid_credentials': 'Email or password is wrong',
  'error.too_many_attempts': 'Too many attempts. Try again in 15 minutes',
  'error.tenant_disabled': "Your company's access is disabled. Contact FuelBot",
  'error.wrong_password': 'Current password is wrong',
  'error.same_password': 'Choose a different password',
  'error.weak_password': '10 or more characters',
  'error.invalid_email': 'Enter a valid email',
  'error.email_taken': 'A user with this email exists',
  'error.invalid_role': 'Not allowed',
  'error.role_scope_change': "Staff and tenant roles can't be swapped",
  'error.unknown_tenant': 'No such tenant',
  'error.unknown_machine': 'Unknown machine',
  'error.machines_not_allowed': 'Only operators and viewers are limited to machines',
  'error.forbidden_self': "You can't change your own role or disable yourself",
  'error.last_tenant_admin': 'Every company needs an active admin',
  'error.last_platform_admin': 'There must be an active FuelBot admin',
  'error.invalid_body': 'Some fields need fixing',
  'error.invalid_config': 'The machine would reject this',
  'error.version_conflict': 'Someone else changed this since you opened it.',
  'error.if_match_required': 'Something went wrong. Reload the page',
  'error.forbidden_field.price': 'Only a tenant admin can change prices',
  'error.forbidden_field.stock': 'Only a tenant admin can change stock settings',
  'error.forbidden': "You don't have permission to do this",
  'error.product_in_use': "Remove it from these machines' menus first",
  'error.product_exists': 'That id is taken',
  'error.tenant_exists': 'That id is taken',
  'error.source_not_configured': 'That machine has no menu to copy',
  'error.not_found': "Not found, or you don't have access",
  'error.network_error': "You're offline, or the server isn't reachable",
  'error.not_signed_in': 'Your session has ended. Sign in again',
  'error.password_change_required': 'Choose your own password to continue',
  'error.csrf_header_required': 'Something went wrong. Reload the page',
  'error.server': 'The server had a problem. Try again',
  'error.generic': 'Something went wrong. Reload the page',

  // Placeholders until the pages land
  'placeholder.coming': 'Coming in {story}.',
  'placeholder.refresh': 'Refresh',
  'action.retry': 'Retry',

  // Pages (dashboard plan §3.3)
  'page.fleet': 'Fleet',
  'page.home': 'Home',
  'page.sales': 'Sales',
  'page.stock': 'Stock',
  'page.machines': 'Machines',
  'page.machineNew': 'Register a machine',
  'page.machine': 'Machine',
  'page.products': 'Products',
  'page.users': 'Users',
  'page.company': 'Company',
  'page.tenants': 'Tenants',
  'page.faults': 'Faults',
  'page.telemetry': 'Telemetry',
  'page.audit': 'Audit',
  'page.unregistered': 'Unregistered',
  'page.usersAll': 'All users',
  'page.salesAll': 'All sales',
  'page.order': 'Order',

  // Shell
  'nav.label': 'Main',
  'nav.platform': 'Platform',
  'nav.more': 'More',
  'nav.account': 'Account',
  'nav.skip': 'Skip to content',
  'nav.footer': 'Times in IST · ₹ INR',
  'topbar.tenant': 'Tenant · {id}',
  'switcher.label': 'Tenant',
  'switcher.all': 'All tenants',
  'account.menu': 'Account',
  'role.platform_admin': 'FuelBot admin',
  'role.tenant_admin': 'Tenant admin',
  'role.operator': 'Operator',
  'role.viewer': 'Viewer',
  'notfound.title': 'Not found',
  'notfound.home': 'Go to your start page',
  'notavailable.title': 'Not available',
  'notavailable.body': "Your role can't open this page.",
  'crash.title': 'Something went wrong. Reload',
  'crash.reload': 'Reload',
};

export function t(key, params = {}) {
  const text = STRINGS[key];
  if (text === undefined) return `[${key}]`;
  return text.replace(/\{(\w+)\}/g, (match, name) => (name in params ? String(params[name]) : match));
}

export function hasString(key) {
  return key in STRINGS;
}
