export function normalizePersonName(value: unknown) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function namesEqual(left: unknown, right: unknown) {
  const a = normalizePersonName(left);
  const b = normalizePersonName(right);
  return Boolean(a && b && a === b);
}
