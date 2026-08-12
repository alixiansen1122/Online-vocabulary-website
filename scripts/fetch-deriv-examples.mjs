import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(".");
const BOOK_FILE = path.join(ROOT, "src", "data", "bbdc-yszch.json");
const CACHE_FILE = path.join(ROOT, ".cache", "deriv-examples.json");
const OUTPUT_FILE = path.join(ROOT, "src", "data", "derivative-examples.json");
const CONCURRENCY = Number.parseInt(process.env.EX_CONCURRENCY || "8", 10);
const EXAMPLE_LIMIT = 2;

const FAMILY_SUFFIXES = ["s", "es", "ed", "ing", "er", "or", "est", "ly", "al", "ial", "ic", "ical", "ive", "ous", "ful", "less", "able", "ible", "ion", "tion", "sion", "ation", "ment", "ness", "ity", "ism", "ist", "ize", "ise", "en", "fy"];

function generateDerivatives(term, pos) {
  const w = String(term || "").trim().toLowerCase().replace(/[^a-z]/g, "");
  if (!w || w.length < 3) return [];
  const isVerb = /v/i.test(pos || "");
  const isNoun = /n/i.test(pos || "") && !isVerb;
  const isAdj = /adj/i.test(pos || "");
  const eE = w.endsWith("e");
  const eY = w.endsWith("y") && !/[aeiou]y$/.test(w);
  const dropE = (sfx) => (eE ? w.slice(0, -1) + sfx : w + sfx);
  const yToI = (sfx) => (eY ? w.slice(0, -1) + "i" + sfx : dropE(sfx));
  const addS = () => (/[sxz]$|ch$|sh$/.test(w) ? w + "es" : w + "s");
  const ionForm = () => {
    if (w.endsWith("ate")) return w.slice(0, -3) + "ation";
    if (w.endsWith("ce")) return w.slice(0, -2) + "tion";
    if (/ct$|rt$|nt$|st$|pt$/.test(w)) return w + "ion";
    if (w.endsWith("se")) return w.slice(0, -1) + "ion";
    if (w.endsWith("de")) return w.slice(0, -2) + "sion";
    if (w.endsWith("ss")) return w + "ion";
    return w + "ation";
  };
  const forms = new Set([w]);
  if (isVerb) {
    forms.add(addS());
    forms.add(eY ? yToI("ed") : dropE("ed"));
    forms.add(dropE("ing"));
    forms.add(dropE("er"));
    forms.add(dropE("or"));
    forms.add(dropE("able"));
    forms.add(w + "ment");
    forms.add(ionForm());
  }
  if (isNoun) {
    forms.add(dropE("al"));
    forms.add(dropE("ic"));
    forms.add(dropE("ous"));
    forms.add(dropE("ful"));
    forms.add(dropE("less"));
    forms.add(dropE("y"));
    forms.add(dropE("ize"));
    forms.add(yToI("al"));
    forms.add(yToI("ous"));
  }
  if (isAdj) {
    forms.add(eY ? yToI("ly") : dropE("ly"));
    forms.add(yToI("ness"));
    forms.add(dropE("ity"));
    forms.add(dropE("ize"));
    forms.add(dropE("ish"));
  }
  return [...forms].filter((f) => f !== w && f.length > w.length && f.length <= w.length + 6);
}

function cleanSentence(sentence, word) {
  const text = String(sentence || "").replace(/\s+/g, " ").trim();
  if (!text || text.length < 12 || text.length > 180) return "";
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (!new RegExp(`\\b${escaped}`, "i").test(text)) return "";
  return text;
}

async function fetchWithTimeout(url, ms = 12000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchExamples(word) {
  const examples = [];
  const dictData = await fetchWithTimeout(
    `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`,
    8000
  );
  if (Array.isArray(dictData)) {
    for (const entry of dictData) {
      for (const meaning of entry.meanings || []) {
        for (const def of meaning.definitions || []) {
          const ex = cleanSentence(def.example, word);
          if (ex) examples.push(ex);
          if (examples.length >= EXAMPLE_LIMIT) break;
        }
        if (examples.length >= EXAMPLE_LIMIT) break;
      }
      if (examples.length >= EXAMPLE_LIMIT) break;
    }
  }
  return examples;
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
const bookTerms = new Set(words.map((w) => String(w.term || "").trim().toLowerCase().replace(/[^a-z]/g, "")));

const allDerivTerms = new Set();
for (const w of words) {
  const derivs = generateDerivatives(w.term, w.pos);
  for (const d of derivs) {
    if (!bookTerms.has(d)) allDerivTerms.add(d);
  }
}
const terms = [...allDerivTerms].sort();
console.log(`total words: ${words.length}, unique derivative terms to fetch: ${terms.length}`);

const cache = await readCache();
console.log(`cached: ${Object.keys(cache).length}`);

let processed = 0;
let found = 0;
const startTime = Date.now();

await mapLimit(terms, CONCURRENCY, async (term) => {
  if (cache[term] !== undefined) {
    if (cache[term] && cache[term].length > 0) found++;
    return;
  }
  const examples = await fetchExamples(term);
  cache[term] = examples;
  processed++;
  if (examples && examples.length > 0) found++;
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

const output = {};
for (const term of terms) {
  if (cache[term] && cache[term].length > 0) output[term] = cache[term];
}
await writeFile(OUTPUT_FILE, JSON.stringify(output, null, 2) + "\n", "utf8");
console.log(`Written ${Object.keys(output).length} entries to ${path.relative(ROOT, OUTPUT_FILE)}`);
