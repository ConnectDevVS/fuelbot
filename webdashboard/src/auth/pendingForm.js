// Form memory across a 401 (dashboard plan §2.5): a form that's open when the session ends gets its
// values back once, after sign-in on the same path. In memory only (a module-level map), and
// never a password field.
const live = new Map();      // path → () => values   (forms mounted now)
const pending = new Map();   // path → values          (waiting for the same path after sign-in)

const SECRET = /pass|secret|key/i;

function scrub(values) {
  if (!values || typeof values !== 'object') return values;
  return Object.fromEntries(Object.entries(values).filter(([k]) => !SECRET.test(k)));
}

/** A mounted form registers how to read its values; returns the unregister function. */
export function registerForm(path, getValues) {
  live.set(path, getValues);
  return () => { if (live.get(path) === getValues) live.delete(path); };
}

/** On a 401: keep every mounted form's values (without secrets). */
export function snapshotForms() {
  for (const [path, getValues] of live) pending.set(path, scrub(getValues()));
}

/** The values kept for this path, once (then forgotten), or undefined. */
export function takeForm(path) {
  const values = pending.get(path);
  pending.delete(path);
  return values;
}

export function clearPendingForms() {
  pending.clear();
}
