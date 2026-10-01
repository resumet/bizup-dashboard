"use client";

import { Extension, Node as TiptapNode, type Editor, type JSONContent } from "@tiptap/core";
import ImageExtension from "@tiptap/extension-image";
import Highlight from "@tiptap/extension-highlight";
import LinkExtension from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import TaskItem from "@tiptap/extension-task-item";
import TaskList from "@tiptap/extension-task-list";
import { TableKit } from "@tiptap/extension-table";
import TextAlign from "@tiptap/extension-text-align";
import { FontSize, LineHeight, TextStyle } from "@tiptap/extension-text-style";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Plugin } from "@tiptap/pm/state";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Bold,
  Check,
  Columns3,
  Eye,
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Heading1,
  Heading2,
  Heading3,
  Highlighter,
  ImagePlus,
  Italic,
  Link2,
  List,
  ListOrdered,
  ListChecks,
  Loader2,
  LockKeyhole,
  Megaphone,
  Pilcrow,
  Quote,
  Redo2,
  Rows3,
  Save,
  Strikethrough,
  Table2,
  Trash2,
  Underline,
  Undo2,
  Unlink,
} from "lucide-react";

import { DocumentRenderer } from "@/components/course-documents/document-renderer";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  blocksToRichTextDocument,
  richTextCharacterCount,
  richTextDocumentToBlocks,
} from "@/lib/course-documents/rich-text";
import { normalizeRichTextPasteHtml } from "@/lib/course-documents/rich-text-paste";
import type {
  CourseDocumentBlock,
  CourseDocumentDetail,
  CourseDocumentStatus,
  RichTextNode,
} from "@/lib/course-documents/types";
import { cn } from "@/lib/utils";

