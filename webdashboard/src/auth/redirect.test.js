import { describe, expect, it } from 'vitest';
import { landingPath, safeNext, signInPath } from './redirect.js';

describe('redirect', () => {
  it('next only accepts dashboard paths', () => {
    expect(safeNext('/dashboard/t/powerfuel/sales')).toBe('/t/powerfuel/sales');
    expect(safeNext('/dashboard/t/powerfuel/sales?view=not-dispensed')).toBe('/t/powerfuel/sales?view=not-dispensed');
    expect(safeNext('/dashboard/')).toBe('/');
    for (const bad of ['//evil.com', '//evil.com/dashboard/x', 'https://evil.com/dashboard/x', 'http://127.0.0.1:8795/dashboard/x',
      '/api/v1/users', '/dashboard', '/dashboardx/y', '/dashboard/../api/v1/users', '/dashboard/./x', '/dashboard/\\evil.com',
      'javascript:alert(1)', '/dashboard/x\ny', '/dashboard/sign-in?next=/dashboard/x', '', null, undefined, 42]) {
      expect(safeNext(bad), String(bad)).toBeNull();
    }
  });

  it('lands staff on Fleet and tenant users on Home', () => {
    expect(landingPath({ permissions: ['telemetry:read', 'sales:read'], tenant: null, user: {} })).toBe('/fleet');
    expect(landingPath({ permissions: ['sales:read'], tenant: { id: 'powerfuel' }, user: {} })).toBe('/t/powerfuel/home');
    expect(signInPath('/dashboard/t/x/sales?a=1')).toBe('/sign-in?next=%2Fdashboard%2Ft%2Fx%2Fsales%3Fa%3D1');
  });
});
