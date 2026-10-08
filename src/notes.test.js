import test from "node:test";
import assert from "node:assert/strict";
import { createRichNote, mergeNotes, normalizeNotes, noteDocument, noteHasContent, notePlainText, plainTextToDocument } from "./notes.js";

test("legacy plain-text notes migrate without losing line breaks", () => {
  const notes = normalizeNotes({ word: "易错点\n搭配：take part in" });
  assert.equal(notes.word.format, "rich-text");
  assert.equal(notePlainText(notes.word), "易错点\n搭配：take part in");
  assert.deepEqual(noteDocument("first\nsecond"), plainTextToDocument("first\nsecond"));
});

test("rich notes preserve supported structure and strip unsafe content", () => {
  const note = createRichNote({
    type: "doc",
    content: [
      { type: "heading", attrs: { level: 9 }, content: [{ type: "text", text: "标题", marks: [{ type: "bold" }] }] },
      { type: "paragraph", content: [{ type: "text", text: "链接", marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }] }] },
      { type: "script", content: [{ type: "text", text: "bad" }] },
    ],
  }, 123);
  assert.equal(note.updatedAt, 123);
  assert.equal(note.content.content[0].attrs.level, 2);
  assert.equal(note.content.content[1].content[0].marks, undefined);
  assert.equal(notePlainText(note), "标题\n链接");
});

test("empty and malformed notes have safe defaults", () => {
  assert.deepEqual(normalizeNotes(undefined), {});
  assert.deepEqual(normalizeNotes({ empty: "  ", invalid: null }), {});
  assert.equal(noteHasContent({ format: "rich-text", content: { type: "doc" } }), false);
});

test("merging notes keeps the newest edit", () => {
  const oldNote = createRichNote(plainTextToDocument("old"), 10);
  const newNote = createRichNote(plainTextToDocument("new"), 20);
  assert.equal(notePlainText(mergeNotes({ word: oldNote }, { word: newNote }).word), "new");
  assert.equal(notePlainText(mergeNotes({ word: newNote }, { word: oldNote }).word), "new");
});
