export function normalizePersonName(value: unknown) {
  let s = String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');

  s = s.replace(/\b(sir|mam|ma'am|g|j|hr|ahl)\b/gi, '').trim().replace(/\s+/g, ' ');
  const first = s.split(' ')[0];
  return first || s;
}

export function namesEqual(left: unknown, right: unknown) {
  const a = normalizePersonName(left);
  const b = normalizePersonName(right);
  return Boolean(a && b && a === b);
}
