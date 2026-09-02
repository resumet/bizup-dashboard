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
  initialBooks,
  loadError,
  canDelete,
}: {
  initialBooks: Book[];
  loadError?: string;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergeName, setMergeName] = useState("");
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
    }
  }

  function toggleBook(bookId: string, checked: boolean) {
    setSelectedBookIds((current) => {
      const next = new Set(current);
      if (checked) next.add(bookId);
      else next.delete(bookId);
      return next;
    });
  }

  function toggleAllBooks(checked: boolean) {
    setSelectedBookIds(
      checked ? new Set(initialBooks.map((book) => book.id)) : new Set(),
    );
  }

  async function mergeBooks() {
    if (selectedBooks.length < 2 || !mergeName.trim()) return;
    setMerging(true);
    setMergeError("");
    try {
      const response = await fetch("/api/address-books/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: mergeName.trim(),
          sourceBookIds: selectedBooks.map((book) => book.id),
        }),
      });
      const body = (await response.json()) as { id?: string; message?: string };
      if (!response.ok || !body.id) {
        throw new Error(body.message || "주소록 병합에 실패했습니다.");
      }
      setMergeOpen(false);
      router.push(`/services/address-books/${body.id}`);
    } catch (caught) {
      setMergeError(
        caught instanceof Error ? caught.message : "주소록 병합에 실패했습니다.",
      );
    } finally {
      setMerging(false);
    }
  }

  async function deleteBook() {
    if (!canDelete || !deleteTarget) return;
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

  const allBooksSelected =
    initialBooks.length > 0 && selectedBookIds.size === initialBooks.length;
  const someBooksSelected = selectedBookIds.size > 0 && !allBooksSelected;

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-primary">ADDRESS BOOKS</p>
          <h1 className="mt-2 text-3xl font-semibold">주소록 매니저</h1>
          <p className="mt-2 text-muted-foreground">
            Excel 또는 CSV로 주소록을 만들고 업데이트합니다.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Dialog open={mergeOpen} onOpenChange={changeMergeDialog}>
            <DialogTrigger asChild>
              <Button variant="outline" disabled={initialBooks.length < 2}>
                <GitMerge />
                주소록 병합
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>새 주소록으로 병합</DialogTitle>
                <DialogDescription>
                  2개 이상의 주소록을 선택하세요. 원본 주소록은 유지되며, 같은
                  전화번호는 새 주소록에 한 번만 저장됩니다.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-2">
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
                <div className="overflow-hidden rounded-lg border">
                  <div className="flex items-center gap-3 border-b bg-muted/40 px-4 py-3">
                    <Checkbox
                      id="select-all-address-books"
                      checked={
                        allBooksSelected
                          ? true
                          : someBooksSelected
                            ? "indeterminate"
                            : false
                      }
                      onCheckedChange={(checked) =>
                        toggleAllBooks(checked === true)
                      }
                      disabled={merging}
                      aria-label="주소록 전체 선택"
                    />
                    <Label
                      htmlFor="select-all-address-books"
                      className="flex-1 cursor-pointer font-medium"
                    >
                      전체 선택
                    </Label>
                    <span className="text-sm text-muted-foreground">
                      {initialBooks.length.toLocaleString("ko-KR")}개
                    </span>
                  </div>
                  <div className="max-h-[42vh] overflow-y-auto">
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
                            disabled={merging}
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
                <p className="text-sm text-muted-foreground" aria-live="polite">
                  {selectedBooks.length.toLocaleString("ko-KR")}개 주소록 선택 · 병합
                  전 {selectedContactCount.toLocaleString("ko-KR")}명
                </p>
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
                  disabled={merging || selectedBooks.length < 2 || !mergeName.trim()}
                >
                  {merging ? <Loader2 className="animate-spin" /> : <GitMerge />}
                  {merging ? "병합 중..." : "병합하기"}
                </Button>
              </DialogFooter>
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
                        <Button variant="outline" size="sm" asChild>
                          <Link href={`/services/address-books/${book.id}`}>
                            관리
                          </Link>
                        </Button>
                        <Button
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
                        </Button>
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
