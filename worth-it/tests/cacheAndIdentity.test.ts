import test from 'node:test';
import assert from 'node:assert/strict';
import { createQueryCache } from '../src/lib/queryCache';
import { parseProductUrl } from '../src/lib/validation';
test('cache expires and evicts while keeping account keys separate', () => {
  let time = 0;
  const cache = createQueryCache<string>(2, () => time);
  cache.set('a', 'private A', 10);
  cache.set('b', 'private B', 20);
  assert.equal(cache.get('a'), 'private A');
  time = 11;
  assert.equal(cache.get('a'), undefined);
  cache.set('c', 'C');
  cache.set('d', 'D');
  assert.equal(cache.get('b'), undefined);
  cache.clear();
  assert.equal(cache.get('d'), undefined);
});
test('tracking parameters disappear while product variants remain distinct', () => {
  assert.equal(
    parseProductUrl('https://brand.example/shirt?variant=blue&utm_source=share&fbclid=abc'),
    'https://brand.example/shirt?variant=blue',
  );
  assert.notEqual(
    parseProductUrl('https://brand.example/shirt?variant=blue'),
    parseProductUrl('https://brand.example/shirt?variant=red'),
  );
  assert.equal(parseProductUrl('https://name:password@brand.example/shirt'), null);
});
