# SRV-30: Scaffold `/webdashboard` (React + Vite + Ant Design)

**As a** developer, **I want** a React + Vite project with Ant Design themed
for FuelBot, the fonts, the CSP nonce in place, linting, unit tests and
written rules, **so that** every later story adds pages, not plumbing.

- **Refs:**
  - DP §0.1 (React + Vite; `/webdashboard`; **Ant Design**;
    **JavaScript**), §0.3 (libraries, fonts, the nonce);
  - DP §2.1 (layout), §2.2 (dev workflow), §2.4 (the style nonce), §2.8
    (palette + antd theme, light only), §2.10 (strings);
  - spike E (fonts), spike A (a build with no inline code), spike G (antd
    with the nonce: 0 violations).
- **Depends on:** SRV-29 (the server serves `dist/` and fills the nonce).

## Deliverables

1. `webdashboard/package.json`:
   - `"type": "module"`, `engines.node >= 22`;
   - scripts: `dev` (vite, :5173, strict port), `build`, `preview`,
     `test` (vitest run), `lint` (eslint), `e2e` (placeholder until
     SRV-31: `echo "no e2e yet"`);
   - dependencies: `react@19`, `react-dom@19`, `react-router@7`,
     `@tanstack/react-query@5`, **`antd@^6`**, **`@ant-design/icons@^6`**,
     `dayjs` (antd's; the `utc` and `timezone` plugins are loaded in
     `src/lib/dayjs.js`);
   - dev dependencies: `vite@8`, `@vitejs/plugin-react@6`, `vitest`,
     `jsdom`, `@testing-library/react`, `@testing-library/user-event`,
     `eslint`, `@eslint/js`, `eslint-plugin-react-hooks`, `globals`;
   - `package-lock.json` committed.
   - (`@dnd-kit/*` comes with SRV-43; `@playwright/test` with SRV-31.)
2. `webdashboard/vite.config.js`:
   - `base: '/dashboard/'`;
   - `server: {port: 5173, strictPort: true, proxy: {'/api': API, '/files': API}}`,
     with `API = process.env.DASHBOARD_API_URL ?? 'http://127.0.0.1:8790'`;
   - `build.outDir: 'dist'`, `build.target: 'es2022'`;
   - vitest `environment: 'jsdom'`.
3. `webdashboard/index.html`:
   - no inline script or style; only the module entry;
   - `<meta name="color-scheme" content="light">`;
   - **`<meta name="csp-nonce" content="__CSP_NONCE__">`**, which the
     server fills per request (SRV-29).
4. **`src/nonce.js`**, the **first import** in `src/main.jsx`:
   - reads the meta;
   - if it holds a real nonce (not the placeholder, as when the Vite dev
     server serves it with no CSP), it wraps `Document.prototype.createElement`
     so every `<style>` element gets `el.nonce`;
   - exports the nonce for the `ConfigProvider`.
   - About 10 lines, as in spike G.
5. Theme:
   - `src/theme/palette.js`: the DP §2.8 colours;
   - `src/theme/antdTheme.js`: the antd `theme` object from the palette
     (tokens + component tokens exactly as the DP §2.8 table);
   - `src/styles/tokens.css`: the same palette as CSS custom properties,
     for our own CSS;
   - `base.css` (the font faces, `.page-title` = Archivo 900 uppercase,
     `.overline` = JetBrains Mono 11 px caps, focus ring), `print.css`;
   - `src/styles/fonts/archivo.woff2` and `jetbrains-mono.woff2`, subset
     from `assets/fonts/*.ttf` with `pyftsubset` (the command is recorded
     in `webdashboard/README.md`), plus `OFL-Archivo.txt` and
     `OFL-JetBrainsMono.txt`.
6. `src/main.jsx`:
   - `import './nonce.js'` first;
   - then `<ConfigProvider theme={antdTheme} csp={{nonce}} locale={enGB}>`
     wrapping `<App>` from antd, around a placeholder page ("FuelBot
     dashboard", a `.page-title`, a primary `Button`, a `Segmented`, a
     `Table`). `enGB` gives day-month dates and Monday-first weeks, which
     match ISO weeks.
   - `src/strings.js`: an empty map + `t(key, params)`.
