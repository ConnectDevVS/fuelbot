// Lint rules (webdashboard/CLAUDE.md): recommended + React hooks, and the dashboard's security and
// consistency bans: no console in src/, no HTML injection or eval, no browser storage, and antd's
// static message/notification/Modal.confirm (they miss the theme and the CSP nonce).
import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';

const STATIC_MODAL = 'MemberExpression[object.name="Modal"][property.name=/^(confirm|info|success|error|warning)$/]';

export default [
  { ignores: ['dist/', 'node_modules/', 'playwright-report/', 'test-results/', '.screenshots/'] },
  js.configs.recommended,
  {
    files: ['**/*.{js,jsx,mjs}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser },
    },
    rules: {
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]', argsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['src/**/*.{js,jsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'no-console': 'error',
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      'no-restricted-syntax': ['error',
        { selector: 'JSXAttribute[name.name="dangerouslySetInnerHTML"]', message: 'No HTML injection (dashboard CLAUDE.md).' },
        { selector: 'MemberExpression[property.name=/^(innerHTML|outerHTML|insertAdjacentHTML)$/]', message: 'No HTML injection.' },
        { selector: STATIC_MODAL, message: 'Use App.useApp().modal: the static Modal methods miss the theme and CSP nonce.' },
      ],
      'no-restricted-globals': ['error',
        { name: 'localStorage', message: 'The dashboard stores nothing in the browser.' },
        { name: 'sessionStorage', message: 'The dashboard stores nothing in the browser.' },
      ],
      'no-restricted-properties': ['error',
        { object: 'window', property: 'localStorage', message: 'The dashboard stores nothing in the browser.' },
        { object: 'window', property: 'sessionStorage', message: 'The dashboard stores nothing in the browser.' },
      ],
      'no-restricted-imports': ['error', {
        paths: [{
          name: 'antd',
          importNames: ['message', 'notification'],
          message: 'Use App.useApp(): the static functions miss the theme and CSP nonce.',
        }],
      }],
    },
  },
  {
    files: ['*.config.js', 'test/**/*.js', 'e2e/**/*.{js,mjs}', 'src/**/*.test.{js,jsx}', 'src/test/**/*.js'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
  {
    // Playwright fixtures are destructured even when unused: test.beforeEach(({}, testInfo) => …).
    files: ['e2e/**/*.{js,mjs}'],
    rules: { 'no-empty-pattern': 'off' },
  },
];
