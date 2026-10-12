// /api/v1/tenants/:tid/machines (plan §4.4): register (the server generates the id), read with
// status, settings, bases, config preview, and (platform only) maintenance. Menus: menus.js.
import express from 'express';
import { Machine } from '../models/index.js';
import { assertCan, canSeeMachine, isPlatform } from '../auth/rbac.js';
import { checkBody, checkVersion, required, T } from '../catalog/input.js';
import { machineConfig } from '../services/catalog.js';
import { createMachine } from '../services/machines.js';
import { machineStatus } from '../services/health.js';
import { configView, machineView } from '../services/views.js';
import { validateAll } from '../catalog/validate.js';
import { audit, diff } from '../services/audit.js';
import { loadTenant } from './tenants.js';
import { HttpError } from '../errors.js';

const httpsUrl = () => (v) => (typeof v === 'string' && /^https:\/\/[^/\s]+\/\S+$/.test(v) ? null : 'an https:// URL');
const SETTINGS = {
  name: T.nonEmpty(80),
  location_label: T.nullable(T.string(60)),
  site: T.nullable(T.string(80)),
  support_phone: T.nullable(T.string(30)),
  idle_video_url: T.nullable(httpsUrl()),
};
const BASE = T.object({
  id: T.slug(), name: T.nonEmpty(40), code: (v) => (typeof v === 'string' && /^B\d$/.test(v) ? null : 'B<digit>'),
  enabled: T.bool(),
});
const FAULT = T.object({ code: T.nonEmpty(20), description: T.string(200) });

export function respond(req, machine) {
  const status = machineStatus(machine, req.app.locals.settings);
  return machineView(machine, status, { platform: isPlatform(req.user) });
}

/** A machine of that tenant the user may see (404 otherwise), as a document. */
export async function loadMachine(req, permission = 'machines:read') {
  const tenant = await loadTenant(req.user, req.params.tid);
  const machine = await Machine.findOne({ _id: req.params.mid, tenant_id: tenant._id });
  if (!machine || !canSeeMachine(req.user, machine)) throw new HttpError(404, 'not_found');
  assertCan(req.user, permission, { machine });
  return machine;
}

/** Saves a config-affecting change: bumps menu_version (the model hook validates the config). */
export async function saveMachine(req, machine, action, before, fields) {
  machine.menu_version += 1;
  await machine.save();
  const view = respond(req, machine);
  const changes = diff(before, view, fields);
  await audit(req, { action, tenant_id: machine.tenant_id, machine_id: machine._id, target: `machine:${machine._id}`, ...changes });
  return view;
}

export function machinesRouter() {
  const router = express.Router({ mergeParams: true });

  router.get('/', async (req, res) => {
    const tenant = await loadTenant(req.user, req.params.tid);
    assertCan(req.user, 'machines:read', { tenantId: tenant._id });
    const machines = await Machine.find({ tenant_id: tenant._id }).sort({ name: 1, _id: 1 }).lean();
    res.json({ items: machines.filter((m) => canSeeMachine(req.user, m)).map((m) => respond(req, m)) });
  });

  router.post('/', async (req, res) => {
    const tenant = await loadTenant(req.user, req.params.tid);
    assertCan(req.user, 'machines:manage', { tenantId: tenant._id });
    const body = checkBody(req.body, { ...SETTINGS, name: required(SETTINGS.name) });
    const fields = Object.fromEntries(Object.entries(body).filter(([, v]) => v !== null));
    const machine = await createMachine({ ...fields, tenant_id: tenant._id });
    const view = respond(req, machine);
    await audit(req, { action: 'machine.register', tenant_id: tenant._id, machine_id: machine._id,
      target: `machine:${machine._id}`, after: { name: view.name, location_label: view.location_label, site: view.site } });
    res.status(201).json({ machine: view });
  });

  router.get('/:mid', async (req, res) => {
    res.json({ machine: respond(req, await loadMachine(req)) });
  });

  router.patch('/:mid', async (req, res) => {
    const machine = await loadMachine(req, 'machines:manage');
    const body = checkBody(req.body, { ...SETTINGS, disabled: T.bool() });
    checkVersion(req, machine.menu_version);
    const before = respond(req, machine);
    for (const [k, v] of Object.entries(body)) machine.set(k, v === null && k !== 'idle_video_url' ? undefined : v);
    const view = await saveMachine(req, machine, 'machine.update', before,
      ['name', 'location_label', 'site', 'support_phone', 'idle_video_url', 'disabled']);
    res.json({ machine: view });
  });

  // What the machine gets, plus the app's verdict on it (errors: [] when valid).
  router.get('/:mid/config', async (req, res) => {
    const machine = await loadMachine(req, 'catalog:read');
    const config = await machineConfig(machine);
    res.json({
      configured: machine.menu.length > 0,
      config: configView(config, { platform: isPlatform(req.user) }),
      errors: validateAll(config),
    });
  });

  router.put('/:mid/bases', async (req, res) => {
    const machine = await loadMachine(req, 'machines:manage');
    const { bases } = checkBody(req.body, { bases: required(T.list(BASE, 6)) });
    if (!bases.some((b) => b.enabled)) {
      throw new HttpError(400, 'invalid_body', [{ field: 'bases', error: 'at least one enabled base' }]);
    }
    if (new Set(bases.map((b) => b.id)).size !== bases.length) {
      throw new HttpError(400, 'invalid_body', [{ field: 'bases', error: 'ids must be unique' }]);
    }
    checkVersion(req, machine.menu_version);
    const before = respond(req, machine);
    machine.bases = bases;
    res.json({ machine: await saveMachine(req, machine, 'machine.bases', before, ['bases']) });
  });

  // Platform only (plan §4.7). No If-Match: a switch, and urgent (stories/catalog-admin decision 2).
  router.put('/:mid/maintenance', async (req, res) => {
    const machine = await loadMachine(req, 'maintenance:write');
    const body = checkBody(req.body, { enabled: required(T.bool()), message: T.string(300), faults: T.list(FAULT, 10) });
    const before = respond(req, machine);
    const switchingOn = body.enabled && !machine.maintenance.enabled;
    machine.maintenance.enabled = body.enabled;
    if (body.message !== undefined) machine.maintenance.message = body.message;
    if (body.faults !== undefined) machine.maintenance.faults = body.faults;
    if (switchingOn) {
      machine.maintenance.flagged_by = req.user.name || req.user.email;
      machine.maintenance.flagged_at = new Date();
    } else if (!body.enabled) {
      machine.maintenance.flagged_by = null;
      machine.maintenance.flagged_at = null;
    }
    res.json({ machine: await saveMachine(req, machine, 'machine.maintenance', before, ['maintenance']) });
  });

  return router;
}
