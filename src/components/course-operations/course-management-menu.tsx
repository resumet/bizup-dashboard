"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Fragment, useId, useRef, useState } from "react";
import { BookOpenCheck, BookUser, Camera, ChartNoAxesCombined, CircleDot, ClipboardList, Loader2, MonitorPlay, Radio, Trash2, UsersRound, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getCourseMenuItems, type CourseMenuKind } from "@/lib/course-operations/course-menu";
import { COURSE_STATUSES, COURSE_STATUS_LABELS, isCourseStatus, type CourseStatus } from "@/lib/course-operations/course-status";

export const courseMenuIcons: Record<CourseMenuKind, LucideIcon> = {
  detail: BookOpenCheck, intake: BookUser, instagram: Camera, youtube: MonitorPlay,
  webinar: Radio, "free-students": UsersRound, students: UsersRound, wbs: ClipboardList,
  ads: ChartNoAxesCombined, status: CircleDot, delete: Trash2,
};
type Subject = { name: string; status: CourseStatus; canDelete: boolean };
type Blocker = { id: string; title: string; href: string; status: string; leadCount: number };

export function CourseManagementMenu({ courseId, align = "end" }: { courseId: string; align?: "start" | "end" }) {
  const router = useRouter();
  const pathname = usePathname();
  const statusId = useId();
  const requestId = useRef(0);
  const [action, setAction] = useState<"status" | "delete" | null>(null);
  const [subject, setSubject] = useState<Subject | null>(null);
  const [status, setStatus] = useState<CourseStatus>("ongoing");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [blockers, setBlockers] = useState<Blocker[]>([]);
  function close() { if (!saving) { requestId.current++; setAction(null); } }
  async function open(next: "status" | "delete") {
    const currentRequest = ++requestId.current;
    setAction(next); setSubject(null); setError(""); setBlockers([]); setLoading(true);
    try {
      const response = await fetch(`/api/course-operations/${encodeURIComponent(courseId)}/menu`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "강의 정보를 불러오지 못했습니다.");
      if (currentRequest !== requestId.current) return;
      setSubject(data); setStatus(data.status);
    } catch (caught) {
      if (currentRequest === requestId.current) setError(caught instanceof Error ? caught.message : "강의 정보를 불러오지 못했습니다.");
    } finally { if (currentRequest === requestId.current) setLoading(false); }
  }
  async function save() {
    if (!subject || saving || (action === "delete" && !subject.canDelete)) return;
    setSaving(true); setError(""); setBlockers([]);
    try {
      const response = await fetch(`/api/course-operations/${encodeURIComponent(courseId)}${action === "status" ? "/status" : ""}`, action === "status"
        ? { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) }
        : { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) {
        if (response.status === 409 && data.code === "COURSE_DOCUMENTS_MUST_BE_REMOVED" && Array.isArray(data.documents)) {
          setBlockers(data.documents); return;
        }
        throw new Error(data.message || "강의 정보를 변경하지 못했습니다.");
      }
      setAction(null);
      if (action === "delete" && pathname.includes(courseId)) router.replace("/services/course-operations");
      router.refresh();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "강의 정보를 변경하지 못했습니다."); }
    finally { setSaving(false); }
  }
  return <>
    <DropdownMenuContent align={align} className="min-w-64" onCloseAutoFocus={event => { if (action) event.preventDefault(); }}>
      {getCourseMenuItems(courseId).map(item => {
        const Icon = courseMenuIcons[item.kind];
        return <Fragment key={item.kind}>
          {item.kind === "status" ? <DropdownMenuSeparator /> : null}
          {item.href ? <DropdownMenuItem asChild><Link href={item.href}><Icon aria-hidden="true" />{item.label}</Link></DropdownMenuItem>
            : <DropdownMenuItem variant={item.kind === "delete" ? "destructive" : "default"} onSelect={() => void open(item.kind as "status" | "delete")}><Icon aria-hidden="true" />{item.label}</DropdownMenuItem>}
        </Fragment>;
      })}
    </DropdownMenuContent>
    <Dialog open={action !== null} onOpenChange={value => { if (!value) close(); }}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{action === "delete" ? "강의를 삭제할까요?" : "강의 상태 변경"}</DialogTitle><DialogDescription className="sr-only">강의 관리 작업을 확인합니다.</DialogDescription></DialogHeader>
        {loading ? <p role="status" className="flex items-center gap-2"><Loader2 className="size-4 animate-spin" />강의 정보를 불러오는 중입니다.</p> : null}
        {subject && action === "status" ? <div className="space-y-2"><Label htmlFor={statusId}>상태</Label><Select value={status} disabled={saving} onValueChange={value => { if (isCourseStatus(value)) setStatus(value); }}><SelectTrigger id={statusId}><SelectValue /></SelectTrigger><SelectContent>{COURSE_STATUSES.map(value => <SelectItem key={value} value={value}>{COURSE_STATUS_LABELS[value]}</SelectItem>)}</SelectContent></Select></div> : null}
        {subject && action === "delete" ? <p className="text-sm">‘{subject.name}’의 강의 정보와 옵션, 유튜브 출연 정보가 삭제됩니다. 연결된 수강생 명단과 문자 제작물은 강의 연결만 해제됩니다. 이 작업은 되돌릴 수 없습니다.</p> : null}
        {subject && action === "delete" && !subject.canDelete ? <p role="alert" className="text-sm text-destructive">강의를 삭제할 권한이 없습니다.</p> : null}
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        {blockers.length ? <div role="alert" className="space-y-2"><p className="text-sm text-destructive">연결된 문서를 먼저 삭제한 뒤 다시 시도해 주세요.</p><ul className="space-y-2">{blockers.map(document => <li key={document.id} className="rounded border p-3"><Link href={document.href} className="text-sm underline">{document.title}</Link><p className="text-xs text-muted-foreground">{document.status === "published" ? "공개" : "비공개"} · 수집 리드 {document.leadCount}건</p></li>)}</ul></div> : null}
        <DialogFooter><Button variant="outline" disabled={saving} onClick={close}>취소</Button><Button variant={action === "delete" ? "destructive" : "default"} disabled={loading || saving || !subject || (action === "delete" && !subject.canDelete)} onClick={() => void save()}>{saving ? <Loader2 className="animate-spin" /> : null}{action === "delete" ? "삭제" : "저장"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}
