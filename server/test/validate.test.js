import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { imageFileName, isValidImageUrl, validateAll, validateConfig } from '../src/catalog/validate.js';
import { mockConfig } from './helpers.js';

describe('validateConfig (the app rules)', () => {
  it('accepts the mock default catalog', () => {
    assert.deepEqual(validateAll(mockConfig('default')), []);
  });

  it('refuses invalid_duplicate_hopper with the app\'s text', () => {
    assert.deepEqual(validateConfig(mockConfig('invalid_duplicate_hopper')),
      ['chocolate: hopper 1 already used by guava']);
  });

  it('checks the top-level shape', () => {
    assert.deepEqual(validateConfig([]), ['config is not an object']);
    assert.deepEqual(validateConfig({ flavors: [] }), ['flavors must be a non-empty array']);
    const f = { id: 'a', name: 'A', hopper: 1, actual_price: 10, image: 'res://a.png', enabled: true };
    assert.deepEqual(validateConfig({ flavors: [f], bases: {}, tenant: 1, maintenance: { faults: 'x' } }),
      ['bases must be an array', 'tenant must be an object', 'maintenance.faults must be an array']);
  });

  it('checks every flavor field like the app', () => {
    const bad = {
      id: 'x', name: '', hopper: 7, actual_price: 0, offer_price: 0, image: 5, image_url: 'ftp://a/b.png',
      sold_out: 'no', badge: 3, nutrition: [],
    };
    assert.deepEqual(validateConfig({ flavors: [bad] }), [
      'x: name missing',
      'x: hopper must be a whole number 1-6',
      'x: actual_price must be > 0',
      'x: offer_price must be null or > 0',
      'x: image must be a string',
      'x: image_url must be https:// with a file name',
      'x: sold_out must be bool',
      'x: badge must be string or null',
      'x: nutrition must be an object',
    ]);
    assert.deepEqual(validateConfig({ flavors: [{ name: 'n', hopper: 1.5, actual_price: 1, image: 'i' }] }),
      ['flavor id missing', '?: hopper must be a whole number 1-6']);
    assert.deepEqual(validateConfig({ flavors: ['str'] }), ['flavor is not an object']);
  });

  it('only enabled flavors claim a hopper', () => {
    const f = (id, enabled) => ({ id, name: id, hopper: 2, actual_price: 1, image: 'i', enabled });
    assert.deepEqual(validateConfig({ flavors: [f('a', true), f('b', false), f('c', 1)] }), []);
  });
});

describe('server rules', () => {
  it('requires whole rupees and unique flavor ids', () => {
    const f = { id: 'a', name: 'A', hopper: 1, actual_price: 10.5, offer_price: 7.2, image: 'i', enabled: false };
    assert.deepEqual(validateAll({ flavors: [f, { ...f, hopper: 2 }] }), [
      'a: actual_price must be whole rupees', 'a: offer_price must be whole rupees',
      'a: actual_price must be whole rupees', 'a: offer_price must be whole rupees', 'a: flavor listed twice',
    ]);
  });
});

describe('image URLs (app rules)', () => {
  it('takes the file name, ignoring query and fragment', () => {
    assert.equal(imageFileName('https://s3/x/guava-1.png?X-Amz=1#f'), 'guava-1.png');
    assert.equal(imageFileName('https://s3/x/a%20b.png'), 'a b.png');
    assert.equal(imageFileName('https://s3'), '');
    assert.equal(imageFileName('https://s3/x/'), '');
    assert.equal(imageFileName('https://s3/x/.hidden'), '');
    assert.equal(imageFileName('no-scheme/a.png'), '');
  });

  it('allows https anywhere and http only on localhost', () => {
    assert.ok(isValidImageUrl('https://bucket.s3.amazonaws.com/t/p.png'));
    assert.ok(isValidImageUrl('http://127.0.0.1:8790/files/p.png'));
    assert.ok(isValidImageUrl('http://localhost/p.png'));
    assert.ok(!isValidImageUrl('http://example.com/p.png'));
    assert.ok(!isValidImageUrl('https:///p.png'));
    assert.ok(!isValidImageUrl('s3://b/p.png'));
  });
});
