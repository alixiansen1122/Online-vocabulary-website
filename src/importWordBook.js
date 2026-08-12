const POS_RE = /(?:(?:abbr|adj|adv|aux|conj|det|int|n|num|phr|pl|prep|pron|v|vi|vt)\.\s*)+/i;

function cleanText(text) {
  return String(text || "")
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
    const line = cleanText(rawLine);
    if (!line) continue;

    const numbered = line.match(/^(\d+)(?:\s+(.*))?$/);
    if (numbered) {
      if (current) entries.push(current);
      current = { order: Number(numbered[1]), text: cleanText(numbered[2] || "") };
      continue;
    }

    if (current) current.text = cleanText([current.text, line].filter(Boolean).join(joiner));
  }

  if (current) entries.push(current);
  return entries;
}

function extractPartOfSpeech(text) {
  const match = text.match(new RegExp(`^(${POS_RE.source})`, "i"));
  if (!match) return { pos: "", meaning: text };
  return {
    pos: match[1].trim(),
    meaning: text.slice(match[0].length).trim(),
  };
}

function wordId(bookId, order, term) {
  const slug = term
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${bookId}-${String(order).padStart(4, "0")}-${slug || "word"}`;
}

function isFooterLine(line) {
  return (
    /^.+词汇.+$/.test(line) ||
    /^共\s*\d+\s*词/.test(line) ||
    /^扫码听单词$/.test(line) ||
    /^纸上默写/.test(line) ||
    /^--\s+\d+\s+of\s+\d+\s+--$/.test(line)
  );
}

function buildWord(bookId, order, term, rawMeaning) {
  const { pos, meaning } = extractPartOfSpeech(rawMeaning);
  return {
    id: wordId(bookId, order, term),
    order,
    term,
    phonetic: "",
    pos,
    meaning,
    rawMeaning,
    source: "导入",
    collins: rawMeaning || meaning,
    examples: [],
    roots: [],
    derivatives: [],
    synonyms: [],
    exam: "来自本地导入的词书文件。",
  };
}

function parseBbdcPage(pageText, pageIndex, bookId) {
  const lines = pageText
    .split(/\r?\n/)
    .map(cleanText)
    .filter((line) => line && !isFooterLine(line));
  const markers = lines.map((line, index) => (line === "Word Meaning" ? index : -1)).filter((index) => index >= 0);

  if (markers.length < 2) return null;

  const terms = parseNumberedLines(lines.slice(markers[0] + 1, markers[1]), " ");
  const meanings = parseNumberedLines(lines.slice(markers[1] + 1), "\n");
  const meaningByOrder = new Map(meanings.map((item) => [item.order, item.text]));
  const words = terms
    .map((item) => buildWord(bookId, item.order, item.text, meaningByOrder.get(item.order) || ""))
    .filter((word) => word.term && word.rawMeaning);

  if (!words.length) return null;
  return {
    id: `${bookId}-page-${String(pageIndex + 1).padStart(3, "0")}`,
    title: `第 ${pageIndex + 1} 页`,
    declaredCount: words.length,
    words,
  };
}

function parseBbdcText(text, bookId) {
  const lines = text.split(/\r?\n/).map(cleanText);
  const markers = lines.map((line, index) => (line === "Word Meaning" ? index : -1)).filter((index) => index >= 0);

  if (markers.length < 2) return [];

  const chapters = [];
  for (let index = 0; index < markers.length - 1; index += 2) {
    const start = markers[index];
    const end = markers[index + 2] ?? lines.length;
    const chapter = parseBbdcPage(lines.slice(start, end).join("\n"), chapters.length, bookId);
    if (chapter) chapters.push(chapter);
  }

  return chapters;
}

function parseGenericText(text, bookId) {
  const lines = text
    .split(/\r?\n/)
    .map(cleanText)
    .filter((line) => line && !isFooterLine(line) && line !== "Word Meaning");

  const words = [];
  let order = 1;

  for (const line of lines) {
    const numbered = line.match(/^(\d+)\s+(.+)$/);
    const content = numbered ? numbered[2] : line;
    const splitByTab = content.split(/\t+/).map(cleanText).filter(Boolean);
    const tabTerm = splitByTab[0];
    const tabMeaning = splitByTab.slice(1).join(" ");

    let term = "";
    let meaning = "";

    if (tabTerm && tabMeaning) {
      term = tabTerm;
      meaning = tabMeaning;
    } else {
      const posMatch = content.match(POS_RE);
      const chineseMatch = content.match(/[\u4e00-\u9fff【]/);
      const splitIndex = posMatch?.index ?? chineseMatch?.index ?? -1;
      if (splitIndex > 0) {
        term = cleanText(content.slice(0, splitIndex));
        meaning = cleanText(content.slice(splitIndex));
      }
    }

    if (/^[A-Za-z][A-Za-z\s.'-]*$/.test(term) && meaning) {
      words.push(buildWord(bookId, numbered ? Number(numbered[1]) : order, term, meaning));
      order += 1;
    }
  }

  if (!words.length) return [];
  return [{ id: `${bookId}-chapter-001`, title: "导入词书", declaredCount: words.length, words }];
}

function parseWordBookText(text, fileName) {
  const bookId = `custom-${Date.now().toString(36)}`;
  const pages = text
    .split(/\n--\s+\d+\s+of\s+\d+\s+--\n/g)
    .map((page) => page.trim())
    .filter(Boolean);
  const chapters = pages.length > 1 ? pages.map((page, index) => parseBbdcPage(page, index, bookId)).filter(Boolean) : parseBbdcText(text, bookId);
  const parsedChapters = chapters.length ? chapters : parseGenericText(text, bookId);
  const parsedTotal = parsedChapters.reduce((total, chapter) => total + chapter.words.length, 0);

  if (!parsedTotal) {
    throw new Error("没有识别到词条。请使用不背单词导出的 PDF/Word，或使用“单词 + 释义”的文本格式。");
  }

  return {
    id: bookId,
    title: fileName.replace(/\.[^.]+$/, "") || "导入词书",
    importedAt: new Date().toISOString(),
    declaredTotal: parsedTotal,
    parsedTotal,
    chapters: parsedChapters,
  };
}

async function extractPdfText(file) {
  const [pdfjsLib, pdfWorkerModule] = await Promise.all([
    import("pdfjs-dist"),
    import("pdfjs-dist/build/pdf.worker.mjs?url"),
  ]);
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerModule.default;

  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  const pages = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    pages.push(`${content.items.map((item) => item.str).join("\n")}\n-- ${pageNumber} of ${pdf.numPages} --`);
  }

  return pages.join("\n\n");
}

async function extractDocxText(file) {
  const { default: mammoth } = await import("mammoth/mammoth.browser");
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  return result.value;
}

export async function importWordBookFromFile(file) {
  const name = file.name || "导入词书";
  const lowerName = name.toLowerCase();
  let text;

  if (lowerName.endsWith(".pdf")) text = await extractPdfText(file);
  else if (lowerName.endsWith(".docx")) text = await extractDocxText(file);
  else throw new Error("目前支持 PDF 和 Word .docx 文件。");

  return parseWordBookText(text, name);
}
