import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { routeTrash } from '../cloudflare/worker/reconciled/trash.js';

// Exercise the production deletion function with real SQL and disposable in-memory records.
const source = readFileSync(new URL('../cloudflare/worker/reconciled/index.js', import.meta.url), 'utf8');
const start = source.indexOf('async function deleteRecurringDefinition(');
const end = source.indexOf('__name(deleteRecurringDefinition', start);
assert(start >= 0 && end > start);
const refreshed = [];
const remove = new Function('getIstDateParts', 'recurringTemplateFromRow', 'nowIso',
  'currentMisWeekPeriod', 'misWeekForDate', 'refreshChecklistMisSnapshot',
  'activeTemplateIdsCache', source.slice(start, end) + '; return deleteRecurringDefinition;')(
  () => ({ dateStr: '2026-11-19' }),
  r => ({ category: r.category, title: r.title, description: r.description, assignedTo: r.assigned_to,
    assignedToName: r.assigned_to_name, department: r.department, frequency: r.frequency,
    dayOfWeek: null, dayOfMonth: null, timeOfDay: '10:00', metadata: JSON.parse(r.metadata_json),
    createdAt: r.created_at }),
  () => new Date().toISOString(), () => ({ weekStart: '2026-11-18' }),
  d => ({ weekStart: d }), async (_, row) => refreshed.push(row.due_date), null,
);
const sql = new DatabaseSync(':memory:');
sql.exec(`
  CREATE TABLE recurring_templates(id TEXT PRIMARY KEY,category,title,description,assigned_to,assigned_to_name,
    department,frequency,day_of_week,day_of_month,time_of_day,is_active,metadata_json,created_at,updated_at);
  CREATE TABLE tasks_current(task_id TEXT PRIMARY KEY,category,status,updated_at);
  CREATE TABLE recurring_period_rows(id TEXT PRIMARY KEY,template_id,category,title,description,assigned_to,
    assigned_to_name,department,due_date,period_key,period_end,status,is_deleted,deleted_at,created_at,updated_at);
  INSERT INTO recurring_templates VALUES ('t','Daily','test','test','u','User','Editor','Daily',
    NULL,NULL,NULL,1,'{}','2026-01-01',NULL);
`);
const insert = sql.prepare("INSERT INTO recurring_period_rows(id,template_id,due_date,period_key,status,is_deleted) VALUES (?,'t',?,?,?,?)");
for (const [id, date, status, deleted] of [
  ['before', '2026-11-10', 'Pending', 0],
  ['cutoff', '2026-11-11', 'Pending', 0],
  ['after-range', '2026-11-18', 'Pending', 0],
  ['future', '2026-12-02', 'Pending', 0],
  ['done', '2026-11-12', 'Completed', 0],
  ['verified', '2026-12-03', 'Verified', 0],
  ['independent', '2026-11-13', 'Pending', 1],
]) insert.run(id, date, date, status, deleted);
const DB = {
  prepare: q => ({ bind: (...args) => ({
    first: () => sql.prepare(q).get(...args),
    all: () => ({ results: sql.prepare(q).all(...args) }),
    run: () => ({ meta: sql.prepare(q).run(...args) }),
  }) }),
  async batch(statements) {
    sql.exec('BEGIN');
    try {
      const results = statements.map(s => s.run());
      sql.exec('COMMIT');
      return results;
    } catch (error) { sql.exec('ROLLBACK'); throw error; }
  },
};
const get = id => sql.prepare('SELECT * FROM recurring_period_rows WHERE id=?').get(id);
const result = await remove({ DB }, 't', '2026-11-11');
assert.equal(result.deletedPeriods, 3);
for (const id of ['cutoff', 'after-range', 'future']) assert.equal(get(id).is_deleted, 1);
for (const id of ['before', 'done', 'verified']) assert.equal(get(id).is_deleted, 0);
assert.equal(sql.prepare('SELECT is_active FROM recurring_templates').get().is_active, 0);
assert(refreshed.includes('2026-11-11'));
console.log('PASS: inclusive cutoff, future deletion, preserved earlier dates and Completed/Verified history');

const url = new URL('https://test/trash/restore');
const response = await routeTrash(new Request(url, {
  method: 'POST', body: JSON.stringify({ kind: 'recurring-whole', id: 't' }),
}), { DB }, url, { refreshChecklistMisSnapshot: async () => {}, invalidateTemplates: () => {} });
assert.equal(response.status, 200);
for (const id of ['cutoff', 'after-range', 'future']) assert.equal(get(id).is_deleted, 0);
assert.equal(get('independent').is_deleted, 1);
assert.equal(sql.prepare('SELECT is_active FROM recurring_templates').get().is_active, 1);
console.log('PASS: undo restores this deletion only');

await remove({ DB }, 't', '2026-10-28');
assert.equal(get('before').is_deleted, 1);
assert.equal(get('done').is_deleted, 0);
console.log('PASS: previous-month filter start honored');
sql.close();
