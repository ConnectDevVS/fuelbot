import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { CodeInput, cleanCode } from './CodeField.jsx';

describe('the emailed code field', () => {
  it('upper-cases, drops anything but letters and digits, and keeps 6', () => {
    expect(cleanCode('abc 234')).toBe('ABC234');
    expect(cleanCode(' hx-6d6p9 ')).toBe('HX6D6P');
    expect(cleanCode(undefined)).toBe('');
  });

  it('passes the cleaned value to the form', () => {
    let value;
    render(<CodeInput aria-label="Code" onChange={(v) => { value = v; }} />);
    fireEvent.change(screen.getByLabelText('Code'), { target: { value: 'ab c2 34 5' } });
    expect(value).toBe('ABC234');
    expect(screen.getByLabelText('Code').getAttribute('autocomplete')).toBe('one-time-code');
  });
});
