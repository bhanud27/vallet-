const base = require('./app.json');
module.exports = () => {
  const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';
  let role = '';
  try {
    role = JSON.parse(Buffer.from(key.split('.')[1] || '', 'base64url').toString()).role || '';
  } catch {}
  if (role === 'service_role' || key.startsWith('sb_secret_'))
    throw new Error('A server-only Supabase key cannot be bundled into the app.');
  for (const name of Object.keys(process.env))
    if (
      /^EXPO_PUBLIC_.*(SERVICE_ROLE|PRIVATE_KEY|SECRET_KEY|ADMIN_KEY)/.test(name) &&
      process.env[name]
    )
      throw new Error('Remove server credentials from public build variables.');
  if (process.env.APP_ENV === 'production') {
    if (!/^https:\/\//.test(process.env.EXPO_PUBLIC_SUPABASE_URL || '') || key.length <= 20)
      throw new Error('Production builds require a connected Supabase project.');
    if (!/^https:\/\//.test(process.env.EXPO_PUBLIC_WEB_URL || ''))
      throw new Error('Production builds require an HTTPS public web URL.');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(process.env.EXPO_PUBLIC_SUPPORT_EMAIL || ''))
      throw new Error('Configure a real public support email before production.');
    if (!process.env.EXPO_PUBLIC_TURNSTILE_SITE_KEY)
      throw new Error('Configure human verification before a production build.');
  }
  return { ...base.expo, runtimeVersion: { policy: 'appVersion' } };
};
