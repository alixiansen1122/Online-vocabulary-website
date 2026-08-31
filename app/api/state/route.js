import { getAppUser } from "../../app-auth.js";
import { ensureDatabase, getBooksBucket, getD1, resultRows } from "../../../db/runtime.js";

export const dynamic = "force-dynamic";

const MAX_STATE_BYTES = 4 * 1024 * 1024;
const MAX_BOOK_BYTES = 12 * 1024 * 1024;
const MAX_BOOKS = 30;
const MAX_REQUEST_BYTES = 32 * 1024 * 1024;

function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function cleanStrings(value, limit = 10000) {
  if (!Array.isArray(value)) return [];
  return value.filter((item) => typeof item === "string").slice(0, limit);
}

function sanitizeState(value) {
  if (!isRecord(value)) throw new Error("同步数据格式不正确");
  return {
    favorites: cleanStrings(value.favorites),
    viewed: isRecord(value.viewed) ? value.viewed : {},
    notes: isRecord(value.notes) ? value.notes : {},
    customBooks: Array.isArray(value.customBooks) ? value.customBooks.slice(0, MAX_BOOKS) : [],
    meaningsHidden: value.meaningsHidden !== false,
    spellingSeparated: value.spellingSeparated !== false,
    accent: value.accent === "uk" ? "uk" : "us",
    activeBookId: typeof value.activeBookId === "string" ? value.activeBookId : "main",
    searchHistory: cleanStrings(value.searchHistory, 30),
    shortcutKeys: isRecord(value.shortcutKeys) ? value.shortcutKeys : {},
  };
}

function safeParseState(value) {
  try {
    return sanitizeState(JSON.parse(value));
  } catch {
    return sanitizeState({});
  }
}

function bookWordCount(book) {
  if (Number.isFinite(book?.declaredTotal)) return Math.max(0, Math.round(book.declaredTotal));
  if (!Array.isArray(book?.chapters)) return 0;
  return book.chapters.reduce((total, chapter) => total + (Array.isArray(chapter?.words) ? chapter.words.length : 0), 0);
}

function normalizeBook(book) {
  if (!isRecord(book) || typeof book.id !== "string" || !book.id.trim()) throw new Error("自定义词书缺少有效编号");
  if (!Array.isArray(book.chapters)) throw new Error("自定义词书内容不完整");
  const serialized = JSON.stringify(book);
  if (new TextEncoder().encode(serialized).byteLength > MAX_BOOK_BYTES) throw new Error(`词书“${book.title || book.id}”过大`);
  return { book, serialized };
}

async function upsertProfile(db, user) {
  await db.prepare(`INSERT INTO profiles (user_id, email, display_name)
    VALUES (?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      email = excluded.email,
      display_name = excluded.display_name,
      updated_at = CURRENT_TIMESTAMP`)
    .bind(user.userId, user.email.toLowerCase(), user.displayName)
    .run();
}

export async function GET() {
  const user = await getAppUser();
  if (!user) return json({ error: "请先使用 ChatGPT 登录" }, 401);

  await ensureDatabase();
  const db = getD1();
  await upsertProfile(db, user);

  const stateRow = await db.prepare("SELECT state_json, version, updated_at FROM user_states WHERE user_id = ?")
    .bind(user.userId)
    .first();
  const metadata = resultRows(await db.prepare(`SELECT id, object_key
    FROM custom_books WHERE user_id = ? ORDER BY updated_at`).bind(user.userId).all());

  const bucket = getBooksBucket();
  const customBooks = (await Promise.all(metadata.map(async (item) => {
    try {
      const object = await bucket.get(item.object_key);
      return object ? JSON.parse(await object.text()) : null;
    } catch {
      return null;
    }
  }))).filter(Boolean);

  const state = stateRow ? safeParseState(stateRow.state_json) : null;
  if (state) state.customBooks = customBooks;

  return json({
    hasState: Boolean(stateRow),
    state,
    version: Number(stateRow?.version || 0),
    updatedAt: stateRow?.updated_at || null,
    user: {
      displayName: user.displayName,
      email: user.email,
    },
  });
}

export async function PUT(request) {
  const user = await getAppUser();
  if (!user) return json({ error: "请先使用 ChatGPT 登录" }, 401);

  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_REQUEST_BYTES) {
    return json({ error: "同步数据过大" }, 413);
  }

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    return json({ error: "同步数据格式不正确" }, 400);
  }

  const syncBooks = payload?.syncBooks === true;
  let state;
  try {
    state = sanitizeState({
      ...payload?.state,
      customBooks: syncBooks ? payload?.customBooks : [],
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "同步数据格式不正确" }, 400);
  }

  await ensureDatabase();
  const db = getD1();
  const bucket = getBooksBucket();
  const existingBooks = syncBooks
    ? resultRows(await db.prepare("SELECT id, object_key FROM custom_books WHERE user_id = ?").bind(user.userId).all())
    : [];
  const existingById = new Map(existingBooks.map((item) => [item.id, item]));
  const incomingIds = new Set();
  const bookStatements = [];

  try {
    for (const candidate of state.customBooks) {
      const { book, serialized } = normalizeBook(candidate);
      const id = book.id.trim().slice(0, 200);
      const objectKey = `users/${encodeURIComponent(user.userId)}/books/${encodeURIComponent(id)}.json`;
      incomingIds.add(id);
      await bucket.put(objectKey, serialized, { httpMetadata: { contentType: "application/json;charset=utf-8" } });
      bookStatements.push(db.prepare(`INSERT INTO custom_books (user_id, id, title, word_count, object_key)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(user_id, id) DO UPDATE SET
          title = excluded.title,
          word_count = excluded.word_count,
          object_key = excluded.object_key,
          updated_at = CURRENT_TIMESTAMP`)
        .bind(user.userId, id, String(book.title || "导入词书").slice(0, 200), bookWordCount(book), objectKey));
    }
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "自定义词书上传失败" }, 400);
  }

  for (const [id, metadata] of existingById) {
    if (incomingIds.has(id)) continue;
    await bucket.delete(metadata.object_key);
    bookStatements.push(db.prepare("DELETE FROM custom_books WHERE user_id = ? AND id = ?").bind(user.userId, id));
  }

  const stateWithoutBooks = { ...state, customBooks: [] };
  const stateJson = JSON.stringify(stateWithoutBooks);
  if (new TextEncoder().encode(stateJson).byteLength > MAX_STATE_BYTES) return json({ error: "学习数据过大" }, 413);

  const current = await db.prepare("SELECT version FROM user_states WHERE user_id = ?").bind(user.userId).first();
  const nextVersion = Number(current?.version || 0) + 1;
  const statements = [
    db.prepare(`INSERT INTO profiles (user_id, email, display_name)
      VALUES (?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        email = excluded.email,
        display_name = excluded.display_name,
        updated_at = CURRENT_TIMESTAMP`)
      .bind(user.userId, user.email.toLowerCase(), user.displayName),
    db.prepare(`INSERT INTO user_states (user_id, state_json, version)
      VALUES (?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        state_json = excluded.state_json,
        version = excluded.version,
        updated_at = CURRENT_TIMESTAMP`)
      .bind(user.userId, stateJson, nextVersion),
    ...bookStatements,
  ];
  await db.batch(statements);

  return json({ saved: true, version: nextVersion, savedAt: new Date().toISOString() });
}
