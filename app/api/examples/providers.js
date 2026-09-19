import { selectExamples } from "../../../src/examples.js";

// Public bilingual pages; unavailable sources fail independently.
export function plainText(value) {
  const named = { amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", nbsp: " ", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", ndash: "–", mdash: "—" };
  return String(value || "").replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]*>/g, "").replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (entity, key) => {
      if (key.startsWith("#")) {
        const code = key[1].toLowerCase() === "x" ? parseInt(key.slice(2), 16) : Number(key.slice(1));
        return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "";
      }
      return named[key.toLowerCase()] ?? entity;
    }).replace(/\s+/g, " ").trim();
}

export function parseYoudao(html, word) {
  const examples = [];
  for (const match of html.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)) {
    const paragraphs = [...match[1].matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)].map(item => item[1]);
    // Only aligned bilingual paragraphs; never zip unrelated blocks together.
    const en = paragraphs.find(item => /id=["']src_/.test(item));
    const zh = paragraphs.find(item => /id=["']tran_/.test(item));
    if (!en || !zh) continue;
    const via = paragraphs.find(item => item !== en && item !== zh);
    examples.push({ en: plainText(en), zh: plainText(zh), source: "youdao", isDirect: true,
      sourceLabel: `有道双语例句${via ? ` · ${plainText(via)}` : ""}`,
      sourceUrl: `https://dict.youdao.com/example/blng/eng/${encodeURIComponent(word)}/` });
  }
  return examples;
}

export function parseIciba(html, word) {
  const json = html.match(/<script\b[^>]*\bid=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i)?.[1];
  if (!json) return [];
  const info = JSON.parse(json)?.props?.pageProps?.initialReduxState?.word?.wordInfo;
  if (!info) return [];
  return (Array.isArray(info.new_sentence) ? info.new_sentence : []).flatMap(group =>
    (Array.isArray(group.sentences) ? group.sentences : []).map(item => ({
      en: plainText(item.en), zh: plainText(item.cn), source: "iciba", isDirect: true,
      sourceLabel: `爱词霸${item.from ? ` · ${plainText(item.from)}` : ""}`,
      sourceUrl: `https://www.iciba.com/word?w=${encodeURIComponent(word)}`,
    })));
}

export function parseTatoeba(payload) {
  return (Array.isArray(payload.data) ? payload.data : []).flatMap(sentence => {
    if (sentence.is_unapproved) return [];
    const translations = (Array.isArray(sentence.translations) ? sentence.translations.flat() : [])
      .filter(item => item.lang === "cmn" && !item.is_unapproved)
      .map(item => ({ ...item, text: item.script === "Hans" ? item.text :
        item.transcriptions?.find(t => t.script === "Hans" && t.type === "altscript" && !t.needsReview)?.text || item.text }))
      .sort((a, b) => Number(Boolean(b.is_direct)) - Number(Boolean(a.is_direct)));
    const translation = translations.find(item => /\p{Script=Han}/u.test(item.text || ""));
    if (!translation) return [];
    const authors = [...new Set([sentence.owner, translation.owner].map(owner =>
      typeof owner === "string" ? owner : owner?.username).filter(Boolean))];
    return [{ en: plainText(sentence.text), zh: plainText(translation.text),
      isDirect: Boolean(translation.is_direct), source: "tatoeba",
      sourceLabel: `Tatoeba${authors.length ? ` · ${authors.join(" / ")}` : ""}`,
      sourceLicense: "CC BY 2.0 FR", sourceUrl: `https://tatoeba.org/en/sentences/show/${sentence.id}` }];
  });
}

async function readSource(fetcher, url, format, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetcher(url, { signal: controller.signal,
      headers: { Accept: format === "json" ? "application/json" : "text/html" },
      cf: { cacheTtlByStatus: { "200-299": 86400, "400-599": 0 }, cacheEverything: true } });
    if (!response.ok) throw new Error(`Source returned ${response.status}`);
    return await (format === "json" ? response.json() : response.text());
  } finally { clearTimeout(timer); }
}

export async function collectExamples(word, { fetcher = fetch, timeoutMs = 6500 } = {}) {
  const params = new URLSearchParams({ lang: "eng", q: `"${word}"`, word_count: "3-40", sort: "relevance",
    limit: "100", is_unapproved: "no", "trans:lang": "cmn", "trans:is_unapproved": "no", include: "transcriptions" });
  const providers = [
    { url: `https://api.tatoeba.org/v1/sentences?${params}`, format: "json", parse: parseTatoeba },
    { url: `https://dict.youdao.com/example/blng/eng/${encodeURIComponent(word)}/`, format: "html", parse: parseYoudao },
    { url: `https://www.iciba.com/word?w=${encodeURIComponent(word)}`, format: "html", parse: parseIciba },
  ];
  const results = await Promise.allSettled(providers.map(async provider =>
    provider.parse(await readSource(fetcher, provider.url, provider.format, timeoutMs), word)));
  return { examples: selectExamples(results.flatMap(result => result.status === "fulfilled" ? result.value : []), word),
    partial: results.some(result => result.status === "rejected") };
}
