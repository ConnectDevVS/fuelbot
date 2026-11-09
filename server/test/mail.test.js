import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadSettings } from '../src/settings.js';
import { MailError, codeMail, createMailer } from '../src/services/mail.js';

const MESSAGE = { to: 'desk@example.com', subject: 'Your FuelBot code: ABC234', text: 'code ABC234', html: '<p>ABC234</p>' };

describe('mail', () => {
  let dir;
  let logged;
  const originals = {};
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fuelbot-mail-'));
    logged = [];
    for (const name of ['log', 'info', 'warn', 'error']) {
      originals[name] = console[name];
      console[name] = (...args) => logged.push(args.join(' '));
    }
  });
  afterEach(() => {
    Object.assign(console, originals);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('file transport writes an .eml', async () => {
    const mailer = createMailer(loadSettings({ MAIL_DIR: dir }).mail);
    await mailer.send(MESSAGE);
    const files = fs.readdirSync(dir);
    assert.equal(files.length, 1);
    assert.match(files[0], /\.eml$/);
    const eml = fs.readFileSync(path.join(dir, files[0]), 'utf8');
    assert.match(eml, /To: desk@example\.com/);
    assert.match(eml, /Subject: Your FuelBot code: ABC234/);
    assert.deepEqual(logged, []);
  });

  it('memory transport collects, and fails when told to', async () => {
    const mailer = createMailer(loadSettings({ MAIL_TRANSPORT: 'memory' }).mail);
    await mailer.send(MESSAGE);
    assert.equal(mailer.sent.length, 1);
    assert.equal(mailer.sent[0].to, 'desk@example.com');
    mailer.fail = true;
    await assert.rejects(mailer.send(MESSAGE), MailError);
    assert.equal(mailer.sent.length, 1);
  });

  it('the code mail has both parts, the code, the expiry in the display zone and the dashboard URL', () => {
    const settings = loadSettings({ PUBLIC_URL: 'https://fuelbot.example', DISPLAY_TZ: 'Asia/Kolkata' });
    const expiresAt = new Date('2026-11-09T09:02:00Z');   // 14:32 in Kolkata
    for (const purpose of ['welcome', 'reset_by_admin', 'forgot', 'requested']) {
      const mail = codeMail({ code: 'ABC234', expiresAt, purpose, settings });
      assert.equal(mail.subject, 'Your FuelBot code: ABC234');
      for (const part of [mail.text, mail.html]) {
        assert.ok(part.includes('ABC234'), purpose);
        assert.ok(part.includes('until 14:32'), purpose);
        assert.ok(part.includes('https://fuelbot.example/dashboard/'), purpose);
      }
      assert.doesNotMatch(mail.text, /password:/i);
    }
    assert.throws(() => codeMail({ code: 'ABC234', expiresAt, purpose: 'other', settings }), /unknown purpose/);
  });

  it('send failure throws MailError without the address or body', async () => {
    // Nothing listens on port 9 of localhost: the connection is refused at once.
    const mail = { ...loadSettings({}).mail, transport: 'smtp', host: '127.0.0.1', port: 9, user: 'u', pass: 'p', from: 'f@example.com' };
    const err = await createMailer(mail).send(MESSAGE).catch((e) => e);
    assert.ok(err instanceof MailError);
    assert.equal(err.code, 'ESOCKET');
    assert.ok(!err.message.includes('desk@example.com') && !err.message.includes('ABC234'));
    assert.deepEqual(logged, []);
  });
});
