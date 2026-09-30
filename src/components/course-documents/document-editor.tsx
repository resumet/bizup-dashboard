"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import {
  ArrowDown,
  ArrowUp,
  Check,
  Eye,
  Heading1,
  Heading2,
  ImagePlus,
  Link2,
  List,
  ListOrdered,
  Loader2,
  Megaphone,
  Pilcrow,
  Plus,
  Save,
  Trash2,
} from "lucide-react";

import { DocumentRenderer } from "@/components/course-documents/document-renderer";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { CourseDocumentBlock, CourseDocumentDetail, CourseDocumentStatus } from "@/lib/course-documents/types";
import { cn } from "@/lib/utils";

type Props = {
  mode: "admin" | "external";
  courseId: string;
  courseName: string;
  accessToken?: string;
  document?: CourseDocumentDetail;
};

type TextBlock = Extract<CourseDocumentBlock, { type: "heading1" | "heading2" | "paragraph" }>;
type ListBlock = Extract<CourseDocumentBlock, { type: "unordered_list" | "ordered_list" }>;

const BLOCK_LABELS: Record<CourseDocumentBlock["type"], string> = {
  heading1: "큰 제목",
  heading2: "작은 제목",
  paragraph: "본문",
  unordered_list: "목록",
  ordered_list: "번호 목록",
  image: "이미지",
  link: "링크",
  cta: "버튼",
};

const ADD_ACTIONS: Array<{
  type: Exclude<CourseDocumentBlock["type"], "image">;
  label: string;
  icon: typeof Heading1;
}> = [
  { type: "heading1", label: "큰 제목", icon: Heading1 },
  { type: "heading2", label: "작은 제목", icon: Heading2 },
  { type: "paragraph", label: "본문", icon: Pilcrow },
  { type: "unordered_list", label: "목록", icon: List },
  { type: "ordered_list", label: "번호 목록", icon: ListOrdered },
  { type: "link", label: "링크", icon: Link2 },
  { type: "cta", label: "버튼", icon: Megaphone },
];

function newBlock(type: CourseDocumentBlock["type"]): CourseDocumentBlock {
  const id = crypto.randomUUID();
  if (type === "unordered_list" || type === "ordered_list") return { id, type, items: [""] };
  if (type === "image") return { id, type, url: "", alt: "" };
  if (type === "link") return { id, type, label: "", url: "" };
  if (type === "cta") return { id, type, label: "자세히 보기", url: "" };
  return { id, type, content: "" };
}

function insertAfter(blocks: CourseDocumentBlock[], block: CourseDocumentBlock, afterBlockId: string | null) {
  const index = afterBlockId ? blocks.findIndex((item) => item.id === afterBlockId) : -1;
  if (index < 0) return [...blocks, block];
  const next = [...blocks];
  next.splice(index + 1, 0, block);
  return next;
}

function focusKey(block: CourseDocumentBlock) {
  if (block.type === "unordered_list" || block.type === "ordered_list") return `${block.id}:0`;
  return block.id;
}

