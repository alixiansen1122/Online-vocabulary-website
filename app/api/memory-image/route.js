import { env } from "cloudflare:workers";
import { getAppUser } from "../../app-auth.js";
import { ensureDatabase, getBooksBucket, getD1 } from "../../../db/runtime.js";
import { buildMemoryImagePrompt, fallbackMemoryPlan, memoryImageCacheSource, normalizeMemoryWord, sanitizeMemoryPlan } from "../../../src/memoryImage.js";

export const dynamic = "force-dynamic";

const IMAGE_MODEL = "gpt-image-2.5-flare";
const PLAN_MODEL = "gpt-5.6-luna";
const DAILY_GENERATION_LIMIT = 20;
const MAX_REQUEST_BYTES = 16 * 1024;

function json(data, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

function hex(buffer) {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function fingerprintFor(word) {
  const bytes = new TextEncoder().encode(memoryImageCacheSource(word));
  return hex(await crypto.subtle.digest("SHA-256", bytes));
}

function wordFromSearchParams(params) {
  return normalizeMemoryWord({
    term: params.get("term"),
    pos: params.get("pos"),
    meaning: params.get("meaning"),
  });
}

async function findMemoryImage(db, fingerprint) {
  return db.prepare(`SELECT fingerprint, term, pos, meaning, image_key, scene_title,
    scene_description, explanation, memory_tip, model, created_at, updated_at
    FROM memory_images WHERE fingerprint = ?`).bind(fingerprint).first();
}

function publicMemoryImage(record) {
  if (!record) return null;
  return {
    fingerprint: record.fingerprint,
    term: record.term,
    pos: record.pos,
    meaning: record.meaning,
    sceneTitle: record.scene_title,
    sceneDescription: record.scene_description,
    explanation: record.explanation,
    memoryTip: record.memory_tip,
    model: record.model,
    createdAt: record.created_at,
    updatedAt: record.updated_at,
    imageUrl: `/api/memory-image/${record.fingerprint}?v=${encodeURIComponent(record.updated_at)}`,
  };
}

async function openAIRequest(path, body, apiKey) {
  const response = await fetch(`https://api.openai.com/v1/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error("OpenAI request failed");
    error.status = response.status;
    error.code = payload?.error?.code || "openai_error";
    throw error;
  }
  return payload;
}

function responseText(payload) {
  for (const item of payload?.output || []) {
    for (const content of item?.content || []) {
      if (content?.type === "output_text" && typeof content.text === "string") return content.text;
    }
  }
  return "";
}

async function createMemoryPlan(word, apiKey) {
  try {
    const payload = await openAIRequest("responses", {
      model: PLAN_MODEL,
      reasoning: { effort: "none" },
      max_output_tokens: 700,
      instructions: `你是英语词汇视觉记忆设计师。请针对用户提供的当前义项设计一个单场景记忆画面，并用简洁中文解释画面元素如何对应词义。抽象词可以使用直观隐喻，但不得改变义项。图片提示词用英文，禁止要求图片包含文字、字母、字幕、标签、标志或水印。`,
      input: `英文单词：${word.term}\n词性：${word.pos || "未标注"}\n当前中文义项：${word.meaning}`,
      text: {
        format: {
          type: "json_schema",
          name: "vocabulary_memory_scene",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              sceneTitle: { type: "string" },
              sceneDescription: { type: "string" },
              explanation: { type: "string" },
              memoryTip: { type: "string" },
              imagePrompt: { type: "string" },
            },
            required: ["sceneTitle", "sceneDescription", "explanation", "memoryTip", "imagePrompt"],
          },
        },
      },
    }, apiKey);
    return sanitizeMemoryPlan(JSON.parse(responseText(payload)), word);
  } catch {
    return fallbackMemoryPlan(word);
  }
}

function decodeBase64(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

async function reserveGeneration(db, userId) {
  const date = new Date().toISOString().slice(0, 10);
  const result = await db.prepare(`INSERT INTO memory_image_usage (user_id, usage_date, count)
    VALUES (?, ?, 1)
    ON CONFLICT(user_id, usage_date) DO UPDATE SET
      count = memory_image_usage.count + 1,
      updated_at = CURRENT_TIMESTAMP
    WHERE memory_image_usage.count < ?
    RETURNING count`).bind(userId, date, DAILY_GENERATION_LIMIT).first();
  return result ? { date, count: Number(result.count || 1) } : null;
}

async function releaseGeneration(db, userId, date) {
  await db.prepare(`UPDATE memory_image_usage SET count = MAX(count - 1, 0), updated_at = CURRENT_TIMESTAMP
    WHERE user_id = ? AND usage_date = ?`).bind(userId, date).run();
}

export async function GET(request) {
  const user = await getAppUser();
  if (!user) return json({ error: "请先使用 ChatGPT 登录" }, 401);
  const word = wordFromSearchParams(new URL(request.url).searchParams);
  if (!word) return json({ error: "单词或释义不完整" }, 400);
  await ensureDatabase();
  const db = getD1();
  const fingerprint = await fingerprintFor(word);
  return json({ image: publicMemoryImage(await findMemoryImage(db, fingerprint)) });
}

export async function POST(request) {
  const user = await getAppUser();
  if (!user) return json({ error: "请先使用 ChatGPT 登录" }, 401);
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_REQUEST_BYTES) return json({ error: "请求内容过大" }, 413);

  let payload;
  try { payload = JSON.parse(raw); } catch { return json({ error: "请求格式不正确" }, 400); }
  const word = normalizeMemoryWord(payload);
  if (!word) return json({ error: "单词或释义不完整" }, 400);

  await ensureDatabase();
  const db = getD1();
  const fingerprint = await fingerprintFor(word);
  const previous = await findMemoryImage(db, fingerprint);
  if (previous && payload.regenerate !== true) return json({ image: publicMemoryImage(previous), cached: true });

  const apiKey = String(env.OPENAI_API_KEY || "").trim();
  if (!apiKey) return json({ error: "记忆图生成功能尚未配置", code: "not_configured" }, 503);
  const reservation = await reserveGeneration(db, user.userId);
  if (!reservation) return json({ error: `今天已生成 ${DAILY_GENERATION_LIMIT} 张记忆图，请明天继续` }, 429);

  const bucket = getBooksBucket();
  let nextObjectKey;
  try {
    const plan = await createMemoryPlan(word, apiKey);
    const imageResult = await openAIRequest("images/generations", {
      model: IMAGE_MODEL,
      prompt: buildMemoryImagePrompt(word, plan),
      n: 1,
      size: "1024x1024",
      quality: "low",
      output_format: "webp",
      output_compression: 82,
      background: "opaque",
      moderation: "auto",
      user: user.userId.slice(0, 128),
    }, apiKey);
    const encoded = imageResult?.data?.[0]?.b64_json;
    if (typeof encoded !== "string" || !encoded) throw new Error("Image data missing");
    const bytes = decodeBase64(encoded);
    if (bytes.byteLength === 0 || bytes.byteLength > 12 * 1024 * 1024) throw new Error("Image size invalid");

    nextObjectKey = `memory-images/${fingerprint}/${Date.now()}.webp`;
    await bucket.put(nextObjectKey, bytes, { httpMetadata: { contentType: "image/webp" } });
    await db.prepare(`INSERT INTO memory_images (
      fingerprint, term, pos, meaning, image_key, scene_title, scene_description,
      explanation, memory_tip, created_by, model
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(fingerprint) DO UPDATE SET
      term = excluded.term,
      pos = excluded.pos,
      meaning = excluded.meaning,
      image_key = excluded.image_key,
      scene_title = excluded.scene_title,
      scene_description = excluded.scene_description,
      explanation = excluded.explanation,
      memory_tip = excluded.memory_tip,
      created_by = excluded.created_by,
      model = excluded.model,
      updated_at = CURRENT_TIMESTAMP`).bind(
        fingerprint, word.term, word.pos, word.meaning, nextObjectKey, plan.sceneTitle,
        plan.sceneDescription, plan.explanation, plan.memoryTip, user.userId, IMAGE_MODEL,
      ).run();
    if (previous?.image_key && previous.image_key !== nextObjectKey) await bucket.delete(previous.image_key);
    return json({ image: publicMemoryImage(await findMemoryImage(db, fingerprint)), cached: false }, previous ? 200 : 201);
  } catch (error) {
    if (nextObjectKey) await bucket.delete(nextObjectKey).catch(() => {});
    await releaseGeneration(db, user.userId, reservation.date).catch(() => {});
    if (error?.status === 401) return json({ error: "图片生成密钥无效，请检查站点配置" }, 503);
    if (error?.status === 429) return json({ error: "图片生成服务繁忙或额度不足，请稍后再试" }, 503);
    return json({ error: "记忆图生成失败，请稍后再试" }, 502);
  }
}
