/**
 * Department normalization and deduplication utilities.
 * Handles mixed case issues (e.g. "digital marketing" vs "Digital Marketing").
 */

const KNOWN_ACRONYMS = new Set(['HR', 'CRM', 'MIS', 'FMS', 'SMP', 'IT', 'QA', 'PR']);

export function canonicalDepartment(dept?: string | null): string {
  if (!dept) return '';
  const trimmed = dept.trim();
  if (!trimmed) return '';
  return trimmed
    .split(/\s+/)
    .map(w => {
      const upper = w.toUpperCase();
      if (KNOWN_ACRONYMS.has(upper)) return upper;
      return w.length > 0 ? w[0].toUpperCase() + w.slice(1).toLowerCase() : '';
    })
    .join(' ');
}

export function deduplicateDepartments(rawList: (string | undefined | null)[]): string[] {
  const map = new Map<string, string>();
  for (const raw of rawList) {
    if (!raw) continue;
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const lower = trimmed.toLowerCase();
    if (!map.has(lower)) {
      map.set(lower, canonicalDepartment(trimmed));
    }
  }
  return Array.from(map.values()).sort((a, b) => a.localeCompare(b));
}

export function matchDepartment(deptA?: string | null, deptB?: string | null): boolean {
  if (!deptA || !deptB) return false;
  return deptA.trim().toLowerCase() === deptB.trim().toLowerCase();
}
