"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  FileSpreadsheet,
  GitMerge,
  Loader2,
  Plus,
  Trash2,
  Users,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ExcludedMergeContact } from "@/lib/address-books/merge";
import { isProtectedAddressBook, pinProtectedAddressBook } from "@/lib/address-books/protected-book";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type Book = {
  id: string;
  name: string;
  contact_count: number;
  updated_at: string;
};

export function AddressBookManager({
  initialBooks: unsortedBooks,
  exclusionRosters = [],
  exclusionLoadError,
  loadError,
  canDelete,
}: {
  initialBooks: Book[];
  exclusionRosters?: { id: string; name: string; is_order_roster: boolean }[];
  exclusionLoadError?: string;
  loadError?: string;
  canDelete: boolean;
}) {
  const router = useRouter();
  const initialBooks = useMemo(() => pinProtectedAddressBook(unsortedBooks), [unsortedBooks]);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergeName, setMergeName] = useState("");
  const [callSalesOnly, setCallSalesOnly] = useState(false);
  const [mergeMode, setMergeMode] = useState<"union" | "subtract">("union");
  const [exclusionKey, setExclusionKey] = useState("");
  const [mergeResult, setMergeResult] = useState<{
    id: string; contactCount: number; duplicateCount: number;
    excludedCount: number; excludedContacts: ExcludedMergeContact[];
    matchedExclusionCount: number;
  } | null>(null);
  const [selectedBookIds, setSelectedBookIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [merging, setMerging] = useState(false);
  const [mergeError, setMergeError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Book | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const selectedBooks = useMemo(
    () => initialBooks.filter((book) => selectedBookIds.has(book.id)),
    [initialBooks, selectedBookIds],
  );
  const selectedContactCount = selectedBooks.reduce(
    (sum, book) => sum + book.contact_count,
    0,
  );

  async function createBook() {
    if (!file) return;
    setSaving(true);
    setError("");
    try {
      const form = new FormData();
      form.set("name", name);
      form.set("file", file);
      const response = await fetch("/api/address-books", {
        method: "POST",
        body: form,
      });
      const body = (await response.json()) as { id?: string; message?: string };
      if (!response.ok || !body.id) {
        throw new Error(body.message || "주소록 생성에 실패했습니다.");
      }
      setOpen(false);
      router.push(`/services/address-books/${body.id}`);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "주소록 생성에 실패했습니다.",
      );
    } finally {
      setSaving(false);
    }
  }

  function changeMergeDialog(openState: boolean) {
    if (merging) return;
    setMergeOpen(openState);
    if (!openState) {
      setMergeName("");
      setSelectedBookIds(new Set());
      setMergeError("");
      setCallSalesOnly(false);
      setMergeMode("union");
      setExclusionKey("");
    }
  }

  function toggleBook(bookId: string, checked: boolean) {
    setSelectedBookIds((current) => {
      const next = new Set(current);
      if (checked && current.size < 3 && exclusionKey !== `address-book:${bookId}`) next.add(bookId);
      else next.delete(bookId);
      return next;
    });
  }

  async function mergeBooks() {
    if (!canMerge) return;
    setMerging(true);
    setMergeError("");
    try {
      const response = await fetch("/api/address-books/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: mergeName.trim(),
          sourceBookIds: selectedBooks.map((book) => book.id),
          callSalesOnly,
          mode: mergeMode,
          ...(mergeMode === "subtract" ? { exclusion: {
            kind: exclusionKey.split(":")[0], id: exclusionKey.split(":")[1],
          } } : {}),
        }),
      });
      const body = (await response.json()) as NonNullable<typeof mergeResult> & { message?: string };
      if (!response.ok || !body.id) {
        throw new Error(body.message || "주소록 병합에 실패했습니다.");
      }
      setMergeOpen(false);
      setMergeResult(body);
      router.refresh();
    } catch (caught) {
      setMergeError(
        caught instanceof Error ? caught.message : "주소록 병합에 실패했습니다.",
      );
    } finally {
      setMerging(false);
    }
  }

  async function deleteBook() {
    if (!canDelete || !deleteTarget || isProtectedAddressBook(deleteTarget)) return;
    setDeleting(true);
    setDeleteError("");
    try {
      const response = await fetch(`/api/address-books/${deleteTarget.id}`, {
        method: "DELETE",
      });
      const body = (await response.json()) as { message?: string };
      if (!response.ok) {
        throw new Error(body.message || "주소록 삭제에 실패했습니다.");
      }
      setDeleteTarget(null);
      router.refresh();
    } catch (caught) {
      setDeleteError(
        caught instanceof Error ? caught.message : "주소록 삭제에 실패했습니다.",
      );
    } finally {
      setDeleting(false);
    }
  }

  const canMerge = selectedBooks.length >= (mergeMode === "subtract" ? 1 : 2)
    && selectedBooks.length <= 3 && Boolean(mergeName.trim())
    && (mergeMode === "union" || Boolean(exclusionKey));

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">주소록 매니저</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Dialog open={mergeOpen} onOpenChange={changeMergeDialog}>
            <DialogTrigger asChild>
              <Button variant="outline" disabled={initialBooks.length === 0}>
                <GitMerge />
                주소록 병합
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl" aria-describedby={undefined}>
              <DialogHeader>
                <DialogTitle>새 주소록으로 병합</DialogTitle>
              </DialogHeader>
              <div className="grid gap-4 py-2">
                <fieldset className="grid gap-2" disabled={merging}>
                  <legend className="mb-2 text-sm font-medium">만들기 방식</legend>
                  <div className="flex flex-wrap gap-x-6 gap-y-3">
                    {([
                      ["union", "목록 합치기"], ["subtract", "유료 수강생 제외하기"],
                    ] as const).map(([mode, label]) => <label key={mode} className="flex cursor-pointer items-center gap-2 text-sm">
                      <input type="radio" name="merge-mode" value={mode} checked={mergeMode === mode}
                        onChange={() => { setMergeMode(mode); setExclusionKey(""); setMergeError(""); }} />
                      {label}
                    </label>)}
                  </div>
                </fieldset>
                <div className="grid gap-2">
                  <Label htmlFor="merged-book-name">새 주소록 이름</Label>
                  <Input
                    id="merged-book-name"
                    value={mergeName}
                    maxLength={200}
                    onChange={(event) => setMergeName(event.target.value)}
                    placeholder="예: 8월 전체 수강생"
                    disabled={merging}
                  />
                </div>
                <div className="flex items-start gap-3 rounded-lg border bg-muted/30 p-4">
                  <Checkbox id="merge-call-sales" checked={callSalesOnly} onCheckedChange={(checked) => setCallSalesOnly(checked === true)} disabled={merging} />
                  <div>
                    <Label htmlFor="merge-call-sales" className="cursor-pointer font-medium">콜세일즈용</Label>
                    <p className="mt-1 text-sm text-muted-foreground">010으로 시작하지 않는 번호는 새 주소록에서 제외합니다. 생성 후 제외 건수와 목록을 한 번 보여드립니다.</p>
                  </div>
                </div>
                <div className="overflow-hidden rounded-lg border">
                  <div className="flex items-center gap-3 border-b bg-muted/40 px-4 py-3">
                    <span className="flex-1 text-sm font-medium">합칠 주소록 (최대 3개)</span>
                    <span className="text-sm text-muted-foreground">
                      {selectedBooks.length} / 3개 선택
                    </span>
                  </div>
                  <div className="max-h-[25vh] overflow-y-auto">
                    {initialBooks.map((book) => {
                      const checkboxId = `merge-book-${book.id}`;
                      return (
                        <div
                          key={book.id}
                          className="flex items-center gap-3 border-b px-4 py-3 last:border-b-0 hover:bg-muted/30"
                        >
                          <Checkbox
                            id={checkboxId}
                            checked={selectedBookIds.has(book.id)}
                            onCheckedChange={(checked) =>
                              toggleBook(book.id, checked === true)
                            }
                            disabled={merging || exclusionKey === `address-book:${book.id}` || (!selectedBookIds.has(book.id) && selectedBookIds.size >= 3)}
                            aria-label={`${book.name} 선택`}
                          />
                          <Label
                            htmlFor={checkboxId}
                            className="min-w-0 flex-1 cursor-pointer truncate font-medium"
                          >
                            {book.name}
                          </Label>
                          <span className="text-sm text-muted-foreground">
                            {book.contact_count.toLocaleString("ko-KR")}명
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
                {mergeMode === "subtract" && <div className="grid gap-2">
                  <Label htmlFor="merge-exclusion">제외할 유료 수강생 명단</Label>
                  <select id="merge-exclusion" value={exclusionKey} disabled={merging}
                    onChange={(event) => setExclusionKey(event.target.value)}
                    className="h-10 w-full min-w-0 rounded-md border bg-background px-3 text-sm">
                    <option value="">제외할 명단을 선택하세요</option>
                    <optgroup label="유료 수강생 명단">
                      {exclusionRosters.filter(roster => roster.is_order_roster).map(roster =>
                        <option key={roster.id} value={`roster:${roster.id}`}>{roster.name}</option>)}
                    </optgroup>
                    <optgroup label="수강생 매니저 명단">
                      {exclusionRosters.filter(roster => !roster.is_order_roster).map(roster =>
                        <option key={roster.id} value={`roster:${roster.id}`}>{roster.name}</option>)}
                    </optgroup>
                    <optgroup label="주소록">
                      {initialBooks.filter(book => !selectedBookIds.has(book.id)).map(book =>
                        <option key={book.id} value={`address-book:${book.id}`}>{book.name}</option>)}
                    </optgroup>
                  </select>
                  <p className="text-xs text-muted-foreground">합칠 주소록 1~3개와 제외할 명단 1개를 선택하세요. 전화번호가 같은 사람을 제외합니다. 수강생 명단은 저장된 최신 명단을 사용하며 환불자는 제외 대상에 포함하지 않습니다.</p>
                  {exclusionLoadError && <p role="alert" className="text-sm text-destructive">{exclusionLoadError}</p>}
                </div>}
                <p className="text-sm text-muted-foreground" aria-live="polite">
                  {selectedBooks.length.toLocaleString("ko-KR")}개 주소록 선택 · 병합
                  전 {selectedContactCount.toLocaleString("ko-KR")}명
                </p>
                <p className="text-xs text-muted-foreground">{mergeMode === "union" ? "합칠 주소록을 2~3개 선택하세요. " : ""}같은 전화번호는 한 번만 저장합니다. 원본 명단은 유지하고 새 주소록을 만듭니다.</p>
                {mergeError && (
                  <Alert variant="destructive">
                    <AlertTitle>병합 실패</AlertTitle>
                    <AlertDescription>{mergeError}</AlertDescription>
                  </Alert>
                )}
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => changeMergeDialog(false)}
                  disabled={merging}
                >
                  취소
                </Button>
                <Button
                  onClick={mergeBooks}
                  disabled={merging || !canMerge}
                >
                  {merging ? <Loader2 className="animate-spin" /> : <GitMerge />}
                  {merging ? "생성 중..." : "새 주소록 만들기"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={mergeResult !== null} onOpenChange={(nextOpen) => {
            if (!nextOpen) { setMergeResult(null); changeMergeDialog(false); }
          }}>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl" aria-describedby={undefined}>
              <DialogHeader>
                <DialogTitle>주소록 생성 완료</DialogTitle>
              </DialogHeader>
              {mergeResult && <>
                <p className="text-sm" role="status">생성 {mergeResult.contactCount.toLocaleString("ko-KR")}명 · 중복 정리 {mergeResult.duplicateCount.toLocaleString("ko-KR")}건{mergeMode === "subtract" && ` · 선택 명단과 일치하여 제외 ${mergeResult.matchedExclusionCount.toLocaleString("ko-KR")}명`}{callSalesOnly && ` · 010 외 번호 제외 ${mergeResult.excludedCount.toLocaleString("ko-KR")}건`}</p>
                {callSalesOnly && <div>
                  <h3 className="mb-2 font-semibold">제외한 항목 목록 ({mergeResult.excludedCount.toLocaleString("ko-KR")}건)</h3>
                  <p className="mb-3 text-xs text-muted-foreground">원본 주소록의 항목 수 기준입니다. 같은 번호가 여러 주소록에 있으면 각각 표시합니다. 제외 목록은 이 창을 닫으면 사라집니다.</p>
                  {mergeResult.excludedContacts.length > 0 ? <div className="max-h-[45vh] overflow-auto rounded-lg border">
                    <Table>
                      <TableHeader><TableRow><TableHead>원본 주소록</TableHead><TableHead>이름</TableHead><TableHead>전화번호</TableHead><TableHead>이메일</TableHead></TableRow></TableHeader>
                      <TableBody>{mergeResult.excludedContacts.map((contact, index) => <TableRow key={`${contact.sourceBookId}-${index}`}>
                        <TableCell>{contact.sourceBookName}</TableCell><TableCell>{contact.name || "-"}</TableCell><TableCell className="font-mono">{contact.normalized_phone || "번호 없음"}</TableCell><TableCell>{contact.email || "-"}</TableCell>
                      </TableRow>)}</TableBody>
                    </Table>
                  </div> : <p className="rounded-lg border p-6 text-center text-sm text-muted-foreground">010 외 번호로 제외한 항목이 없습니다.</p>}
                </div>}
                {mergeResult.contactCount === 0 && <p className="text-sm text-muted-foreground">모든 연락처가 제외되어 빈 주소록을 생성했습니다.</p>}
                <DialogFooter>
                  <Button variant="outline" onClick={() => { setMergeResult(null); changeMergeDialog(false); }}>닫기</Button>
                  <Button onClick={() => {
                    const id = mergeResult.id;
                    setMergeResult(null); changeMergeDialog(false);
                    router.push(`/services/address-books/${id}`);
                  }}>생성한 주소록 보기</Button>
                </DialogFooter>
              </>}
            </DialogContent>
          </Dialog>

          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus />
                새 주소록
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>주소록 만들기</DialogTitle>
                <DialogDescription>
                  이름·전화번호·이메일 컬럼이 있는 CSV 또는 XLSX를 선택하세요.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-2">
                <div className="grid gap-2">
                  <Label htmlFor="book-name">주소록 이름</Label>
                  <Input
                    id="book-name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="book-file">Excel/CSV 파일</Label>
                  <Input
                    id="book-file"
                    type="file"
                    accept=".csv,.xlsx"
                    onChange={(event) =>
                      setFile(event.target.files?.[0] ?? null)
                    }
                  />
                </div>
                {error && (
                  <Alert variant="destructive">
                    <AlertTitle>생성 실패</AlertTitle>
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>
                  취소
                </Button>
                <Button
                  onClick={createBook}
                  disabled={saving || !name.trim() || !file}
                >
                  {saving ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <FileSpreadsheet />
                  )}
                  주소록 생성
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {loadError ? (
        <Alert variant="destructive" className="mt-6">
          <AlertTitle>주소록 조회 실패</AlertTitle>
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
      ) : (
        <Card className="mt-7 overflow-hidden">
          <CardHeader>
            <CardTitle className="text-base">
              주소록 {initialBooks.length.toLocaleString("ko-KR")}개
            </CardTitle>
          </CardHeader>
          {initialBooks.length === 0 ? (
            <CardContent>
              <div className="py-16 text-center">
                <Users className="mx-auto size-8 text-muted-foreground" />
                <p className="mt-3 text-sm text-muted-foreground">
                  아직 주소록이 없습니다.
                </p>
              </div>
            </CardContent>
          ) : (
            <>
              <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>주소록 이름</TableHead>
                  <TableHead className="text-right">연락처</TableHead>
                  <TableHead>최근 업데이트</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {initialBooks.map((book) => (
                  <TableRow key={book.id}>
                    <TableCell className="font-medium">
                      <Link
                        href={`/services/address-books/${book.id}`}
                        className="hover:underline"
                      >
                        {book.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-right">
                      {book.contact_count.toLocaleString("ko-KR")}명
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(book.updated_at).toLocaleString("ko-KR")}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        {!isProtectedAddressBook(book) && <Button
                          variant="outline"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          disabled={!canDelete}
                          onClick={() => {
                            setDeleteError("");
                            setDeleteTarget(book);
                          }}
                        >
                          <Trash2 />
                          삭제
                        </Button>}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              </Table>
            </>
          )}
        </Card>
      )}

      <AlertDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(openState) => {
          if (!openState && !deleting) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>주소록을 삭제할까요?</AlertDialogTitle>
            <AlertDialogDescription>
              &apos;{deleteTarget?.name}&apos;의 연락처와 발송 이력이 함께
              삭제됩니다. 강의에 연결된 주소록이라면 해당 연결도 해제되며 이
              작업은 되돌릴 수 없습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteError ? (
            <Alert variant="destructive">
              <AlertTitle>주소록을 삭제할 수 없습니다</AlertTitle>
              <AlertDescription>{deleteError}</AlertDescription>
            </Alert>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>취소</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={(event) => {
                event.preventDefault();
                void deleteBook();
              }}
              disabled={deleting || !canDelete}
            >
              {deleting ? <Loader2 className="animate-spin" /> : <Trash2 />}
              {deleting ? "삭제 중..." : "삭제"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