function focusEditor(target: string, atEnd = false) {
  window.requestAnimationFrame(() => {
    const element = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[data-editor-focus="${target}"]`);
    if (!element) return;
    element.focus();
    const position = atEnd ? element.value.length : 0;
    element.setSelectionRange(position, position);
  });
}

function prepareBlocks(blocks: CourseDocumentBlock[]) {
  return blocks.flatMap<CourseDocumentBlock>((block) => {
    if (block.type === "heading1" || block.type === "heading2" || block.type === "paragraph") {
      return block.content.trim() ? [block] : [];
    }
    if (block.type === "unordered_list" || block.type === "ordered_list") {
      const items = block.items.filter((item) => item.trim());
      return items.length ? [{ ...block, items }] : [];
    }
    return [block];
  });
}

function textClass(type: TextBlock["type"]) {
  if (type === "heading1") return "text-3xl font-bold leading-tight tracking-tight sm:text-4xl";
  if (type === "heading2") return "text-2xl font-semibold leading-snug tracking-tight";
  return "text-base leading-8";
}

export function CourseDocumentEditor({ mode, courseId, courseName, accessToken, document }: Props) {
  const router = useRouter();
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState(document?.title ?? "");
  const [blocks, setBlocks] = useState<CourseDocumentBlock[]>(document?.content ?? []);
  const [status, setStatus] = useState<CourseDocumentStatus>(document?.status ?? "draft");
  const [leadGateAfterBlockId, setLeadGateAfterBlockId] = useState<string | null>(
    document?.leadGateEnabled ? document.leadGateAfterBlockId : null,
  );
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const leadGateEnabled = mode === "admin" && Boolean(leadGateAfterBlockId);
  const returnHref = mode === "admin" ? "/services/instagram-management" : `/write/${accessToken}`;

  const characterCount = useMemo(() => blocks.reduce((sum, block) => {
    if (block.type === "heading1" || block.type === "heading2" || block.type === "paragraph") {
      return sum + block.content.length;
    }
    if (block.type === "unordered_list" || block.type === "ordered_list") {
      return sum + block.items.join("").length;
    }
    if (block.type === "link" || block.type === "cta") return sum + block.label.length;
    return sum;
  }, 0), [blocks]);

  useEffect(() => {
    if (!dirty) return;
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warnBeforeLeaving);
    return () => window.removeEventListener("beforeunload", warnBeforeLeaving);
  }, [dirty]);

  function changeTitle(value: string) {
    setTitle(value);
    setDirty(true);
    setNotice("");
  }

  function updateBlock(id: string, updater: (block: CourseDocumentBlock) => CourseDocumentBlock) {
    setBlocks((current) => current.map((block) => block.id === id ? updater(block) : block));
    setDirty(true);
    setNotice("");
  }

  function addBlock(type: Exclude<CourseDocumentBlock["type"], "image">, afterBlockId = activeBlockId) {
    const block = newBlock(type);
    setBlocks((current) => insertAfter(current, block, afterBlockId));
    setActiveBlockId(block.id);
    setDirty(true);
    setNotice("");
    focusEditor(focusKey(block));
  }

  function removeBlock(block: CourseDocumentBlock) {
    const index = blocks.findIndex((item) => item.id === block.id);
    const previous = blocks[index - 1];
    const next = blocks.filter((item) => item.id !== block.id);
    setBlocks(next);
    if (leadGateAfterBlockId === block.id || next.at(-1)?.id === leadGateAfterBlockId) {
      setLeadGateAfterBlockId(null);
    }
    setActiveBlockId(previous?.id ?? null);
    setDirty(true);
    setNotice("");
    if (previous) focusEditor(focusKey(previous), true);
  }

  function moveBlock(index: number, offset: -1 | 1) {
    const target = index + offset;
    if (target < 0 || target >= blocks.length) return;
    const next = [...blocks];
    [next[index], next[target]] = [next[target], next[index]];
    setBlocks(next);
    if (next.at(-1)?.id === leadGateAfterBlockId) setLeadGateAfterBlockId(null);
    setDirty(true);
    setNotice("");
  }

  function changeTextBlock(block: TextBlock, value: string) {
    if (block.type === "paragraph") {
      const shortcut = value.startsWith("## ")
        ? { type: "heading2" as const, content: value.slice(3) }
        : value.startsWith("# ")
          ? { type: "heading1" as const, content: value.slice(2) }
          : value.startsWith("- ") || value.startsWith("* ")
            ? { type: "unordered_list" as const, items: [value.slice(2)] }
            : value.startsWith("1. ")
              ? { type: "ordered_list" as const, items: [value.slice(3)] }
              : null;
      if (shortcut) {
        updateBlock(block.id, () => ({ id: block.id, ...shortcut }));
        focusEditor(shortcut.type === "unordered_list" || shortcut.type === "ordered_list" ? `${block.id}:0` : block.id, true);
        return;
      }
    }
    updateBlock(block.id, () => ({ ...block, content: value }));
  }

  function splitTextBlock(event: KeyboardEvent<HTMLTextAreaElement>, block: TextBlock, index: number) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      const start = event.currentTarget.selectionStart;
      const end = event.currentTarget.selectionEnd;
      const nextBlock = newBlock("paragraph") as TextBlock;
      nextBlock.content = block.content.slice(end);
      const next = [...blocks];
      next[index] = { ...block, content: block.content.slice(0, start) };
      next.splice(index + 1, 0, nextBlock);
      setBlocks(next);
      setActiveBlockId(nextBlock.id);
      setDirty(true);
      setNotice("");
      focusEditor(nextBlock.id);
      return;
    }
    if (
      event.key === "Backspace"
      && !block.content
      && event.currentTarget.selectionStart === 0
      && blocks.length > 1
    ) {
      event.preventDefault();
      removeBlock(block);
    }
  }

  function updateListItem(block: ListBlock, itemIndex: number, value: string) {
    updateBlock(block.id, () => {
      const items = [...block.items];
      items[itemIndex] = value;
      return { ...block, items };
    });
  }

  function handleListKey(event: KeyboardEvent<HTMLInputElement>, block: ListBlock, blockIndex: number, itemIndex: number) {
    if (event.key === "Enter") {
      event.preventDefault();
      const start = event.currentTarget.selectionStart ?? block.items[itemIndex]?.length ?? 0;
      const end = event.currentTarget.selectionEnd ?? start;
      const currentValue = block.items[itemIndex] ?? "";
      if (!currentValue.trim()) {
        const remaining = block.items.filter((_, index) => index !== itemIndex);
        const paragraph = newBlock("paragraph") as TextBlock;
        const next = [...blocks];
        if (remaining.length) next[blockIndex] = { ...block, items: remaining };
        else next.splice(blockIndex, 1);
        const insertionIndex = remaining.length ? blockIndex + 1 : blockIndex;
        next.splice(insertionIndex, 0, paragraph);
        setBlocks(next);
        setActiveBlockId(paragraph.id);
        setDirty(true);
        setNotice("");
        focusEditor(paragraph.id);
        return;
      }
      const items = [...block.items];
      items[itemIndex] = currentValue.slice(0, start);
      items.splice(itemIndex + 1, 0, currentValue.slice(end));
      setBlocks((current) => current.map((item) => item.id === block.id ? { ...block, items } : item));
      setDirty(true);
      setNotice("");
      focusEditor(`${block.id}:${itemIndex + 1}`);
      return;
    }
    if (event.key === "Backspace" && !block.items[itemIndex] && (event.currentTarget.selectionStart ?? 0) === 0) {
      event.preventDefault();
      if (block.items.length === 1) {
        updateBlock(block.id, () => ({ id: block.id, type: "paragraph", content: "" }));
        focusEditor(block.id);
        return;
      }
      const items = block.items.filter((_, index) => index !== itemIndex);
      updateBlock(block.id, () => ({ ...block, items }));
      focusEditor(`${block.id}:${Math.max(0, itemIndex - 1)}`, true);
    }
  }

  async function uploadImage(file: File) {
    const insertionAnchorId = activeBlockId;
    setUploading(true);
    setError("");
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
      const imageBlock: CourseDocumentBlock = {
        id: crypto.randomUUID(),
        type: "image",
        url: body.url,
        alt: "",
      };
      setBlocks((current) => insertAfter(current, imageBlock, insertionAnchorId));
      setActiveBlockId(imageBlock.id);
      setDirty(true);
      setNotice("");
      focusEditor(imageBlock.id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "이미지를 업로드하지 못했습니다.");
    } finally {
      setUploading(false);
      if (imageInputRef.current) imageInputRef.current.value = "";
    }
  }

  function acceptDroppedImage(files: FileList) {
    const file = Array.from(files).find((item) => item.type.startsWith("image/"));
    if (file) void uploadImage(file);
  }

  async function save() {
    if (saving || uploading) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      if (!title.trim()) throw new Error("문서 제목을 입력해 주세요.");
      const normalizedBlocks = prepareBlocks(blocks);
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
      setDirty(false);
      setNotice("저장했습니다.");
      if (!document && body.id && mode === "external") router.replace(`/write/${accessToken}/${body.id}`);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "문서를 저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  function renderBlock(block: CourseDocumentBlock, index: number) {
    return (
      <div key={block.id}>
        {mode === "admin" && index > 0 ? (
          <button
            type="button"
            className={cn(
              "group/gate my-2 flex w-full items-center gap-3 text-xs font-medium transition-colors",
              leadGateAfterBlockId === blocks[index - 1]?.id
                ? "text-primary"
                : "text-muted-foreground/50 hover:text-muted-foreground",
            )}
            onClick={() => {
              setLeadGateAfterBlockId(leadGateAfterBlockId === blocks[index - 1]?.id ? null : blocks[index - 1]?.id ?? null);
              setDirty(true);
              setNotice("");
            }}
          >
            <span className="h-px flex-1 bg-current/25" />
            {leadGateAfterBlockId === blocks[index - 1]?.id ? "리드게이트 해제" : "리드게이트"}
            <span className="h-px flex-1 bg-current/25" />
          </button>
        ) : null}

        <article
          className={cn(
            "group relative rounded-lg px-3 py-2 transition-colors",
            activeBlockId === block.id ? "bg-muted/35" : "hover:bg-muted/20",
          )}
          onFocusCapture={() => setActiveBlockId(block.id)}
          onClick={() => setActiveBlockId(block.id)}
        >
          <span className="absolute top-3 -left-7 hidden text-[10px] font-semibold tracking-wide text-muted-foreground/55 uppercase lg:block">
            {BLOCK_LABELS[block.type]}
          </span>
          <div className="absolute top-1.5 right-1.5 z-10 flex rounded-md border bg-background/95 p-0.5 opacity-0 shadow-sm transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
            <Button type="button" size="icon-xs" variant="ghost" title="아래에 본문 추가" aria-label="아래에 본문 추가" onClick={() => addBlock("paragraph", block.id)}><Plus /></Button>
            <Button type="button" size="icon-xs" variant="ghost" title="위로 이동" aria-label="위로 이동" disabled={index === 0} onClick={() => moveBlock(index, -1)}><ArrowUp /></Button>
            <Button type="button" size="icon-xs" variant="ghost" title="아래로 이동" aria-label="아래로 이동" disabled={index === blocks.length - 1} onClick={() => moveBlock(index, 1)}><ArrowDown /></Button>
            <Button type="button" size="icon-xs" variant="ghost" className="text-muted-foreground hover:text-destructive" title="삭제" aria-label="블록 삭제" onClick={() => removeBlock(block)}><Trash2 /></Button>
          </div>

          {(block.type === "heading1" || block.type === "heading2" || block.type === "paragraph") ? (
            <Textarea
              data-editor-focus={block.id}
              rows={1}
              value={block.content}
              onChange={(event) => changeTextBlock(block, event.target.value)}
              onKeyDown={(event) => splitTextBlock(event, block, index)}
              placeholder={block.type === "paragraph" ? "본문을 입력하세요" : BLOCK_LABELS[block.type]}
              className={cn(
                "field-sizing-content min-h-10 resize-none overflow-hidden border-0 bg-transparent px-0 py-1 pr-28 shadow-none focus-visible:border-transparent focus-visible:ring-0 dark:bg-transparent",
                textClass(block.type),
              )}
            />
          ) : null}

          {(block.type === "unordered_list" || block.type === "ordered_list") ? (
            <div className="space-y-1 py-1 pr-28">
              {block.items.map((item, itemIndex) => (
                <div key={`${block.id}-${itemIndex}`} className="flex items-start gap-3">
                  <span className="w-5 shrink-0 pt-1.5 text-right leading-7 text-muted-foreground tabular-nums">
                    {block.type === "ordered_list" ? `${itemIndex + 1}.` : "•"}
                  </span>
                  <Input
                    data-editor-focus={`${block.id}:${itemIndex}`}
                    value={item}
                    onChange={(event) => updateListItem(block, itemIndex, event.target.value)}
                    onKeyDown={(event) => handleListKey(event, block, index, itemIndex)}
                    placeholder="목록 항목"
                    className="h-9 border-0 bg-transparent px-0 text-base leading-7 shadow-none focus-visible:border-transparent focus-visible:ring-0 dark:bg-transparent md:text-base"
                  />
                </div>
              ))}
            </div>
          ) : null}

          {block.type === "image" ? (
            <figure className="overflow-hidden rounded-xl border bg-muted/15">
              <Image className="max-h-[34rem] w-full object-contain" src={block.url} alt={block.alt} width={1200} height={675} unoptimized />
              <Input
                data-editor-focus={block.id}
                value={block.alt}
                onChange={(event) => updateBlock(block.id, (current) => ({ ...current, alt: event.target.value }) as CourseDocumentBlock)}
                placeholder="이미지 설명"
                className="rounded-none border-0 border-t bg-background px-4 text-center text-sm shadow-none focus-visible:ring-0"
              />
            </figure>
          ) : null}

          {(block.type === "link" || block.type === "cta") ? (
            <div className={cn(
              "grid gap-3 rounded-lg border p-4 pr-28 sm:grid-cols-[minmax(10rem,0.7fr)_minmax(0,1.3fr)]",
              block.type === "cta" ? "bg-primary/5" : "bg-muted/15",
            )}>
              <div className="space-y-1.5">
                <Label htmlFor={`${block.id}-label`}>{block.type === "cta" ? "버튼 문구" : "링크 문구"}</Label>
                <Input id={`${block.id}-label`} data-editor-focus={block.id} value={block.label} onChange={(event) => updateBlock(block.id, (current) => ({ ...current, label: event.target.value }) as CourseDocumentBlock)} placeholder={block.type === "cta" ? "자세히 보기" : "링크 이름"} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`${block.id}-url`}>주소</Label>
                <Input id={`${block.id}-url`} type="url" value={block.url} onChange={(event) => updateBlock(block.id, (current) => ({ ...current, url: event.target.value }) as CourseDocumentBlock)} placeholder="https://" />
              </div>
            </div>
          ) : null}
        </article>
      </div>
    );
  }

  return (
    <div
      className="space-y-4"
      onKeyDown={(event) => {
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
          event.preventDefault();
          void save();
        }
      }}
      onPaste={(event) => {
        const file = Array.from(event.clipboardData.files).find((item) => item.type.startsWith("image/"));
        if (file) {
          event.preventDefault();
          void uploadImage(file);
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
          <div
            className="flex items-center gap-1 overflow-x-auto border-t px-2 py-1.5"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              acceptDroppedImage(event.dataTransfer.files);
            }}
          >
            {ADD_ACTIONS.map((action, index) => {
              const Icon = action.icon;
              return (
                <div key={action.type} className="flex items-center">
                  {index === 3 || index === 5 ? <span className="mx-1 h-5 w-px bg-border" /> : null}
                  <Button type="button" size="sm" variant="ghost" title={`${action.label} 추가`} onClick={() => addBlock(action.type)}><Icon /><span className="hidden sm:inline">{action.label}</span></Button>
                </div>
              );
            })}
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
            <Button type="button" size="sm" variant="ghost" disabled={uploading} title="이미지 추가" onClick={() => imageInputRef.current?.click()}>{uploading ? <Loader2 className="animate-spin" /> : <ImagePlus />}<span className="hidden sm:inline">이미지</span></Button>
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
              <DocumentRenderer blocks={prepareBlocks(blocks)} />
            </div>
          ) : (
            <div className="mx-auto w-full max-w-4xl px-5 py-10 sm:px-10 lg:px-16 lg:py-14">
              <Input
                value={title}
                maxLength={200}
                autoFocus={!document}
                onChange={(event) => changeTitle(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== "Enter") return;
                  event.preventDefault();
                  if (blocks[0]) focusEditor(focusKey(blocks[0]));
                  else addBlock("paragraph", null);
                }}
                placeholder="문서 제목"
                aria-label="문서 제목"
                className="h-auto rounded-none border-0 bg-transparent px-3 py-2 text-4xl font-bold tracking-tight shadow-none placeholder:text-muted-foreground/45 focus-visible:border-transparent focus-visible:ring-0 sm:text-5xl md:text-5xl dark:bg-transparent"
              />

              <div className="mt-8">
                {blocks.map(renderBlock)}
                {!blocks.length ? (
                  <button type="button" className="flex min-h-56 w-full items-start rounded-lg px-3 py-3 text-left text-base text-muted-foreground/55 transition-colors hover:bg-muted/20 hover:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => addBlock("paragraph", null)}>본문을 입력하세요</button>
                ) : null}
              </div>
            </div>
          )}

          <footer className="flex items-center justify-between border-t px-5 py-3 text-xs text-muted-foreground sm:px-8">
            <span>블록 {prepareBlocks(blocks).length.toLocaleString("ko-KR")}개</span>
            <span>{characterCount.toLocaleString("ko-KR")}자</span>
          </footer>
        </section>

        <aside className="space-y-5 rounded-xl border bg-background p-4 xl:sticky xl:top-28">
          <h2 className="font-semibold">문서 설정</h2>
          {mode === "admin" ? (
            <div className="space-y-2">
              <Label>공개 상태</Label>
              <Select value={status} onValueChange={(value) => { setStatus(value as CourseDocumentStatus); setDirty(true); setNotice(""); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="draft">비공개</SelectItem><SelectItem value="published">공개</SelectItem></SelectContent>
              </Select>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3"><span className="text-sm font-medium">상태</span><Badge variant="secondary">관리자 검수 전</Badge></div>
          )}

          {mode === "admin" ? (
            <div className="flex items-center justify-between gap-3 border-t pt-4"><span className="text-sm font-medium">리드게이트</span><Badge variant={leadGateEnabled ? "default" : "secondary"}>{leadGateEnabled ? "사용" : "사용 안 함"}</Badge></div>
          ) : null}

          {document?.slug && status === "published" ? <Button asChild variant="outline" className="w-full"><a href={`/article/${document.slug}`} target="_blank" rel="noopener noreferrer"><Eye />공개 페이지</a></Button> : null}
          <Button type="button" variant="ghost" className="w-full" onClick={() => router.push(returnHref)}>목록으로</Button>
        </aside>
      </div>
    </div>
  );
}
