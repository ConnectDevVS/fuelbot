// /api/v1/tenants/:tid/machines/:mid/keys (plan §4.3, §4.4): issue (shown once), list, revoke.
// tenant_admin and platform_admin (keys:manage). The key itself is never stored or audited.
import express from 'express';
import mongoose from 'mongoose';
import { MachineKey } from '../models/index.js';
import { checkBody, T } from '../catalog/input.js';
import { issueKey, keyView } from '../services/keys.js';
import { audit } from '../services/audit.js';
import { loadMachine } from './machines.js';
import { HttpError } from '../errors.js';

export function keysRouter() {
  const router = express.Router({ mergeParams: true });

  router.get('/', async (req, res) => {
    const machine = await loadMachine(req, 'keys:manage');
    const keys = await MachineKey.find({ machine_id: machine._id }).sort({ _id: -1 }).lean();
    res.json({ items: keys.map(keyView) });
  });

  router.post('/', async (req, res) => {
    const machine = await loadMachine(req, 'keys:manage');
    const body = checkBody(req.body ?? {}, { label: T.string(60) });
    const { key, doc } = await issueKey(machine, { label: body.label ?? '', createdBy: req.user._id });
    await audit(req, { action: 'key.issue', tenant_id: machine.tenant_id, machine_id: machine._id,
      target: `key:${doc._id}`, after: { prefix: doc.prefix, label: doc.label } });
    res.status(201).json({ key, machine_key: keyView(doc) });   // the only time the key is returned
  });

  router.delete('/:kid', async (req, res) => {
    const machine = await loadMachine(req, 'keys:manage');
    if (!mongoose.Types.ObjectId.isValid(req.params.kid)) throw new HttpError(404, 'not_found');
    const doc = await MachineKey.findOne({ _id: req.params.kid, machine_id: machine._id });
    if (!doc) throw new HttpError(404, 'not_found');
    if (!doc.revoked_at) {
      doc.revoked_at = new Date();
      await doc.save();
      await audit(req, { action: 'key.revoke', tenant_id: machine.tenant_id, machine_id: machine._id,
        target: `key:${doc._id}`, before: { prefix: doc.prefix } });
    }
    res.json({ machine_key: keyView(doc) });
  });

  return router;
}
