"use client";

import { useState, type FormEvent } from "react";
import {
  ExternalLink,
  Loader2,
  Pencil,
  Save,
  StickyNote,
  Trash2,
} from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  COURSE_NOTE_MAX_LENGTH,
  tokenizeCourseNoteContent,
  type CourseNote,
} from "@/lib/course-operations/notes";

const NOTE_TIME_FORMATTER = new Intl.DateTimeFormat("ko-KR", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Seoul",
});

function formatNoteTime(value: string) {
  return NOTE_TIME_FORMATTER.format(new Date(value));
}

function NoteContent({ content }: { content: string }) {
  return (
    <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6">
      {tokenizeCourseNoteContent(content).map((token, index) =>
        token.type === "link" ? (
          <a
            key={`${token.href}-${index}`}
            href={token.href}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 break-all font-medium text-primary underline underline-offset-3 hover:opacity-80"
          >
            {token.value}
            <ExternalLink className="size-3.5" />
          </a>
        ) : (
          <span key={`text-${index}`}>{token.value}</span>
        ),
      )}
    </p>
  );
}

export function CourseNotesCard({
  courseId,
  currentUserId,
  currentUserEmail,
  initialNotes,
  loadError,
}: {
  courseId: string;
  currentUserId: string;
  currentUserEmail: string;
  initialNotes: CourseNote[];
  loadError?: string;
}) {
  const [notes, setNotes] = useState(initialNotes);
  const [content, setContent] = useState("");
  const [editingId, setEditingId] = useState("");
  const [editingContent, setEditingContent] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<CourseNote | null>(null);
  const [savingAction, setSavingAction] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  async function createNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingAction("create");
    setError("");
    try {
      const response = await fetch(`/api/course-operations/${courseId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      const body = (await response.json()) as {
        note?: CourseNote;
        message?: string;
      };
      if (!response.ok || !body.note) {
        throw new Error(body.message ?? "메모를 저장하지 못했습니다.");
      }
      setNotes((current) => [body.note as CourseNote, ...current]);
      setContent("");
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "메모를 저장하지 못했습니다.",
      );
    } finally {
      setSavingAction("");
    }
  }

  async function updateNote(noteId: string) {
    setSavingAction(noteId);
    setError("");
    try {
      const response = await fetch(
        `/api/course-operations/${courseId}/notes/${noteId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: editingContent }),
        },
      );
      const body = (await response.json()) as {
        note?: CourseNote;
        message?: string;
      };
      if (!response.ok || !body.note) {
        throw new Error(body.message ?? "메모를 수정하지 못했습니다.");
      }
      const savedNote = body.note;
      setNotes((current) =>
        current.map((note) => (note.id === noteId ? savedNote : note)),
      );
      setEditingId("");
      setEditingContent("");
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "메모를 수정하지 못했습니다.",
      );
    } finally {
      setSavingAction("");
    }
  }

  async function deleteNote() {
    if (!deleteTarget) return;
    setDeleting(true);
    setError("");
    try {
      const response = await fetch(
        `/api/course-operations/${courseId}/notes/${deleteTarget.id}`,
        { method: "DELETE" },
      );
      const body = (await response.json()) as {
        id?: string;
        message?: string;
      };
      if (!response.ok || body.id !== deleteTarget.id) {
        throw new Error(body.message ?? "메모를 삭제하지 못했습니다.");
      }
      setNotes((current) =>
        current.filter((note) => note.id !== deleteTarget.id),
      );
      if (editingId === deleteTarget.id) {
        setEditingId("");
        setEditingContent("");
      }
      setDeleteTarget(null);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "메모를 삭제하지 못했습니다.",
      );
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <StickyNote className="size-4" />
              강의 메모
              <Badge variant="secondary">{notes.length}건</Badge>
            </CardTitle>
            <CardDescription className="mt-1">
              강의 운영 내용을 기록합니다. 입력한 URL은 저장 후 클릭할 수 있습니다.
            </CardDescription>
          </div>
          <span className="text-xs text-muted-foreground">
            작성자 {currentUserEmail}
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {loadError ? (
          <Alert variant="destructive">
            <AlertDescription>{loadError}</AlertDescription>
          </Alert>
        ) : null}
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <form onSubmit={createNote} className="space-y-2">
          <Textarea
            aria-label="새 강의 메모"
            className="min-h-28"
            placeholder="강의 운영 메모 또는 URL을 입력하세요."
            maxLength={COURSE_NOTE_MAX_LENGTH}
            value={content}
            onChange={(event) => setContent(event.target.value)}
            disabled={Boolean(loadError)}
          />
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-muted-foreground">
              {Array.from(content).length.toLocaleString("ko-KR")} / 5,000자
            </span>
            <Button
              type="submit"
              disabled={
                Boolean(savingAction) || !content.trim() || Boolean(loadError)
              }
            >
              {savingAction === "create" ? (
                <Loader2 className="animate-spin" />
              ) : (
                <Save />
              )}
              메모 저장
            </Button>
          </div>
        </form>

        <div className="space-y-3 border-t pt-4">
          {notes.length === 0 ? (
            <div className="rounded-xl border border-dashed py-10 text-center text-sm text-muted-foreground">
              아직 작성된 강의 메모가 없습니다.
            </div>
          ) : (
            notes.map((note) => {
              const canManage = note.createdBy === currentUserId;
              const isEditing = editingId === note.id;
              const wasEdited = note.updatedAt !== note.createdAt;
              return (
                <article key={note.id} className="rounded-xl border p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">
                        {note.authorEmail}
                      </span>
                      <span className="mx-1.5">·</span>
                      <time dateTime={note.createdAt}>
                        {formatNoteTime(note.createdAt)}
                      </time>
                      {wasEdited ? (
                        <span> · 수정 {formatNoteTime(note.updatedAt)}</span>
                      ) : null}
                    </div>
                    {canManage && !isEditing ? (
                      <div className="flex gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setEditingId(note.id);
                            setEditingContent(note.content);
                            setError("");
                          }}
                          disabled={Boolean(savingAction)}
                        >
                          <Pencil />수정
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => setDeleteTarget(note)}
                          disabled={Boolean(savingAction)}
                        >
                          <Trash2 />삭제
                        </Button>
                      </div>
                    ) : null}
                  </div>

                  {isEditing ? (
                    <div className="mt-3 space-y-2">
                      <Textarea
                        aria-label="강의 메모 수정"
                        className="min-h-28"
                        maxLength={COURSE_NOTE_MAX_LENGTH}
                        value={editingContent}
                        onChange={(event) =>
                          setEditingContent(event.target.value)
                        }
                      />
                      <div className="flex justify-end gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => {
                            setEditingId("");
                            setEditingContent("");
                          }}
                          disabled={savingAction === note.id}
                        >
                          취소
                        </Button>
                        <Button
                          type="button"
                          onClick={() => updateNote(note.id)}
                          disabled={
                            Boolean(savingAction) || !editingContent.trim()
                          }
                        >
                          {savingAction === note.id ? (
                            <Loader2 className="animate-spin" />
                          ) : (
                            <Save />
                          )}
                          수정 저장
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <NoteContent content={note.content} />
                  )}
                </article>
              );
            })
          )}
        </div>
      </CardContent>

      <AlertDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open && !deleting) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>메모를 삭제할까요?</AlertDialogTitle>
            <AlertDialogDescription>
              삭제한 강의 메모는 복구할 수 없습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>취소</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={(event) => {
                event.preventDefault();
                void deleteNote();
              }}
              disabled={deleting}
            >
              {deleting ? <Loader2 className="animate-spin" /> : <Trash2 />}
              삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
