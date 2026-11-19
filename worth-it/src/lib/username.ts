export const USERNAME_MAX = 40;
export const USERNAME_HINT = '3–40 letters, numbers, or underscores.';
export const USERNAME_TAKEN = 'That username is already taken. Choose another.';

export function normalizeUsername(value: string) {
  return value.trim().toLowerCase();
}

export function isUsername(value: string) {
  return /^[a-z0-9_]{3,40}$/.test(value);
}
