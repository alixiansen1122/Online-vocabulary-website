import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PDFParse } from "pdf-parse";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_INPUT = path.join(ROOT, "file", "bbdc_YSZCH_hvDJ(1).pdf");
const DEFAULT_OUTPUT = path.join(ROOT, "src", "data", "bbdc-yszch.json");

const input = path.resolve(process.argv[2] || DEFAULT_INPUT);
const output = path.resolve(process.argv[3] || DEFAULT_OUTPUT);

function cleanLine(line) {
  return line
    .normalize("NFKC")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/([\u4e00-\u9fff】）])[,]([\u4e00-\u9fff【（])/g, "$1，$2")
    .replace(/([\u4e00-\u9fff】）])[;]([\u4e00-\u9fff【（])/g, "$1；$2")
    .trim();
}

function parseNumberedLines(lines, joiner = "\n") {
  const entries = [];
  let current = null;

  for (const rawLine of lines) {
    const line = cleanLine(rawLine);
    if (!line) continue;

    const numbered = line.match(/^(\d+)(?:\s+(.*))?$/);
    if (numbered) {
      if (current) entries.push(current);
      current = {
        order: Number(numbered[1]),
        text: cleanLine(numbered[2] || ""),
      };
      continue;
    }

    if (current) {
      current.text = cleanLine([current.text, line].filter(Boolean).join(joiner));
    }
  }

  if (current) entries.push(current);
  return entries;
}

function extractPartOfSpeech(text) {
  const match = text.match(/^((?:(?:abbr|adj|adv|aux|conj|det|int|n|num|phr|pl|prep|pron|v|vi|vt)\.\s*)+)/i);
  if (!match) return { pos: "", meaning: text };
  return {
    pos: match[1].trim(),
    meaning: text.slice(match[0].length).trim(),
  };
}

function wordId(order, term) {
  const slug = term
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `bbdc-${String(order).padStart(4, "0")}-${slug || "word"}`;
}

function isFooterLine(line) {
  return (
    /^雅思词汇真经$/.test(line) ||
    /^共\s*\d+\s*词/.test(line) ||
    /^扫码听单词$/.test(line) ||
    /^纸上默写/.test(line)
  );
}

function parsePage(pageText, pageIndex) {
  const lines = pageText
    .split(/\r?\n/)
    .map(cleanLine)
    .filter((line) => line && !isFooterLine(line));

  const markers = lines
    .map((line, index) => (line === "Word Meaning" ? index : -1))
    .filter((index) => index >= 0);

  if (markers.length < 2) return null;

  const wordLines = lines.slice(markers[0] + 1, markers[1]);
  const meaningLines = lines.slice(markers[1] + 1);
  const terms = parseNumberedLines(wordLines, " ");
  const meanings = parseNumberedLines(meaningLines, "\n");
  const meaningByOrder = new Map(meanings.map((item) => [item.order, item.text]));

  const words = terms
    .map((item) => {
      const rawMeaning = meaningByOrder.get(item.order) || "";
      const { pos, meaning } = extractPartOfSpeech(rawMeaning);

      return {
        id: wordId(item.order, item.text),
        order: item.order,
        term: item.text,
        phonetic: "",
        pos,
        meaning,
        rawMeaning,
        source: "雅思",
        collins: rawMeaning || meaning,
        examples: [],
        roots: [],
        derivatives: [],
        synonyms: [],
        exam: "来自不背单词导出的《雅思词汇真经》PDF。",
      };
    })
    .filter((word) => word.term && word.rawMeaning);

  if (words.length === 0) return null;

  return {
    id: `page-${String(pageIndex + 1).padStart(3, "0")}`,
    title: `第 ${pageIndex + 1} 页`,
    declaredCount: words.length,
    words,
  };
}

async function main() {
  const buffer = await readFile(input);
  const parser = new PDFParse({ data: buffer });
  const info = await parser.getInfo();
  const result = await parser.getText();
  await parser.destroy();

  const pages = result.text
    .split(/\n--\s+\d+\s+of\s+\d+\s+--\n/g)
    .map((page) => page.trim())
    .filter(Boolean);

  const chapters = pages.map(parsePage).filter(Boolean);
  const words = chapters.flatMap((chapter) => chapter.words);
  const declaredTotal = Number(result.text.match(/共\s*(\d+)\s*词/)?.[1] || words.length);

  const book = {
    title: "雅思词汇真经",
    source: path.relative(ROOT, input).replace(/\\/g, "/"),
    importedAt: new Date().toISOString(),
    pageCount: info.total || pages.length,
    declaredTotal,
    parsedTotal: words.length,
    chapters,
  };

  await writeFile(output, `${JSON.stringify(book, null, 2)}\n`, "utf8");
  console.log(`Imported ${words.length}/${declaredTotal} words from ${chapters.length} pages.`);
  console.log(`Wrote ${path.relative(ROOT, output)}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
