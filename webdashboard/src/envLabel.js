// The deployment's tag (the server's ENV_LABEL, e.g. "staging"), which the server writes into
// <meta name="fb-env"> per request. Empty in production; the placeholder (Vite dev server) is none too.
export const PLACEHOLDER = '__ENV_LABEL__';

export function readEnvLabel(doc) {
  const value = doc.querySelector('meta[name="fb-env"]')?.getAttribute('content')?.trim() ?? '';
  return value === PLACEHOLDER ? '' : value;
}

export const envLabel = readEnvLabel(document);
