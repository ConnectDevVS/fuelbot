// jsdom lacks a few browser APIs antd uses. (Node-environment test files skip all of this.)
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

const browser = typeof window !== 'undefined';
if (browser) afterEach(() => { cleanup(); });

if (browser && !window.matchMedia) {
  window.matchMedia = (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() { return false; },
  });
}

// antd measures scrollbars with getComputedStyle(el, '::-webkit-scrollbar'); jsdom logs
// "Not implemented" for pseudo-elements. Ignore the pseudo-element instead.
if (browser) {
  const getComputedStyle = window.getComputedStyle.bind(window);
  window.getComputedStyle = (el) => getComputedStyle(el);
}

if (browser && !window.ResizeObserver) {
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
