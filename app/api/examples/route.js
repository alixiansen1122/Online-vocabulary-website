const TATOEBA_API = "https://api.tatoeba.org/v1/sentences";

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function contentTokens(sentence, term) {
  const termTokens = new Set(normalizeText(term).split(" ").filter(Boolean));
  return normalizeText(sentence)
    .split(" ")
    .filter((token) => token.length > 2 && !termTokens.has(token));
}

function jaccardSimilarity(left, right) {
  const a = new Set(left);
  const b = new Set(right);
  if (a.size === 0 || b.size === 0) return 0;
  let overlap = 0;
  for (const token of a) if (b.has(token)) overlap += 1;
  return overlap / (a.size + b.size - overlap);
}

function pickChineseTranslation(translations) {
  return [...(translations || [])]
    .filter((translation) => translation.lang === "cmn" && !translation.is_unapproved)
    .map((translation) => {
      const simplified = translation.script === "Hans"
        ? translation.text
        : translation.transcriptions?.find(
          (item) => item.script === "Hans" && item.type === "altscript" && !item.needsReview,
        )?.text;
      return {
        ...translation,
        text: simplified || translation.text,
        hasSimplified: Boolean(simplified),
      };
    })
    .sort((left, right) => {
      const leftScore = (left.hasSimplified ? 4 : 0) + (left.is_direct ? 2 : 0);
      const rightScore = (right.hasSimplified ? 4 : 0) + (right.is_direct ? 2 : 0);
      return rightScore - leftScore;
    })[0];
}

function cleanChinesePunctuation(text) {
  return String(text || "")
    .replace(/\s*([，。！？；：])\s*/g, "$1")
    .replace(/\s*,\s*/g, "，")
    .replace(/\s*\.\s*$/g, "。")
    .trim();
}

function chooseDiverseExamples(candidates, term, limit = 4) {
  const selected = [];
  const remaining = [...candidates];

  while (remaining.length > 0 && selected.length < limit) {
    let bestIndex = 0;
    let bestScore = -Infinity;

    remaining.forEach((candidate, index) => {
      const words = candidate.en.trim().split(/\s+/).length;
      const lengthScore = words >= 6 && words <= 16 ? 16 : words >= 4 && words <= 20 ? 8 : 0;
      const directScore = candidate.isDirect ? 6 : 0;
      const candidateTokens = contentTokens(candidate.en, term);
      const maxSimilarity = selected.reduce(
        (max, item) => Math.max(max, jaccardSimilarity(candidateTokens, contentTokens(item.en, term))),
        0,
      );
      const opening = candidateTokens.slice(0, 3).join(" ");
      const repeatedOpening = selected.some((item) => contentTokens(item.en, term).slice(0, 3).join(" ") === opening);
      const score = lengthScore + directScore - maxSimilarity * 30 - (repeatedOpening ? 12 : 0);

      if (score > bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    });

    selected.push(remaining.splice(bestIndex, 1)[0]);
  }

  return selected;
}

export async function GET(request) {
  const requestUrl = new URL(request.url);
  const word = String(requestUrl.searchParams.get("word") || "").trim();

  if (!word || word.length > 80 || !/^[a-zA-Z][a-zA-Z '\-/]*$/.test(word)) {
    return Response.json({ examples: [] }, { status: 400 });
  }

  const params = new URLSearchParams({
    lang: "eng",
    q: `"${word}"`,
    word_count: "3-20",
    sort: "relevance",
    limit: "40",
    is_unapproved: "no",
  });
  params.append("trans:lang", "cmn");
  params.append("trans:is_unapproved", "no");
  params.set("include", "transcriptions");

  try {
    const response = await fetch(`${TATOEBA_API}?${params.toString()}`, {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) throw new Error(`Tatoeba returned ${response.status}`);

    const payload = await response.json();
    const exactWord = new RegExp(`(^|[^a-zA-Z])${escapeRegExp(word)}(?=$|[^a-zA-Z])`, "i");
    const seenEnglish = new Set();
    const seenChinese = new Set();
    const candidates = [];

    for (const sentence of payload.data || []) {
      if (!exactWord.test(sentence.text || "")) continue;
      const translation = pickChineseTranslation(sentence.translations);
      if (!translation?.text) continue;

      const englishKey = normalizeText(sentence.text);
      const chineseKey = normalizeText(translation.text);
      if (!englishKey || !chineseKey || seenEnglish.has(englishKey) || seenChinese.has(chineseKey)) continue;
      seenEnglish.add(englishKey);
      seenChinese.add(chineseKey);
      candidates.push({
        en: sentence.text,
        zh: cleanChinesePunctuation(translation.text),
        isDirect: Boolean(translation.is_direct),
        source: "tatoeba",
        sourceLabel: sentence.owner ? `Tatoeba · ${sentence.owner}` : "Tatoeba",
        sourceUrl: `https://tatoeba.org/en/sentences/show/${sentence.id}`,
      });
    }

    const examples = chooseDiverseExamples(candidates, word).map((example) => ({
      en: example.en,
      zh: example.zh,
      source: example.source,
      sourceLabel: example.sourceLabel,
      sourceUrl: example.sourceUrl,
    }));
    return Response.json(
      { examples },
      {
        headers: {
          "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
        },
      },
    );
  } catch {
    return Response.json(
      { examples: [] },
      {
        status: 200,
        headers: {
          "Cache-Control": "public, max-age=300",
        },
      },
    );
  }
}
