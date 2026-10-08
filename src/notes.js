const MAX_NOTES = 10000;
const MAX_NOTE_TEXT_LENGTH = 50000;
const MAX_NOTE_NODES = 4000;
const MAX_NOTE_DEPTH = 24;

const CONTAINER_NODES = new Set([
  "doc",
  "paragraph",
  "heading",
  "bulletList",
  "orderedList",
  "listItem",
  "taskList",
  "taskItem",
  "blockquote",
  "codeBlock",
]);
const LEAF_NODES = new Set(["text", "hardBreak", "horizontalRule"]);
const SAFE_MARKS = new Set(["bold", "italic", "underline", "strike", "code", "highlight", "link"]);
const NEWLINE_CONTAINERS = new Set(["doc", "bulletList", "orderedList", "taskList"]);

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function safeLink(value) {
  if (typeof value !== "string") return null;
  const href = value.trim().slice(0, 2000);
  if (!href) return null;
  try {
    const url = new URL(href, "https://notes.invalid");
    if (!["http:", "https:", "mailto:"].includes(url.protocol)) return null;
    return href;
  } catch {
    return null;
  }
}

function sanitizeMarks(value) {
  if (!Array.isArray(value)) return undefined;
  const marks = value.flatMap((candidate) => {
    if (!isRecord(candidate) || !SAFE_MARKS.has(candidate.type)) return [];
    if (candidate.type === "link") {
      const href = safeLink(candidate.attrs?.href);
      if (!href) return [];
      return [{ type: "link", attrs: { href, target: "_blank", rel: "noopener noreferrer nofollow" } }];
    }
    if (candidate.type === "highlight") return [{ type: "highlight" }];
    return [{ type: candidate.type }];
  });
  return marks.length ? marks : undefined;
}

function sanitizeNode(value, context, depth = 0) {
  if (!isRecord(value) || depth > MAX_NOTE_DEPTH || context.nodes >= MAX_NOTE_NODES) return null;
  const type = typeof value.type === "string" ? value.type : "";
  if (!CONTAINER_NODES.has(type) && !LEAF_NODES.has(type)) return null;
  context.nodes += 1;

  if (type === "text") {
    if (typeof value.text !== "string" || context.remaining <= 0) return null;
    const text = value.text.slice(0, context.remaining);
    context.remaining -= text.length;
    if (!text) return null;
    const marks = sanitizeMarks(value.marks);
    return { type: "text", text, ...(marks ? { marks } : {}) };
  }

  if (type === "hardBreak" || type === "horizontalRule") return { type };

  const content = Array.isArray(value.content)
    ? value.content.map((child) => sanitizeNode(child, context, depth + 1)).filter(Boolean)
    : [];
  const attrs = {};
  if (type === "heading") attrs.level = value.attrs?.level === 3 ? 3 : 2;
  if (type === "taskItem") attrs.checked = value.attrs?.checked === true;
  return {
    type,
    ...(Object.keys(attrs).length ? { attrs } : {}),
    ...(content.length ? { content } : {}),
  };
}

export function sanitizeNoteDocument(value) {
  const context = { nodes: 0, remaining: MAX_NOTE_TEXT_LENGTH };
  const doc = sanitizeNode(value, context);
  if (!doc || doc.type !== "doc") return { type: "doc", content: [{ type: "paragraph" }] };
  if (!Array.isArray(doc.content) || !doc.content.length) doc.content = [{ type: "paragraph" }];
  return doc;
}

export function plainTextToDocument(value) {
  const text = String(value || "").slice(0, MAX_NOTE_TEXT_LENGTH).replace(/\r\n?/g, "\n");
  return {
    type: "doc",
    content: text.split("\n").map((line) => ({
      type: "paragraph",
      ...(line ? { content: [{ type: "text", text: line }] } : {}),
    })),
  };
}

function nodePlainText(node) {
  if (!isRecord(node)) return "";
  if (node.type === "text") return typeof node.text === "string" ? node.text : "";
  if (node.type === "hardBreak") return "\n";
  if (!Array.isArray(node.content)) return "";
  const separator = NEWLINE_CONTAINERS.has(node.type) ? "\n" : "";
  return node.content.map(nodePlainText).join(separator);
}

export function noteDocument(value) {
  if (typeof value === "string") return plainTextToDocument(value);
  if (isRecord(value) && value.format === "rich-text") return sanitizeNoteDocument(value.content);
  if (isRecord(value) && value.type === "doc") return sanitizeNoteDocument(value);
  if (isRecord(value) && typeof value.plainText === "string") return plainTextToDocument(value.plainText);
  return plainTextToDocument("");
}

export function notePlainText(value) {
  if (typeof value === "string") return value.slice(0, MAX_NOTE_TEXT_LENGTH);
  return nodePlainText(noteDocument(value)).slice(0, MAX_NOTE_TEXT_LENGTH);
}

export function noteHasContent(value) {
  return notePlainText(value).trim().length > 0;
}

export function createRichNote(content, updatedAt = Date.now()) {
  const document = sanitizeNoteDocument(content);
  return {
    version: 2,
    format: "rich-text",
    content: document,
    plainText: nodePlainText(document).slice(0, MAX_NOTE_TEXT_LENGTH),
    updatedAt: Number.isFinite(Number(updatedAt)) ? Math.max(0, Number(updatedAt)) : Date.now(),
  };
}

function normalizeNote(value) {
  if (typeof value === "string") return createRichNote(plainTextToDocument(value), 0);
  if (!isRecord(value)) return null;
  const updatedAt = Number.isFinite(Number(value.updatedAt)) ? Number(value.updatedAt) : 0;
  return createRichNote(noteDocument(value), updatedAt);
}

export function normalizeNotes(value) {
  if (!isRecord(value)) return {};
  const result = {};
  for (const [rawId, candidate] of Object.entries(value).slice(0, MAX_NOTES)) {
    const id = rawId.trim().slice(0, 240);
    if (!id) continue;
    const note = normalizeNote(candidate);
    if (note && noteHasContent(note)) result[id] = note;
  }
  return result;
}

export function mergeNotes(cloudValue, localValue) {
  const cloud = normalizeNotes(cloudValue);
  const local = normalizeNotes(localValue);
  const merged = { ...cloud };
  Object.entries(local).forEach(([wordId, localNote]) => {
    const cloudNote = cloud[wordId];
    if (!cloudNote || Number(localNote.updatedAt) >= Number(cloudNote.updatedAt)) merged[wordId] = localNote;
  });
  return merged;
}
