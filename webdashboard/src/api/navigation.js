// A bridge from code outside React (the query cache's error handler) to the router, so a 401 or
// a forced password change navigates inside the SPA instead of reloading the page.
let navigator = null;

/** Called once with router.navigate (paths are relative to the /dashboard basename). */
export function setNavigator(fn) {
  navigator = fn;
}

export function goTo(path, options) {
  if (navigator) return navigator(path, options);
  window.location.assign(`/dashboard${path}`);
  return undefined;
}

/** The current location as a /dashboard/… path (the `next` after sign-in). */
export function currentPath() {
  return `${window.location.pathname}${window.location.search}`;
}
