import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { memo, useCallback, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import Hypher from "hypher";
import hyphenationPatterns from "hyphenation.en-us";
import {
  ArrowLeft,
  BarChart3,
  BookOpen,
  Clock,
  Cloud,
  CloudOff,
  Download,
  Eye,
  EyeOff,
  FileUp,
  Keyboard,
  ListPlus,
  LoaderCircle,
  LogOut,
  RefreshCw,
  RotateCcw,
  Search,
  Star,
  Trash2,
  Upload,
  Volume2,
  X,
} from "lucide-react";
import bbdcBook from "./data/bbdc-yszch.json";
import syllableExceptions from "./data/syllable-exceptions.json";
import morphemes from "./data/morphemes.json";
import derivativeExamples from "./data/derivative-examples.json";
import derivativeDetails from "./data/derivative-details.json";
import synonymDetails from "./data/synonym-details.json";
import exampleTranslations from "./data/example-translations.json";
import exampleAdditions from "./data/example-additions.json";
import { speakNavigationWord, speakWord } from "./offlineTts";

const STORAGE_KEY = "offline_vocab_reader_v1";
const CLOUD_DIRTY_KEY = "offline_vocab_reader_cloud_dirty_v1";
const CLOUD_SYNC_DELAY = 900;
const BACKUP_FORMAT = "word-memory-web-backup";
const BACKUP_VERSION = 1;
const DEFAULT_SHORTCUT_KEYS = Object.freeze({
  previous: "ArrowUp",
  next: "ArrowDown",
  tabPrevious: "ArrowLeft",
  tabNext: "ArrowRight",
  spellingMode: "_",
  favorite: "f",
  meaning: " ",
});
const SHORTCUT_ACTIONS = [
  { id: "previous", label: "上一个单词", description: "向上切换" },
  { id: "next", label: "下一个单词", description: "向下切换" },
  { id: "tabPrevious", label: "上一个扩展页", description: "向左切换例句、派生等页面" },
  { id: "tabNext", label: "下一个扩展页", description: "向右切换例句、派生等页面" },
  { id: "spellingMode", label: "切换拼写分隔", description: "切换分隔与连续字母显示" },
  { id: "favorite", label: "收藏 / 取消收藏", description: "切换当前单词收藏状态" },
  { id: "meaning", label: "显示 / 隐藏释义", description: "切换当前单词中文意思" },
];
const BLOCKED_SHORTCUT_KEYS = new Set(["Control", "Shift", "Alt", "Meta", "OS", "CapsLock", "Tab", "Escape"]);

function canonicalShortcutKey(value) {
  const key = String(value || "");
  if (key === "Spacebar") return " ";
  if (key === "-") return "_";
  return key.length === 1 ? key.toLowerCase() : key;
}

function normalizeShortcutKey(value, fallback) {
  const key = canonicalShortcutKey(value);
  if (!key || BLOCKED_SHORTCUT_KEYS.has(key)) return fallback;
  return key;
}

function normalizeShortcutKeys(value) {
  const source = isRecord(value) ? value : {};
  const normalized = {
    previous: normalizeShortcutKey(source.previous, DEFAULT_SHORTCUT_KEYS.previous),
    next: normalizeShortcutKey(source.next, DEFAULT_SHORTCUT_KEYS.next),
    tabPrevious: normalizeShortcutKey(source.tabPrevious, DEFAULT_SHORTCUT_KEYS.tabPrevious),
    tabNext: normalizeShortcutKey(source.tabNext, DEFAULT_SHORTCUT_KEYS.tabNext),
    spellingMode: normalizeShortcutKey(source.spellingMode, DEFAULT_SHORTCUT_KEYS.spellingMode),
    favorite: normalizeShortcutKey(source.favorite, DEFAULT_SHORTCUT_KEYS.favorite),
    meaning: normalizeShortcutKey(source.meaning, DEFAULT_SHORTCUT_KEYS.meaning),
  };
  const fallbackKeys = {
    meaning: [DEFAULT_SHORTCUT_KEYS.meaning, "m"],
    tabPrevious: [DEFAULT_SHORTCUT_KEYS.tabPrevious, "["],
    tabNext: [DEFAULT_SHORTCUT_KEYS.tabNext, "]"],
    spellingMode: [DEFAULT_SHORTCUT_KEYS.spellingMode, "Enter"],
    previous: [DEFAULT_SHORTCUT_KEYS.previous, "p"],
    next: [DEFAULT_SHORTCUT_KEYS.next, "n"],
    favorite: [DEFAULT_SHORTCUT_KEYS.favorite, "v"],
  };
  const usedKeys = new Set();
  for (const actionId of ["meaning", "tabPrevious", "tabNext", "spellingMode", "previous", "next", "favorite"]) {
    if (usedKeys.has(normalized[actionId])) {
      normalized[actionId] = fallbackKeys[actionId].find((key) => !usedKeys.has(key)) || fallbackKeys[actionId][0];
    }
    usedKeys.add(normalized[actionId]);
  }
  return normalized;
}

function shortcutKeyLabel(value) {
  const labels = {
    ArrowUp: "↑",
    ArrowDown: "↓",
    ArrowLeft: "←",
    ArrowRight: "→",
    " ": "空格",
    Enter: "回车",
    Backspace: "退格",
    Delete: "删除",
  };
  const key = canonicalShortcutKey(value);
  return labels[key] || (key.length === 1 ? key.toUpperCase() : key);
}

const SAMPLE_CHAPTERS = [];

const IMPORTED_CHAPTERS = Array.isArray(bbdcBook.chapters) ? bbdcBook.chapters : [];
const ORIGINAL_BOOK_CHAPTERS = [
  { title: "自然地理", start: "atmosphere", end: "petroleum" },
  { title: "植物研究", start: "photosynthesis", end: "optimal" },
  { title: "动物保护", start: "biologist", end: "shepherd" },
  { title: "太空探索", start: "galaxy", end: "hopeless" },
  { title: "学校教育", start: "education", end: "fee" },
  { title: "科技发明", start: "technology", end: "circumstance" },
  { title: "文化历史", start: "culture", end: "adversity" },
  { title: "语言演化", start: "language", end: "contention" },
  { title: "娱乐运动", start: "medium", end: "bow" },
  { title: "物品材料", start: "stuff", end: "durable" },
  { title: "时尚潮流", start: "fashion", end: "slight" },
  { title: "饮食健康", start: "food", end: "slice" },
  { title: "建筑场所", start: "architecture", end: "internal" },
  { title: "交通旅行", start: "navigate", end: "swift" },
  { title: "国家政府", start: "republic", end: "germany" },
  { title: "社会经济", start: "economy", end: "collaborate" },
  { title: "法律法规", start: "law", end: "instruct" },
  { title: "沙场争锋", start: "violence", end: "veteran" },
  { title: "社会角色", start: "pioneer", end: "coward" },
  { title: "行为动作", start: "act", end: "sideways" },
  { title: "身心健康", start: "feel", end: "stereotype" },
  { title: "时间日期", start: "daily", end: null },
];

function groupOriginalBookChapters(sourceChapters) {
  const words = sourceChapters.flatMap((chapter) => chapter.words || []);
  if (words.length === 0) return sourceChapters;

  const normalizedTerm = (word) => String(word?.term || "").trim().toLowerCase();
  const chapters = [];
  let cursor = 0;

  for (const [index, definition] of ORIGINAL_BOOK_CHAPTERS.entries()) {
    const start = words.findIndex((word, wordIndex) => wordIndex >= cursor && normalizedTerm(word) === definition.start);
    const end = definition.end
      ? words.findIndex((word, wordIndex) => wordIndex >= start && normalizedTerm(word) === definition.end)
      : words.length - 1;

    if (start !== cursor || end < start) return sourceChapters;

    const chapterWords = words.slice(start, end + 1);
    chapters.push({
      id: `chapter-${String(index + 1).padStart(2, "0")}`,
      title: `Chapter ${index + 1} ${definition.title}`,
      declaredCount: chapterWords.length,
      words: chapterWords,
    });
    cursor = end + 1;
  }

  return cursor === words.length ? chapters : sourceChapters;
}

const CHAPTERS = IMPORTED_CHAPTERS.length > 0 ? groupOriginalBookChapters(IMPORTED_CHAPTERS) : SAMPLE_CHAPTERS;
const BOOK_TITLE = bbdcBook.title || "IELTS Vocabulary";
const BOOK_TOTAL = bbdcBook.declaredTotal || CHAPTERS.reduce((total, chapter) => total + chapter.words.length, 0);
const NOTE_TAB = "\u7b14\u8bb0";
const EXAMPLE_TAB = "\u4f8b\u53e5";
const AFFIX_TAB = "词缀";
const DEFAULT_DETAIL_TAB = EXAMPLE_TAB;
const DETAIL_TABS = [EXAMPLE_TAB, "\u6d3e\u751f", AFFIX_TAB, "\u8fd1\u4e49", NOTE_TAB];
const VOICE_OPTIONS = {
  us: { label: "\u7f8e", lang: "en-US" },
  uk: { label: "\u82f1", lang: "en-GB" },
};
const VOWELS = new Set(["a", "e", "i", "o", "u"]);
const hyphenator = new Hypher(hyphenationPatterns);
const termSegmentCache = new Map();

const MORPH_PREFIXES = morphemes.prefixes.map((p) => [p.m, p.n]).sort((a, b) => b[0].length - a[0].length);
const MORPH_SUFFIXES = morphemes.suffixes.map((s) => [s.m, s.n]).sort((a, b) => b[0].length - a[0].length);
const MORPH_ROOTS = morphemes.roots
  .flatMap((r) => [{ m: r.m, n: r.n }, ...(r.v || []).map((v) => ({ m: v, n: r.n }))])
  .sort((a, b) => b.m.length - a.m.length);

const MORPH_DENY = new Set([
  "interior", "internal", "interim", "internet", "university", "universal", "universe",
]);

const morphCache = new Map();
const affixCache = new Map();
const exampleLookupCache = new Map();

function hasVowel(s) {
  for (const ch of s) if (VOWELS.has(ch) || ch === "y") return true;
  return false;
}

function detectAffixes(term) {
  const key = String(term || "").toLowerCase().replace(/[^a-z]/g, "");
  if (!key || key.length < 5) return [];
  if (affixCache.has(key)) return affixCache.get(key);
  if (MORPH_DENY.has(key)) {
    affixCache.set(key, []);
    return [];
  }

  const result = detectAffixesInner(key);
  affixCache.set(key, result);
  return result;
}

function detectAffixesInner(key) {
  const found = [];
  let prefixLen = 0;
  let matchedPrefix = "";
  for (const [prefix, note] of MORPH_PREFIXES) {
    if (key.startsWith(prefix) && key.length - prefix.length >= 3) {
      found.push({ part: `${prefix}-`, note: `前缀：${note}` });
      prefixLen = prefix.length;
      matchedPrefix = prefix;
      break;
    }
  }

  const stem = key.slice(prefixLen);
  let suffixLen = 0;
  let matchedSuffix = "";
  for (const [suffix, note] of MORPH_SUFFIXES) {
    if (stem.length - suffix.length >= 2 && stem.endsWith(suffix)) {
      const rootCand = stem.slice(0, stem.length - suffix.length);
      if (hasVowel(rootCand)) {
        found.push({ part: `-${suffix}`, note: `后缀：${note}` });
        suffixLen = suffix.length;
        matchedSuffix = suffix;
        break;
      }
    }
  }

  const rootCandidate = stem.slice(0, stem.length - suffixLen);
  let rootFound = false;
  if (rootCandidate.length >= 3) {
    for (const { m, n } of MORPH_ROOTS) {
      if (m.length < 3) continue;
      if (rootCandidate === m || (rootCandidate.includes(m) && rootCandidate.length > m.length)) {
        found.splice(found.length - (matchedSuffix ? 1 : 0), 0, { part: m, note: `词根：${n}` });
        rootFound = true;
        break;
      }
    }
  }

  if (!rootFound && matchedPrefix && matchedPrefix.length <= 2) {
    const retryStem = key;
    let retrySuffixLen = 0;
    let retrySuffix = "";
    let retrySuffixNote = "";
    for (const [suffix, snote] of MORPH_SUFFIXES) {
      if (retryStem.length - suffix.length >= 2 && retryStem.endsWith(suffix)) {
        const rootCand = retryStem.slice(0, retryStem.length - suffix.length);
        if (hasVowel(rootCand)) {
          retrySuffixLen = suffix.length;
          retrySuffix = suffix;
          retrySuffixNote = snote;
          break;
        }
      }
    }
    const retryRootCand = retryStem.slice(0, retryStem.length - retrySuffixLen);
    if (retryRootCand.length >= 3) {
      for (const { m, n } of MORPH_ROOTS) {
        if (m.length < 3) continue;
        if (retryRootCand === m || (retryRootCand.includes(m) && retryRootCand.length > m.length)) {
          const retryResult = [];
          retryResult.push({ part: m, note: `词根：${n}` });
          if (retrySuffix) retryResult.push({ part: `-${retrySuffix}`, note: `后缀：${retrySuffixNote}` });
          return retryResult;
        }
      }
    }
  }

  return found;
}

function morphologySplit(term) {
  const key = String(term || "").toLowerCase().replace(/[^a-z]/g, "");
  if (!key || key.length < 5) return null;
  if (morphCache.has(key)) return morphCache.get(key);
  if (MORPH_DENY.has(key)) {
    morphCache.set(key, null);
    return null;
  }

  let prefix = "";
  for (const [p] of MORPH_PREFIXES) {
    if (p.length >= 4 && key.startsWith(p) && key.length - p.length >= 3) {
      prefix = p;
      break;
    }
  }
  const stem = key.slice(prefix.length);
  let suffix = "";
  for (const [s] of MORPH_SUFFIXES) {
    if (stem.length - s.length >= 3 && stem.endsWith(s)) {
      const root = stem.slice(0, stem.length - s.length);
      if (hasVowel(root)) {
        suffix = s;
        break;
      }
    }
  }
  const root = stem.slice(0, stem.length - suffix.length);

  if (!prefix && !suffix) {
    morphCache.set(key, null);
    return null;
  }

  const parts = [];
  if (prefix) parts.push(prefix);
  if (root) parts.push(root);
  if (suffix) parts.push(suffix);
  const result = parts.length > 1 ? parts : null;
  morphCache.set(key, result);
  return result;
}

function flattenWords() {
  return CHAPTERS.flatMap((chapter) => chapter.words.map((word) => ({ ...word, chapterId: chapter.id })));
}

const ALL_WORDS = flattenWords();
const MAIN_BOOK_ID = "main";
const FAVORITES_BOOK_ID = "favorites";

const FAMILY_SUFFIXES = ["s", "es", "ed", "ing", "er", "or", "est", "ly", "al", "ial", "ic", "ical", "ive", "ous", "ful", "less", "able", "ible", "ion", "tion", "sion", "ation", "ment", "ness", "ity", "ism", "ist", "ize", "ise", "en", "fy"];

function stemVariants(term) {
  const word = String(term || "").trim().toLowerCase().replace(/[^a-z]/g, "");
  const stems = new Set([word]);
  if (word.length < 3) return [...stems];

  for (const suffix of FAMILY_SUFFIXES) {
    if (word.endsWith(suffix) && word.length > suffix.length + 2) {
      const stem = word.slice(0, -suffix.length);
      if (stem.length >= 3) {
        stems.add(stem);
        if (stem.endsWith("e")) stems.add(stem.slice(0, -1));
        else stems.add(`${stem}e`);
        if (suffix === "ing" && stem.length > 1 && stem.endsWith(stem.at(-1))) stems.add(stem.slice(0, -1));
        if (["tion", "sion", "ation"].includes(suffix)) stems.add(`${stem}e`);
        if (["ity", "ness", "ly", "ic", "ical"].includes(suffix) && stem.endsWith("i")) stems.add(`${stem.slice(0, -1)}y`);
        if (["ity", "ness", "ly", "ical"].includes(suffix) && stem.endsWith("e")) stems.add(stem.slice(0, -1));
      }
    }
  }
  if (word.endsWith("e") && word.length > 3) stems.add(word.slice(0, -1));
  if (word.endsWith("y") && word.length > 3) stems.add(`${word.slice(0, -1)}i`);
  if (word.endsWith("y") && word.length > 3) stems.add(`${word.slice(0, -1)}ie`);

  return [...stems].filter((item) => item.length >= 3);
}

const derivativeStemIndex = new Map();
{
  const allTerms = [...new Set(ALL_WORDS.map((w) => String(w.term || "").trim().toLowerCase().replace(/[^a-z]/g, "")))].filter((t) => t && !t.includes(" "));
  for (const term of allTerms) {
    for (const stem of stemVariants(term)) {
      if (!derivativeStemIndex.has(stem)) derivativeStemIndex.set(stem, new Set());
      derivativeStemIndex.get(stem).add(term);
    }
  }
}

const derivativeCache = new Map();
function findDerivatives(term) {
  const word = String(term || "").trim().toLowerCase().replace(/[^a-z]/g, "");
  if (!word || word.includes(" ") || word.length < 4) return [];
  if (derivativeCache.has(word)) return derivativeCache.get(word);

  const stems = stemVariants(word);
  const matches = new Set();
  for (const stem of stems) {
    const bucket = derivativeStemIndex.get(stem);
    if (bucket) {
      for (const candidate of bucket) {
        if (candidate === word) continue;
        if (Math.abs(candidate.length - word.length) <= 8) matches.add(candidate);
      }
    }
  }
  for (const stem of stems) {
    for (const [indexedStem, bucket] of derivativeStemIndex) {
      if (indexedStem === word) continue;
      if (indexedStem.startsWith(stem) && indexedStem.length <= stem.length + 6) {
        for (const candidate of bucket) {
          if (candidate !== word) matches.add(candidate);
        }
      }
    }
  }

  const result = [...matches]
    .sort((a, b) => Math.abs(a.length - word.length) - Math.abs(b.length - word.length))
    .slice(0, 12);
  derivativeCache.set(word, result);
  return result;
}

const BOOK_TERM_MAP = new Map();
for (const w of ALL_WORDS) {
  const key = String(w.term || "").trim().toLowerCase().replace(/[^a-z]/g, "");
  if (key && !BOOK_TERM_MAP.has(key)) {
    BOOK_TERM_MAP.set(key, {
      meaning: w.meaning || w.rawMeaning || "",
      pos: w.pos || "",
      term: w.term,
      examples: w.examples || [],
    });
  }
}

const DERIV_EXAMPLES = new Map(Object.entries(derivativeExamples));

const SUFFIX_NOTES = {
  s: "复数/三单", es: "复数/三单", ed: "过去式/过去分词", ing: "现在分词/动名词",
  er: "从事者；...的物", or: "从事者", able: "可...的", ible: "可...的",
  ment: "行为；结果", ion: "行为；状态", tion: "行为；状态", sion: "行为；状态", ation: "行为；过程",
  al: "...的（形容词）；行为", ic: "...的", ous: "充满...的", ful: "充满...的",
  less: "没有...的", y: "...的", ize: "使...化", ise: "使...化",
  ly: "...地", ness: "性质；状态", ity: "性质；状态", ish: "像...的",
};

const genDerivCache = new Map();
function generateDerivatives(term, pos) {
  const w = String(term || "").trim().toLowerCase().replace(/[^a-z]/g, "");
  if (!w || w.length < 3) return [];
  if (genDerivCache.has(w)) return genDerivCache.get(w);

  const isVerb = /v/i.test(pos || "");
  const isNoun = /n/i.test(pos || "") && !isVerb;
  const isAdj = /adj/i.test(pos || "");

  const endsWithE = w.endsWith("e");
  const endsWithY = w.endsWith("y") && !/[aeiou]y$/.test(w);
  const dropE = (sfx) => (endsWithE ? w.slice(0, -1) + sfx : w + sfx);
  const yToI = (sfx) => (endsWithY ? w.slice(0, -1) + "i" + sfx : dropE(sfx));
  const addS = () => (/[sxz]$|ch$|sh$/.test(w) ? w + "es" : w + "s");

  const ionForm = () => {
    if (w.endsWith("ate")) return w.slice(0, -3) + "ation";
    if (w.endsWith("ce")) return w.slice(0, -2) + "tion";
    if (w.endsWith("ct") || w.endsWith("rt") || w.endsWith("nt") || w.endsWith("st") || w.endsWith("pt")) return w + "ion";
    if (w.endsWith("se")) return w.slice(0, -1) + "ion";
    if (w.endsWith("de")) return w.slice(0, -2) + "sion";
    if (w.endsWith("ss")) return w + "ion";
    return w + "ation";
  };

  const forms = [];
  const add = (term, sfx) => {
    if (term !== w && term.length > w.length && term.length <= w.length + 6) {
      forms.push({ term, suffix: sfx, note: SUFFIX_NOTES[sfx] || "" });
    }
  };
  if (isVerb) {
    add(addS(), /[sxz]$|ch$|sh$/.test(w) ? "es" : "s");
    add(endsWithY ? yToI("ed") : dropE("ed"), "ed");
    add(dropE("ing"), "ing");
    add(dropE("er"), "er");
    add(dropE("or"), "or");
    add(dropE("able"), "able");
    add(w + "ment", "ment");
    add(ionForm(), "tion");
  }
  if (isNoun) {
    add(dropE("al"), "al");
    add(dropE("ic"), "ic");
    add(dropE("ous"), "ous");
    add(dropE("ful"), "ful");
    add(dropE("less"), "less");
    add(dropE("y"), "y");
    add(dropE("ize"), "ize");
    add(yToI("al"), "al");
    add(yToI("ous"), "ous");
  }
  if (isAdj) {
    add(endsWithY ? yToI("ly") : dropE("ly"), "ly");
    add(yToI("ness"), "ness");
    add(dropE("ity"), "ity");
    add(dropE("ize"), "ize");
    add(dropE("ish"), "ish");
  }

  const seen = new Set();
  const result = forms.filter((f) => {
    if (seen.has(f.term)) return false;
    seen.add(f.term);
    return true;
  });
  genDerivCache.set(w, result);
  return result;
}

const DERIVATIVE_POS = {
  s: "v.",
  es: "v.",
  ed: "v.",
  ing: "v.",
  er: "n.",
  or: "n.",
  able: "adj.",
  ible: "adj.",
  ment: "n.",
  ion: "n.",
  tion: "n.",
  sion: "n.",
  ation: "n.",
  al: "adj.",
  ic: "adj.",
  ous: "adj.",
  ful: "adj.",
  less: "adj.",
  y: "adj.",
  ize: "v.",
  ise: "v.",
  ly: "adv.",
  ness: "n.",
  ity: "n.",
  ish: "adj.",
};

function baseDerivativeMeaning(word) {
  return String(word.meaning || word.rawMeaning || "")
    .split("\n")[0]
    .replace(/^(?:adj|adv|aux|conj|det|int|n|num|phr|pl|prep|pron|v|vi|vt)\.\s*/i, "")
    .trim();
}

function derivativeConcepts(word) {
  return baseDerivativeMeaning(word)
    .split(/[；;，,]/)
    .map((part) => part.trim().replace(/[的地]$/, ""))
    .filter(Boolean)
    .slice(0, 2)
    .join("、");
}

function inferredDerivativeDetail(word, item) {
  const key = item.term.toLowerCase().replace(/[^a-z]/g, "");
  if (derivativeDetails[key]) return derivativeDetails[key];

  const baseMeaning = baseDerivativeMeaning(word) || word.term;
  const concepts = derivativeConcepts(word) || baseMeaning;
  const suffix = item.suffix;

  if (suffix === "ly") {
    return {
      pos: "adv.",
      meaning: baseMeaning
        .split(/[；;，,]/)
        .map((part) => part.trim().replace(/的$/, "地"))
        .filter(Boolean)
        .join("；"),
    };
  }
  if (suffix === "ness" || suffix === "ity") {
    return { pos: "n.", meaning: `${concepts}的性质、状态或特征` };
  }
  if (suffix === "s" || suffix === "es") {
    return { pos: "v.", meaning: `${baseMeaning}（动词第三人称单数形式）` };
  }
  if (suffix === "ed") {
    return { pos: "v.", meaning: `${baseMeaning}（过去式或过去分词形式）` };
  }
  if (suffix === "ing") {
    return { pos: "v.", meaning: `${baseMeaning}（现在分词或动名词形式）` };
  }
  if (suffix === "er" || suffix === "or") {
    return { pos: "n.", meaning: `从事“${concepts}”的人或执行相关动作的事物` };
  }
  if (suffix === "able" || suffix === "ible") {
    return { pos: "adj.", meaning: `能够${concepts}的；可以被${concepts}的` };
  }
  if (["ment", "ion", "tion", "sion", "ation"].includes(suffix)) {
    return { pos: "n.", meaning: `${concepts}的行为、过程、状态或结果` };
  }
  if (suffix === "less") {
    return { pos: "adj.", meaning: `缺少${concepts}的；没有${concepts}的` };
  }
  if (suffix === "ful") {
    return { pos: "adj.", meaning: `充满${concepts}的；具有${concepts}特征的` };
  }
  if (suffix === "ize" || suffix === "ise") {
    return { pos: "v.", meaning: `使……具有${concepts}的特征；使……变成相关状态` };
  }
  if (suffix === "ish") {
    return { pos: "adj.", meaning: `有些${concepts}的；带有${concepts}特征的` };
  }
  return {
    pos: DERIVATIVE_POS[suffix] || "",
    meaning: `与“${baseMeaning}”有关的派生含义`,
  };
}

function isReliableGeneratedDerivative(item) {
  const key = item.term.toLowerCase().replace(/[^a-z]/g, "");
  return Boolean(derivativeDetails[key] || DERIV_EXAMPLES.has(key));
}

function flattenBookWords(book) {
  return book.chapters.flatMap((chapter) => chapter.words.map((word) => ({ ...word, chapterId: chapter.id })));
}

function buildWordBooks(favorites, customBooks = []) {
  const favoriteSet = new Set(favorites);
  const importedBooks = customBooks
    .filter((book) => Array.isArray(book.chapters))
    .map((book) => {
      const words = flattenBookWords(book);
      return {
        id: book.id,
        title: book.title || "\u5bfc\u5165\u8bcd\u4e66",
        total: book.declaredTotal || words.length,
        words,
        chapters: book.chapters,
        emptyText: "\u6682\u65e0\u8bcd\u6761",
      };
    });
  const studyBooks = [
    {
      id: MAIN_BOOK_ID,
      title: BOOK_TITLE,
      total: BOOK_TOTAL,
      words: ALL_WORDS,
      chapters: CHAPTERS,
      emptyText: "\u6682\u65e0\u8bcd\u6761",
    },
    ...importedBooks,
  ];
  const allWords = studyBooks.flatMap((book) => book.words);
  const favoriteWords = allWords.filter((word) => favoriteSet.has(word.id));

  return [
    ...studyBooks,
    {
      id: FAVORITES_BOOK_ID,
      title: "\u751f\u8bcd\u672c",
      total: favoriteWords.length,
      words: favoriteWords,
      chapters: [
        {
          id: FAVORITES_BOOK_ID,
          title: "\u751f\u8bcd\u672c",
          declaredCount: favoriteWords.length,
          words: favoriteWords,
        },
      ],
      emptyText: "\u8fd8\u6ca1\u6709\u6536\u85cf\u751f\u8bcd",
    },
  ];
}

function defaultState() {
  return {
    favorites: [],
    viewed: {},
    notes: {},
    customBooks: [],
    meaningsHidden: true,
    spellingSeparated: true,
    accent: "us",
    activeBookId: MAIN_BOOK_ID,
    searchHistory: [],
    shortcutKeys: { ...DEFAULT_SHORTCUT_KEYS },
  };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    return {
      ...defaultState(),
      ...parsed,
      meaningsHidden: true,
      spellingSeparated: parsed.spellingSeparated !== false,
      accent: VOICE_OPTIONS[parsed.accent] ? parsed.accent : "us",
      shortcutKeys: normalizeShortcutKeys(parsed.shortcutKeys),
    };
  } catch {
    return defaultState();
  }
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalizeBackupState(value) {
  if (!isRecord(value)) throw new Error("备份数据格式不正确");

  const defaults = defaultState();
  return {
    ...defaults,
    ...value,
    favorites: Array.isArray(value.favorites) ? value.favorites.filter((item) => typeof item === "string") : [],
    viewed: isRecord(value.viewed) ? value.viewed : {},
    notes: isRecord(value.notes) ? value.notes : {},
    customBooks: Array.isArray(value.customBooks) ? value.customBooks.filter((book) => isRecord(book)) : [],
    searchHistory: Array.isArray(value.searchHistory) ? value.searchHistory.filter((item) => typeof item === "string") : [],
    meaningsHidden: true,
    spellingSeparated: value.spellingSeparated !== false,
    accent: VOICE_OPTIONS[value.accent] ? value.accent : defaults.accent,
    activeBookId: typeof value.activeBookId === "string" ? value.activeBookId : defaults.activeBookId,
    shortcutKeys: normalizeShortcutKeys(value.shortcutKeys),
  };
}

function mergeStoredStates(cloudValue, localValue) {
  const cloud = normalizeBackupState(cloudValue);
  const local = normalizeBackupState(localValue);
  const viewed = { ...cloud.viewed };
  Object.entries(local.viewed).forEach(([wordId, timestamp]) => {
    if (!viewed[wordId] || Number(timestamp) > Number(viewed[wordId])) viewed[wordId] = timestamp;
  });
  const customBooks = new Map(cloud.customBooks.map((book) => [book.id, book]));
  local.customBooks.forEach((book) => customBooks.set(book.id, book));

  return {
    ...cloud,
    ...local,
    favorites: Array.from(new Set([...cloud.favorites, ...local.favorites])),
    viewed,
    notes: { ...cloud.notes, ...local.notes },
    customBooks: Array.from(customBooks.values()),
    searchHistory: Array.from(new Set([...local.searchHistory, ...cloud.searchHistory])).slice(0, 30),
    meaningsHidden: true,
  };
}

function downloadBackup(state) {
  const payload = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    data: state,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `word-memory-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function readBackupFile(file) {
  let parsed;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    throw new Error("无法读取备份文件，请选择导出的 JSON 文件");
  }

  if (parsed?.format !== BACKUP_FORMAT || parsed?.version !== BACKUP_VERSION) {
    throw new Error("备份文件版本或格式不受支持");
  }
  return normalizeBackupState(parsed.data);
}

function IconButton({ children, label, className = "", ...props }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-900 transition hover:bg-slate-100 active:scale-95 sm:h-10 sm:w-10 ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

function chapterLabel(chapter, index) {
  if (chapter.id === FAVORITES_BOOK_ID) return "生词本";

  const pageMatch = String(chapter.id || "").match(/page-(\d+)/i);
  const count = chapter.declaredCount || chapter.words?.length || 0;

  if (pageMatch) return `第 ${Number(pageMatch[1])} 页  ${count}词`;
  return `${chapter.title || `Chapter ${index + 1}`}  ${count}词`;
}

function phoneticFor(word, accent) {
  if (accent === "uk") return word.phoneticUk || word.phoneticUs || word.phonetic || "";
  return word.phoneticUs || word.phoneticUk || word.phonetic || "";
}

function splitTerm(word) {
  const term = String(word.term || "");
  const normalizedTerm = term.toLowerCase();
  if (termSegmentCache.has(normalizedTerm)) return termSegmentCache.get(normalizedTerm);

  const segments = term.split(/(\s+|[-/])/).flatMap((part) => {
    if (!part) return [];
    if (!part.trim() || /[\s\-/]/.test(part)) return [part];
    const key = part.toLowerCase();
    if (syllableExceptions[key]) return syllableExceptions[key];
    return hyphenator.hyphenate(part);
  });

  termSegmentCache.set(normalizedTerm, segments);
  return segments;
}

function SplitTerm({ word, className = "" }) {
  const segments = splitTerm(word);

  return (
    <span className={`inline-flex flex-wrap items-baseline ${className}`}>
      {segments.map((segment, index) => (
        <span key={`${segment}-${index}`} className="inline-flex items-baseline">
          {index > 0 && segment.trim() && segments[index - 1]?.trim() && <span className="px-0.5 text-orange-500">·</span>}
          <span>{segment}</span>
        </span>
      ))}
    </span>
  );
}

function WordSplits({ word }) {
  const morphs = morphologySplit(word.term);
  const syllables = splitTerm(word)
    .filter((s) => s.trim())
    .join("·");

  return (
    <div className="mt-2 space-y-1 text-xs font-semibold sm:text-sm">
      {morphs && morphs.length > 1 && (
        <div className="flex items-baseline gap-1.5">
          <span className="text-slate-400">构词</span>
          <span className="text-slate-700">{morphs.join("·")}</span>
        </div>
      )}
      <div className="flex items-baseline gap-1.5">
        <span className="text-slate-400">音节</span>
        <span className="text-slate-700">{syllables}</span>
      </div>
    </div>
  );
}

function spellingPattern(word, separated) {
  const target = String(word.term || "").toLowerCase().replace(/[^a-z]/g, "");
  const groups = [];
  let letterIndex = 0;
  let previousWasLetters = false;

  for (const segment of separated ? splitTerm(word) : [word.term]) {
    const letters = [...segment].filter((character) => /[a-z]/i.test(character));
    if (letters.length > 0) {
      if (previousWasLetters) groups.push({ type: "separator", text: "·" });
      groups.push({
        type: "letters",
        slots: letters.map(() => ({ index: letterIndex++ })),
      });
      previousWasLetters = true;
      continue;
    }

    if (segment) {
      groups.push({ type: "separator", text: segment.trim() ? segment : "／" });
      previousWasLetters = false;
    }
  }

  return { target, groups };
}

function SpellingPractice({ word, accent, keyboardMode, separated }) {
  const pattern = useMemo(() => spellingPattern(word, separated), [separated, word]);
  const [attempt, setAttempt] = useState({ term: pattern.target, value: "" });
  const spokenAttemptRef = useRef("");
  const typed = attempt.term === pattern.target ? attempt.value : "";
  const completed = pattern.target.length > 0 && typed.length === pattern.target.length;
  const correct = completed && typed.toLowerCase() === pattern.target;
  const wrong = completed && !correct;

  useEffect(() => {
    if (!correct) {
      spokenAttemptRef.current = "";
      return;
    }

    const signature = `${pattern.target}:${typed}`;
    if (spokenAttemptRef.current === signature) return;
    spokenAttemptRef.current = signature;
    speakWord(word.term, accent);
  }, [accent, correct, pattern.target, typed, word.term]);

  useEffect(() => {
    if (!pattern.target) return undefined;
    const desktopQuery = window.matchMedia("(min-width: 1024px)");
    const handleKeyDown = (event) => {
      const modeMatches = keyboardMode === "desktop" ? desktopQuery.matches : !desktopQuery.matches;
      if (!modeMatches || event.ctrlKey || event.metaKey || event.altKey) return;
      const eventTarget = event.target;
      if (eventTarget instanceof Element && eventTarget.closest("input, textarea, select, [contenteditable='true']")) return;

      if (event.key === "Backspace") {
        setAttempt((current) => {
          const value = current.term === pattern.target ? current.value : "";
          return { term: pattern.target, value: value.slice(0, -1) };
        });
        if (typed) event.preventDefault();
        return;
      }

      if (!/^[a-z]$/i.test(event.key)) return;
      event.preventDefault();
      setAttempt((current) => {
        const currentValue = current.term === pattern.target ? current.value : "";
        const nextBase = currentValue.length >= pattern.target.length ? "" : currentValue;
        return {
          term: pattern.target,
          value: `${nextBase}${event.key}`.slice(0, pattern.target.length),
        };
      });
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [keyboardMode, pattern.target, typed]);

  const toneClass = correct
    ? "border-orange-500 text-orange-600"
    : wrong
      ? "border-red-500 text-red-500"
      : "border-slate-300 text-slate-800";
  const status = correct
    ? "拼写正确，再输入即可重练"
    : wrong
      ? "拼写错误，再输入即可重练"
      : typed
        ? `${typed.length}/${pattern.target.length}`
        : "直接使用键盘拼写";

  return (
    <div className="max-w-full rounded-lg bg-slate-50 px-3 py-2.5 sm:max-w-sm sm:px-4 sm:py-3" aria-label={`${word.term} 键盘拼写练习`}>
      <div className="flex max-w-full flex-wrap items-end justify-end gap-x-1.5 gap-y-2 font-mono text-base font-bold sm:text-lg">
        {pattern.groups.map((group, groupIndex) =>
          group.type === "separator" ? (
            <span key={`separator-${groupIndex}`} className="pb-1 text-slate-300">
              {group.text}
            </span>
          ) : (
            <span key={`letters-${groupIndex}`} className="inline-flex items-end gap-1">
              {group.slots.map((slot) => (
                <span
                  key={slot.index}
                  className={`inline-flex h-6 w-3.5 items-end justify-center border-b-2 pb-0.5 transition-colors sm:h-7 sm:w-4 ${toneClass}`}
                >
                  {typed[slot.index] || "\u00a0"}
                </span>
              ))}
            </span>
          ),
        )}
      </div>
      <p
        aria-live="polite"
        className={`mt-2 text-right text-[10px] font-bold sm:text-xs ${correct ? "text-orange-600" : wrong ? "text-red-500" : "text-slate-400"}`}
      >
        {status}
      </p>
    </div>
  );
}

function staticBilingualExamples(word) {
  const translated = (word.examples || [])
    .map((example) => ({
      en: typeof example === "string" ? example : example.en,
      zh: typeof example === "string" ? exampleTranslations[example] : example.zh,
      source: "local",
    }))
    .filter((example) => example.en && example.zh);
  const seen = new Set(translated.map((example) => example.en.toLowerCase()));
  const combined = [...translated];

  for (const example of exampleAdditions[word.term.toLowerCase()] || []) {
    if (seen.has(example.en.toLowerCase())) continue;
    seen.add(example.en.toLowerCase());
    combined.push({ ...example, source: "local" });
  }

  return combined;
}

function normalizedSentence(sentence) {
  return String(sentence || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function mergeBilingualExamples(remoteExamples, localExamples) {
  const seenEnglish = new Set();
  const seenChinese = new Set();
  const merged = [];

  for (const example of [...remoteExamples, ...localExamples]) {
    const englishKey = normalizedSentence(example.en);
    const chineseKey = normalizedSentence(example.zh);
    if (!englishKey || !chineseKey || seenEnglish.has(englishKey) || seenChinese.has(chineseKey)) continue;
    seenEnglish.add(englishKey);
    seenChinese.add(chineseKey);
    merged.push(example);
    if (merged.length >= 4) break;
  }

  return merged;
}

function loadCorpusExamples(term, signal) {
  const key = String(term || "").trim().toLowerCase();
  if (!key) return Promise.resolve([]);
  if (exampleLookupCache.has(key)) return Promise.resolve(exampleLookupCache.get(key));

  return fetch(`/api/examples?word=${encodeURIComponent(term)}`, { signal })
    .then(async (response) => {
      if (!response.ok) throw new Error("例句查询失败");
      const payload = await response.json();
      const examples = Array.isArray(payload.examples) ? payload.examples : [];
      exampleLookupCache.set(key, examples);
      return examples;
    })
    .catch((error) => {
      if (error?.name === "AbortError") throw error;
      return [];
    });
}

function HighlightedTerm({ text, term }) {
  const source = String(text || "");
  const target = String(term || "").trim();
  if (!target) return source;

  const escaped = target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts = source.split(new RegExp(`(${escaped})`, "gi"));

  return parts.map((part, index) =>
    part.toLowerCase() === target.toLowerCase() ? (
      <strong key={`${part}-${index}`} className="font-extrabold text-orange-600">
        {part}
      </strong>
    ) : (
      part
    ),
  );
}

function ExampleContent({ word }) {
  const localExamples = useMemo(() => staticBilingualExamples(word), [word]);
  const [lookup, setLookup] = useState({ term: word.term, loading: true, examples: [] });

  useEffect(() => {
    let active = true;
    const term = word.term;
    const cacheKey = term.trim().toLowerCase();
    const controller = new AbortController();
    let timer;

    const load = () => {
      loadCorpusExamples(term, controller.signal)
        .then((examples) => {
          if (active) setLookup({ term, loading: false, examples });
        })
        .catch(() => {});
    };

    if (exampleLookupCache.has(cacheKey)) load();
    else timer = window.setTimeout(load, 180);

    return () => {
      active = false;
      if (timer) window.clearTimeout(timer);
      controller.abort();
    };
  }, [word.term]);

  const loading = lookup.term !== word.term || lookup.loading;
  const examples = useMemo(
    () => mergeBilingualExamples(lookup.term === word.term ? lookup.examples : [], localExamples),
    [lookup, localExamples, word.term],
  );

  if (loading && examples.length === 0) {
    return (
      <div className="space-y-3" aria-label="正在搜索真实双语例句">
        {[1, 2, 3].map((item) => (
          <div key={item} className="animate-pulse rounded-xl border border-slate-100 bg-slate-50/80 px-3.5 py-3 sm:px-4 sm:py-3.5">
            <div className="h-4 w-4/5 rounded bg-slate-200" />
            <div className="mt-3 h-3 w-2/3 rounded bg-slate-100" />
          </div>
        ))}
      </div>
    );
  }

  if (examples.length === 0) {
    return (
      <div className="rounded-xl bg-slate-50 px-4 py-8 text-center">
        <p className="text-sm font-semibold text-slate-500 sm:text-base">暂未找到可靠的中英双语例句</p>
        <p className="mt-2 text-xs leading-5 text-slate-400">为避免重复和生硬句型，这里不再使用通用模板补足数量。</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {examples.map((example, index) => (
        <div key={`${example.en}-${index}`} className="rounded-xl border border-slate-100 bg-slate-50/80 px-3.5 py-3 sm:px-4 sm:py-3.5">
          <p className="text-sm leading-7 text-slate-800 sm:text-base">
            <span className="mr-2 text-xs font-bold tabular-nums text-slate-300">{index + 1}</span>
            <HighlightedTerm text={example.en} term={word.term} />
          </p>
          <p className="mt-1 pl-5 text-sm leading-6 text-slate-500 sm:text-[15px] sm:leading-7">
            {example.zh}
          </p>
          {example.sourceUrl && (
            <a
              href={example.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-1.5 inline-block pl-5 text-[10px] font-semibold text-slate-300 transition hover:text-orange-500 sm:text-xs"
            >
              {example.sourceLabel || "Tatoeba"} · CC BY 2.0 FR
            </a>
          )}
        </div>
      ))}
      {loading && examples.length < 4 && (
        <p className="px-1 text-xs font-semibold text-slate-400">正在继续搜索更多不重复的双语例句…</p>
      )}
    </div>
  );
}

function DerivativeTerm({ term, baseTerm }) {
  const source = String(term || "");
  const base = String(baseTerm || "").toLowerCase().replace(/[^a-z]/g, "");
  const lowerSource = source.toLowerCase();
  let start = lowerSource.indexOf(base);
  let length = start >= 0 ? base.length : 0;

  if (start < 0 && base) {
    const candidates = [
      base.endsWith("e") ? base.slice(0, -1) : "",
      base.endsWith("y") ? base.slice(0, -1) : "",
    ].filter((candidate) => candidate.length >= 3);

    for (const candidate of candidates) {
      const candidateStart = lowerSource.indexOf(candidate);
      if (candidateStart >= 0 && candidate.length > length) {
        start = candidateStart;
        length = candidate.length;
      }
    }
  }

  if (start < 0 && base) {
    let commonLength = 0;
    while (
      commonLength < base.length
      && commonLength < lowerSource.length
      && base[commonLength] === lowerSource[commonLength]
    ) {
      commonLength += 1;
    }
    if (commonLength >= 3) {
      start = 0;
      length = commonLength;
    }
  }

  if (start < 0 || length < 3) return <span className="text-slate-950">{source}</span>;

  return (
    <span aria-label={source}>
      <span className="text-slate-950">{source.slice(0, start)}</span>
      <span className="text-orange-600">{source.slice(start, start + length)}</span>
      <span className="text-slate-950">{source.slice(start + length)}</span>
    </span>
  );
}

function derivativeMeaningLines(pos, meaning) {
  return String(meaning || "")
    .split("\n")
    .map((line, index) => {
      const trimmed = line.trim();
      const match = trimmed.match(/^((?:adj|adv|aux|conj|det|int|n|num|phr|pl|prep|pron|v|vi|vt)\.)\s*(.*)$/i);
      if (match) return { pos: match[1], meaning: match[2] };
      return { pos: index === 0 ? pos : "", meaning: trimmed };
    })
    .filter((line) => line.pos || line.meaning);
}

function DerivativeMeaning({ pos, meaning }) {
  const lines = derivativeMeaningLines(pos, meaning);
  return (
    <div className="space-y-1">
      {lines.map((line, index) => (
        <p key={`${line.pos}-${line.meaning}-${index}`} className="text-sm leading-6 text-slate-700 sm:text-base sm:leading-7">
          {line.pos && <strong className="mr-1.5 font-extrabold text-slate-950">{line.pos}</strong>}
          <span>{line.meaning}</span>
        </p>
      ))}
    </div>
  );
}

function getSynonymDetail(item) {
  const term = String(item || "").trim();
  const key = term.toLowerCase();
  const bookEntry = BOOK_TERM_MAP.get(key.replace(/[^a-z]/g, ""));
  const detail = synonymDetails[key];

  if (detail) return { term, ...detail, inBook: Boolean(bookEntry) };
  if (bookEntry) {
    return {
      term: bookEntry.term,
      pos: bookEntry.pos,
      meaning: bookEntry.meaning,
      inBook: true,
    };
  }
  return {
    term,
    pos: "",
    meaning: `与“${term}”所在词条意思相近`,
    inBook: false,
  };
}

function DetailContent({ tab, word, note, onChangeNote }) {
  if (tab === NOTE_TAB) {
    return (
      <div>
        <textarea
          value={note}
          onChange={(event) => onChangeNote(event.target.value)}
          placeholder="\u5199\u4e0b\u4f60\u5bf9\u8fd9\u4e2a\u5355\u8bcd\u7684\u8bb0\u5fc6\u70b9\u3001\u6613\u9519\u70b9\u6216\u4f8b\u53e5..."
          className="min-h-32 w-full resize-none rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm leading-6 text-slate-900 outline-none transition focus:border-orange-400 focus:bg-white focus:ring-2 focus:ring-orange-100 sm:min-h-40 sm:text-base sm:leading-7"
        />
        <p className="mt-2 text-xs font-semibold text-slate-400">笔记会自动永久保存到本地。</p>
      </div>
    );
  }

  if (tab === EXAMPLE_TAB) {
    return <ExampleContent word={word} />;
  }

  if (tab === "\u6d3e\u751f") {
    const inBook = findDerivatives(word.term);
    const generated = generateDerivatives(word.term, word.pos);
    const seen = new Set();
    const allDeriv = [];
    const addDeriv = (term, pos, meaning, clickable, examples) => {
      const key = term.toLowerCase().replace(/[^a-z]/g, "");
      if (seen.has(key) || key === word.term.toLowerCase().replace(/[^a-z]/g, "")) return;
      seen.add(key);
      allDeriv.push({ term, pos, meaning, clickable, examples: examples || [] });
    };
    for (const item of [...(word.derivatives || []), ...inBook]) {
      const key = item.toLowerCase().replace(/[^a-z]/g, "");
      const entry = BOOK_TERM_MAP.get(key);
      if (entry) addDeriv(entry.term, entry.pos, entry.meaning, true, entry.examples);
    }
    for (const item of generated) {
      const key = item.term.toLowerCase().replace(/[^a-z]/g, "");
      const inBookEntry = BOOK_TERM_MAP.get(key);
      if (inBookEntry) {
        addDeriv(inBookEntry.term, inBookEntry.pos, inBookEntry.meaning, true, inBookEntry.examples);
      } else if (isReliableGeneratedDerivative(item)) {
        const detail = inferredDerivativeDetail(word, item);
        const exs = DERIV_EXAMPLES.get(key) || [];
        addDeriv(item.term, detail.pos, detail.meaning, false, exs);
      }
    }

    if (!allDeriv.length) return <p className="text-sm text-slate-400 sm:text-base">暂无派生词</p>;
    return (
      <div className="flex flex-col gap-2.5">
        {allDeriv.map((item) => (
          <div
            key={item.term}
            className={`rounded-lg px-3 py-2.5 sm:px-4 sm:py-3 ${
              item.clickable ? "bg-orange-50" : "bg-slate-50"
            }`}
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="shrink-0 text-base font-extrabold sm:text-lg">
                <DerivativeTerm term={item.term} baseTerm={word.term} />
              </span>
              {item.clickable && (
                <span className="rounded bg-orange-100 px-1.5 py-0.5 text-[10px] font-bold text-orange-700 sm:text-xs">
                  词库
                </span>
              )}
            </div>
            {item.meaning && (
              <div className="mt-1.5">
                <DerivativeMeaning pos={item.pos} meaning={item.meaning} />
              </div>
            )}
            {item.examples.length > 0 && (
              <div className="mt-2 space-y-1">
                {item.examples.slice(0, 2).map((ex, i) => (
                  <p key={i} className="border-l-2 border-orange-300 pl-2.5 text-sm leading-6 text-slate-600 sm:pl-3 sm:leading-7">
                    {ex}
                  </p>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    );
  }

  if (tab === AFFIX_TAB) {
    const detected = detectAffixes(word.term);
    const seen = new Set();
    const allRoots = [];
    for (const root of [...(word.roots || []), ...detected]) {
      const key = root.part.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      allRoots.push(root);
    }
    if (!allRoots.length) return <p className="text-sm text-slate-400 sm:text-base">暂无词缀信息</p>;
    return (
      <div className="space-y-4 sm:space-y-5">
        <div className="rounded-lg bg-slate-950 p-4 text-white sm:p-5">
          <p className="text-sm leading-6 text-slate-200">识别前缀、词根和后缀，能帮你更快理解派生词和词义变化。</p>
        </div>
        <div className="space-y-3">
          {allRoots.map((root) => (
            <div key={word.id + "-" + root.part} className="flex items-start justify-between gap-3 border-b pb-3 sm:gap-4">
              <span className="text-lg font-bold text-orange-600 sm:text-xl">{root.part}</span>
              <span className="text-right text-sm text-slate-600 sm:text-base">{root.note}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (tab === "\u8fd1\u4e49") {
    if (!word.synonyms?.length) return <p className="text-sm text-slate-400 sm:text-base">暂无近义词</p>;
    const synonyms = word.synonyms.map(getSynonymDetail);
    return (
      <div className="flex flex-col gap-2.5">
        {synonyms.map((item) => (
          <div key={item.term} className="rounded-lg bg-orange-50 px-3 py-2.5 sm:px-4 sm:py-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-base font-extrabold text-orange-700 sm:text-lg">{item.term}</span>
              {item.inBook && (
                <span className="rounded bg-orange-100 px-1.5 py-0.5 text-[10px] font-bold text-orange-700 sm:text-xs">
                  词库
                </span>
              )}
            </div>
            <div className="mt-1.5">
              <DerivativeMeaning pos={item.pos} meaning={item.meaning} />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return null;
}

function WordRowBase({ word, selected, favorite, meaningsHidden, accent, onSelect, onToggleFavorite, onOpenDetail }) {
  const showMeaning = selected && !meaningsHidden;
  const voiceLabel = VOICE_OPTIONS[accent]?.label || VOICE_OPTIONS.us.label;

  return (
    <div
      id={`word-row-${word.id}`}
      className={`border-b border-slate-100 px-4 transition sm:px-5 ${selected ? "bg-orange-50" : "bg-white"}`}
      onClick={() => onSelect(word.id)}
    >
      <div className="min-h-14 py-3 sm:min-h-16 sm:py-4">
        <div className="flex items-start gap-2.5 sm:gap-3">
          <div className="min-w-0 flex-1">
            {selected ? (
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-2xl font-bold leading-none text-orange-600 sm:text-3xl">{word.term}</span>
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-400 sm:text-xs">
                    {word.source}
                  </span>
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500 sm:text-xs">
                    {voiceLabel}
                  </span>
                  {phoneticFor(word, accent) && <span className="text-xs font-semibold text-slate-500 sm:text-sm">{phoneticFor(word, accent)}</span>}
                </div>
                <WordSplits word={word} />
              </div>
            ) : (
              <div className="text-base font-bold text-slate-950 sm:text-xl">{word.term}</div>
            )}
            {showMeaning && (
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-sm leading-6 text-slate-800 sm:gap-2 sm:text-base">
                <span>{word.pos}</span>
                <span>{word.meaning}</span>
              </div>
            )}
          </div>

          {selected && (
            <div className="mt-1 flex items-center gap-1" onClick={(event) => event.stopPropagation()}>
              <IconButton
                 label={favorite ? "取消收藏" : "收藏到生词本"}
                className={favorite ? "text-orange-500" : "text-slate-500"}
                onClick={() => onToggleFavorite(word.id)}
              >
                <Star className={`h-5 w-5 sm:h-6 sm:w-6 ${favorite ? "fill-orange-400" : ""}`} />
              </IconButton>
              <IconButton label="单词详情" className="text-slate-500" onClick={() => onOpenDetail(word.id)}>
                <ListPlus className="h-5 w-5 sm:h-6 sm:w-6" />
              </IconButton>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const WordRow = memo(
  WordRowBase,
  (previous, next) =>
    previous.word === next.word &&
    previous.selected === next.selected &&
    previous.favorite === next.favorite &&
    previous.meaningsHidden === next.meaningsHidden &&
    previous.accent === next.accent &&
    previous.onSelect === next.onSelect &&
    previous.onToggleFavorite === next.onToggleFavorite &&
    previous.onOpenDetail === next.onOpenDetail
);

function WordListPage({
  book,
  selectedId,
  favorites,
  meaningsHidden,
  accent,
  onSelectWord,
  onToggleFavorite,
  onOpenDetail,
  onToggleMeanings,
  onToggleAccent,
  onOpenSearch,
  onOpenDashboard,
  pendingScrollId,
  onPendingScrollHandled,
}) {
  const favoriteSet = useMemo(() => new Set(favorites), [favorites]);
  const chapters = book.chapters;
  const [chapterPickerOpen, setChapterPickerOpen] = useState(false);
  const scrollParentRef = useRef(null);
  const listItems = useMemo(
    () =>
      chapters.flatMap((chapter, chapterIndex) => [
        { type: "chapter", key: `chapter-${chapter.id}`, chapter, chapterIndex },
        ...chapter.words.map((word) => ({
          type: "word",
          key: `word-${word.id}`,
          word,
          chapterId: chapter.id,
        })),
      ]),
    [chapters],
  );
  const listIndexes = useMemo(() => {
    const byWordId = new Map();
    const byChapterId = new Map();
    const chapterByWordId = new Map();
    listItems.forEach((item, index) => {
      if (item.type === "chapter") byChapterId.set(item.chapter.id, index);
      else {
        byWordId.set(item.word.id, index);
        chapterByWordId.set(item.word.id, item.chapterId);
      }
    });
    return { byWordId, byChapterId, chapterByWordId };
  }, [listItems]);
  const selectedChapterId = listIndexes.chapterByWordId.get(selectedId);
  const rowVirtualizer = useVirtualizer({
    count: listItems.length,
    getScrollElement: () => scrollParentRef.current,
    estimateSize: (index) => {
      const item = listItems[index];
      if (item?.type === "chapter") return 44;
      return item?.word.id === selectedId ? 132 : 64;
    },
    getItemKey: (index) => listItems[index]?.key || index,
    overscan: 12,
  });

  useEffect(() => {
    if (!chapterPickerOpen) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setChapterPickerOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [chapterPickerOpen]);

  useEffect(() => {
    if (!pendingScrollId) return undefined;
    const index = listIndexes.byWordId.get(pendingScrollId);
    const frame = requestAnimationFrame(() => {
      if (index !== undefined) rowVirtualizer.scrollToIndex(index, { align: "center" });
      onPendingScrollHandled();
    });
    return () => cancelAnimationFrame(frame);
  }, [listIndexes, onPendingScrollHandled, pendingScrollId, rowVirtualizer]);

  const jumpToChapter = (chapterId) => {
    setChapterPickerOpen(false);
    const index = listIndexes.byChapterId.get(chapterId);
    if (index !== undefined) rowVirtualizer.scrollToIndex(index, { align: "start", behavior: "smooth" });
  };

  return (
    <main className="flex h-screen min-h-0 flex-col bg-white text-slate-950">
      <header className="z-20 shrink-0 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-3 sm:h-16 sm:px-4">
          <IconButton label="返回">
            <ArrowLeft className="h-5 w-5 sm:h-6 sm:w-6" />
          </IconButton>
          <h1 className="min-w-0 truncate px-2 text-base font-bold sm:text-xl">{book.title}</h1>
          <div className="flex items-center gap-1">
            <div className="relative">
              <IconButton
                label="跳转章节"
                aria-haspopup="menu"
                aria-expanded={chapterPickerOpen}
                aria-controls="chapter-jump-menu"
                onClick={() => setChapterPickerOpen((open) => !open)}
                className={chapterPickerOpen ? "bg-orange-50 text-orange-600" : ""}
              >
                <BookOpen className="h-5 w-5 sm:h-6 sm:w-6" />
              </IconButton>
              <AnimatePresence>
                {chapterPickerOpen && (
                  <>
                    <button
                      type="button"
                      aria-label="关闭章节菜单"
                      className="fixed inset-0 z-30 cursor-default"
                      onClick={() => setChapterPickerOpen(false)}
                    />
                    <motion.div
                      id="chapter-jump-menu"
                      role="menu"
                      initial={{ opacity: 0, y: -8, scale: 0.98 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -6, scale: 0.98 }}
                      transition={{ duration: 0.15 }}
                      className="absolute right-0 top-11 z-40 max-h-[min(70vh,34rem)] w-72 overflow-y-auto rounded-xl border border-slate-200 bg-white p-2 shadow-xl sm:top-12 sm:w-80"
                    >
                      <div className="px-2 pb-2 pt-1 text-xs font-bold tracking-wide text-slate-400">跳转到章节</div>
                      {chapters.map((chapter, chapterIndex) => {
                        const firstWord = chapter.words[0]?.term || "";
                        const lastWord = chapter.words.at(-1)?.term || "";
                        const active = chapter.id === selectedChapterId;
                        return (
                          <button
                            key={chapter.id}
                            type="button"
                            role="menuitem"
                            onClick={() => jumpToChapter(chapter.id)}
                            className={`mb-1 w-full rounded-lg px-3 py-2.5 text-left transition last:mb-0 ${
                              active ? "bg-orange-50 text-orange-700" : "text-slate-700 hover:bg-slate-50"
                            }`}
                          >
                            <span className="flex items-center justify-between gap-3">
                              <span className="truncate text-sm font-extrabold sm:text-base">{chapter.title || `Chapter ${chapterIndex + 1}`}</span>
                              <span className="shrink-0 text-xs font-bold text-slate-400">{chapter.words.length}词</span>
                            </span>
                            {firstWord && lastWord && (
                              <span className="mt-1 block truncate text-xs font-semibold text-slate-400">
                                {firstWord} — {lastWord}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>
            <IconButton label="搜索" onClick={onOpenSearch}>
              <Search className="h-5 w-5 sm:h-6 sm:w-6" />
            </IconButton>
            <IconButton label={meaningsHidden ? "显示释义" : "隐藏释义"} onClick={onToggleMeanings}>
              {meaningsHidden ? <Eye className="h-5 w-5 sm:h-6 sm:w-6" /> : <EyeOff className="h-5 w-5 sm:h-6 sm:w-6" />}
            </IconButton>
            <button
              type="button"
              aria-label="切换英美发音"
              title="切换英美发音"
              onClick={onToggleAccent}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold text-orange-600 transition hover:bg-orange-50 active:scale-95 sm:h-10 sm:w-10 sm:text-base"
            >
              {VOICE_OPTIONS[accent]?.label || VOICE_OPTIONS.us.label}
            </button>
          </div>
        </div>

        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 pb-4 pt-1 sm:px-5 sm:pb-5">
          <span className="h-5 w-1.5 rounded-full bg-slate-300" />
          <span className="text-2xl font-bold sm:text-3xl">{book.total}词</span>
        </div>
      </header>

      <section ref={scrollParentRef} className="mx-auto min-h-0 w-full max-w-3xl flex-1 overflow-y-auto pb-16 lg:pb-0">
        {listItems.length > 0 && (
          <div className="relative w-full" style={{ height: `${rowVirtualizer.getTotalSize()}px` }}>
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const item = listItems[virtualRow.index];
              return (
                <div
                  key={item.key}
                  data-index={virtualRow.index}
                  ref={rowVirtualizer.measureElement}
                  className="absolute left-0 top-0 w-full"
                  style={{ transform: `translateY(${virtualRow.start}px)` }}
                >
                  {item.type === "chapter" ? (
                    <div
                      id={`chapter-section-${item.chapter.id}`}
                      className="border-y border-slate-100 bg-slate-50 px-4 py-2.5 text-sm font-semibold text-slate-400 sm:px-5 sm:py-3 sm:text-base"
                    >
                      {chapterLabel(item.chapter, item.chapterIndex)}
                    </div>
                  ) : (
                    <WordRow
                      word={item.word}
                      selected={selectedId === item.word.id}
                      favorite={favoriteSet.has(item.word.id)}
                      meaningsHidden={meaningsHidden}
                      accent={accent}
                      onSelect={onSelectWord}
                      onToggleFavorite={onToggleFavorite}
                      onOpenDetail={onOpenDetail}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}

        {listItems.length === 0 && (
          <div className="px-4 py-12 text-center text-sm text-slate-400 sm:px-5 sm:py-16 sm:text-base">没有找到匹配的单词</div>
        )}
      </section>

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-100 bg-white lg:static lg:shrink-0">
        <div className="mx-auto grid h-14 max-w-3xl grid-cols-2 sm:h-16">
          <button type="button" className="flex flex-col items-center justify-center gap-1 text-orange-600">
            <BookOpen className="h-5 w-5 sm:h-6 sm:w-6" />
            <span className="text-xs font-semibold">词汇</span>
          </button>
          <button
            type="button"
            onClick={onOpenDashboard}
            className="flex flex-col items-center justify-center gap-1 text-slate-500"
          >
            <BarChart3 className="h-5 w-5 sm:h-6 sm:w-6" />
            <span className="text-xs font-semibold">仪表盘</span>
          </button>
        </div>
      </nav>
    </main>
  );
}

function SearchPage({ book, query, onQueryChange, onBack, onSelectResult, searchHistory, onSelectHistory, onRemoveHistory, onClearHistory }) {
  const normalizedQuery = query.trim().toLowerCase();
  const indexedWords = useMemo(
    () =>
      book.chapters.flatMap((chapter, chapterIndex) =>
        chapter.words.map((word) => ({
          ...word,
          chapterTitle: chapterLabel(chapter, chapterIndex),
        }))
      ),
    [book.chapters]
  );
  const results = useMemo(() => {
    if (!normalizedQuery) return [];
    return indexedWords.filter((word) => word.term.toLowerCase().startsWith(normalizedQuery));
  }, [indexedWords, normalizedQuery]);

  const handleSelectResult = (id) => {
    if (normalizedQuery) onSelectHistory(query.trim());
    onSelectResult(id);
  };

  return (
    <main className="min-h-screen bg-white text-slate-950 lg:h-screen lg:min-h-0 lg:overflow-y-auto">
      <header className="sticky top-0 z-20 border-b border-slate-100 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-3xl items-center gap-2 px-3 sm:h-16 sm:px-4">
          <IconButton label="返回词汇" onClick={onBack}>
            <ArrowLeft className="h-5 w-5 sm:h-6 sm:w-6" />
          </IconButton>
          <label className="flex h-10 min-w-0 flex-1 items-center gap-2 border-b border-slate-200 text-slate-500">
            <Search className="h-5 w-5 shrink-0" />
            <input
              autoFocus
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder="搜索单词、释义或音标"
              className="h-full min-w-0 flex-1 bg-transparent text-base text-slate-900 outline-none placeholder:text-slate-400"
            />
          </label>
          {query && (
            <IconButton label="清空搜索" onClick={() => onQueryChange("")}>
              <X className="h-5 w-5 sm:h-6 sm:w-6" />
            </IconButton>
          )}
        </div>
      </header>

      <section className="mx-auto max-w-3xl px-4 py-4 sm:px-5">
        <div className="mb-3 flex items-center justify-between text-sm font-semibold text-slate-400">
          <span>{book.title}</span>
          {normalizedQuery && <span>{results.length} 个结果</span>}
        </div>

        {!normalizedQuery && searchHistory.length > 0 && (
          <div className="mb-6">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-sm font-bold text-slate-500">
                <Clock className="h-4 w-4" />
                搜索历史
              </div>
              <button
                type="button"
                onClick={onClearHistory}
                className="inline-flex items-center gap-1 text-xs font-semibold text-slate-400 transition hover:text-red-500"
              >
                <Trash2 className="h-3.5 w-3.5" />
                清空
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {searchHistory.map((item) => (
                <div
                  key={item}
                  className="group inline-flex items-center gap-1.5 rounded-full bg-slate-100 py-1.5 pl-3 pr-1.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-200"
                >
                  <button
                    type="button"
                    onClick={() => onQueryChange(item)}
                    className="shrink-0"
                  >
                    {item}
                  </button>
                  <button
                    type="button"
                    aria-label="删除"
                    title="删除"
                    onClick={() => onRemoveHistory(item)}
                    className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-slate-400 transition hover:bg-red-100 hover:text-red-500"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {!normalizedQuery && searchHistory.length === 0 && (
          <div className="py-16 text-center text-sm text-slate-400 sm:text-base">输入关键词开始搜索</div>
        )}

        {normalizedQuery && results.length === 0 && (
          <div className="py-16 text-center text-sm text-slate-400 sm:text-base">没有找到匹配的单词</div>
        )}

        <div className="divide-y divide-slate-100">
          {results.map((word) => (
            <button
              key={word.id}
              type="button"
              onClick={() => handleSelectResult(word.id)}
              className="flex w-full items-start justify-between gap-4 py-4 text-left transition hover:bg-slate-50"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-lg font-bold text-slate-950 sm:text-xl">{word.term}</span>
                  {(word.phoneticUs || word.phonetic) && <span className="text-sm font-semibold text-slate-400">{word.phoneticUs || word.phonetic}</span>}
                </div>
                <div className="mt-1 text-sm leading-6 text-slate-700 sm:text-base">
                  <span className="font-semibold">{word.pos}</span> {word.meaning}
                </div>
                <div className="mt-2 text-xs font-semibold text-orange-600 sm:text-sm">{word.chapterTitle}</div>
              </div>
              <ArrowLeft className="mt-1 h-5 w-5 rotate-180 text-slate-300" />
            </button>
          ))}
        </div>
      </section>
    </main>
  );
}

function DashboardPage({
  favorites,
  viewed,
  wordBooks,
  activeBook,
  onBack,
  onOpenWord,
  onChangeBook,
  onImportBook,
  onExportData,
  onImportData,
  shortcutKeys,
  onChangeShortcut,
  onResetShortcuts,
  currentUser,
  signOutPath,
  syncStatus,
  syncMessage,
  onRetrySync,
}) {
  const [bookChooserOpen, setBookChooserOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importMessage, setImportMessage] = useState("");
  const [backupImporting, setBackupImporting] = useState(false);
  const [backupMessage, setBackupMessage] = useState("");
  const [recordingShortcut, setRecordingShortcut] = useState(null);
  const [shortcutMessage, setShortcutMessage] = useState("");
  const favoriteSet = useMemo(() => new Set(favorites), [favorites]);
  const activeViewedCount = activeBook.words.filter((word) => viewed[word.id]).length;
  const progress = activeBook.total > 0 ? Math.round((activeViewedCount / activeBook.total) * 100) : 0;
  const listWords = activeBook.id === FAVORITES_BOOK_ID ? activeBook.words : activeBook.words.slice(0, 30);

  const handleShortcutKeyDown = (actionId, event) => {
    if (recordingShortcut !== actionId) return;
    event.preventDefault();
    event.stopPropagation();

    if (event.key === "Escape") {
      setRecordingShortcut(null);
      setShortcutMessage("已取消设置");
      return;
    }
    if (event.ctrlKey || event.metaKey || event.altKey) {
      setShortcutMessage("请直接按一个按键，不要组合 Ctrl、Alt 或 Command");
      return;
    }

    const key = canonicalShortcutKey(event.key);
    if (!key || BLOCKED_SHORTCUT_KEYS.has(key)) {
      setShortcutMessage("这个按键不能用作快捷键，请换一个");
      return;
    }
    const duplicate = SHORTCUT_ACTIONS.find((action) => action.id !== actionId && shortcutKeys[action.id] === key);
    if (duplicate) {
      setShortcutMessage(`${shortcutKeyLabel(key)} 已用于“${duplicate.label}”`);
      return;
    }

    onChangeShortcut(actionId, key);
    setRecordingShortcut(null);
    setShortcutMessage(`“${SHORTCUT_ACTIONS.find((action) => action.id === actionId)?.label}”已改为 ${shortcutKeyLabel(key)}`);
  };

  return (
    <main className="min-h-screen bg-slate-50 pb-8 text-slate-950 lg:h-screen lg:min-h-0 lg:overflow-y-auto">
      <header className="sticky top-0 z-20 bg-slate-50/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-3 sm:h-16 sm:px-4">
          <IconButton label="返回词汇" onClick={onBack}>
            <ArrowLeft className="h-5 w-5 sm:h-6 sm:w-6" />
          </IconButton>
          <h1 className="text-lg font-bold sm:text-xl">仪表盘</h1>
          <div className="h-9 w-9 sm:h-10 sm:w-10" />
        </div>
      </header>

      <section className="mx-auto max-w-3xl px-4 sm:px-5">
        <div className="mb-4 rounded-lg border border-slate-100 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <span className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
                syncStatus === "offline" || syncStatus === "error"
                  ? "bg-amber-50 text-amber-600"
                  : "bg-emerald-50 text-emerald-600"
              }`}>
                {syncStatus === "loading" || syncStatus === "syncing" ? (
                  <LoaderCircle className="h-5 w-5 animate-spin" />
                ) : syncStatus === "offline" || syncStatus === "error" ? (
                  <CloudOff className="h-5 w-5" />
                ) : (
                  <Cloud className="h-5 w-5" />
                )}
              </span>
              <div className="min-w-0">
                <h2 className="truncate text-base font-bold sm:text-lg">{currentUser?.displayName || "ChatGPT 用户"}</h2>
                <p className="truncate text-xs font-semibold text-slate-400 sm:text-sm">{currentUser?.email}</p>
                <p className={`mt-1 text-xs font-bold ${
                  syncStatus === "offline" || syncStatus === "error" ? "text-amber-600" : "text-emerald-600"
                }`} aria-live="polite">
                  {syncMessage}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {(syncStatus === "offline" || syncStatus === "error") && (
                <button
                  type="button"
                  onClick={onRetrySync}
                  className="inline-flex items-center gap-1.5 rounded-md bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-200 sm:text-sm"
                >
                  <RefreshCw className="h-4 w-4" />
                  重试
                </button>
              )}
              <a
                href={signOutPath}
                className="inline-flex items-center gap-1.5 rounded-md bg-slate-950 px-3 py-2 text-xs font-bold text-white transition hover:bg-slate-800 sm:text-sm"
              >
                <LogOut className="h-4 w-4" />
                退出
              </a>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-slate-100 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-orange-50 text-orange-600">
                <Keyboard className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-lg font-bold">自定义按键</h2>
                <p className="mt-1 text-xs font-semibold leading-5 text-slate-400 sm:text-sm">
                  点击一个按键后，再按下你想使用的键；字母快捷键会优先于拼写练习。
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                onResetShortcuts();
                setRecordingShortcut(null);
                setShortcutMessage("已恢复默认快捷键");
              }}
              className="inline-flex items-center gap-1.5 rounded-md bg-slate-100 px-3 py-2 text-xs font-bold text-slate-600 transition hover:bg-slate-200 sm:text-sm"
            >
              <RotateCcw className="h-4 w-4" />
              恢复默认
            </button>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-3">
            {SHORTCUT_ACTIONS.map((action) => {
              const recording = recordingShortcut === action.id;
              return (
                <button
                  key={action.id}
                  type="button"
                  aria-pressed={recording}
                  onClick={() => {
                    setRecordingShortcut(recording ? null : action.id);
                    setShortcutMessage(recording ? "已取消设置" : `请按下“${action.label}”的新按键`);
                  }}
                  onKeyDown={(event) => handleShortcutKeyDown(action.id, event)}
                  onBlur={() => {
                    if (recordingShortcut === action.id) setRecordingShortcut(null);
                  }}
                  className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-3 text-left transition sm:block sm:px-4 ${
                    recording
                      ? "border-orange-400 bg-orange-50 ring-2 ring-orange-100"
                      : "border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-slate-100"
                  }`}
                >
                  <span>
                    <span className="block text-sm font-bold text-slate-800">{action.label}</span>
                    <span className="mt-0.5 block text-xs font-semibold text-slate-400">{action.description}</span>
                  </span>
                  <kbd className={`inline-flex min-w-12 shrink-0 items-center justify-center rounded-md border px-2.5 py-1.5 font-mono text-sm font-extrabold shadow-sm sm:mt-3 ${
                    recording ? "border-orange-300 bg-white text-orange-600" : "border-slate-200 bg-white text-slate-800"
                  }`}>
                    {recording ? "请按键" : shortcutKeyLabel(shortcutKeys[action.id])}
                  </kbd>
                </button>
              );
            })}
          </div>
          <p className="mt-3 min-h-5 text-xs font-semibold text-slate-500" aria-live="polite">{shortcutMessage}</p>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-2xl font-bold leading-tight sm:text-3xl">正在学习</h2>
          <div className="flex items-center gap-2">
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-full bg-white px-3 py-2 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-100">
              <FileUp className="h-4 w-4" />
              导入词书
              <input
                type="file"
                accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                className="hidden"
                disabled={importing}
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (!file) return;
                  setImporting(true);
                  setImportMessage("正在导入...");
                  try {
                    const book = await onImportBook(file);
                    setImportMessage(`已导入 ${book.parsedTotal || book.declaredTotal} 词`);
                  } catch (error) {
                    setImportMessage(error instanceof Error ? error.message : "导入失败");
                  } finally {
                    setImporting(false);
                  }
                }}
              />
            </label>
            <button
              type="button"
              onClick={() => setBookChooserOpen((open) => !open)}
              className="rounded-full bg-orange-50 px-3 py-2 text-sm font-bold text-orange-600 transition hover:bg-orange-100 sm:px-4"
            >
              换本词书
            </button>
          </div>
        </div>
        {importMessage && <div className="mt-3 text-sm font-semibold text-slate-500">{importMessage}</div>}

        <AnimatePresence initial={false}>
          {bookChooserOpen && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="mt-4 grid grid-cols-1 gap-2 rounded-lg bg-white p-2 shadow-sm"
            >
              {wordBooks.map((book) => (
                <button
                  key={book.id}
                  type="button"
                  onClick={() => {
                    onChangeBook(book.id);
                    setBookChooserOpen(false);
                  }}
                  className={`flex items-center justify-between rounded-md px-3 py-3 text-left text-sm font-bold sm:px-4 sm:py-4 sm:text-base transition ${
                    activeBook.id === book.id ? "bg-slate-950 text-white" : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  <span>{book.title}</span>
                  <span className={activeBook.id === book.id ? "text-white/70" : "text-slate-400"}>{book.total}词</span>
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="mt-3 rounded-lg bg-white p-4 shadow-sm sm:mt-4 sm:p-6">
          <div className="flex items-end justify-between gap-4">
            <div>
              <div className="text-xs font-semibold text-slate-400 sm:text-sm">当前词书</div>
              <div className="mt-1.5 text-xl font-bold leading-tight sm:text-2xl">{activeBook.title}</div>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold text-orange-600 sm:text-3xl">{progress}%</div>
              <div className="mt-1 text-xs font-semibold text-slate-400 sm:text-sm">已查看</div>
            </div>
          </div>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100 sm:mt-5">
            <div className="h-full rounded-full bg-orange-500 transition-all" style={{ width: `${progress}%` }} />
          </div>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2 sm:mt-4 sm:gap-3">
          <div className="rounded-lg bg-white p-3 text-center shadow-sm sm:p-4">
            <div className="text-xl font-bold sm:text-2xl">{activeBook.total}</div>
            <div className="mt-1 text-xs font-semibold text-slate-400">总词数</div>
          </div>
          <div className="rounded-lg bg-white p-3 text-center shadow-sm sm:p-4">
            <div className="text-xl font-bold sm:text-2xl">{activeViewedCount}</div>
            <div className="mt-1 text-xs font-semibold text-slate-400">已点开</div>
          </div>
          <div className="rounded-lg bg-white p-3 text-center shadow-sm sm:p-4">
            <div className="text-xl font-bold sm:text-2xl">{favorites.length}</div>
            <div className="mt-1 text-xs font-semibold text-slate-400">生词</div>
          </div>
        </div>

        <div className="mt-3 rounded-lg bg-white p-4 shadow-sm sm:mt-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold">数据迁移</h2>
              <p className="mt-1 text-xs font-semibold text-slate-400 sm:text-sm">进度、收藏、快捷键、笔记、搜索记录和导入词书</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  onExportData();
                  setBackupMessage("备份已导出");
                }}
                className="inline-flex items-center gap-1.5 rounded-md bg-slate-950 px-3 py-2 text-sm font-bold text-white transition hover:bg-slate-800"
              >
                <Download className="h-4 w-4" />
                导出备份
              </button>
              <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md bg-orange-50 px-3 py-2 text-sm font-bold text-orange-700 transition hover:bg-orange-100">
                <Upload className="h-4 w-4" />
                导入备份
                <input
                  type="file"
                  accept=".json,application/json"
                  className="hidden"
                  disabled={backupImporting}
                  onChange={async (event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (!file) return;
                    setBackupImporting(true);
                    setBackupMessage("正在恢复...");
                    try {
                      await onImportData(file);
                      setBackupMessage("备份已恢复");
                    } catch (error) {
                      setBackupMessage(error instanceof Error ? error.message : "备份导入失败");
                    } finally {
                      setBackupImporting(false);
                    }
                  }}
                />
              </label>
            </div>
          </div>
          {backupMessage && <div className="mt-3 text-sm font-semibold text-slate-500">{backupMessage}</div>}
        </div>

        <div className="mt-3 rounded-lg bg-white p-4 shadow-sm sm:mt-4 sm:p-5">
          <h2 className="text-lg font-bold">章节进度</h2>
          <div className="mt-3 space-y-3 sm:mt-4 sm:space-y-4">
            {activeBook.chapters.map((chapter, chapterIndex) => {
              const learned = chapter.words.filter((word) => viewed[word.id]).length;
              const chapterProgress = chapter.words.length > 0 ? Math.round((learned / chapter.words.length) * 100) : 0;
              return (
                <div key={chapter.id}>
                  <div className="flex items-center justify-between text-sm font-semibold">
                    <span>{chapterLabel(chapter, chapterIndex)}</span>
                    <span className="text-slate-400">
                      {learned}/{chapter.words.length}
                    </span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-slate-900" style={{ width: `${chapterProgress}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-3 rounded-lg bg-white p-4 shadow-sm sm:mt-4 sm:p-5">
          <h2 className="text-lg font-bold">{activeBook.id === FAVORITES_BOOK_ID ? "生词本" : "词条预览"}</h2>
          <div className="mt-3 divide-y divide-slate-100">
            {listWords.length === 0 && <div className="py-8 text-center text-slate-400">{activeBook.emptyText}</div>}
            {listWords.map((word) => (
              <button
                key={word.id}
                type="button"
                onClick={() => onOpenWord(word.id)}
                className="flex w-full items-center justify-between gap-3 py-3 text-left sm:gap-4 sm:py-4"
              >
                <div>
                  <div className="text-base font-bold sm:text-lg">{word.term}</div>
                  <div className="mt-1 text-sm text-slate-500">{word.meaning}</div>
                </div>
                {favoriteSet.has(word.id) ? (
                  <Star className="h-6 w-6 fill-orange-400 text-orange-500" />
                ) : (
                  <BookOpen className="h-6 w-6 text-slate-300" />
                )}
              </button>
            ))}
          </div>
          {activeBook.id === MAIN_BOOK_ID && activeBook.words.length > listWords.length && (
            <div className="pt-4 text-center text-sm font-semibold text-slate-400">
              已显示前 {listWords.length} 个词条
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

function DetailPane({
  word,
  favorite,
  accent,
  meaningsHidden,
  spellingSeparated,
  tab,
  note,
  onTabChange,
  onChangeNote,
  onClose,
  onToggleFavorite,
  showClose = false,
  keyboardMode = "desktop",
  layoutId,
  className = "",
}) {
  if (!word) {
    return (
      <div className="flex h-full min-h-80 items-center justify-center px-8 text-center text-slate-400">
        <div>
          <BookOpen className="mx-auto h-10 w-10 text-slate-300" />
          <p className="mt-3 text-sm font-semibold">从左侧选择一个单词查看详情</p>
        </div>
      </div>
    );
  }

  return (
    <div className={className}>
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <h2
              aria-hidden={meaningsHidden}
              style={{ visibility: meaningsHidden ? "hidden" : "visible" }}
              className="text-2xl font-bold text-orange-600 sm:text-4xl"
            >
              <SplitTerm word={word} />
            </h2>
            <span className="rounded bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-400 sm:text-sm">{word.source}</span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2 sm:mt-3 sm:gap-3">
            <button
              type="button"
              onClick={() => speakWord(word.term, accent)}
              className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1.5 text-xs font-bold text-slate-600 sm:text-sm"
            >
              <span>{VOICE_OPTIONS[accent]?.label || VOICE_OPTIONS.us.label}</span>
              <Volume2 className="h-4 w-4" />
            </button>
            {phoneticFor(word, accent) && <span className="text-sm text-slate-600 sm:text-lg">{phoneticFor(word, accent)}</span>}
          </div>
        </div>
        <div className="flex flex-row-reverse items-start justify-between gap-3 sm:flex-col sm:items-end">
          <div className="flex gap-1">
            <IconButton
              label={favorite ? "取消收藏" : "收藏到生词本"}
              className={favorite ? "text-orange-500" : "text-slate-500"}
              onClick={() => onToggleFavorite(word.id)}
            >
              <Star className={`h-5 w-5 sm:h-6 sm:w-6 ${favorite ? "fill-orange-400" : ""}`} />
            </IconButton>
            {showClose && (
              <IconButton label="关闭" onClick={onClose}>
                <X className="h-6 w-6" />
              </IconButton>
            )}
          </div>
          <SpellingPractice word={word} accent={accent} keyboardMode={keyboardMode} separated={spellingSeparated} />
        </div>
      </div>

      {!meaningsHidden && (
        <div className="mt-4 text-lg leading-8 text-slate-950 sm:mt-6 sm:text-xl">
          <span className="font-semibold">{word.pos}</span> {word.meaning}
        </div>
      )}

      <div className="mt-4 flex gap-4 overflow-x-auto border-b border-slate-100 text-sm font-bold text-slate-400 sm:mt-6 sm:gap-6 sm:text-base">
        {DETAIL_TABS.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => onTabChange(item)}
            className={`relative shrink-0 pb-2.5 sm:pb-3 ${tab === item ? "text-slate-950" : ""}`}
          >
            {item}
            {tab === item && (
              <motion.span
                layoutId={layoutId}
                className="absolute bottom-0 left-1/2 h-1 w-6 -translate-x-1/2 rounded-full bg-orange-500"
              />
            )}
          </button>
        ))}
      </div>

      <div className="pt-4 sm:pt-6">
        <DetailContent tab={tab} word={word} note={note} onChangeNote={onChangeNote} />
      </div>
    </div>
  );
}

function DetailSheet({ word, favorite, accent, meaningsHidden, spellingSeparated, tab, note, onTabChange, onChangeNote, onClose, onToggleFavorite }) {
  return (
    <AnimatePresence>
      {word && (
        <motion.div className="fixed inset-0 z-50 lg:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <button type="button" aria-label="关闭详情" className="absolute inset-0 bg-black/45" onClick={onClose} />
          <motion.section
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 280 }}
            className="absolute inset-x-0 bottom-0 mx-auto max-h-[88vh] max-w-3xl overflow-hidden rounded-t-lg bg-white"
          >
            <div className="mx-auto mt-2 h-1 w-16 rounded-full bg-slate-200" />
            <DetailPane
              word={word}
              favorite={favorite}
              accent={accent}
              meaningsHidden={meaningsHidden}
              spellingSeparated={spellingSeparated}
              tab={tab}
              note={note}
              onTabChange={onTabChange}
              onChangeNote={onChangeNote}
              onClose={onClose}
              onToggleFavorite={onToggleFavorite}
              showClose
              keyboardMode="mobile"
              layoutId="active-detail-tab-mobile"
              className="max-h-[86vh] overflow-auto px-4 pb-5 pt-4 sm:px-5 sm:pb-6 sm:pt-5"
            />
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default function App({ currentUser, signOutPath = "/signout-with-chatgpt?return_to=%2F" }) {
  const [stored, setStored] = useState(loadState);
  const [cloudReady, setCloudReady] = useState(false);
  const [syncStatus, setSyncStatus] = useState("loading");
  const [syncMessage, setSyncMessage] = useState("正在读取云端数据…");
  const storedRef = useRef(stored);
  const cloudReadyRef = useRef(false);
  const syncInFlightRef = useRef(false);
  const syncDirtyRef = useRef(false);
  const syncTimerRef = useRef(null);
  const cloudVersionRef = useRef(0);
  const cloudBooksSnapshotRef = useRef("");
  const [selectedId, setSelectedId] = useState(ALL_WORDS[0].id);
  const [detailId, setDetailId] = useState(null);
  const [detailTab, setDetailTab] = useState(DEFAULT_DETAIL_TAB);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState("words");
  const [pendingScrollId, setPendingScrollId] = useState(null);

  const wordBooks = useMemo(() => buildWordBooks(stored.favorites, stored.customBooks), [stored.favorites, stored.customBooks]);
  const activeBook = useMemo(
    () => wordBooks.find((book) => book.id === stored.activeBookId) || wordBooks[0],
    [stored.activeBookId, wordBooks]
  );
  const allAvailableWords = useMemo(() => {
    const byId = new Map();
    wordBooks.forEach((book) => {
      if (book.id === FAVORITES_BOOK_ID) return;
      book.words.forEach((word) => byId.set(word.id, word));
    });
    return Array.from(byId.values());
  }, [wordBooks]);
  const wordById = useMemo(() => new Map(allAvailableWords.map((word) => [word.id, word])), [allAvailableWords]);
  const activeWordIndexById = useMemo(
    () => new Map(activeBook.words.map((word, index) => [word.id, index])),
    [activeBook.words],
  );
  const effectiveSelectedId = activeWordIndexById.has(selectedId) ? selectedId : activeBook.words[0]?.id;
  const selectedWordIndex = activeWordIndexById.get(effectiveSelectedId);
  const selectedWord = selectedWordIndex === undefined ? undefined : activeBook.words[selectedWordIndex];
  const detailWord = useMemo(() => wordById.get(detailId), [detailId, wordById]);
  const favoriteSet = useMemo(() => new Set(stored.favorites), [stored.favorites]);

  useEffect(() => {
    storedRef.current = stored;
  }, [stored]);

  const flushCloudState = useCallback(async () => {
    if (!cloudReadyRef.current || syncInFlightRef.current || !syncDirtyRef.current) return;
    syncInFlightRef.current = true;
    try {
      while (syncDirtyRef.current) {
        syncDirtyRef.current = false;
        setSyncStatus("syncing");
        setSyncMessage("正在同步到云端…");
        const snapshot = storedRef.current;
        const customBooks = Array.isArray(snapshot.customBooks) ? snapshot.customBooks : [];
        const booksSnapshot = JSON.stringify(customBooks);
        const syncBooks = booksSnapshot !== cloudBooksSnapshotRef.current;
        const stateWithoutBooks = { ...snapshot };
        delete stateWithoutBooks.customBooks;
        const response = await fetch("/api/state", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            state: stateWithoutBooks,
            customBooks: syncBooks ? customBooks : undefined,
            syncBooks,
            version: cloudVersionRef.current,
          }),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || "云端同步失败");
        cloudVersionRef.current = Number(result.version || cloudVersionRef.current + 1);
        if (syncBooks) cloudBooksSnapshotRef.current = booksSnapshot;
      }
      localStorage.removeItem(CLOUD_DIRTY_KEY);
      setSyncStatus("saved");
      setSyncMessage("所有学习数据已保存到云端");
    } catch (error) {
      syncDirtyRef.current = true;
      localStorage.setItem(CLOUD_DIRTY_KEY, "1");
      const offline = typeof navigator !== "undefined" && !navigator.onLine;
      setSyncStatus(offline ? "offline" : "error");
      setSyncMessage(offline ? "当前离线，恢复网络后会自动同步" : (error instanceof Error ? error.message : "云端同步失败"));
    } finally {
      syncInFlightRef.current = false;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const hydrate = async () => {
      try {
        const response = await fetch("/api/state", { cache: "no-store" });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || "云端数据读取失败");
        if (cancelled) return;

        cloudVersionRef.current = Number(result.version || 0);
        const localState = storedRef.current;
        const hasUnsyncedLocalChanges = localStorage.getItem(CLOUD_DIRTY_KEY) === "1";
        if (result.hasState && result.state) {
          const cloudState = normalizeBackupState(result.state);
          cloudBooksSnapshotRef.current = JSON.stringify(cloudState.customBooks);
          const nextState = hasUnsyncedLocalChanges ? mergeStoredStates(cloudState, localState) : cloudState;
          storedRef.current = nextState;
          setStored(nextState);
          syncDirtyRef.current = hasUnsyncedLocalChanges;
        } else {
          syncDirtyRef.current = true;
          setSyncMessage("正在上传本机学习数据…");
        }

        cloudReadyRef.current = true;
        setCloudReady(true);
        if (syncDirtyRef.current) await flushCloudState();
        else {
          setSyncStatus("saved");
          setSyncMessage("云端数据已加载");
        }
      } catch (error) {
        if (cancelled) return;
        cloudReadyRef.current = true;
        setCloudReady(true);
        syncDirtyRef.current = true;
        localStorage.setItem(CLOUD_DIRTY_KEY, "1");
        const offline = typeof navigator !== "undefined" && !navigator.onLine;
        setSyncStatus(offline ? "offline" : "error");
        setSyncMessage(offline ? "当前离线，正在使用本机缓存" : (error instanceof Error ? error.message : "云端数据读取失败"));
      }
    };
    hydrate();
    return () => {
      cancelled = true;
    };
  }, [flushCloudState]);

  useEffect(() => {
    if (!cloudReady) return undefined;
    syncDirtyRef.current = true;
    localStorage.setItem(CLOUD_DIRTY_KEY, "1");
    window.clearTimeout(syncTimerRef.current);
    syncTimerRef.current = window.setTimeout(flushCloudState, CLOUD_SYNC_DELAY);
    return () => window.clearTimeout(syncTimerRef.current);
  }, [cloudReady, flushCloudState, stored]);

  useEffect(() => {
    const retry = () => {
      if (!cloudReadyRef.current) return;
      syncDirtyRef.current = true;
      flushCloudState();
    };
    const markOffline = () => {
      setSyncStatus("offline");
      setSyncMessage("当前离线，恢复网络后会自动同步");
    };
    window.addEventListener("online", retry);
    window.addEventListener("offline", markOffline);
    return () => {
      window.removeEventListener("online", retry);
      window.removeEventListener("offline", markOffline);
    };
  }, [flushCloudState]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
    }, 300);
    return () => window.clearTimeout(timer);
  }, [stored]);

  const clearPendingScroll = useCallback(() => setPendingScrollId(null), []);

  const markViewed = useCallback((id) => {
    setStored((current) => {
      if (current.viewed[id]) return current;
      return { ...current, viewed: { ...current.viewed, [id]: Date.now() } };
    });
  }, []);

  const selectWord = useCallback((id, speechMode = "immediate") => {
    setSelectedId(id);
    setStored((current) => {
      const alreadyViewed = Boolean(current.viewed[id]);
      if (current.meaningsHidden && alreadyViewed) return current;
      return {
        ...current,
        meaningsHidden: true,
        viewed: alreadyViewed ? current.viewed : { ...current.viewed, [id]: Date.now() },
      };
    });
    const word = wordById.get(id);
    if (word) {
      if (speechMode === "navigation") speakNavigationWord(word.term, stored.accent);
      else speakWord(word.term, stored.accent);
    }
  }, [stored.accent, wordById]);

  const moveWordSelection = useCallback((direction) => {
    if (page !== "words" || activeBook.words.length === 0) return;
    const currentIndex = activeWordIndexById.get(selectedId) ?? -1;
    const nextIndex = currentIndex < 0
      ? 0
      : Math.min(activeBook.words.length - 1, Math.max(0, currentIndex + direction));
    const nextWord = activeBook.words[nextIndex];
    if (!nextWord || nextWord.id === selectedId) return;

    selectWord(nextWord.id, "navigation");
    if (detailId) setDetailId(nextWord.id);
    setPendingScrollId(nextWord.id);
  }, [activeBook.words, activeWordIndexById, detailId, page, selectWord, selectedId]);

  const toggleFavorite = useCallback((id) => {
    setStored((current) => {
      const set = new Set(current.favorites);
      if (set.has(id)) set.delete(id);
      else set.add(id);
      return { ...current, favorites: Array.from(set) };
    });
  }, []);

  const changeShortcut = useCallback((actionId, key) => {
    if (!Object.prototype.hasOwnProperty.call(DEFAULT_SHORTCUT_KEYS, actionId)) return;
    const normalizedKey = normalizeShortcutKey(key, DEFAULT_SHORTCUT_KEYS[actionId]);
    setStored((current) => {
      const currentKeys = normalizeShortcutKeys(current.shortcutKeys);
      if (Object.entries(currentKeys).some(([id, value]) => id !== actionId && value === normalizedKey)) return current;
      return { ...current, shortcutKeys: { ...currentKeys, [actionId]: normalizedKey } };
    });
  }, []);

  const resetShortcuts = useCallback(() => {
    setStored((current) => ({ ...current, shortcutKeys: { ...DEFAULT_SHORTCUT_KEYS } }));
  }, []);

  const toggleMeanings = useCallback(() => {
    setStored((current) => ({ ...current, meaningsHidden: !current.meaningsHidden }));
  }, []);

  const toggleSpellingMode = useCallback(() => {
    setStored((current) => ({ ...current, spellingSeparated: !current.spellingSeparated }));
  }, []);

  const moveDetailTab = useCallback((direction) => {
    setDetailTab((current) => {
      const currentIndex = Math.max(0, DETAIL_TABS.indexOf(current));
      const nextIndex = (currentIndex + direction + DETAIL_TABS.length) % DETAIL_TABS.length;
      return DETAIL_TABS[nextIndex];
    });
  }, []);

  useEffect(() => {
    const handleKeyboardShortcut = (event) => {
      if (page !== "words" || event.ctrlKey || event.metaKey || event.altKey || document.getElementById("chapter-jump-menu")) return;
      const eventTarget = event.target;
      if (eventTarget instanceof Element && eventTarget.closest("input, textarea, select, [contenteditable='true']")) return;

      const key = canonicalShortcutKey(event.key);
      const shortcuts = normalizeShortcutKeys(stored.shortcutKeys);
      const actionId = Object.entries(shortcuts).find(([, shortcutKey]) => shortcutKey === key)?.[0];
      if (!actionId) return;

      event.preventDefault();
      event.stopImmediatePropagation();
      if (actionId === "previous") moveWordSelection(-1);
      else if (actionId === "next") moveWordSelection(1);
      else if (actionId === "tabPrevious") moveDetailTab(-1);
      else if (actionId === "tabNext") moveDetailTab(1);
      else if (actionId === "spellingMode" && !event.repeat) toggleSpellingMode();
      else if (actionId === "favorite" && !event.repeat && selectedWord?.id) toggleFavorite(selectedWord.id);
      else if (actionId === "meaning" && !event.repeat) toggleMeanings();
    };

    window.addEventListener("keydown", handleKeyboardShortcut, true);
    return () => window.removeEventListener("keydown", handleKeyboardShortcut, true);
  }, [moveDetailTab, moveWordSelection, page, selectedWord?.id, stored.shortcutKeys, toggleFavorite, toggleMeanings, toggleSpellingMode]);

  const openDetail = useCallback((id) => {
    setSelectedId(id);
    setDetailId(id);
    setDetailTab(stored.notes?.[id]?.trim() ? NOTE_TAB : DEFAULT_DETAIL_TAB);
    setStored((current) => (current.meaningsHidden ? current : { ...current, meaningsHidden: true }));
    markViewed(id);
  }, [markViewed, stored.notes]);

  const openWordFromDashboard = useCallback((id) => {
    setPage("words");
    setSelectedId(id);
    setPendingScrollId(id);
    const word = wordById.get(id);
    if (word) speakWord(word.term, stored.accent);
    openDetail(id);
  }, [openDetail, stored.accent, wordById]);

  const openWordFromSearch = useCallback((id) => {
    setPage("words");
    setDetailId(null);
    setPendingScrollId(id);
    selectWord(id);
  }, [selectWord]);

  const addSearchHistory = useCallback((term) => {
    const trimmed = String(term || "").trim();
    if (!trimmed) return;
    setStored((current) => ({
      ...current,
      searchHistory: [trimmed, ...(current.searchHistory || []).filter((h) => h !== trimmed)].slice(0, 30),
    }));
  }, []);

  const removeSearchHistory = useCallback((term) => {
    setStored((current) => ({
      ...current,
      searchHistory: (current.searchHistory || []).filter((h) => h !== term),
    }));
  }, []);

  const clearSearchHistory = useCallback(() => {
    setStored((current) => ({ ...current, searchHistory: [] }));
  }, []);

  const toggleAccent = useCallback(() => {
    setStored((current) => ({ ...current, accent: current.accent === "us" ? "uk" : "us" }));
  }, []);

  const changeNote = useCallback((wordId, value) => {
    setStored((current) => ({
      ...current,
      notes: { ...current.notes, [wordId]: value },
    }));
  }, []);

  const changeBook = useCallback((bookId) => {
    const nextBook = wordBooks.find((book) => book.id === bookId) || wordBooks[0];
    setStored((current) => ({ ...current, activeBookId: nextBook.id, meaningsHidden: true }));
    setSearch("");
    setSelectedId(nextBook.words[0]?.id || "");
    setDetailId(null);
  }, [wordBooks]);

  const importBook = useCallback(async (file) => {
    const { importWordBookFromFile } = await import("./importWordBook");
    const book = await importWordBookFromFile(file);
    setStored((current) => ({
      ...current,
      customBooks: [...(current.customBooks || []).filter((item) => item.id !== book.id), book],
      activeBookId: book.id,
      meaningsHidden: true,
    }));
    setSearch("");
    setSelectedId(book.chapters[0]?.words[0]?.id || "");
    setDetailId(null);
    return book;
  }, []);

  const exportData = useCallback(() => {
    downloadBackup(stored);
  }, [stored]);

  const importData = useCallback(async (file) => {
    const backupState = await readBackupFile(file);
    const restoredBooks = buildWordBooks(backupState.favorites, backupState.customBooks);
    const restoredBook = restoredBooks.find((book) => book.id === backupState.activeBookId) || restoredBooks[0];
    const restoredState = { ...backupState, activeBookId: restoredBook.id };

    setStored(restoredState);
    setSelectedId(restoredBook.words[0]?.id || "");
    setDetailId(null);
    setSearch("");
    setPage("dashboard");
  }, []);

  return (
    <>
      <div className="lg:grid lg:h-screen lg:grid-cols-[minmax(420px,46%)_minmax(0,54%)] lg:overflow-hidden xl:grid-cols-[minmax(460px,42%)_minmax(0,58%)]">
        <div className="lg:min-h-0 lg:overflow-hidden lg:border-r lg:border-slate-200">
          {page === "dashboard" ? (
            <DashboardPage
              favorites={stored.favorites}
              viewed={stored.viewed}
              wordBooks={wordBooks}
              activeBook={activeBook}
              onBack={() => setPage("words")}
              onOpenWord={openWordFromDashboard}
              onChangeBook={changeBook}
              onImportBook={importBook}
              onExportData={exportData}
              onImportData={importData}
              shortcutKeys={stored.shortcutKeys}
              onChangeShortcut={changeShortcut}
              onResetShortcuts={resetShortcuts}
              currentUser={currentUser}
              signOutPath={signOutPath}
              syncStatus={syncStatus}
              syncMessage={syncMessage}
              onRetrySync={flushCloudState}
            />
          ) : page === "search" ? (
            <SearchPage
              book={activeBook}
              query={search}
              onQueryChange={setSearch}
              onBack={() => setPage("words")}
              onSelectResult={openWordFromSearch}
              searchHistory={stored.searchHistory || []}
              onSelectHistory={addSearchHistory}
              onRemoveHistory={removeSearchHistory}
              onClearHistory={clearSearchHistory}
            />
          ) : (
            <WordListPage
              book={activeBook}
              selectedId={selectedWord?.id}
              favorites={stored.favorites}
              meaningsHidden={stored.meaningsHidden}
              accent={stored.accent}
              onSelectWord={selectWord}
              onToggleFavorite={toggleFavorite}
              onOpenDetail={openDetail}
              onToggleMeanings={toggleMeanings}
              onToggleAccent={toggleAccent}
              onOpenSearch={() => setPage("search")}
              onOpenDashboard={() => setPage("dashboard")}
              pendingScrollId={pendingScrollId}
              onPendingScrollHandled={clearPendingScroll}
            />
          )}
        </div>

        <aside className="hidden h-screen min-h-0 overflow-y-auto bg-white lg:block">
          <DetailPane
            word={selectedWord}
            favorite={selectedWord ? favoriteSet.has(selectedWord.id) : false}
            accent={stored.accent}
            meaningsHidden={stored.meaningsHidden}
            spellingSeparated={stored.spellingSeparated}
            tab={detailTab}
            note={selectedWord ? stored.notes?.[selectedWord.id] || "" : ""}
            onTabChange={setDetailTab}
            onChangeNote={(value) => {
              if (selectedWord) changeNote(selectedWord.id, value);
            }}
            onToggleFavorite={toggleFavorite}
            layoutId="active-detail-tab-desktop"
            className="mx-auto min-h-full max-w-4xl px-6 py-8 xl:px-10 xl:py-10"
          />
        </aside>
      </div>

      <DetailSheet
        word={detailWord}
        favorite={detailWord ? favoriteSet.has(detailWord.id) : false}
        accent={stored.accent}
        meaningsHidden={stored.meaningsHidden}
        spellingSeparated={stored.spellingSeparated}
        tab={detailTab}
        note={detailWord ? stored.notes?.[detailWord.id] || "" : ""}
        onTabChange={setDetailTab}
        onChangeNote={(value) => {
          if (detailWord) changeNote(detailWord.id, value);
        }}
        onClose={() => setDetailId(null)}
        onToggleFavorite={toggleFavorite}
      />
    </>
  );
}