7. `webdashboard/eslint.config.js`: recommended + react-hooks, plus:
   - `no-console: error` in `src/`;
   - `no-restricted-syntax` banning `dangerouslySetInnerHTML`, `innerHTML`
     and `eval`;
   - `no-restricted-globals` for `localStorage`/`sessionStorage` (the
     dashboard stores nothing in the browser);
   - `no-restricted-imports` banning the static `message`/`Modal.confirm`/
     `notification` from `antd`: use `App.useApp()`, which carries the theme
     and nonce context (DP §4).
8. `webdashboard/.gitignore`: `node_modules/`, `dist/`, `.screenshots/`,
   `test-results/`, `playwright-report/`.
9. `webdashboard/.gdignore` (empty; Godot must not scan `node_modules/`).
10. `webdashboard/CLAUDE.md`: the rules, commands and gotchas:
    - no inline code;
    - no secrets in storage, URLs or logs;
    - permission-based hiding only;
    - strings in `strings.js`;
    - colours only from `palette.js` / `tokens.css`;
    - **antd via our `src/ui/` wrappers**;
    - **`App.useApp()` for message and modal**;
    - **`nonce.js` must stay the first import**;
    - screenshots looked at; one commit per story; zsh;
    - the spikes' lessons: charts use `viewBox` + `width:100%`; expected
      401s appear as console errors; antd `zeroRuntime` doesn't work with
      our theme (spike G); antd `List` is deprecated in 6.6.
11. `webdashboard/README.md`: run (server + `npm run dev`), build (served at
    `:8790/dashboard/`), test, e2e, fonts.
12. Root `CLAUDE.md`: a layout line for `webdashboard/` pointing to its
    CLAUDE.md. Root `README.md`: one line.
13. Tests: `src/App.test.jsx`, `src/theme/theme.test.js`,
    `src/nonce.test.js`, and the build check `test/build.test.js` (vitest,
    `node` environment).

## Spec notes

- **CSS:** antd for components. CSS Modules (`*.module.css`) only for
  layout and our own pieces. There's no CSS framework besides antd.
- **Colours** exist only in `palette.js` and `tokens.css`. A unit test greps
  `src/**/*.{css,jsx,js}` for hex colours elsewhere.
- **Font faces:** `font-weight: 100 900; font-stretch: 62% 125%` for
  Archivo; `font-display: swap`. antd gets `fontFamily` from the theme.
- **Bundle:** routes load lazily (`React.lazy`) from SRV-33 on. This story
  records the placeholder's gzip size as a baseline (spike G: 346 KB for a
  full antd page).

## Acceptance criteria

- [ ] `npm ci && npm run build` produces `dist/index.html` + hashed assets.
      `http://127.0.0.1:8790/dashboard/` (the server from SRV-29) shows the
      placeholder: a lime primary button with dark text, a lime selected
      segment, Archivo headings. **0 CSP violations** in the browser console
      (checked by hand here; guarded automatically from SRV-31). Seen by
      hand, noted in the commit with the bundle size.
- [ ] `test/build.test.js` › "built index.html has no inline code and keeps
      the nonce placeholder":
      - every `<script>` has a `src`;
      - no `<style>` element, no `style=` attribute, no `on*=` attributes;
      - asset URLs start with `/dashboard/`;
      - exactly one `<meta name="csp-nonce" content="__CSP_NONCE__">`.
- [ ] `test/build.test.js` › "fonts are subset WOFF2 under 120 KB each, OFL
      texts shipped".
- [ ] `src/nonce.test.js` › "stamps the nonce on created styles"; "does
      nothing with the placeholder".
- [ ] `src/theme/theme.test.js`:
      - "antd theme and tokens.css use the same palette";
      - "primary button is lime with dark text";
      - "colorPrimary is readable on white" (contrast ≥ 4.5).
- [ ] `src/App.test.jsx` › "renders the placeholder inside ConfigProvider"
      (jsdom).
- [ ] `src/styles/tokens.test.js` › "no colour literals outside
      palette.js/tokens.css"; "every `var(--…)` used in `src/` is defined".
- [ ] `npm run lint` passes. A deliberate `console.log` and a static
      `message.success` import in `src/` both fail it (checked once, not
      committed).
- [ ] `git status` shows no `dist/` or `node_modules/`; Godot's
      `tools/check_boot.sh` still → `BOOT OK` (the `.gdignore` works).

## Out of scope

Routing, API calls and real pages (SRV-32 on). Browser tests (SRV-31).
antd's `zeroRuntime` / pre-built CSS (doesn't work with a custom theme in
6.6.5; revisit on upgrade).
