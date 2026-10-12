// Imported FIRST by main.jsx (dashboard plan §2.4, spike G). The server puts a fresh CSP nonce in
// <meta name="csp-nonce"> per request; the CSP allows only styles carrying it. antd's
// ConfigProvider gets it via csp={{nonce}}, but antd's helper library creates a few <style>
// elements of its own (a scrollbar measure, the drawer's scroll lock), so every <style> this page
// creates gets it here. With the placeholder (Vite dev server: no CSP) nothing is changed.
export const PLACEHOLDER = '__CSP_NONCE__';

export function installNonce(doc) {
  const value = doc.querySelector('meta[name="csp-nonce"]')?.getAttribute('content') ?? '';
  if (!value || value === PLACEHOLDER) return undefined;
  const create = Document.prototype.createElement;
  Document.prototype.createElement = function createElement(tag, options) {
    const el = create.call(this, tag, options);
    if (String(tag).toLowerCase() === 'style') el.nonce = value;
    return el;
  };
  return value;
}

export const nonce = installNonce(document);
