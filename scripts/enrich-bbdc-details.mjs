import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BOOK_FILE = path.join(ROOT, "src", "data", "bbdc-yszch.json");
const CACHE_FILE = path.join(ROOT, ".cache", "bbdc-word-details.json");
const LIMIT = Number.parseInt(process.env.ENRICH_LIMIT || "0", 10);
const CONCURRENCY = Number.parseInt(process.env.ENRICH_CONCURRENCY || "4", 10);
const EXAMPLE_LIMIT = Number.parseInt(process.env.ENRICH_EXAMPLES || "2", 10);
const SYNONYM_LIMIT = Number.parseInt(process.env.ENRICH_SYNONYMS || "8", 10);
const DERIVATIVE_LIMIT = Number.parseInt(process.env.ENRICH_DERIVATIVES || "8", 10);

const PREFIXES = [
  ["hydro", "水"],
  ["litho", "石；岩石"],
  ["geo", "地球；土地"],
  ["bio", "生命；生物"],
  ["eco", "环境；生态"],
  ["aero", "空气；航空"],
  ["photo", "光"],
  ["thermo", "热"],
  ["chrono", "时间"],
  ["tele", "远距离"],
  ["micro", "微小"],
  ["macro", "宏大"],
  ["mono", "单一"],
  ["multi", "多个"],
  ["inter", "在...之间"],
  ["intra", "在...内部"],
  ["trans", "穿过；转变"],
  ["sub", "在下；次级"],
  ["super", "在上；超级"],
  ["anti", "反对；抵抗"],
  ["pro", "支持；向前"],
  ["pre", "预先；在前"],
  ["post", "之后"],
  ["re", "再次；返回"],
  ["de", "向下；去除"],
  ["dis", "否定；分开"],
  ["un", "否定；相反"],
  ["non", "否定；非"],
  ["mis", "错误"],
  ["over", "过度；在上"],
  ["under", "不足；在下"],
  ["auto", "自己；自动"],
  ["semi", "半"],
  ["circum", "周围"],
  ["hyper", "过度；超越"],
  ["hypo", "不足；在下"],
  ["con", "共同；加强"],
  ["com", "共同；加强"],
  ["cor", "共同；加强"],
  ["col", "共同；加强"],
  ["en", "使成为；进入"],
  ["em", "使成为；进入"],
  ["ex", "向外；以前"],
  ["in", "进入；否定"],
  ["im", "进入；否定"],
  ["il", "否定"],
  ["ir", "否定"],
];

const SUFFIXES = [
  ["sphere", "球体；范围"],
  ["logy", "学科；研究"],
  ["graphy", "书写；记录"],
  ["graph", "书写；图表"],
  ["meter", "测量器"],
  ["scope", "观察仪器；范围"],
  ["tion", "名词后缀：行为；状态"],
  ["sion", "名词后缀：行为；状态"],
  ["ation", "名词后缀：行为；过程"],
  ["ment", "名词后缀：行为；结果"],
  ["ness", "名词后缀：性质；状态"],
  ["ity", "名词后缀：性质；状态"],
  ["ism", "主义；制度；现象"],
  ["ist", "从事者；主义者"],
  ["ence", "性质；状态"],
  ["ance", "性质；状态"],
  ["ic", "形容词后缀：...的"],
  ["ical", "形容词后缀：...的"],
  ["ive", "形容词后缀：有...性质的"],
  ["ous", "形容词后缀：充满...的"],
  ["ful", "形容词后缀：充满...的"],
  ["less", "形容词后缀：没有...的"],
  ["able", "形容词后缀：能够...的"],
  ["ible", "形容词后缀：能够...的"],
  ["ly", "副词后缀：...地"],
];

const FAMILY_SUFFIXES = [
  "s",
  "es",
  "ed",
  "ing",
  "er",
  "or",
  "est",
  "ly",
  "al",
  "ial",
  "ic",
  "ical",
  "ive",
  "ous",
  "ful",
  "less",
  "able",
  "ible",
  "ion",
  "tion",
  "sion",
  "ation",
  "ment",
  "ness",
  "ity",
  "ism",
  "ist",
  "ize",
  "ise",
];

function normalizeTerm(term) {
  return String(term || "").trim().toLowerCase();
}

