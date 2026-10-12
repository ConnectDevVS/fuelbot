import { describe, expect, it } from 'vitest';
import { ApiError } from './client.js';
import { CODES, fieldErrors, fieldPath, messageFor } from './errors.js';

// DP §7, in its order.
const DP7 = ['invalid_credentials', 'too_many_attempts', 'tenant_disabled', 'wrong_password', 'same_password',
  'weak_password', 'invalid_email', 'email_taken', 'invalid_role', 'role_scope_change', 'unknown_tenant',
  'unknown_machine', 'machines_not_allowed', 'forbidden_self', 'last_tenant_admin', 'last_platform_admin',
  'invalid_body', 'invalid_config', 'version_conflict', 'if_match_required', 'forbidden_field', 'forbidden',
  'product_in_use', 'product_exists', 'tenant_exists', 'source_not_configured', 'not_found', 'network_error'];

const err = (code, details, status = 400) => new ApiError(status, code, details);

describe('errors', () => {
  it('every DP §7 code has a message', () => {
    const generic = messageFor(err('something_new'));
    for (const code of DP7) {
      expect(CODES).toContain(code);
      const text = messageFor(err(code));
      expect(text, code).not.toMatch(/^\[/);
      if (code !== 'if_match_required') expect(text, code).not.toBe(generic);
    }
    expect(messageFor(err('invalid_credentials', undefined, 401))).toBe('Email or password is wrong');
    expect(messageFor(err('not_found', undefined, 404))).toBe("Not found, or you don't have access");
    expect(messageFor(err('forbidden_field', ['actual_price'], 403))).toBe('Only a tenant admin can change prices');
    expect(messageFor(err('forbidden_field', ['portion_g'], 403))).toBe('Only a tenant admin can change stock settings');
    expect(messageFor(err('last_tenant_admin', undefined, 409))).not.toBe(messageFor(err('last_platform_admin', undefined, 409)));
    expect(messageFor(new Error('boom'))).toBe(generic);
  });

  it('invalid_body details map to field paths (menu[2].hopper)', () => {
    expect(fieldPath('menu[2].hopper')).toEqual(['menu', 2, 'hopper']);
    expect(fieldPath('nutrition.kcal')).toEqual(['nutrition', 'kcal']);
    expect(fieldPath('bases[0]')).toEqual(['bases', 0]);
    const fields = fieldErrors(err('invalid_body', [
      { field: 'menu[2].hopper', error: 'whole number 1–6' },
      { field: 'name', error: 'required' },
    ]));
    expect(fields).toEqual([
      { name: ['menu', 2, 'hopper'], errors: ['whole number 1–6'] },
      { name: ['name'], errors: ['required'] },
    ]);
    expect(fieldErrors(err('version_conflict', undefined, 409))).toEqual([]);
  });

  it('users codes map to fields', () => {
    expect(fieldErrors(err('email_taken', undefined, 409))).toEqual([{ name: ['email'], errors: ['A user with this email exists'] }]);
    expect(fieldErrors(err('invalid_email'))[0].name).toEqual(['email']);
    expect(fieldErrors(err('invalid_role'))[0].name).toEqual(['role']);
    expect(fieldErrors(err('role_scope_change'))[0].name).toEqual(['role']);
    expect(fieldErrors(err('unknown_tenant'))[0].name).toEqual(['tenant_id']);
    expect(fieldErrors(err('unknown_machine'))[0].name).toEqual(['machines']);
    expect(fieldErrors(err('machines_not_allowed'))[0].name).toEqual(['machines']);
    // weak_password's details are a string from the server: our rule text is shown instead.
    expect(fieldErrors(err('weak_password', 'at least 10 characters'))).toEqual([{ name: ['password'], errors: ['10 or more characters'] }]);
    expect(fieldErrors(err('weak_password'), { password: 'new' })[0].name).toEqual(['new']);
  });
});
