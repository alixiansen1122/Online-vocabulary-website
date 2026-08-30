import { env } from "cloudflare:workers";

let ready = null;

export function getD1() {
  if (!env.DB) throw new Error("云端数据库暂时不可用");
  return env.DB;
}

export function getBooksBucket() {
  if (!env.BOOKS) throw new Error("云端词书存储暂时不可用");
  return env.BOOKS;
}

export async function ensureDatabase() {
  if (!ready) {
    ready = createSchema().catch((error) => {
      ready = null;
      throw error;
    });
  }
  return ready;
}

async function createSchema() {
  const db = getD1();
  const statements = [
    `CREATE TABLE IF NOT EXISTS profiles (
      user_id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      display_name TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS user_states (
      user_id TEXT PRIMARY KEY,
      state_json TEXT NOT NULL DEFAULT '{}',
      version INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS custom_books (
      user_id TEXT NOT NULL,
      id TEXT NOT NULL,
      title TEXT NOT NULL,
      word_count INTEGER NOT NULL DEFAULT 0,
      object_key TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY(user_id, id)
    )`,
    "CREATE INDEX IF NOT EXISTS idx_custom_books_user_updated ON custom_books(user_id, updated_at)",
  ];
  await db.batch(statements.map((statement) => db.prepare(statement)));
}

export function resultRows(result) {
  return result?.results || [];
}
