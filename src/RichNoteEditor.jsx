import { useCallback, useEffect, useRef, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Highlight from "@tiptap/extension-highlight";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Placeholder from "@tiptap/extension-placeholder";
import {
  Bold,
  CheckSquare,
  ChevronDown,
  Code,
  Eraser,
  Expand,
  Heading2,
  Heading3,
  Highlighter,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Maximize2,
  Minimize2,
  Quote,
  Redo2,
  Strikethrough,
  Underline,
  Undo2,
} from "lucide-react";
import { createRichNote, noteDocument, noteHasContent } from "./notes.js";

const SAVE_DELAY = 700;
const NOTE_TEMPLATES = [
  { label: "易错点", heading: "易错点", hint: "记录容易混淆、拼错或用错的地方……" },
  { label: "固定搭配", heading: "固定搭配", hint: "写下常见搭配、介词和使用场景……" },
  { label: "近义辨析", heading: "近义辨析", hint: "与相近词比较语气、含义和用法……" },
  { label: "自己的例句", heading: "自己的例句", hint: "用这个词写一句与你有关的话……" },
  { label: "记忆方法", heading: "记忆方法", hint: "记录词根、联想或记忆口诀……" },
];

function ToolButton({ active = false, disabled = false, label, onClick, children }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition focus-visible:outline-2 focus-visible:outline-orange-500 disabled:cursor-not-allowed disabled:opacity-35 ${
        active ? "bg-orange-100 text-orange-700" : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
      }`}
    >
      {children}
    </button>
  );
}

function ToolbarDivider() {
  return <span aria-hidden="true" className="mx-0.5 h-6 w-px shrink-0 bg-slate-200" />;
}

export default function RichNoteEditor({ value, onChange, word }) {
  const [saveState, setSaveState] = useState("saved");
  const [fullscreen, setFullscreen] = useState(false);
  const [revision, setRevision] = useState(0);
  const [templateOpen, setTemplateOpen] = useState(false);
  const onChangeRef = useRef(onChange);
  const saveTimerRef = useRef(null);
  const latestDocumentRef = useRef(null);
  const dirtyRef = useRef(false);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const persist = useCallback(() => {
    if (!dirtyRef.current || !latestDocumentRef.current) return;
    onChangeRef.current(createRichNote(latestDocumentRef.current));
    dirtyRef.current = false;
    setSaveState("saved");
  }, []);

  const scheduleSave = useCallback((document) => {
    latestDocumentRef.current = document;
    dirtyRef.current = true;
    setSaveState("saving");
    window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(persist, SAVE_DELAY);
  }, [persist]);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        link: { openOnClick: false, autolink: true, defaultProtocol: "https" },
      }),
      Highlight,
      TaskList,
      TaskItem.configure({ nested: true }),
      Placeholder.configure({
        placeholder: "写下记忆点、易错点、搭配或自己的例句……",
      }),
    ],
    content: noteDocument(value),
    editorProps: {
      attributes: {
        class: "tiptap-note-content",
        "aria-label": `${word?.term || "单词"}的学习笔记`,
      },
    },
    onUpdate: ({ editor: currentEditor }) => {
      scheduleSave(currentEditor.getJSON());
      setRevision((current) => current + 1);
    },
    onSelectionUpdate: () => setRevision((current) => current + 1),
  });

  useEffect(() => () => {
    window.clearTimeout(saveTimerRef.current);
    if (dirtyRef.current && latestDocumentRef.current) {
      onChangeRef.current(createRichNote(latestDocumentRef.current));
      dirtyRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (!fullscreen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setFullscreen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [fullscreen]);

  const applyTemplate = (template) => {
    if (!editor) return;
    editor.chain().focus().insertContent([
      { type: "heading", attrs: { level: 3 }, content: [{ type: "text", text: template.heading }] },
      { type: "paragraph", content: [{ type: "text", text: template.hint }] },
    ]).run();
    setTemplateOpen(false);
  };

  const setLink = () => {
    if (!editor) return;
    const existing = editor.getAttributes("link").href || "";
    const href = window.prompt("输入链接地址", existing);
    if (href === null) return;
    if (!href.trim()) editor.chain().focus().extendMarkRange("link").unsetLink().run();
    else editor.chain().focus().extendMarkRange("link").setLink({ href: href.trim() }).run();
  };

  const wordCount = editor ? editor.state.doc.textContent.trim().split(/\s+/).filter(Boolean).length : 0;
  const characterCount = editor ? editor.state.doc.textContent.length : 0;
  void revision;

  return (
    <div className={fullscreen ? "rich-note-editor fixed inset-0 z-[100] flex flex-col bg-white p-3 sm:p-6" : "rich-note-editor"}>
      <div className={`overflow-hidden border border-slate-200 bg-white shadow-sm ${fullscreen ? "flex min-h-0 flex-1 flex-col rounded-2xl" : "rounded-xl"}`}>
        <div className="flex items-center gap-1 border-b border-slate-200 bg-slate-50 px-2 py-2">
          <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <ToolButton label="粗体" active={editor?.isActive("bold")} disabled={!editor} onClick={() => editor?.chain().focus().toggleBold().run()}><Bold className="h-4 w-4" /></ToolButton>
            <ToolButton label="斜体" active={editor?.isActive("italic")} disabled={!editor} onClick={() => editor?.chain().focus().toggleItalic().run()}><Italic className="h-4 w-4" /></ToolButton>
            <ToolButton label="下划线" active={editor?.isActive("underline")} disabled={!editor} onClick={() => editor?.chain().focus().toggleUnderline().run()}><Underline className="h-4 w-4" /></ToolButton>
            <ToolButton label="删除线" active={editor?.isActive("strike")} disabled={!editor} onClick={() => editor?.chain().focus().toggleStrike().run()}><Strikethrough className="h-4 w-4" /></ToolButton>
            <ToolButton label="高亮" active={editor?.isActive("highlight")} disabled={!editor} onClick={() => editor?.chain().focus().toggleHighlight().run()}><Highlighter className="h-4 w-4" /></ToolButton>
            <ToolbarDivider />
            <ToolButton label="二级标题" active={editor?.isActive("heading", { level: 2 })} disabled={!editor} onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}><Heading2 className="h-4 w-4" /></ToolButton>
            <ToolButton label="三级标题" active={editor?.isActive("heading", { level: 3 })} disabled={!editor} onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}><Heading3 className="h-4 w-4" /></ToolButton>
            <ToolButton label="无序列表" active={editor?.isActive("bulletList")} disabled={!editor} onClick={() => editor?.chain().focus().toggleBulletList().run()}><List className="h-4 w-4" /></ToolButton>
            <ToolButton label="有序列表" active={editor?.isActive("orderedList")} disabled={!editor} onClick={() => editor?.chain().focus().toggleOrderedList().run()}><ListOrdered className="h-4 w-4" /></ToolButton>
            <ToolButton label="待办列表" active={editor?.isActive("taskList")} disabled={!editor} onClick={() => editor?.chain().focus().toggleTaskList().run()}><CheckSquare className="h-4 w-4" /></ToolButton>
            <ToolButton label="引用" active={editor?.isActive("blockquote")} disabled={!editor} onClick={() => editor?.chain().focus().toggleBlockquote().run()}><Quote className="h-4 w-4" /></ToolButton>
            <ToolButton label="行内代码" active={editor?.isActive("code")} disabled={!editor} onClick={() => editor?.chain().focus().toggleCode().run()}><Code className="h-4 w-4" /></ToolButton>
            <ToolButton label="添加或移除链接" active={editor?.isActive("link")} disabled={!editor} onClick={setLink}><LinkIcon className="h-4 w-4" /></ToolButton>
            <ToolbarDivider />
            <ToolButton label="撤销" disabled={!editor?.can().chain().focus().undo().run()} onClick={() => editor?.chain().focus().undo().run()}><Undo2 className="h-4 w-4" /></ToolButton>
            <ToolButton label="重做" disabled={!editor?.can().chain().focus().redo().run()} onClick={() => editor?.chain().focus().redo().run()}><Redo2 className="h-4 w-4" /></ToolButton>
            <ToolButton label="清除格式" disabled={!editor} onClick={() => editor?.chain().focus().unsetAllMarks().clearNodes().run()}><Eraser className="h-4 w-4" /></ToolButton>
          </div>
          <ToolButton label={fullscreen ? "退出全屏" : "全屏编辑"} onClick={() => setFullscreen((current) => !current)}>
            {fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </ToolButton>
        </div>

        <div className="border-b border-slate-100 bg-white px-3 py-2">
          <div className="relative inline-block">
            <button type="button" onClick={() => setTemplateOpen((current) => !current)} className="inline-flex items-center gap-1.5 rounded-lg bg-orange-50 px-3 py-1.5 text-xs font-bold text-orange-700 transition hover:bg-orange-100">
              <Expand className="h-3.5 w-3.5" />插入学习模板<ChevronDown className="h-3.5 w-3.5" />
            </button>
            {templateOpen && (
              <div className="absolute left-0 top-full z-20 mt-1 grid min-w-52 gap-1 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl">
                {NOTE_TEMPLATES.map((template) => (
                  <button key={template.label} type="button" onClick={() => applyTemplate(template)} className="rounded-lg px-3 py-2 text-left text-sm font-semibold text-slate-700 hover:bg-orange-50 hover:text-orange-700">
                    {template.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className={fullscreen ? "min-h-0 flex-1 overflow-y-auto" : ""}>
          <EditorContent editor={editor} />
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-slate-100 bg-slate-50 px-3 py-2 text-[11px] font-semibold text-slate-400">
          <span>{saveState === "saving" ? "正在保存…" : noteHasContent(value) || characterCount ? "已保存" : "开始记录你的记忆线索"}</span>
          <span>{wordCount} 词 · {characterCount} 字符</span>
        </div>
      </div>
    </div>
  );
}
