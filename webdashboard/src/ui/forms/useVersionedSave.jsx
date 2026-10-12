// Saving a versioned resource (§4 pattern 10). The save sends If-Match with the version the form
// was loaded with. On 409 version_conflict the Conflict dialog fetches the current resource and
// lists the fields that differ (theirs vs yours):
//   Keep my changes: your edits (the fields you changed) on top of theirs, saved with their version;
//   Discard mine: the form takes theirs.
// 428 if_match_required is a bug: the generic error. Anything else maps to fields and the summary
// (applyServerError); a 422 is returned as configError, for the InvalidConfigPanel only.
import { useEffect, useRef, useState } from 'react';
import { App, Button, Space } from 'antd';
import { useQueryClient } from '@tanstack/react-query';
import { ApiError } from '../../api/client.js';
import { applyServerError } from './applyServerError.js';
import { t } from '../../strings.js';
import styles from './forms.module.css';

const getPath = (obj, name) => [].concat(name).reduce((o, k) => (o === null || o === undefined ? undefined : o[k]), obj);
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const show = (v) => (v === null || v === undefined || v === '' ? '—' : Array.isArray(v) ? v.join(', ') : String(v));

function setPath(obj, name, value) {
  const path = [].concat(name);
  const out = Array.isArray(obj) ? [...obj] : { ...obj };
  let cursor = out;
  path.forEach((k, i) => {
    if (i === path.length - 1) cursor[k] = value;
    else {
      cursor[k] = Array.isArray(cursor[k]) ? [...cursor[k]] : { ...(cursor[k] ?? {}) };
      cursor = cursor[k];
    }
  });
  return out;
}

/**
 * form: the antd form. initial: the values the form was loaded with. version: the loaded version.
 * fields: [{name, label, format?(v)}] compared in the Conflict dialog.
 * fetchCurrent(): the resource now; valuesOf(resource) → form values; versionOf(resource) → version.
 * save(values, version) → the saved resource. invalidate: query keys. success: toast text.
 * onSaved(resource) / onDiscard(resource): let the page reset the form.
 */
export function useVersionedSave({ form, initial, version, fields, fetchCurrent, valuesOf, versionOf, save,
  invalidate = [], success, onSaved, onDiscard, rename }) {
  const { modal, message } = App.useApp();
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState(null);
  const [configError, setConfigError] = useState(null);
  const versionRef = useRef(version);
  useEffect(() => { versionRef.current = version; }, [version]);   // the page reloaded the resource

  async function run(values, atVersion) {
    setSaving(true);
    setProblem(null);
    setConfigError(null);
    // The last attempt's server errors no longer apply.
    const stale = form.getFieldsError().filter((f) => f.errors.length).map((f) => ({ name: f.name, errors: [] }));
    if (stale.length) form.setFields(stale);
    try {
      const saved = await save(values, atVersion);
      if (versionOf && saved) versionRef.current = versionOf(saved);
      await Promise.all(invalidate.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
      if (success) message.success(success);
      onSaved?.(saved);
      return saved;
    } catch (err) {
      if (err instanceof ApiError && err.status === 409 && err.code === 'version_conflict') {
        await conflict(values);
      } else if (err instanceof ApiError && err.code === 'if_match_required') {
        setProblem({ message: t('error.generic'), fields: [], unknown: [] });
      } else if (err instanceof ApiError && err.code === 'invalid_config') {
        setConfigError(err);   // the InvalidConfigPanel says it all; no second summary
      } else {
        setProblem(applyServerError(err, form, { rename }));
      }
      return undefined;
    } finally {
      setSaving(false);
    }
  }

  async function conflict(mine) {
    setSaving(false);   // nothing is in flight while the dialog waits for a choice
    let current;
    try {
      current = await fetchCurrent();
    } catch (err) {
      setProblem(applyServerError(err, form, { rename }));
      return;
    }
    const theirs = valuesOf(current);
    const rows = fields.filter((f) => !same(getPath(theirs, f.name), getPath(mine, f.name)));
    const changedByMe = fields.filter((f) => !same(getPath(mine, f.name), getPath(initial, f.name)));
    let choose;
    const choice = new Promise((resolve) => { choose = resolve; });
    const instance = modal.confirm({
      title: t('conflict.title'),
      width: 560,
      onCancel: () => choose('stay'),   // Escape: nothing changes, the edits stay in the form
      content: (
        <div>
          <p>{t('conflict.body')}</p>
          {rows.length > 0 && (
            <table className={styles.diff}>
              <thead><tr><th className="overline">{t('conflict.field')}</th><th className="overline">{t('conflict.theirs')}</th><th className="overline">{t('conflict.yours')}</th></tr></thead>
              <tbody>
                {rows.map((f) => (
                  <tr key={JSON.stringify(f.name)}>
                    <td>{f.label}</td>
                    <td>{(f.format ?? show)(getPath(theirs, f.name))}</td>
                    <td>{(f.format ?? show)(getPath(mine, f.name))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ),
      footer: (
        <Space className={styles.conflictActions}>
          <Button onClick={() => choose('discard')}>{t('conflict.discard')}</Button>
          <Button type="primary" onClick={() => choose('keep')}>{t('conflict.keep')}</Button>
        </Space>
      ),
    });
    const picked = await choice;
    instance.destroy();
    versionRef.current = versionOf(current);
    if (picked === 'discard') {
      onDiscard?.(current);
    } else if (picked === 'keep') {
      const rebased = changedByMe.reduce((acc, f) => setPath(acc, f.name, getPath(mine, f.name)), theirs);
      form.setFieldsValue(rebased);
      await run(rebased, versionRef.current);
    }
  }

  return {
    saving,
    problem,
    configError,
    clearProblem: () => { setProblem(null); setConfigError(null); },
    submit: (values) => run(values, versionRef.current),
  };
}
