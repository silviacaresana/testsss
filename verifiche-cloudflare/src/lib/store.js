// Accesso al database D1. Ogni operazione è una singola istruzione SQL, quindi
// atomica: non servono transazioni (D1 non le offre a livello di query singola).

import { newId } from "./text.js";
import { sumPoints } from "./validate.js";

const SUMMARY_COLUMNS =
  "id, title, subject, track, year, item_count, total_points, revision, created_by, created_at, updated_at";

function toSummary(row) {
  return {
    id: row.id,
    title: row.title,
    subject: row.subject,
    track: row.track,
    year: row.year,
    itemCount: row.item_count,
    totalPoints: row.total_points,
    revision: row.revision,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listTests(db) {
  const { results } = await db
    .prepare(`SELECT ${SUMMARY_COLUMNS} FROM tests ORDER BY updated_at DESC LIMIT 500`)
    .all();
  return results.map(toSummary);
}

export async function getTest(db, id) {
  const row = await db.prepare(`SELECT ${SUMMARY_COLUMNS}, body FROM tests WHERE id = ?`).bind(id).first();
  if (!row) return null;
  return { ...toSummary(row), test: JSON.parse(row.body) };
}

export async function createTest(db, test, createdBy) {
  const id = newId();
  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO tests (id, title, subject, track, year, item_count, total_points, revision, body, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`,
    )
    .bind(id, test.title, test.subject, test.track, test.year, test.items.length, sumPoints(test), JSON.stringify(test), createdBy ?? null, now, now)
    .run();
  return getTest(db, id);
}

/**
 * Aggiorna solo se la revisione coincide con quella che il browser aveva letto.
 * @returns {Promise<{status: "ok", record: object} | {status: "conflict", record: object} | {status: "missing"}>}
 */
export async function updateTest(db, id, expectedRevision, test) {
  const now = new Date().toISOString();
  const result = await db
    .prepare(
      `UPDATE tests
         SET title = ?, subject = ?, track = ?, year = ?, item_count = ?, total_points = ?,
             body = ?, revision = revision + 1, updated_at = ?
       WHERE id = ? AND revision = ?`,
    )
    .bind(test.title, test.subject, test.track, test.year, test.items.length, sumPoints(test), JSON.stringify(test), now, id, expectedRevision)
    .run();
  const record = await getTest(db, id);
  if (!record) return { status: "missing" };
  return result.meta.changes === 1 ? { status: "ok", record } : { status: "conflict", record };
}

export async function deleteTest(db, id) {
  const result = await db.prepare("DELETE FROM tests WHERE id = ?").bind(id).run();
  return result.meta.changes === 1;
}
