export function normalizePersonName(value: unknown) {
  let s = String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');

  s = s.replace(/\b(sir|mam|ma'am|g|j|hr|ahl)\b/gi, '').trim().replace(/\s+/g, ' ');
  return s;
}

export function namesEqual(left: unknown, right: unknown) {
  const a = normalizePersonName(left);
  const b = normalizePersonName(right);
  return Boolean(a && b && a === b);
}

export const VINITT_PHONE_LAST10 = '9820188505';

export function isVinittUser(user?: { uid?: string | null; name?: string | null; waNumber?: string | null } | null): boolean {
  if (!user) return false;
  if (user.uid === 'user-vinitt') return true;
  const name = normalizePersonName(user.name);
  if (name === 'vinitt' || name === 'vinit') return true;
  const digits = String(user.waNumber ?? '').replace(/\D/g, '');
  if (digits.endsWith(VINITT_PHONE_LAST10)) return true;
  return false;
}
