// Finto database D1 per lo sviluppo e i test, costruito su `node:sqlite` (Node 22.13 o successivo).
// Espone la stessa interfaccia che usa src/lib/store.js: prepare().bind().all()/first()/run().
// Serve solo in locale: su Cloudflare il binding «DB» è il vero D1.

import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

function statement(stmt, params = []) {
  return {
    bind(...values) {
      return statement(stmt, values);
    },
    async all() {
      return { results: stmt.all(...params), success: true, meta: {} };
    },
    async first() {
      return stmt.get(...params) ?? null;
    },
    async run() {
      const info = stmt.run(...params);
      return { success: true, meta: { changes: Number(info.changes), last_row_id: Number(info.lastInsertRowid) } };
    },
  };
}

/**
 * @param {string} file percorso del file SQLite, oppure ":memory:"
 * @param {string} [migrationsDir] cartella con i file .sql da applicare in ordine alfabetico
 */
export function createD1(file = ":memory:", migrationsDir) {
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  if (file !== ":memory:") db.exec("PRAGMA journal_mode = WAL");

  if (migrationsDir) {
    db.exec("CREATE TABLE IF NOT EXISTS _dev_migrations (name TEXT PRIMARY KEY)");
    const applied = new Set(db.prepare("SELECT name FROM _dev_migrations").all().map((row) => row.name));
    const files = fs.readdirSync(migrationsDir).filter((name) => name.endsWith(".sql")).sort();
    for (const name of files) {
      if (applied.has(name)) continue;
      db.exec(fs.readFileSync(path.join(migrationsDir, name), "utf8"));
      db.prepare("INSERT INTO _dev_migrations (name) VALUES (?)").run(name);
    }
  }

  return {
    prepare: (sql) => statement(db.prepare(sql)),
    close: () => db.close(),
  };
}
