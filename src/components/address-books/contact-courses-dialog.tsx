"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { ContactCourse } from "@/lib/address-books/contact-courses";

export function ContactCoursesDialog({ bookId, contact, onClose }: {
  bookId: string; contact: { id: string; name: string | null }; onClose: () => void;
}) {
  const [courses, setCourses] = useState<ContactCourse[] | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/address-books/${bookId}/contacts/${contact.id}/courses`, { cache: "no-store", signal: controller.signal })
      .then(async response => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.message ?? "수강 강의를 불러오지 못했습니다.");
        if (!controller.signal.aborted) setCourses(data.courses);
      })
      .catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "수강 강의를 불러오지 못했습니다."); });
    return () => controller.abort();
  }, [bookId, contact.id, attempt]);
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent className="flex max-h-[85dvh] flex-col sm:max-w-2xl" aria-describedby={undefined}>
      <DialogHeader><DialogTitle>{contact.name || "이름 없음"}님의 수강 강의</DialogTitle></DialogHeader>
      <div className="min-h-0 space-y-3 overflow-y-auto">
        {error ? <div role="alert" className="space-y-3"><p className="text-sm text-destructive">{error}</p><Button variant="outline" onClick={() => { setError(""); setCourses(null); setAttempt(value => value + 1); }}>다시 시도</Button></div>
          : courses === null ? <p role="status" className="py-6 text-center text-sm">수강 강의를 불러오는 중입니다.</p>
          : !courses.length ? <p role="status" className="py-6 text-center text-sm text-muted-foreground">저장된 유료수강생 명단에 포함된 강의가 없습니다.</p>
          : <ul className="space-y-3">{courses.map(course => <li key={course.id} className="rounded-lg border p-4">
            <Link className="break-words font-medium underline underline-offset-4" href={`/services/course-operations/students-settlements/${course.id}?tab=paid-students`}>{course.name}</Link>
            <dl className="mt-3 grid grid-cols-[3rem_minmax(0,1fr)] gap-x-3 gap-y-2 text-sm">
              <dt className="text-muted-foreground">기수</dt><dd className="break-words">{course.cohort || "미등록"}</dd>
              <dt className="text-muted-foreground">강사명</dt><dd className="break-words">{course.instructorName || "미등록"}</dd>
            </dl>
          </li>)}</ul>}
        <p className="text-xs leading-relaxed text-muted-foreground">주소록 전화번호와 실제 수강생 전화번호를 비교합니다. 환불자는 제외하며, 결제자와 수강생이 다르면 실제 수강생 기준으로 표시합니다.</p>
      </div>
      <DialogFooter><Button variant="outline" onClick={onClose}>닫기</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}
