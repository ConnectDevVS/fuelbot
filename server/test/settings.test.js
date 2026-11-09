import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadSettings } from '../src/settings.js';

const KEY = Buffer.alloc(32, 7).toString('base64');
const SMTP = { SMTP_USER: 'fuelbot@gmail.com', SMTP_PASS: 'app password', MAIL_FROM: 'FuelBot <fuelbot@gmail.com>' };
const PROD = { NODE_ENV: 'production', JWT_SECRET: 's', CODE_ENCRYPTION_KEY: KEY, ...SMTP };

describe('settings: codes and mail', () => {
  it('production needs CODE_ENCRYPTION_KEY', () => {
    assert.throws(() => loadSettings({ ...PROD, CODE_ENCRYPTION_KEY: '' }), /CODE_ENCRYPTION_KEY is required/);
  });

  it('CODE_ENCRYPTION_KEY must be 32 bytes of base64', () => {
    for (const bad of ['short', Buffer.alloc(16).toString('base64'), `${KEY}!`]) {
      assert.throws(() => loadSettings({ CODE_ENCRYPTION_KEY: bad }), /32 bytes/, bad);
    }
    assert.deepEqual(loadSettings({ CODE_ENCRYPTION_KEY: KEY }).codeKey, Buffer.alloc(32, 7));
  });

  it('dev gets a random key and the file transport', () => {
    const a = loadSettings({});
    assert.equal(a.codeKey.length, 32);
    assert.notDeepEqual(a.codeKey, loadSettings({}).codeKey);
    assert.equal(a.mail.transport, 'file');
    assert.match(a.mail.dir, /server\/\.mail\/?$/);
  });

  it('production sends by smtp only', () => {
    assert.equal(loadSettings(PROD).mail.transport, 'smtp');
    for (const transport of ['file', 'memory']) {
      assert.throws(() => loadSettings({ ...PROD, MAIL_TRANSPORT: transport }), /MAIL_TRANSPORT must be smtp/);
    }
  });

  it('smtp needs a user, an app password and a sender', () => {
    for (const missing of Object.keys(SMTP)) {
      assert.throws(() => loadSettings({ ...SMTP, MAIL_TRANSPORT: 'smtp', [missing]: '' }), /SMTP_USER, SMTP_PASS and MAIL_FROM/);
    }
    const { mail } = loadSettings({ ...SMTP, MAIL_TRANSPORT: 'smtp' });
    assert.equal(mail.host, 'smtp.gmail.com');
    assert.equal(mail.port, 465);
  });

  it('an unknown transport throws', () => {
    assert.throws(() => loadSettings({ MAIL_TRANSPORT: 'pigeon' }), /MAIL_TRANSPORT must be one of/);
  });
});
