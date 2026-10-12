import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createMemoryRouter } from 'react-router';
import { App } from './App.jsx';
import { routes } from './shell/routes.jsx';
import { makeQueryClient } from './api/queryClient.js';

describe('App', () => {
  it('renders the sign-in page inside ConfigProvider', async () => {
    const router = createMemoryRouter(routes, { initialEntries: ['/sign-in'] });
    render(<App nonce="test-nonce" router={router} queryClient={makeQueryClient()} />);
    expect(await screen.findByRole('heading', { level: 1 })).toHaveProperty('textContent', 'Sign in');
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeTruthy();
    // antd's runtime styles carry the nonce from ConfigProvider csp.
    const styles = [...document.querySelectorAll('style')];
    expect(styles.length).toBeGreaterThan(0);
    expect(styles.some((s) => s.nonce === 'test-nonce' || s.getAttribute('nonce') === 'test-nonce')).toBe(true);
  });
});
