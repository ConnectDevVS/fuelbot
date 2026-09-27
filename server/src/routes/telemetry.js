// Platform-only operational data (plan §4.7, §4.9): /telemetry and the /faults log.
import express from 'express';
import { TelemetryEvent } from '../models/index.js';
import { guard } from '../auth/rbac.js';
import { recordPage, scopedFilter } from '../services/records.js';
import { BRIDGE_DOWN, HEALTH_EVENTS } from '../services/health.js';

export function recordView(r) {
  const { _id, __v, ...rest } = r;
  return { id: String(_id), ...rest };
}

export function telemetryRouter() {
  const router = express.Router();
  router.use(guard('telemetry:read'));

  router.get('/', async (req, res) => {
    const filter = scopedFilter(req.user, req.query);
    if (typeof req.query.type === 'string' && req.query.type) filter.event_type = req.query.type;
    if (typeof req.query.order_id === 'string' && req.query.order_id) filter.order_id = req.query.order_id;
    res.json(await recordPage(TelemetryEvent, filter, req.query, recordView));
  });

  return router;
}

/**
 * Fault intervals from health events in client-time order (stories/read-apis decision 7):
 * [{tenant_id, machine_id, code, from, to (null while open), duration_sec (null while open)}].
 */
export function faultIntervals(events) {
  const open = new Map();   // machine_id → Map(code → interval)
  const out = [];
  const openCode = (e, code) => {
    const mine = open.get(e.machine_id) ?? new Map();
    open.set(e.machine_id, mine);
    if (!mine.has(code)) mine.set(code, { tenant_id: e.tenant_id, machine_id: e.machine_id, code, from: e.ts, to: null });
  };
  const close = (e, code) => {
    const interval = open.get(e.machine_id)?.get(code);
    if (!interval) return;
    interval.to = e.ts;
    out.push(interval);
    open.get(e.machine_id).delete(code);
  };
  for (const e of events) {
    if (e.event_type === 'machine_fault' && e.fault) openCode(e, e.fault);
    else if (e.event_type === 'bridge_down') openCode(e, BRIDGE_DOWN);
    else if (e.event_type === 'bridge_up') close(e, BRIDGE_DOWN);
    else if (e.event_type === 'machine_ok') {
      const codes = e.cleared ? [e.cleared] : [...(open.get(e.machine_id)?.keys() ?? [])].filter((c) => c !== BRIDGE_DOWN);
      for (const code of codes) close(e, code);
    }
  }
  for (const mine of open.values()) out.push(...mine.values());
  return out
    .map((i) => ({ ...i, duration_sec: i.to ? Math.round((i.to - i.from) / 1000) : null }))
    .sort((a, b) => b.from - a.from);
}

export function faultsRouter() {
  const router = express.Router();
  router.use(guard('faults:read'));

  router.get('/', async (req, res) => {
    const { ts, ...filter } = scopedFilter(req.user, req.query);
    const events = await TelemetryEvent.find({ ...filter, event_type: { $in: HEALTH_EVENTS },
      ...(ts?.$lt ? { ts: { $lt: ts.$lt } } : {}) }).sort({ ts: 1, _id: 1 }).lean();
    let items = faultIntervals(events);
    if (ts?.$gte) items = items.filter((i) => i.to === null || i.to >= ts.$gte);
    res.json({ items });
  });

  return router;
}
