import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { App } from './App.jsx';

describe('App', () => {
  it('renders the placeholder inside ConfigProvider', () => {
    render(<App nonce="test-nonce" />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('FuelBot dashboard');
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeTruthy();
    expect(screen.getByText('Week')).toBeTruthy();
    expect(screen.getByText('₹1,705')).toBeTruthy();
    // antd's runtime styles carry the nonce from ConfigProvider csp.
    const styles = [...document.querySelectorAll('style')];
    expect(styles.length).toBeGreaterThan(0);
    expect(styles.some((s) => s.nonce === 'test-nonce' || s.getAttribute('nonce') === 'test-nonce')).toBe(true);
  });
});
