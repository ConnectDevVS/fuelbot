import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { makeUser, startServer } from './helpers.js';
import { User } from '../src/models/index.js';
import {
  CODE_ALPHABET, CODE_TTL_MS, MAX_ATTEMPTS, checkCode, clearCode, decryptCode, generateCode, issueCode,
} from '../src/services/codes.js';

const later = (ms) => ({ now: new Date(Date.now() + ms) });
const invalid = (voided) => (e) => e.status === 400 && e.message === 'invalid_code' && e.voided === voided;

describe('codes', () => {
  let ctx;
  let settings;
  let user;
  before(async () => {
    ctx = await startServer();
    settings = ctx.settings;
  });
  after(() => ctx.stop());
  beforeEach(async () => {
    await ctx.reset();
    user = await makeUser({ email: 'desk@example.com', role: 'platform_admin' });
  });

  it('codes use the alphabet and are 6 long', () => {
    const pattern = new RegExp(`^[${CODE_ALPHABET}]{6}$`);
    for (let i = 0; i < 1000; i += 1) assert.match(generateCode(), pattern);
    assert.doesNotMatch(CODE_ALPHABET, /[OIL01]/);
  });

  it('a live code is reused with its expiry', async () => {
    const first = await issueCode(user._id, settings);
    const second = await issueCode(user._id, settings, later(29 * 60 * 1000));
    assert.equal(first.reused, false);
    assert.equal(second.reused, true);
    assert.equal(second.code, first.code);
    assert.equal(second.expiresAt.getTime(), first.expiresAt.getTime());
  });

  it('an expired code is replaced', async () => {
    const first = await issueCode(user._id, settings);
    const second = await issueCode(user._id, settings, later(CODE_TTL_MS + 60 * 1000));
    assert.equal(second.reused, false);
    assert.notEqual(second.code, first.code);
    await assert.rejects(checkCode(user._id, first.code, settings, later(CODE_TTL_MS + 61 * 1000)), invalid(false));
  });

  it('parallel issues give one code', async () => {
    const results = await Promise.all(Array.from({ length: 5 }, () => issueCode(user._id, settings)));
    assert.equal(new Set(results.map((r) => r.code)).size, 1);
    assert.equal(results.filter((r) => !r.reused).length, 1);
  });

  it('the stored code is encrypted', async () => {
    const { code } = await issueCode(user._id, settings);
    const raw = await User.collection.findOne({ _id: user._id });
    assert.ok(!JSON.stringify(raw).includes(code));
    assert.equal(decryptCode(raw.email_code.enc, settings.codeKey), code);
    assert.equal(decryptCode(raw.email_code.enc, crypto.randomBytes(32)), null);
  });

  it('the code is not loaded with the user unless asked for', async () => {
    await issueCode(user._id, settings);
    assert.equal((await User.findById(user._id).lean()).email_code, undefined);
  });

  it('check accepts lower case and spaces', async () => {
    const { code } = await issueCode(user._id, settings);
    await checkCode(user._id, ` ${code.slice(0, 3).toLowerCase()} ${code.slice(3)} `, settings);
  });

  it('check rejects an expired code and a missing one', async () => {
    await assert.rejects(checkCode(user._id, 'ABC234', settings), invalid(false));
    const { code } = await issueCode(user._id, settings);
    await assert.rejects(checkCode(user._id, code, settings, later(CODE_TTL_MS + 1000)), invalid(false));
    await assert.rejects(checkCode(user._id, undefined, settings), invalid(false));
  });

  it('five wrong attempts void the code', async () => {
    const { code } = await issueCode(user._id, settings);
    const wrong = code === 'AAAAAA' ? 'BBBBBB' : 'AAAAAA';
    for (let i = 1; i < MAX_ATTEMPTS; i += 1) await assert.rejects(checkCode(user._id, wrong, settings), invalid(false));
    await assert.rejects(checkCode(user._id, wrong, settings), invalid(true));
    await assert.rejects(checkCode(user._id, code, settings), invalid(false));
    assert.equal((await User.findById(user._id).select('+email_code').lean()).email_code, null);
    const fresh = await issueCode(user._id, settings);
    assert.equal(fresh.reused, false);
  });

  it('parallel wrong attempts never allow more than five', async () => {
    const { code } = await issueCode(user._id, settings);
    const wrong = code === 'AAAAAA' ? 'BBBBBB' : 'AAAAAA';
    await Promise.allSettled(Array.from({ length: 12 }, () => checkCode(user._id, wrong, settings)));
    await assert.rejects(checkCode(user._id, code, settings), invalid(false));
  });

  it('clearCode removes it', async () => {
    const { code } = await issueCode(user._id, settings);
    await clearCode(user._id);
    await assert.rejects(checkCode(user._id, code, settings), invalid(false));
  });
});
