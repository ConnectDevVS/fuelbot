import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { ApiError } from '../../api/client.js';
import { renderUi } from '../../test/render.jsx';
import { FormHarness } from '../../test/FormHarness.jsx';
import { applyServerError } from './applyServerError.js';

function formWith(names) {
  let form;
  renderUi(createElement(FormHarness, { names, onForm: (f) => { form = f; } }));
  return form;
}

describe('applyServerError', () => {
  it('maps invalid_body details to fields, unknown paths to the summary', () => {
    const form = formWith(['name', 'actual_price']);
    // As captured: PATCH …/products/guava {colour, name: '', actual_price: 7.5}
    const error = new ApiError(400, 'invalid_body', [
      { field: 'colour', error: 'unknown field' },
      { field: 'name', error: 'a non-empty string ≤ 80' },
      { field: 'actual_price', error: 'whole rupees > 0' },
    ]);
    const problem = applyServerError(error, form);
    expect(form.getFieldError('name')).toEqual(['a non-empty string ≤ 80']);
    expect(form.getFieldError('actual_price')).toEqual(['whole rupees > 0']);
    expect(problem.message).toBe('Some fields need fixing');
    expect(problem.fields.map((f) => f.name)).toEqual([['name'], ['actual_price']]);
    expect(problem.unknown).toEqual([{ field: 'colour', error: 'unknown field' }]);
  });

  it('menu[2].hopper → antd name path', () => {
    const form = formWith([['menu', 2, 'hopper'], ['nutrition', 'kcal']]);
    const problem = applyServerError(new ApiError(400, 'invalid_body', [
      { field: 'menu[2].hopper', error: 'a whole number 1–6' },
      { field: 'nutrition.kcal', error: 'a number' },
    ]), form);
    expect(form.getFieldError(['menu', 2, 'hopper'])).toEqual(['a whole number 1–6']);
    expect(form.getFieldError(['nutrition', 'kcal'])).toEqual(['a number']);
    expect(problem.unknown).toEqual([]);
  });

  it("a list item's error ('[1] code: …') goes to that row's field", () => {
    const form = formWith([['bases', 1, 'code'], ['bases', 1, 'name']]);
    // As captured: PUT …/bases with bases[1].code 'X9'.
    const problem = applyServerError(new ApiError(400, 'invalid_body', [
      { field: 'bases', error: '[1] code: B<digit>' },
      { field: 'bases', error: 'at least one enabled base' },
    ]), form);
    expect(form.getFieldError(['bases', 1, 'code'])).toEqual(['B<digit>']);
    expect(problem.unknown).toEqual([{ field: 'bases', error: 'at least one enabled base' }]);
  });

  it("an object's errors ('logo_text: …; display_name: …') go to their fields", () => {
    const form = formWith([['branding', 'logo_text'], ['branding', 'display_name']]);
    applyServerError(new ApiError(400, 'invalid_body', [
      { field: 'branding', error: 'logo_text: a string (≤ 4); display_name: a string (≤ 60)' },
    ]), form);
    expect(form.getFieldError(['branding', 'logo_text'])).toEqual(['a string (≤ 4)']);
    expect(form.getFieldError(['branding', 'display_name'])).toEqual(['a string (≤ 60)']);
  });

  it('forbidden_field marks its fields; users codes map; others are a summary', () => {
    const form = formWith(['actual_price', 'offer_price', 'email']);
    const price = applyServerError(new ApiError(403, 'forbidden_field', ['actual_price', 'offer_price']), form);
    expect(form.getFieldError('offer_price')).toEqual(['Only a tenant admin can change prices']);
    expect(price.message).toBe('Only a tenant admin can change prices');
    applyServerError(new ApiError(409, 'email_taken'), form);
    expect(form.getFieldError('email')).toEqual(['A user with this email exists']);
    const other = applyServerError(new ApiError(0, 'network_error'), form);
    expect(other).toEqual({ message: "You're offline, or the server isn't reachable", fields: [], unknown: [] });
  });
});
