import { getAppUser } from "../../app-auth.js";
import { ensureDatabase, getD1, resultRows } from "../../../db/runtime.js";
import { calculateStreaks, chinaDateKey, summarizeDays } from "../../../src/studyStats.js";

export const dynamic = "force-dynamic";

const EVENT_TYPES = new Set(["word_viewed", "spelling_attempt"]);
const MAX_EVENTS = 200;
const MAX_REQUEST_BYTES = 512 * 1024;

function json(data, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

function textValue(value, length) {
  return typeof value === "string" ? value.trim().slice(0, length) : "";
}

function normalizeEvent(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const id = textValue(value.id, 240);
  const eventType = textValue(value.type, 40);
  const wordId = textValue(value.wordId, 200);
  if (!id || !EVENT_TYPES.has(eventType) || !wordId) return null;

  const now = Date.now();
  const candidate = Number(value.occurredAt);
  const earliest = Date.UTC(2000, 0, 1);
  const occurredAt = Number.isFinite(candidate) && candidate >= earliest && candidate <= now + 86_400_000
    ? Math.round(candidate)
    : now;
  return {
    id,
    eventType,
    eventDate: chinaDateKey(occurredAt),
    occurredAt,
    wordId,
    wordTerm: textValue(value.wordTerm, 160),
    bookId: textValue(value.bookId, 200),
    bookTitle: textValue(value.bookTitle, 200),
    correct: eventType === "spelling_attempt" && value.correct === true ? 1 : 0,
    firstTry: eventType === "spelling_attempt" && value.firstTry === true ? 1 : 0,
    review: eventType === "spelling_attempt" && value.review === true ? 1 : 0,
  };
}

function integer(value) {
  return Number(value || 0);
}

export async function GET(request) {
  const user = await getAppUser();
  if (!user) return json({ error: "请先使用 ChatGPT 登录" }, 401);

  const currentYear = Number(chinaDateKey().slice(0, 4));
  const requestedYear = Number(new URL(request.url).searchParams.get("year"));
  const year = Number.isInteger(requestedYear) && requestedYear >= 2000 && requestedYear <= currentYear
    ? requestedYear
    : currentYear;

  await ensureDatabase();
  const db = getD1();
  const prefix = `${year}-%`;
  const [dayResult, dateResult, yearResult, bookResult] = await Promise.all([
    db.prepare(`SELECT event_date AS date,
      COUNT(DISTINCT CASE WHEN event_type = 'word_viewed' THEN word_id END) AS word_views,
      SUM(CASE WHEN event_type = 'spelling_attempt' THEN 1 ELSE 0 END) AS spelling_attempts,
      SUM(CASE WHEN event_type = 'spelling_attempt' AND correct = 1 THEN 1 ELSE 0 END) AS correct,
      SUM(CASE WHEN event_type = 'spelling_attempt' AND correct = 0 THEN 1 ELSE 0 END) AS wrong,
      SUM(CASE WHEN event_type = 'spelling_attempt' AND correct = 1 AND first_try = 1 THEN 1 ELSE 0 END) AS first_try_correct,
      SUM(CASE WHEN event_type = 'spelling_attempt' AND correct = 1 AND first_try = 0 THEN 1 ELSE 0 END) AS retry_correct,
      SUM(CASE WHEN event_type = 'spelling_attempt' AND review = 1 THEN 1 ELSE 0 END) AS review_attempts,
      SUM(CASE WHEN event_type = 'spelling_attempt' AND review = 1 AND correct = 1 THEN 1 ELSE 0 END) AS review_correct
      FROM study_events WHERE user_id = ? AND event_date LIKE ?
      GROUP BY event_date ORDER BY event_date`).bind(user.userId, prefix).all(),
    db.prepare("SELECT DISTINCT event_date AS date FROM study_events WHERE user_id = ? ORDER BY event_date")
      .bind(user.userId).all(),
    db.prepare("SELECT DISTINCT CAST(substr(event_date, 1, 4) AS INTEGER) AS year FROM study_events WHERE user_id = ? ORDER BY year DESC")
      .bind(user.userId).all(),
    db.prepare(`SELECT book_id, MAX(book_title) AS book_title,
      COUNT(DISTINCT event_date) AS active_days,
      COUNT(DISTINCT CASE WHEN event_type = 'word_viewed' THEN word_id END) AS words,
      SUM(CASE WHEN event_type = 'spelling_attempt' THEN 1 ELSE 0 END) AS spelling_attempts,
      SUM(CASE WHEN event_type = 'spelling_attempt' AND correct = 1 THEN 1 ELSE 0 END) AS correct
      FROM study_events WHERE user_id = ? AND event_date LIKE ?
      GROUP BY book_id ORDER BY words DESC, spelling_attempts DESC LIMIT 20`).bind(user.userId, prefix).all(),
  ]);

  const days = resultRows(dayResult).map((row) => ({
    date: row.date,
    wordViews: integer(row.word_views),
    spellingAttempts: integer(row.spelling_attempts),
    correct: integer(row.correct),
    wrong: integer(row.wrong),
    firstTryCorrect: integer(row.first_try_correct),
    retryCorrect: integer(row.retry_correct),
    reviewAttempts: integer(row.review_attempts),
    reviewCorrect: integer(row.review_correct),
  }));
  const activeDates = resultRows(dateResult).map((row) => row.date);
  const streaks = calculateStreaks(activeDates);
  const years = Array.from(new Set([currentYear, year, ...resultRows(yearResult).map((row) => integer(row.year))]))
    .filter(Boolean).sort((a, b) => b - a);
  const books = resultRows(bookResult).map((row) => ({
    id: row.book_id || "unknown",
    title: row.book_title || "未分类词书",
    activeDays: integer(row.active_days),
    words: integer(row.words),
    spellingAttempts: integer(row.spelling_attempts),
    correct: integer(row.correct),
  }));

  return json({
    year,
    years,
    days,
    yearTotals: summarizeDays(days),
    activity: { ...streaks, firstDate: activeDates[0] || null, lastDate: activeDates.at(-1) || null },
    books,
  });
}

export async function POST(request) {
  const user = await getAppUser();
  if (!user) return json({ error: "请先使用 ChatGPT 登录" }, 401);

  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_REQUEST_BYTES) return json({ error: "统计数据过大" }, 413);
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    return json({ error: "统计数据格式不正确" }, 400);
  }
  if (!Array.isArray(payload?.events) || payload.events.length > MAX_EVENTS) {
    return json({ error: `每次最多提交 ${MAX_EVENTS} 条学习记录` }, 400);
  }
  const events = payload.events.map(normalizeEvent).filter(Boolean);
  if (events.length !== payload.events.length) return json({ error: "包含无效的学习记录" }, 400);
  if (!events.length) return json({ saved: true, accepted: 0 });

  await ensureDatabase();
  const db = getD1();
  const results = await db.batch(events.map((event) => db.prepare(`INSERT INTO study_events (
    user_id, id, event_type, event_date, occurred_at, word_id, word_term, book_id, book_title, correct, first_try, review
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(user_id, id) DO NOTHING`).bind(
    user.userId, event.id, event.eventType, event.eventDate, event.occurredAt, event.wordId,
    event.wordTerm, event.bookId, event.bookTitle, event.correct, event.firstTry, event.review,
  )));
  const inserted = results.reduce((total, result) => total + integer(result?.meta?.changes), 0);
  return json({ saved: true, accepted: events.length, inserted });
}
