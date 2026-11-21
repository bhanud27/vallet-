import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const configure = require('../app.config.js');
test('build configuration rejects server credentials in public client variables', () => {
  const previous = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  try {
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'sb_secret_example_not_a_real_key';
    assert.throws(configure, /server-only/);
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY =
      'header.' +
      Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url') +
      '.example';
    assert.throws(configure, /server-only/);
  } finally {
    if (previous === undefined) delete process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
    else process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = previous;
  }
});
