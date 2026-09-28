# SRV-30: Scaffold `/webdashboard`

**As a** developer, **I want** a React + Vite project with the FuelBot
theme, fonts, linting, unit tests and written rules, **so that** every
later story adds pages, not plumbing.

- **Refs:** DP §0.1 (React + Vite; `/webdashboard`), §0.3 (libraries, JS,
  fonts), §2.1 (layout), §2.2 (dev workflow), §2.8 (tokens, theme boot),
  §2.10 (strings). Spike E (fonts), spike A (a build with no inline code).
- **Depends on:** SRV-29 (so `npm run build` output is served at
  `/dashboard/`).

## Deliverables

1. `webdashboard/package.json`:
   - `"type": "module"`, `engines.node >= 22`;
   - scripts: `dev` (vite, :5173, strict port), `build`, `preview`,
     `test` (vitest run), `lint` (eslint), `e2e` (placeholder until
     SRV-31: `echo "no e2e yet"`);
   - dependencies: `react@19`, `react-dom@19`, `react-router@7`,
     `@tanstack/react-query@5`;
   - dev dependencies: `vite@8`, `@vitejs/plugin-react@6`, `vitest`,
     `jsdom`, `@testing-library/react`, `@testing-library/user-event`,
     `eslint`, `@eslint/js`, `eslint-plugin-react-hooks`, `globals`;
   - `package-lock.json` committed.
2. `webdashboard/vite.config.js`:
   - `base: '/dashboard/'`;
   - `server: {port: 5173, strictPort: true, proxy: {'/api': API, '/files': API}}`,
     with `API = process.env.DASHBOARD_API_URL ?? 'http://127.0.0.1:8790'`;
   - `build.outDir: 'dist'`;
   - vitest `environment: 'jsdom'`.
3. `webdashboard/index.html`:
   - no inline script or style;
   - `<script src="/dashboard/theme-boot.js"></script>` in `<head>`
     (classic, from `public/`), then the module entry;
   - `<meta name="color-scheme" content="dark light">`.
4. `webdashboard/public/theme-boot.js`:
   - reads `localStorage['fb_theme']` (`system|dark|light`) in try/catch;
   - resolves `system` via `matchMedia('(prefers-color-scheme: light)')`;
   - sets `document.documentElement.dataset.theme`.
5. Styles:
   - `src/styles/tokens.css` (DP §2.8, both themes; chart tokens
     included), `base.css` (reset, type scale, focus ring), `print.css`
     (forces light tokens);
   - `src/styles/fonts/archivo.woff2` and `jetbrains-mono.woff2`, subset
     from `assets/fonts/*.ttf` with `pyftsubset` (the command is recorded
     in `webdashboard/README.md`), plus `OFL-Archivo.txt` and
     `OFL-JetBrainsMono.txt` copied.
6. `src/main.jsx` + `src/App.jsx`: a placeholder page "FuelBot dashboard"
   in the theme. `src/strings.js` (empty map + `t(key, params)`).
7. `webdashboard/eslint.config.js`: recommended + react-hooks, plus these
   rules:
   - `no-console: error` in `src/`;
   - `no-restricted-syntax` banning `dangerouslySetInnerHTML`, `innerHTML`
     and `eval`;
   - `no-restricted-globals` for `localStorage`/`sessionStorage`, except
     in `src/shell/theme.js` and `public/theme-boot.js` (a per-file
     override).
8. `webdashboard/.gitignore`: `node_modules/`, `dist/`, `.screenshots/`,
   `test-results/`, `playwright-report/`.
9. `webdashboard/.gdignore` (empty; Godot must not scan `node_modules/`).
10. `webdashboard/CLAUDE.md`: the rules, commands and gotchas:
    - no inline code;
    - no secrets in storage, URLs or logs;
    - permission-based hiding only;
    - strings in `strings.js`;
    - tokens only (no colour literals outside `tokens.css`);
    - screenshots looked at;
    - one commit per story;
    - zsh;
    - the spikes' lessons: charts use `viewBox` + `width:100%`; expected
      401s appear as console errors.
11. `webdashboard/README.md`: run (server + `npm run dev`), build (served at
    `:8790/dashboard/`), test, e2e, fonts.
12. Root `CLAUDE.md`: a layout line for `webdashboard/` pointing to its
    CLAUDE.md. Root `README.md`: one line.
13. Test `src/App.test.jsx`; build check `test/build.test.js` (vitest,
    `node` environment).

## Spec notes

- **No CSS framework.** CSS Modules (`*.module.css`, Vite built-in) for
  components; tokens are global.
- **Colours** exist only in `tokens.css`. A unit test greps `src/**/*.css`
  and `*.jsx` for hex colours outside it.
- **Font faces:** `font-weight: 100 900; font-stretch: 62% 125%` for
  Archivo; `font-display: swap`.

## Acceptance criteria

- [ ] `npm ci && npm run build` produces `dist/index.html` + hashed assets;
      `http://127.0.0.1:8790/dashboard/` (server from SRV-29) shows the
      placeholder in the dark theme. Seen by hand, noted in the commit.
- [ ] `test/build.test.js` › "built index.html has no inline code":
      - every `<script>` has a `src`;
      - no `<style>` element, no `style=` attribute;
      - no `on*=` attributes;
      - asset URLs start with `/dashboard/`.
- [ ] `test/build.test.js` › "fonts are subset WOFF2 under 120 KB each, OFL
      texts shipped".
- [ ] `src/App.test.jsx` › "renders the placeholder" (jsdom).
- [ ] `src/styles/tokens.test.js` › "no colour literals outside tokens.css".
- [ ] `src/styles/tokens.test.js` › "both themes define the same token
      names".
- [ ] `npm run lint` passes. A deliberate `console.log` in `src/` fails it
      (checked once, not committed).
- [ ] `git status` shows no `dist/` or `node_modules/`; Godot's
      `tools/check_boot.sh` still → `BOOT OK` (the `.gdignore` works).

## Out of scope

Routing, API calls and real pages (SRV-32 on). Browser tests (SRV-31).
