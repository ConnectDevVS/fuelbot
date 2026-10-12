// Hooks an antd form into the 401 form memory (pendingForm.js): while mounted its values can be
// kept when the session ends; after signing in again on the same path they come back once.
import { useEffect } from 'react';
import { useLocation } from 'react-router';
import { registerForm, takeForm } from './pendingForm.js';

export function useFormMemory(form) {
  const { pathname, search } = useLocation();
  const path = `/dashboard${pathname}${search}`;
  useEffect(() => {
    const kept = takeForm(path);
    if (kept) form.setFieldsValue(kept);
    return registerForm(path, () => form.getFieldsValue(true));
  }, [form, path]);
}
