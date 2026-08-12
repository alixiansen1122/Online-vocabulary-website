import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(".");
const BOOK_FILE = path.join(ROOT, "src", "data", "bbdc-yszch.json");
const CACHE_FILE = path.join(ROOT, ".cache", "phonetics.json");
const CONCURRENCY = Number.parseInt(process.env.PHONETIC_CONCURRENCY || "5", 10);
const RETRIES = Number.parseInt(process.env.PHONETIC_RETRIES || "2", 10);

function normalizePhonetic(text) {
  if (!text) return "";
  let t = String(text).trim();
  if (!t.startsWith("/")) t = "/" + t;
  if (!t.endsWith("/")) t = t + "/";
  t = t
    .replace(/ɹ/g, "r")
    .replace(/ɝ/g, "ɜr")
    .replace(/ɚ/g, "ər")
    .replace(/ʍ/g, "w")
    .replace(/ɕ/g, "ʃ")
    .replace(/ʑ/g, "ʒ");
  return t;
}

function cleanTerm(term) {
  return String(term || "").trim();
}

async function fetchWithRetry(url, retries = RETRIES) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const res = await fetch(url, { signal: controller.signal });
      if (res.status === 429) {
        await new Promise((r) => setTimeout(r, 3000 * (attempt + 1)));
        continue;
      }
      if (!res.ok) return null;
      return await res.json();
    } catch {
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
        continue;
      }
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }
  return null;
}

async function fetchPhoneticForToken(token) {
  const key = token.toLowerCase();
  if (!/^[a-z]+$/i.test(key)) return null;
  const data = await fetchWithRetry(
    `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(key)}`
  );
  if (!Array.isArray(data) || !data[0]) return null;

  let us = "";
  let uk = "";
  for (const entry of data) {
    for (const p of entry.phonetics || []) {
      const audio = String(p.audio || "");
      const text = normalizePhonetic(p.text);
      if (!text) continue;
      if (/us[._-]/i.test(audio) || /-us\./i.test(audio)) {
        if (!us) us = text;
      } else if (/uk[._-]/i.test(audio) || /-uk\./i.test(audio)) {
        if (!uk) uk = text;
      } else if (!us && !uk) {
        us = text;
        uk = text;
      }
    }
  }
  if (!us) {
    const any = (data[0].phonetics || []).find((p) => p.text);
    if (any) us = normalizePhonetic(any.text);
  }
  if (!uk) uk = us;
  if (!us) return null;
  return { us, uk };
}

async function fetchPhoneticForTerm(term) {
  const tokens = cleanTerm(term).split(/[\s-]+/).filter(Boolean);
  if (tokens.length === 0) return null;
  if (tokens.length === 1) return fetchPhoneticForToken(tokens[0]);

  const parts = await Promise.all(tokens.map((t) => fetchPhoneticForToken(t)));
  const usParts = [];
  const ukParts = [];
  let anyUs = false;
  let anyUk = false;
  for (let i = 0; i < parts.length; i++) {
    if (parts[i]) {
      usParts.push(parts[i].us);
      ukParts.push(parts[i].uk);
      if (parts[i].us) anyUs = true;
      if (parts[i].uk) anyUk = true;
    } else {
      usParts.push(tokens[i]);
      ukParts.push(tokens[i]);
    }
  }
  if (!anyUs && !anyUk) return null;
  return {
    us: usParts.length > 1 ? "/" + usParts.map((p) => p.replace(/^\//, "").replace(/\/$/, "")).join(" ") + "/" : usParts[0],
    uk: ukParts.length > 1 ? "/" + ukParts.map((p) => p.replace(/^\//, "").replace(/\/$/, "")).join(" ") + "/" : ukParts[0],
  };
}

async function readCache() {
  try {
    return JSON.parse(await readFile(CACHE_FILE, "utf8"));
  } catch {
    return {};
  }
}

async function writeCache(cache) {
  await mkdir(path.dirname(CACHE_FILE), { recursive: true });
  await writeFile(CACHE_FILE, JSON.stringify(cache, null, 2), "utf8");
}

async function mapLimit(items, limit, mapper) {
  let index = 0;
  const workers = Array.from({ length: limit }, async () => {
    while (index < items.length) {
      const current = index;
      index += 1;
      await mapper(items[current], current);
    }
  });
  await Promise.all(workers);
}

const book = JSON.parse(await readFile(BOOK_FILE, "utf8"));
const words = book.chapters.flatMap((c) => c.words);
const terms = [...new Set(words.map((w) => cleanTerm(w.term)))];
console.log(`total words: ${words.length}, unique terms: ${terms.length}`);

const cache = await readCache();
console.log(`cached: ${Object.keys(cache).length}`);

let processed = 0;
let found = 0;
const startTime = Date.now();

await mapLimit(terms, CONCURRENCY, async (term) => {
  if (cache[term]) {
    found += cache[term] ? 1 : 0;
    return;
  }
  const result = await fetchPhoneticForTerm(term);
  cache[term] = result;
  processed++;
  if (result) found++;
  if (processed % 50 === 0) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
    const rate = (processed / (elapsed / 60)).toFixed(1);
    console.log(`[${processed}/${terms.length}] found=${found} elapsed=${elapsed}s rate=${rate}/min`);
    await writeCache(cache);
  }
});

await writeCache(cache);
const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
console.log(`\nDone. processed=${processed} found=${found}/${terms.length} elapsed=${elapsed}s`);

let updated = 0;
let keptOriginal = 0;
for (const word of words) {
  const term = cleanTerm(word.term);
  const ph = cache[term];
  if (ph) {
    word.phoneticUs = ph.us;
    word.phoneticUk = ph.uk;
    updated++;
  } else {
    word.phoneticUs = word.phonetic || "";
    word.phoneticUk = word.phonetic || "";
    keptOriginal++;
  }
}

book.phoneticsEnrichedAt = new Date().toISOString();
await writeFile(BOOK_FILE, `${JSON.stringify(book, null, 2)}\n`, "utf8");
console.log(`Written to JSON: updated=${updated} keptOriginal=${keptOriginal}`);