function uniq(items) {
  const seen = new Set();
  const result = [];
  for (const item of items) {
    const value = String(item || "").trim();
    const key = value.toLowerCase();
    if (!value || seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }
  return result;
}

function cleanSentence(sentence, word) {
  const text = String(sentence || "").replace(/\s+/g, " ").trim();
  if (!text || text.length < 12 || text.length > 180) return "";
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (!new RegExp(`\\b${escaped}\\b`, "i").test(text)) return "";
  return text;
}

function cleanSynonym(word) {
  const value = String(word || "").toLowerCase().replace(/_/g, " ").trim();
  if (!value || value.length > 32) return "";
  if (/[^a-z -]/.test(value)) return "";
  if (/^(atomic number|e\d+|packaging gas|chemical element)/.test(value)) return "";
  return value;
}

function detectAffixes(term) {
  const word = normalizeTerm(term).replace(/[^a-z]/g, "");
  if (word.length < 5) return [];

  const roots = [];
  for (const [prefix, note] of PREFIXES) {
    if (word.startsWith(prefix) && word.length > prefix.length + 2) {
      roots.push({ part: `${prefix}-`, note: `前缀/词根：${note}` });
      break;
    }
  }

  for (const [suffix, note] of SUFFIXES) {
    if (word.endsWith(suffix) && word.length > suffix.length + 2) {
      roots.push({ part: `-${suffix}`, note: `后缀/词根：${note}` });
      break;
    }
  }

  return roots;
}

function stemVariants(term) {
  const word = normalizeTerm(term).replace(/[^a-z]/g, "");
  const stems = new Set([word]);
  for (const suffix of FAMILY_SUFFIXES) {
    if (word.endsWith(suffix) && word.length > suffix.length + 3) {
      const stem = word.slice(0, -suffix.length);
      stems.add(stem);
      if (suffix === "ing" && stem.endsWith(stem.at(-1))) stems.add(stem.slice(0, -1));
      if (["tion", "sion", "ation"].includes(suffix)) stems.add(`${stem}e`);
      if (["ity", "ness", "ly"].includes(suffix) && stem.endsWith("i")) stems.add(`${stem.slice(0, -1)}y`);
    }
  }
  return [...stems].filter((item) => item.length >= 4);
}

function findDerivatives(term, allTerms) {
  const word = normalizeTerm(term);
  if (!/^[a-z -]+$/.test(word) || word.includes(" ")) return [];

  const stems = stemVariants(word);
  const matches = [];
  for (const other of allTerms) {
    const candidate = normalizeTerm(other);
    if (candidate === word || candidate.includes(" ")) continue;
    const candidateStems = stemVariants(candidate);
    const related =
      stems.some((stem) => candidate.startsWith(stem) && candidate.length <= stem.length + 10) ||
      candidateStems.some((stem) => word.startsWith(stem) && word.length <= stem.length + 10) ||
      stems.some((stem) => candidateStems.includes(stem));
    if (related) matches.push(candidate);
  }

  return uniq(matches)
    .sort((a, b) => Math.abs(a.length - word.length) - Math.abs(b.length - word.length))
    .slice(0, DERIVATIVE_LIMIT);
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

async function fetchJson(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function loadRemoteDetails(term) {
  const encoded = encodeURIComponent(term);
  const dictUrl = `https://api.dictionaryapi.dev/api/v2/entries/en/${encoded}`;
  const datamuseUrl = `https://api.datamuse.com/words?rel_syn=${encoded}&max=12`;
  const tatoebaUrl = `https://tatoeba.org/en/api_v0/search?from=eng&query=${encoded}&orphans=no&unapproved=no&sort=words&to=none`;

  const [dict, datamuse, tatoeba] = await Promise.all([
    fetchJson(dictUrl),
    fetchJson(datamuseUrl),
    fetchJson(tatoebaUrl),
  ]);

  const examples = [];
  const synonyms = [];

  for (const entry of Array.isArray(dict) ? dict : []) {
    for (const meaning of entry.meanings || []) {
      synonyms.push(...(meaning.synonyms || []));
      for (const definition of meaning.definitions || []) {
        const example = cleanSentence(definition.example, term);
        if (example) examples.push(example);
        synonyms.push(...(definition.synonyms || []));
      }
    }
  }

  for (const result of tatoeba?.results || []) {
    const example = cleanSentence(result.text, term);
    if (example) examples.push(example);
  }

  for (const item of Array.isArray(datamuse) ? datamuse : []) {
    const synonym = cleanSynonym(item.word);
    if (synonym) synonyms.push(synonym);
  }

  return {
    examples: uniq(examples).slice(0, EXAMPLE_LIMIT),
    synonyms: uniq(synonyms.map(cleanSynonym)).slice(0, SYNONYM_LIMIT),
  };
}

async function mapLimit(items, limit, mapper) {
  let index = 0;
  const workers = Array.from({ length: limit }, async () => {
    while (index < items.length) {
      const currentIndex = index;
      index += 1;
      await mapper(items[currentIndex], currentIndex);
    }
  });
  await Promise.all(workers);
}

const book = JSON.parse(await readFile(BOOK_FILE, "utf8"));
const words = book.chapters.flatMap((chapter) => chapter.words);
const allTerms = uniq(words.map((word) => word.term));
const targetWords = LIMIT > 0 ? words.slice(0, LIMIT) : words;
const cache = await readCache();

await mapLimit(targetWords, CONCURRENCY, async (word, index) => {
  const term = normalizeTerm(word.term);
  if (!term) return;

  if (!cache[term]) {
    console.log(`${index + 1}/${targetWords.length} ${word.term}`);
    cache[term] = await loadRemoteDetails(term);
    if ((index + 1) % 50 === 0) await writeCache(cache);
  }

  const details = cache[term] || {};
  word.examples = uniq([...(word.examples || []), ...(details.examples || [])]).slice(0, EXAMPLE_LIMIT);
  word.synonyms = uniq([...(word.synonyms || []), ...(details.synonyms || [])]).slice(0, SYNONYM_LIMIT);
  word.derivatives = uniq([...(word.derivatives || []), ...findDerivatives(term, allTerms)]).slice(0, DERIVATIVE_LIMIT);
  word.roots = detectAffixes(term);
});

book.enrichedAt = new Date().toISOString();
await writeCache(cache);
await writeFile(BOOK_FILE, `${JSON.stringify(book, null, 2)}\n`, "utf8");

const stats = words.reduce(
  (result, word) => {
    if (word.examples?.length) result.examples += 1;
    if (word.derivatives?.length) result.derivatives += 1;
    if (word.roots?.length) result.roots += 1;
    if (word.synonyms?.length) result.synonyms += 1;
    return result;
  },
  { examples: 0, derivatives: 0, roots: 0, synonyms: 0 }
);

console.log(`Enriched ${targetWords.length} words.`);
console.log(stats);