type Props = {
  mode: "admin" | "external";
  courseId: string;
  courseName: string;
  accessToken?: string;
  document?: CourseDocumentDetail;
  fixedTitle?: boolean;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const FONT_SIZE_OPTIONS = [12, 14, 16, 18, 20, 24, 28, 32, 40, 48] as const;
const LINE_HEIGHT_OPTIONS = [
  { value: "1.2", label: "좁게 1.2" },
  { value: "1.5", label: "보통 1.5" },
  { value: "1.8", label: "넓게 1.8" },
  { value: "2", label: "아주 넓게 2.0" },
] as const;
const TOP_LEVEL_BLOCKS = [
  "paragraph",
  "heading",
  "bulletList",
  "orderedList",
  "taskList",
  "blockquote",
  "codeBlock",
  "horizontalRule",
  "image",
  "table",
  "buttonLink",
];

const BlockIdentity = Extension.create({
  name: "blockIdentity",
  addGlobalAttributes() {
    return [{
      types: TOP_LEVEL_BLOCKS,
      attributes: {
        blockId: {
          default: null,
          parseHTML: (element) => element.getAttribute("data-block-id"),
          renderHTML: (attributes) => attributes.blockId ? { "data-block-id": attributes.blockId } : {},
        },
      },
    }];
  },
  addProseMirrorPlugins() {
    return [new Plugin({
      appendTransaction: (_transactions, _oldState, newState) => {
        const seen = new Set<string>();
        const transaction = newState.tr;
        let changed = false;
        newState.doc.forEach((node, offset) => {
          const candidate = node.attrs.blockId;
          if (typeof candidate === "string" && UUID_PATTERN.test(candidate) && !seen.has(candidate)) {
            seen.add(candidate);
            return;
          }
          const blockId = crypto.randomUUID();
          seen.add(blockId);
          transaction.setNodeMarkup(offset, undefined, { ...node.attrs, blockId }, node.marks);
          changed = true;
        });
        return changed ? transaction : null;
      },
    })];
  },
});

const ButtonLink = TiptapNode.create({
  name: "buttonLink",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,
  addAttributes() {
    return {
      label: { default: "자세히 보기" },
      url: { default: "" },
    };
  },
  parseHTML() {
    return [{ tag: "div[data-course-document-button]" }];
  },
  renderHTML({ node }) {
    return [
      "div",
      {
        "data-course-document-button": "",
        "data-label": node.attrs.label,
        "data-url": node.attrs.url,
        "data-block-id": node.attrs.blockId,
      },
      ["span", {}, node.attrs.label],
    ];
  },
});

function normalizeExternalUrl(value: string) {
  const normalized = /^https?:\/\//iu.test(value.trim()) ? value.trim() : `https://${value.trim()}`;
  const url = new URL(normalized);
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("http 또는 https 주소를 입력해 주세요.");
  return url.toString();
}

function editorBlocks(editor: Editor) {
  return richTextDocumentToBlocks(editor.getJSON() as { content?: RichTextNode[] });
}

function imageFileFromTransfer(data: DataTransfer | null) {
  if (!data) return null;
  const directFile = Array.from(data.files).find((item) => item.type.startsWith("image/"));
  if (directFile) return directFile;
  for (const item of Array.from(data.items)) {
    if (item.kind !== "file" || !item.type.startsWith("image/")) continue;
    const file = item.getAsFile();
    if (file) return file;
  }
  return null;
}

function ToolbarButton({
  active = false,
  label,
  disabled = false,
  onClick,
  children,
}: {
  active?: boolean;
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Button
      type="button"
      size="icon-sm"
      variant={active ? "secondary" : "ghost"}
      aria-label={label}
      title={label}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

export function CourseDocumentEditor({ mode, courseId, courseName, accessToken, document, fixedTitle = false }: Props) {
  const imageInputRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<Editor | null>(null);
  const dirtyRef = useRef(false);
  const [title, setTitle] = useState(document?.title ?? "");
  const [blocks, setBlocks] = useState<CourseDocumentBlock[]>(document?.content ?? []);
  const [status, setStatus] = useState<CourseDocumentStatus>(document?.status ?? "draft");
  const [leadGateAfterBlockId, setLeadGateAfterBlockId] = useState<string | null>(
    document?.leadGateEnabled ? document.leadGateAfterBlockId : null,
  );
  const [preview, setPreview] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [selectionRevision, setSelectionRevision] = useState(0);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [linkText, setLinkText] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [buttonDialogOpen, setButtonDialogOpen] = useState(false);
  const [buttonLabel, setButtonLabel] = useState("자세히 보기");
  const [buttonUrl, setButtonUrl] = useState("");
  const [gateDialogOpen, setGateDialogOpen] = useState(false);

  const initialContent = useMemo(() => blocksToRichTextDocument(document?.content ?? []) as JSONContent, [document?.content]);
  const leadGateEnabled = mode === "admin" && Boolean(leadGateAfterBlockId);
  const characterCount = useMemo(() => richTextCharacterCount(blocks), [blocks]);

  const uploadImage = useCallback(async (file: File, insertAt?: number) => {
    setUploading(true);
    setError("");
    setNotice("");
    try {
      const formData = new FormData();
      formData.set("file", file);
      let endpoint = `/api/write/${accessToken}/images`;
      if (mode === "admin") {
        endpoint = "/api/instagram-management/images";
        formData.set("courseId", courseId);
      }
      const response = await fetch(endpoint, { method: "POST", body: formData });
      const body = await response.json() as { url?: string; message?: string };
      if (!response.ok || !body.url) throw new Error(body.message ?? "이미지를 업로드하지 못했습니다.");
      const activeEditor = editorRef.current;
      if (!activeEditor || activeEditor.isDestroyed) return;
      const chain = activeEditor.chain().focus();
      if (typeof insertAt === "number") chain.setTextSelection(insertAt);
      chain.insertContent({
        type: "image",
        attrs: { src: body.url, alt: file.name.replace(/\.[^.]+$/u, ""), title: null, blockId: crypto.randomUUID() },
      }).run();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "이미지를 업로드하지 못했습니다.");
    } finally {
      setUploading(false);
      if (imageInputRef.current) imageInputRef.current.value = "";
    }
  }, [accessToken, courseId, mode]);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] }, link: false }),
      LinkExtension.configure({
        openOnClick: false,
        autolink: true,
        linkOnPaste: true,
        defaultProtocol: "https",
        HTMLAttributes: { target: "_blank", rel: "noopener noreferrer" },
      }),
      ImageExtension.configure({ inline: false, allowBase64: false }),
      TableKit.configure({
        table: { resizable: true, renderWrapper: true, allowTableNodeSelection: true },
      }),
      TaskList,
      TaskItem.configure({
        nested: true,
        // The editable node view does not inherit renderHTML's data-type marker.
        HTMLAttributes: { "data-type": "taskItem" },
      }),
      TextStyle,
      FontSize,
      LineHeight,
      Highlight,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Placeholder.configure({ placeholder: "본문을 입력하거나 이미지를 붙여넣으세요" }),
      ButtonLink,
      BlockIdentity,
    ],
    content: initialContent,
    editorProps: {
      attributes: {
        class: "course-rich-text-editor",
        "aria-label": "문서 본문",
      },
      transformPastedHTML: normalizeRichTextPasteHtml,
      handlePaste: (_view, event) => {
        const file = imageFileFromTransfer(event.clipboardData);
        const html = event.clipboardData?.getData("text/html").trim();
        if (!file || html) return false;
        event.preventDefault();
        void uploadImage(file);
        return true;
      },
      handleDrop: (view, event) => {
        const file = imageFileFromTransfer(event.dataTransfer);
        if (!file) return false;
        event.preventDefault();
        const position = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos;
        void uploadImage(file, position);
        return true;
      },
    },
    onCreate: ({ editor: createdEditor }) => {
      editorRef.current = createdEditor;
    },
    onUpdate: ({ editor: updatedEditor }) => {
      const nextBlocks = editorBlocks(updatedEditor);
      setBlocks(nextBlocks);
      setLeadGateAfterBlockId((current) => {
        if (!current) return null;
        const index = nextBlocks.findIndex((block) => block.id === current);
        return index >= 0 && index < nextBlocks.length - 1 ? current : null;
      });
      dirtyRef.current = true;
      setDirty(true);
      setNotice("");
    },
    onSelectionUpdate: () => setSelectionRevision((value) => value + 1),
    onDestroy: () => {
      editorRef.current = null;
    },
  }, [document?.id, uploadImage]);

  useEffect(() => {
    if (!dirty) return;
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      if (!dirtyRef.current) return;
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warnBeforeLeaving);
    return () => window.removeEventListener("beforeunload", warnBeforeLeaving);
  }, [dirty]);

  function changeTitle(value: string) {
    setTitle(value);
    dirtyRef.current = true;
    setDirty(true);
    setNotice("");
  }

  function openLinkDialog() {
    if (!editor) return;
    const { from, to, empty } = editor.state.selection;
    setLinkText(empty ? "" : editor.state.doc.textBetween(from, to, " "));
    const attrs = editor.getAttributes("link");
    setLinkUrl(typeof attrs.href === "string" ? attrs.href : "");
    setLinkDialogOpen(true);
  }

  function applyLink() {
    if (!editor) return;
    try {
      const href = normalizeExternalUrl(linkUrl);
      if (editor.state.selection.empty) {
        if (!linkText.trim()) throw new Error("링크 문구를 입력해 주세요.");
        editor.chain().focus().insertContent({
          type: "text",
          text: linkText.trim(),
          marks: [{ type: "link", attrs: { href, target: "_blank", rel: "noopener noreferrer" } }],
        }).run();
      } else {
        editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
      }
      setLinkDialogOpen(false);
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "링크 주소를 확인해 주세요.");
    }
  }

  function removeLink() {
    editor?.chain().focus().extendMarkRange("link").unsetLink().run();
    setLinkDialogOpen(false);
  }

  function insertChecklistItem() {
    if (!editor) return;
    if (editor.isActive("taskItem")) {
      editor.chain().focus().splitListItem("taskItem").run();
      return;
    }
    editor.chain().focus().insertContent({
      type: "taskList",
      attrs: { blockId: crypto.randomUUID() },
      content: [{
        type: "taskItem",
        attrs: { checked: false },
        content: [{ type: "paragraph" }],
      }],
    }).run();
  }

  function openButtonDialog() {
    const attrs = editor?.getAttributes("buttonLink");
    setButtonLabel(typeof attrs?.label === "string" ? attrs.label : "자세히 보기");
    setButtonUrl(typeof attrs?.url === "string" ? attrs.url : "");
    setButtonDialogOpen(true);
  }

  function applyButtonLink() {
    if (!editor) return;
    try {
      if (!buttonLabel.trim()) throw new Error("버튼 문구를 입력해 주세요.");
      const url = normalizeExternalUrl(buttonUrl);
      if (editor.isActive("buttonLink")) {
        editor.chain().focus().updateAttributes("buttonLink", { label: buttonLabel.trim(), url }).run();
      } else {
        editor.chain().focus().insertContent([
          { type: "buttonLink", attrs: { label: buttonLabel.trim(), url, blockId: crypto.randomUUID() } },
          { type: "paragraph", attrs: { blockId: crypto.randomUUID() } },
        ]).run();
      }
      setButtonDialogOpen(false);
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "버튼 정보를 확인해 주세요.");
    }
  }

  async function save() {
    if (saving || uploading) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      if (!title.trim()) throw new Error("문서 제목을 입력해 주세요.");
      const normalizedBlocks = editor ? editorBlocks(editor) : blocks;
      const gateIndex = normalizedBlocks.findIndex((block) => block.id === leadGateAfterBlockId);
      const normalizedLeadGateAfterBlockId = gateIndex >= 0 && gateIndex < normalizedBlocks.length - 1
        ? leadGateAfterBlockId
        : null;
      const endpoint = mode === "admin" ? "/api/instagram-management" : `/api/write/${accessToken}`;
      const method = mode === "admin" || document ? (mode === "admin" ? "POST" : "PATCH") : "POST";
      const payload = mode === "admin"
        ? {
            action: "save-document",
            documentId: document?.id,
            document: {
              title,
              content: normalizedBlocks,
              status,
              leadGateEnabled: Boolean(normalizedLeadGateAfterBlockId),
              leadGateAfterBlockId: normalizedLeadGateAfterBlockId,
            },
          }
        : { documentId: document?.id, title, content: normalizedBlocks };
      const response = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await response.json() as { id?: string; message?: string };
      if (!response.ok) throw new Error(body.message ?? "문서를 저장하지 못했습니다.");
      setBlocks(normalizedBlocks);
      setLeadGateAfterBlockId(normalizedLeadGateAfterBlockId);
      dirtyRef.current = false;
      setDirty(false);
      setNotice("저장했습니다.");
      if (!document && body.id && mode === "external") window.location.replace(`/write/${accessToken}/${body.id}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "문서를 저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  const currentBlockStyle = editor?.isActive("heading", { level: 1 })
    ? "heading1"
    : editor?.isActive("heading", { level: 2 })
      ? "heading2"
      : editor?.isActive("heading", { level: 3 })
        ? "heading3"
        : "paragraph";
  const currentFontSize = typeof editor?.getAttributes("textStyle").fontSize === "string"
    ? editor.getAttributes("textStyle").fontSize
    : "default";
  const currentLineHeight = typeof editor?.getAttributes("textStyle").lineHeight === "string"
    ? editor.getAttributes("textStyle").lineHeight
    : "default";
  void selectionRevision;

  return (
    <div
      className="space-y-4"
      onKeyDown={(event) => {
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
          event.preventDefault();
          void save();
        }
      }}
    >
      <header className="sticky top-0 z-20 overflow-hidden rounded-xl border bg-background/95 shadow-sm backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5 sm:px-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="truncate text-sm font-semibold">{courseName}</span>
            <span className="h-4 w-px bg-border" />
            <span className={cn("flex items-center gap-1.5 text-xs", dirty ? "text-amber-700" : "text-muted-foreground")}>
              {dirty ? <span className="size-1.5 rounded-full bg-amber-500" /> : <Check className="size-3.5" />}
              {dirty ? "저장 안 됨" : "저장됨"}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" size="sm" variant="ghost" onClick={() => setPreview((value) => !value)}><Eye />{preview ? "편집" : "미리보기"}</Button>
            <Button type="button" size="sm" onClick={() => void save()} disabled={saving || uploading || (!dirty && Boolean(document))}>{saving ? <Loader2 className="animate-spin" /> : <Save />}{saving ? "저장 중" : "저장"}</Button>
          </div>
        </div>

        {!preview ? (
          <div className="flex items-center gap-1 overflow-x-auto border-t px-2 py-1.5">
            <Select
              value={currentBlockStyle}
              onValueChange={(value) => {
                if (!editor) return;
                if (value === "heading1") editor.chain().focus().toggleHeading({ level: 1 }).run();
                else if (value === "heading2") editor.chain().focus().toggleHeading({ level: 2 }).run();
                else if (value === "heading3") editor.chain().focus().toggleHeading({ level: 3 }).run();
                else editor.chain().focus().setParagraph().run();
              }}
            >
              <SelectTrigger className="h-8 w-[7.25rem] border-0 bg-transparent shadow-none"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="paragraph"><span className="flex items-center gap-2"><Pilcrow className="size-4" />본문</span></SelectItem>
                <SelectItem value="heading1"><span className="flex items-center gap-2"><Heading1 className="size-4" />큰 제목</span></SelectItem>
                <SelectItem value="heading2"><span className="flex items-center gap-2"><Heading2 className="size-4" />작은 제목</span></SelectItem>
                <SelectItem value="heading3"><span className="flex items-center gap-2"><Heading3 className="size-4" />소제목</span></SelectItem>
              </SelectContent>
            </Select>
            <span className="mx-1 h-5 w-px shrink-0 bg-border" />
            <Select
              value={currentFontSize}
              onValueChange={(value) => {
                if (!editor) return;
                if (value === "default") editor.chain().focus().unsetFontSize().run();
                else editor.chain().focus().setFontSize(value).run();
              }}
            >
              <SelectTrigger className="h-8 w-[6.25rem] border-0 bg-transparent shadow-none" aria-label="글자 크기"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="default">기본 크기</SelectItem>
                {FONT_SIZE_OPTIONS.map((size) => <SelectItem key={size} value={`${size}px`}>{size}px</SelectItem>)}
              </SelectContent>
            </Select>
            <Select
              value={currentLineHeight}
              onValueChange={(value) => {
                if (!editor) return;
                if (value === "default") editor.chain().focus().unsetLineHeight().run();
                else editor.chain().focus().setLineHeight(value).run();
              }}
            >
              <SelectTrigger className="h-8 w-[6.25rem] border-0 bg-transparent shadow-none" aria-label="행간"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="default">기본 행간</SelectItem>
                {LINE_HEIGHT_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <span className="mx-1 h-5 w-px shrink-0 bg-border" />
            <ToolbarButton label="굵게" active={Boolean(editor?.isActive("bold"))} onClick={() => editor?.chain().focus().toggleBold().run()}><Bold /></ToolbarButton>
            <ToolbarButton label="기울임" active={Boolean(editor?.isActive("italic"))} onClick={() => editor?.chain().focus().toggleItalic().run()}><Italic /></ToolbarButton>
            <ToolbarButton label="밑줄" active={Boolean(editor?.isActive("underline"))} onClick={() => editor?.chain().focus().toggleUnderline().run()}><Underline /></ToolbarButton>
            <ToolbarButton label="취소선" active={Boolean(editor?.isActive("strike"))} onClick={() => editor?.chain().focus().toggleStrike().run()}><Strikethrough /></ToolbarButton>
            <ToolbarButton label="형광펜" active={Boolean(editor?.isActive("highlight"))} onClick={() => editor?.chain().focus().toggleHighlight().run()}><Highlighter /></ToolbarButton>
            <ToolbarButton label="링크" active={Boolean(editor?.isActive("link"))} onClick={openLinkDialog}><Link2 /></ToolbarButton>
            <span className="mx-1 h-5 w-px shrink-0 bg-border" />
            <ToolbarButton label="왼쪽 정렬" active={Boolean(editor && !editor.isActive({ textAlign: "center" }) && !editor.isActive({ textAlign: "right" }) && !editor.isActive({ textAlign: "justify" }))} onClick={() => editor?.chain().focus().setTextAlign("left").run()}><AlignLeft /></ToolbarButton>
            <ToolbarButton label="가운데 정렬" active={Boolean(editor?.isActive({ textAlign: "center" }))} onClick={() => editor?.chain().focus().setTextAlign("center").run()}><AlignCenter /></ToolbarButton>
            <ToolbarButton label="오른쪽 정렬" active={Boolean(editor?.isActive({ textAlign: "right" }))} onClick={() => editor?.chain().focus().setTextAlign("right").run()}><AlignRight /></ToolbarButton>
            <ToolbarButton label="양쪽 정렬" active={Boolean(editor?.isActive({ textAlign: "justify" }))} onClick={() => editor?.chain().focus().setTextAlign("justify").run()}><AlignJustify /></ToolbarButton>
            <span className="mx-1 h-5 w-px shrink-0 bg-border" />
            <ToolbarButton label="글머리 목록" active={Boolean(editor?.isActive("bulletList"))} onClick={() => editor?.chain().focus().toggleBulletList().run()}><List /></ToolbarButton>
            <ToolbarButton label="번호 목록" active={Boolean(editor?.isActive("orderedList"))} onClick={() => editor?.chain().focus().toggleOrderedList().run()}><ListOrdered /></ToolbarButton>
            <Button
              type="button"
              size="sm"
              variant={editor?.isActive("taskList") ? "secondary" : "ghost"}
              aria-label="체크 항목 넣기"
              title="체크 항목 넣기"
              onMouseDown={(event) => event.preventDefault()}
              onClick={insertChecklistItem}
            >
              <ListChecks />체크 항목
            </Button>
            <ToolbarButton label="인용문" active={Boolean(editor?.isActive("blockquote"))} onClick={() => editor?.chain().focus().toggleBlockquote().run()}><Quote /></ToolbarButton>
            <span className="mx-1 h-5 w-px shrink-0 bg-border" />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  size="icon-sm"
                  variant={editor?.isActive("table") ? "secondary" : "ghost"}
                  aria-label="표"
                  title="표"
                >
                  <Table2 />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-48">
                <DropdownMenuItem
                  disabled={Boolean(editor?.isActive("table"))}
                  onSelect={() => editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
                >
                  <Table2 />3×3 표 넣기
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem disabled={!editor?.isActive("table")} onSelect={() => editor?.chain().focus().addRowAfter().run()}><Rows3 />아래 행 추가</DropdownMenuItem>
                <DropdownMenuItem disabled={!editor?.isActive("table")} onSelect={() => editor?.chain().focus().addColumnAfter().run()}><Columns3 />오른쪽 열 추가</DropdownMenuItem>
                <DropdownMenuItem disabled={!editor?.isActive("table")} onSelect={() => editor?.chain().focus().toggleHeaderRow().run()}><Rows3 />헤더 행 전환</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem disabled={!editor?.isActive("table")} onSelect={() => editor?.chain().focus().deleteRow().run()}><Trash2 />현재 행 삭제</DropdownMenuItem>
                <DropdownMenuItem disabled={!editor?.isActive("table")} onSelect={() => editor?.chain().focus().deleteColumn().run()}><Trash2 />현재 열 삭제</DropdownMenuItem>
                <DropdownMenuItem variant="destructive" disabled={!editor?.isActive("table")} onSelect={() => editor?.chain().focus().deleteTable().run()}><Trash2 />표 삭제</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <input
              ref={imageInputRef}
              className="hidden"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void uploadImage(file);
              }}
            />
            <ToolbarButton label="이미지 넣기" disabled={uploading} onClick={() => imageInputRef.current?.click()}>{uploading ? <Loader2 className="animate-spin" /> : <ImagePlus />}</ToolbarButton>
            <ToolbarButton label="버튼 넣기" active={Boolean(editor?.isActive("buttonLink"))} onClick={openButtonDialog}><Megaphone /></ToolbarButton>
            <span className="mx-1 h-5 w-px shrink-0 bg-border" />
            <ToolbarButton label="실행 취소" disabled={!editor?.can().undo()} onClick={() => editor?.chain().focus().undo().run()}><Undo2 /></ToolbarButton>
            <ToolbarButton label="다시 실행" disabled={!editor?.can().redo()} onClick={() => editor?.chain().focus().redo().run()}><Redo2 /></ToolbarButton>
          </div>
        ) : null}
      </header>

      {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
      {notice ? <Alert><AlertDescription>{notice}</AlertDescription></Alert> : null}

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_15rem]">
        <section className="min-h-[46rem] rounded-xl border bg-background shadow-sm">
          {preview ? (
            <div className="mx-auto w-full max-w-3xl px-6 py-12 sm:px-12">
              <h1 className="mb-10 text-4xl font-bold tracking-tight text-balance sm:text-5xl">{title || "제목 없음"}</h1>
              <DocumentRenderer blocks={blocks} />
            </div>
          ) : (
            <div className="mx-auto w-full max-w-4xl px-6 py-10 sm:px-12 lg:px-16 lg:py-14">
              {fixedTitle ? (
                <h1 className="py-2 text-4xl font-bold tracking-tight text-balance sm:text-5xl">{title}</h1>
              ) : (
                <Input
                  value={title}
                  maxLength={200}
                  autoFocus={!document}
                  onChange={(event) => changeTitle(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter") return;
                    event.preventDefault();
                    editor?.commands.focus("start");
                  }}
                  placeholder="문서 제목"
                  aria-label="문서 제목"
                  className="h-auto rounded-none border-0 bg-transparent px-0 py-2 text-4xl font-bold tracking-tight shadow-none placeholder:text-muted-foreground/45 focus-visible:border-transparent focus-visible:ring-0 sm:text-5xl dark:bg-transparent"
                />
              )}
              <EditorContent editor={editor} className="mt-8" />
            </div>
          )}

          <footer className="flex items-center justify-end border-t px-5 py-3 text-xs text-muted-foreground sm:px-8">
            <span>{characterCount.toLocaleString("ko-KR")}자</span>
          </footer>
        </section>

        <aside className="space-y-5 rounded-xl border bg-background p-4 xl:sticky xl:top-28">
          <h2 className="font-semibold">문서 설정</h2>
          {mode === "admin" ? (
            <div className="space-y-2">
              <Label>공개 상태</Label>
              <Select value={status} onValueChange={(value) => { setStatus(value as CourseDocumentStatus); dirtyRef.current = true; setDirty(true); setNotice(""); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="draft">비공개</SelectItem><SelectItem value="published">공개</SelectItem></SelectContent>
              </Select>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3"><span className="text-sm font-medium">상태</span><Badge variant="secondary">관리자 검수 전</Badge></div>
          )}

          {mode === "admin" ? (
            <div className="space-y-3 border-t pt-4">
              <div className="flex items-center justify-between gap-3"><span className="text-sm font-medium">리드게이트</span><Badge variant={leadGateEnabled ? "default" : "secondary"}>{leadGateEnabled ? "사용" : "사용 안 함"}</Badge></div>
              <Button type="button" variant="outline" className="w-full" disabled={blocks.length < 2} onClick={() => setGateDialogOpen(true)}><LockKeyhole />{leadGateEnabled ? "위치 변경" : "설정"}</Button>
            </div>
          ) : null}

          {document?.slug && status === "published" ? <Button asChild variant="outline" className="w-full"><a href={`/article/${document.slug}`} target="_blank" rel="noopener noreferrer"><Eye />공개 페이지</a></Button> : null}
        </aside>
      </div>

      <Dialog open={linkDialogOpen} onOpenChange={setLinkDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>링크</DialogTitle><DialogDescription className="sr-only">선택한 텍스트에 링크를 적용합니다.</DialogDescription></DialogHeader>
          <div className="space-y-4 py-2">
            {editor?.state.selection.empty ? <div className="space-y-2"><Label htmlFor="document-link-text">링크 문구</Label><Input id="document-link-text" value={linkText} onChange={(event) => setLinkText(event.target.value)} /></div> : null}
            <div className="space-y-2"><Label htmlFor="document-link-url">주소</Label><Input id="document-link-url" type="url" autoFocus value={linkUrl} onChange={(event) => setLinkUrl(event.target.value)} placeholder="https://" onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); applyLink(); } }} /></div>
          </div>
          <DialogFooter>
            <DialogClose asChild><Button variant="outline">취소</Button></DialogClose>
            {editor?.isActive("link") ? <Button type="button" variant="ghost" onClick={removeLink}><Unlink />링크 해제</Button> : null}
            <Button type="button" onClick={applyLink}>적용</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={buttonDialogOpen} onOpenChange={setButtonDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>버튼</DialogTitle><DialogDescription className="sr-only">문서에 표시할 버튼을 설정합니다.</DialogDescription></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2"><Label htmlFor="document-button-label">버튼 문구</Label><Input id="document-button-label" value={buttonLabel} onChange={(event) => setButtonLabel(event.target.value)} /></div>
            <div className="space-y-2"><Label htmlFor="document-button-url">주소</Label><Input id="document-button-url" type="url" value={buttonUrl} onChange={(event) => setButtonUrl(event.target.value)} placeholder="https://" onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); applyButtonLink(); } }} /></div>
          </div>
          <DialogFooter><DialogClose asChild><Button variant="outline">취소</Button></DialogClose><Button type="button" onClick={applyButtonLink}>적용</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={gateDialogOpen} onOpenChange={setGateDialogOpen}>
        <DialogContent className="flex max-h-[88dvh] flex-col overflow-hidden sm:max-w-3xl">
          <DialogHeader className="shrink-0"><DialogTitle>리드게이트 위치</DialogTitle><DialogDescription className="sr-only">공개할 내용과 정보 입력 후 공개할 내용의 경계를 선택합니다.</DialogDescription></DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain rounded-xl border bg-background px-5 py-6 sm:px-8">
            <h1 className="mb-8 text-3xl font-bold tracking-tight text-balance">{title || "제목 없음"}</h1>
            {blocks.map((block, index) => (
              <div key={block.id}>
                <DocumentRenderer blocks={[block]} />
                {index < blocks.length - 1 ? (
                  <button
                    type="button"
                    className={cn(
                      "group my-5 flex w-full items-center gap-3 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      leadGateAfterBlockId === block.id ? "text-primary" : "text-muted-foreground/55 hover:text-foreground",
                    )}
                    onClick={() => {
                      setLeadGateAfterBlockId(block.id);
                      dirtyRef.current = true;
                      setDirty(true);
                      setNotice("");
                    }}
                  >
                    <span className="h-px flex-1 bg-current/30" />
                    <LockKeyhole className="size-3.5" />
                    {leadGateAfterBlockId === block.id ? "리드게이트 위치" : "여기에 리드게이트 설정"}
                    <span className="h-px flex-1 bg-current/30" />
                  </button>
                ) : null}
              </div>
            ))}
          </div>
          <DialogFooter className="shrink-0">
            {leadGateAfterBlockId ? <Button type="button" variant="ghost" onClick={() => { setLeadGateAfterBlockId(null); dirtyRef.current = true; setDirty(true); setNotice(""); }}>리드게이트 해제</Button> : null}
            <DialogClose asChild><Button>완료</Button></DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
