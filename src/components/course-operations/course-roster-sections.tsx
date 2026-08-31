"use client";

import Link from "next/link";
import { useDeferredValue, useState } from "react";
import {
  BookUser,
  ExternalLink,
  Search,
  Users,
} from "lucide-react";

import { RosterAnalysisCards } from "@/components/jobs/roster-analysis-cards";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import type {
  AddressBookSummary,
  CourseRosterAnalysis,
  CourseStudentPreview,
  FreeStudentPreview,
  LinkableRosterJob,
} from "@/lib/course-operations/types";

const DATE_FORMATTER = new Intl.DateTimeFormat("ko-KR", {
  dateStyle: "medium",
  timeZone: "Asia/Seoul",
});

function formatPhone(value: string) {
  const digits = value.replace(/\D/gu, "");
  return digits.length === 11
    ? `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`
    : value || "-";
}

export function CourseRosterSections({
  rosterJobs,
  selectedRosterIds,
  onRosterIdsChange,
  addressBooks,
  paidStudentPreview,
  paidRosterAnalysis,
  freeStudentPreview,
  freeAddressBookId,
  onFreeAddressBookChange,
}: {
  rosterJobs: LinkableRosterJob[];
  selectedRosterIds: string[];
  onRosterIdsChange: (ids: string[]) => void;
  addressBooks: AddressBookSummary[];
  paidStudentPreview: CourseStudentPreview[];
  paidRosterAnalysis?: CourseRosterAnalysis;
  freeStudentPreview: FreeStudentPreview[];
  freeAddressBookId: string;
  onFreeAddressBookChange: (id: string) => void;
}) {
  const [rosterDialogOpen, setRosterDialogOpen] = useState(false);
  const [rosterQuery, setRosterQuery] = useState("");
  const deferredRosterQuery = useDeferredValue(rosterQuery.trim().toLocaleLowerCase("ko-KR"));
  const [pendingRosterId, setPendingRosterId] = useState("");
  const [addressDialogOpen, setAddressDialogOpen] = useState(false);
  const [addressQuery, setAddressQuery] = useState("");
  const deferredAddressQuery = useDeferredValue(addressQuery.trim().toLocaleLowerCase("ko-KR"));
  const [pendingAddressBookId, setPendingAddressBookId] = useState("");
  const [freeRosterOpen, setFreeRosterOpen] = useState(false);

  const selectedRoster =
    rosterJobs.find((job) => job.id === selectedRosterIds[0]) ?? null;
  const visiblePaidStudentPreview = paidStudentPreview.filter((student) =>
    selectedRosterIds.includes(student.sourceJobId),
  );
  const paidStudentPreviewRows = visiblePaidStudentPreview.slice(0, 5);
  const visiblePaidRosterAnalysis =
    paidRosterAnalysis?.sourceJobId === selectedRoster?.id
      ? paidRosterAnalysis
      : null;
  const filteredRosterJobs = deferredRosterQuery
    ? rosterJobs.filter((job) =>
        `${job.name} ${job.default_course_name ?? ""}`
          .toLocaleLowerCase("ko-KR")
          .includes(deferredRosterQuery),
      )
    : rosterJobs;
  const selectedAddressBook =
    addressBooks.find((book) => book.id === freeAddressBookId) ?? null;
  const visibleFreeStudentPreview = freeStudentPreview.filter(
    (student) => student.sourceAddressBookId === freeAddressBookId,
  );
  const freeStudentPreviewRows = visibleFreeStudentPreview.slice(0, 5);
  const filteredAddressBooks = deferredAddressQuery
    ? addressBooks.filter((book) =>
        book.name.toLocaleLowerCase("ko-KR").includes(deferredAddressQuery),
      )
    : addressBooks;

  function openRosterDialog() {
    setPendingRosterId(selectedRosterIds[0] ?? "");
    setRosterQuery("");
    setRosterDialogOpen(true);
  }

  function openAddressDialog() {
    setPendingAddressBookId(freeAddressBookId);
    setAddressQuery("");
    setAddressDialogOpen(true);
  }

  return (
    <div className="space-y-6 border-t pt-6">
      {visiblePaidRosterAnalysis ? (
        <RosterAnalysisCards
          sourceItems={visiblePaidRosterAnalysis.sourceItems}
          optionItems={visiblePaidRosterAnalysis.optionItems}
          totalCount={visiblePaidRosterAnalysis.totalCount}
        />
      ) : null}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2.5">
            <CardTitle className="mr-1 text-2xl">유료강의 수강생 명단</CardTitle>
            <Badge variant="secondary">
              {selectedRoster?.valid_count.toLocaleString() ?? 0}명
            </Badge>
            {visiblePaidRosterAnalysis ? (
              <Badge variant="outline">
                카카오톡 입장{" "}
                {visiblePaidRosterAnalysis.groupChatJoinedCount.toLocaleString()}명
              </Badge>
            ) : null}
            {selectedRoster ? (
              <Button variant="outline" size="sm" asChild>
                <Link href={`/services/course-roster/${selectedRoster.id}`}>
                  크게 보기<ExternalLink />
                </Link>
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={openRosterDialog}
            >
              <Users />명단 교체
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {!selectedRoster ? (
            <div className="flex min-h-40 flex-col items-center justify-center rounded-xl border border-dashed text-center">
              <p className="font-medium">연결된 수강생 명단이 없습니다</p>
              <p className="mt-1 text-sm text-muted-foreground">
                명단 교체를 눌러 수강생 명단 분석 작업을 연결해 주세요.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {visiblePaidStudentPreview.length === 0 ? (
                <div className="rounded-xl border border-dashed py-10 text-center text-sm text-muted-foreground">
                  변경된 명단은 저장 후 수강생 목록에 반영됩니다.
                </div>
              ) : (
                <div className="overflow-hidden rounded-xl border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>이름</TableHead>
                        <TableHead>전화번호</TableHead>
                        <TableHead>이메일</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paidStudentPreviewRows.map((student) => (
                        <TableRow key={`${student.sourceJobId}-${student.id}`}>
                          <TableCell className="font-medium">{student.name || "-"}</TableCell>
                          <TableCell className="font-mono">{formatPhone(student.phone)}</TableCell>
                          <TableCell className="text-muted-foreground">{student.email || "-"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
              {selectedRoster.valid_count > 5 ? (
                <p className="text-xs text-muted-foreground">
                  화면에는 앞 5명까지 표시합니다.
                </p>
              ) : null}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={rosterDialogOpen} onOpenChange={setRosterDialogOpen}>
        <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>수강생 명단 연결</DialogTitle>
            <DialogDescription>
              연결할 명단 하나를 선택하세요. 다른 강의에 연결된 명단은 표시되지 않습니다.
            </DialogDescription>
          </DialogHeader>
          <div className="relative">
            <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-10 pl-9"
              placeholder="명단 작업명·강의명 검색"
              aria-label="수강생 명단 검색"
              value={rosterQuery}
              onChange={(event) => setRosterQuery(event.target.value)}
            />
          </div>
          <div className="max-h-[48vh] space-y-2 overflow-y-auto pr-1">
            {filteredRosterJobs.length === 0 ? (
              <div className="rounded-xl border border-dashed py-12 text-center text-sm text-muted-foreground">
                연결할 수 있는 수강생 명단이 없습니다.
              </div>
            ) : (
              filteredRosterJobs.map((job) => {
                const checked = pendingRosterId === job.id;
                return (
                  <div key={job.id} className="flex items-center gap-3 rounded-xl border p-4">
                    <Checkbox
                      id={`replace-roster-${job.id}`}
                      className="size-5 rounded-full"
                      checked={checked}
                      onCheckedChange={(value) =>
                        setPendingRosterId(value === true ? job.id : "")
                      }
                    />
                    <Label htmlFor={`replace-roster-${job.id}`} className="min-w-0 flex-1 cursor-pointer">
                      <span className="block truncate font-medium">{job.name}</span>
                      <span className="mt-1 block text-xs text-muted-foreground">
                        {job.default_course_name || "강의명 미지정"} · {job.valid_count.toLocaleString()}명
                      </span>
                    </Label>
                  </div>
                );
              })
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setRosterDialogOpen(false)}>
              취소
            </Button>
            <Button
              type="button"
              onClick={() => {
                onRosterIdsChange(pendingRosterId ? [pendingRosterId] : []);
                setRosterDialogOpen(false);
              }}
            >
              선택 적용
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2.5">
            <CardTitle className="mr-1 text-2xl">무료강의 수강생 명단</CardTitle>
            <Badge variant="secondary">
              {selectedAddressBook?.contact_count.toLocaleString() ?? 0}명
            </Badge>
            {selectedAddressBook ? (
              <Button variant="outline" size="sm" asChild>
                <Link href={`/services/address-books/${selectedAddressBook.id}`}>
                  크게 보기<ExternalLink />
                </Link>
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={openAddressDialog}
            >
              <BookUser />{selectedAddressBook ? "주소록 교체" : "주소록 연결"}
            </Button>
            {selectedAddressBook ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setFreeRosterOpen((open) => !open)}
              >
                {freeRosterOpen ? "접기" : "펼치기"}
              </Button>
            ) : null}
          </div>
        </CardHeader>
        {!selectedAddressBook || freeRosterOpen ? (
        <CardContent>
          {selectedAddressBook ? (
            <div className="space-y-4">
              <div className="rounded-xl border p-5">
                <div>
                  <p className="font-semibold">{selectedAddressBook.name}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    연락처 {selectedAddressBook.contact_count.toLocaleString()}명 · 최근 수정 {DATE_FORMATTER.format(new Date(selectedAddressBook.updated_at))}
                  </p>
                </div>
              </div>
              {visibleFreeStudentPreview.length ? (
                <div className="overflow-hidden rounded-xl border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>이름</TableHead>
                        <TableHead>전화번호</TableHead>
                        <TableHead>이메일</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {freeStudentPreviewRows.map((student) => (
                        <TableRow key={student.id}>
                          <TableCell className="font-medium">{student.name || "-"}</TableCell>
                          <TableCell className="font-mono">{formatPhone(student.phone)}</TableCell>
                          <TableCell className="text-muted-foreground">{student.email || "-"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="rounded-xl border border-dashed py-10 text-center text-sm text-muted-foreground">
                  변경된 주소록은 저장 후 명단에 반영됩니다.
                </div>
              )}
              {selectedAddressBook.contact_count > 5 ? (
                <p className="text-xs text-muted-foreground">
                  화면에는 앞 5명까지 표시합니다.
                </p>
              ) : null}
            </div>
          ) : (
            <div className="flex min-h-40 flex-col items-center justify-center rounded-xl border border-dashed text-center">
              <p className="font-medium">무료강의 수강생 주소록이 연결되지 않았습니다</p>
              <p className="mt-1 text-sm text-muted-foreground">
                주소록 연결을 눌러 기존 주소록을 선택해 주세요.
              </p>
            </div>
          )}
        </CardContent>
        ) : null}
      </Card>

      <Dialog open={addressDialogOpen} onOpenChange={setAddressDialogOpen}>
        <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>무료강의 수강생 주소록 연결</DialogTitle>
            <DialogDescription>
              주소록 매니저에 저장된 주소록 중 하나를 선택하세요.
            </DialogDescription>
          </DialogHeader>
          <div className="relative">
            <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-10 pl-9"
              placeholder="주소록 이름 검색"
              aria-label="무료강의 주소록 검색"
              value={addressQuery}
              onChange={(event) => setAddressQuery(event.target.value)}
            />
          </div>
          <div className="max-h-[45vh] space-y-2 overflow-y-auto pr-1">
            {filteredAddressBooks.length === 0 ? (
              <div className="rounded-xl border border-dashed py-12 text-center text-sm text-muted-foreground">
                선택할 주소록이 없습니다.
                <Button variant="link" asChild className="mt-2 w-full">
                  <Link href="/services/address-books">주소록 매니저 열기</Link>
                </Button>
              </div>
            ) : (
              filteredAddressBooks.map((book) => {
                const checked = pendingAddressBookId === book.id;
                return (
                  <div key={book.id} className="flex items-center gap-3 rounded-xl border p-4">
                    <Checkbox
                      id={`free-address-book-${book.id}`}
                      className="size-5 rounded-full"
                      checked={checked}
                      onCheckedChange={(value) =>
                        setPendingAddressBookId(value === true ? book.id : "")
                      }
                    />
                    <Label htmlFor={`free-address-book-${book.id}`} className="min-w-0 flex-1 cursor-pointer">
                      <span className="block truncate font-medium">{book.name}</span>
                      <span className="mt-1 block text-xs text-muted-foreground">
                        연락처 {book.contact_count.toLocaleString()}명
                      </span>
                    </Label>
                  </div>
                );
              })
            )}
          </div>
          <DialogFooter>
            {pendingAddressBookId ? (
              <Button type="button" variant="ghost" onClick={() => setPendingAddressBookId("")}>
                연결 해제
              </Button>
            ) : null}
            <Button type="button" variant="outline" onClick={() => setAddressDialogOpen(false)}>
              취소
            </Button>
            <Button
              type="button"
              onClick={() => {
                onFreeAddressBookChange(pendingAddressBookId);
                setAddressDialogOpen(false);
              }}
            >
              선택 적용
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
