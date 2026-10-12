// Dirty tracking for the unsaved bar: compare the form's values with those it was loaded with.
import { useCallback, useRef, useState } from 'react';

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** Returns {dirty, onValuesChange (pass to <Form>), reset(values) after load/save}. */
export function useFormDirty(form) {
  const initial = useRef(undefined);
  const [dirty, setDirty] = useState(false);
  const onValuesChange = useCallback(() => {
    setDirty(!same(form.getFieldsValue(true), initial.current));
  }, [form]);
  const reset = useCallback((values) => {
    if (values !== undefined) form.setFieldsValue(values);
    initial.current = form.getFieldsValue(true);
    setDirty(false);
  }, [form]);
  return { dirty, onValuesChange, reset };
}
