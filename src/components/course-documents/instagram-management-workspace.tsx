"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Ban, Check, Copy, ExternalLink, FilePlus2, FileText, Loader2, RefreshCw, Search, Trash2 } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { BlockedPhone, CourseDocumentCourse, CourseDocumentLead } from "@/lib/course-documents/types";

type LoadResponse = { courses?: CourseDocumentCourse[]; leads?: CourseDocumentLead[]; blockedPhones?: BlockedPhone[]; message?: string };

function dateTime(value: string) {
  return new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Seoul" }).format(new Date(value));
}

function shortDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", { month: "short", day: "numeric", timeZone: "Asia/Seoul" }).format(new Date(value));
}

async function copyText(value: string) {
  if (!navigator.clipboard?.writeText) throw new Error("클립보드 복사를 지원하지 않는 브라우저입니다.");
  await navigator.clipboard.writeText(value);
}

export function InstagramManagementWorkspace() {
  const router = useRouter();
  const [courses, setCourses] = useState<CourseDocumentCourse[]>([]);
  const [leads, setLeads] = useState<CourseDocumentLead[]>([]);
  const [blockedPhones, setBlockedPhones] = useState<BlockedPhone[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [newDocumentOpen, setNewDocumentOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [leadCourseId, setLeadCourseId] = useState("");
  const [leadDocumentId, setLeadDocumentId] = useState("");
  const [leadInstructor, setLeadInstructor] = useState("");
  const [leadFrom, setLeadFrom] = useState("");
  const [leadTo, setLeadTo] = useState("");
  const [blockedPhone, setBlockedPhone] = useState("");
  const [blockedMemo, setBlockedMemo] = useState("");
  const [renderedAt] = useState(() => Date.now());

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/instagram-management", { cache: "no-store" });
      const body = await response.json() as LoadResponse;
      if (!response.ok || !body.courses || !body.leads || !body.blockedPhones) throw new Error(body.message ?? "데이터를 불러오지 못했습니다.");
      setCourses(body.courses);
      setLeads(body.leads);
      setBlockedPhones(body.blockedPhones);
      setSelectedCourseId((current) => current && body.courses!.some((course) => course.id === current) ? current : body.courses![0]?.id ?? "");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "데이터를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    fetch("/api/instagram-management", { cache: "no-store" })
      .then(async (response) => ({ response, body: await response.json() as LoadResponse }))
      .then(({ response, body }) => {
        if (!active) return;
        if (!response.ok || !body.courses || !body.leads || !body.blockedPhones) throw new Error(body.message ?? "데이터를 불러오지 못했습니다.");
        setCourses(body.courses);
        setLeads(body.leads);
        setBlockedPhones(body.blockedPhones);
        setSelectedCourseId(body.courses[0]?.id ?? "");
      })
      .catch((caught: unknown) => { if (active) setError(caught instanceof Error ? caught.message : "데이터를 불러오지 못했습니다."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const selectedCourse = courses.find((course) => course.id === selectedCourseId);
  const filteredCourses = useMemo(() => {
    const query = search.trim().toLowerCase();
    return query ? courses.filter((course) => `${course.name} ${course.instructorName} ${course.cohort}`.toLowerCase().includes(query)) : courses;
  }, [courses, search]);
  const instructors = useMemo(() => [...new Set(courses.map((course) => course.instructorName).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ko")), [courses]);
  const allDocuments = useMemo(() => courses.flatMap((course) => course.documents.map((document) => ({ ...document, courseName: course.name }))), [courses]);
  const filteredLeads = useMemo(() => leads.filter((lead) => {
    if (leadCourseId && lead.courseId !== leadCourseId) return false;
    if (leadDocumentId && lead.documentId !== leadDocumentId) return false;
    if (leadInstructor && lead.instructorName !== leadInstructor) return false;
    const created = lead.createdAt.slice(0, 10);
    return (!leadFrom || created >= leadFrom) && (!leadTo || created <= leadTo);
  }), [leads, leadCourseId, leadDocumentId, leadInstructor, leadFrom, leadTo]);
  const todayKey = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date(renderedAt));
  const todayLeadCount = filteredLeads.filter((lead) => lead.createdAt.slice(0, 10) === todayKey).length;
  const lastSevenDaysLeadCount = filteredLeads.filter((lead) => new Date(lead.createdAt).getTime() >= renderedAt - 7 * 86_400_000).length;

  async function post(payload: Record<string, unknown>) {
    const response = await fetch("/api/instagram-management", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const body = await response.json() as { id?: string; setting?: { enabled: boolean; accessToken: string }; blockedPhone?: BlockedPhone; message?: string };
    if (!response.ok) throw new Error(body.message ?? "요청을 처리하지 못했습니다.");
    return body;
  }

  async function updateAccess(enabled: boolean, regenerateToken = false) {
    if (!selectedCourse) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const body = await post({ action: "update-course-access", courseId: selectedCourse.id, enabled, regenerateToken });
      if (!body.setting) throw new Error("외부 작성 설정 응답이 올바르지 않습니다.");
      setCourses((current) => current.map((course) => course.id === selectedCourse.id ? { ...course, externalEditEnabled: body.setting!.enabled, externalAccessToken: body.setting!.accessToken } : course));
      setNotice(regenerateToken ? "외부 작성 주소를 재발급했습니다." : enabled ? "외부 작성을 활성화했습니다." : "외부 작성을 비활성화했습니다.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "외부 작성 설정을 저장하지 못했습니다."); }
    finally { setBusy(false); }
  }

  async function createDocument() {
    if (!selectedCourse) return;
    setBusy(true); setError("");
    try {
      const body = await post({ action: "create-document", courseId: selectedCourse.id, title: newTitle });
      if (!body.id) throw new Error("생성된 문서를 확인하지 못했습니다.");
      setNewDocumentOpen(false); setNewTitle("");
      router.push(`/services/instagram-management/documents/${body.id}`);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "문서를 만들지 못했습니다."); }
    finally { setBusy(false); }
  }

  async function deleteDocument(documentId: string) {
    if (!window.confirm("문서를 삭제 상태로 전환할까요? 수집된 리드는 보존됩니다.")) return;
    setBusy(true); setError("");
    try { await post({ action: "delete-document", documentId }); await load(); setNotice("문서를 삭제했습니다. 리드는 보존됩니다."); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "문서를 삭제하지 못했습니다."); }
    finally { setBusy(false); }
  }

  async function addBlockedPhone() {
    setBusy(true); setError("");
    try {
      const body = await post({ action: "add-blocked-phone", phone: blockedPhone, memo: blockedMemo });
      if (!body.blockedPhone) throw new Error("저장 결과를 확인하지 못했습니다.");
      setBlockedPhones((current) => [body.blockedPhone!, ...current]); setBlockedPhone(""); setBlockedMemo(""); setNotice("차단 전화번호를 추가했습니다.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "차단 전화번호를 추가하지 못했습니다."); }
    finally { setBusy(false); }
  }

  async function deleteBlockedPhone(id: string) {
    setBusy(true); setError("");
    try { await post({ action: "delete-blocked-phone", id }); setBlockedPhones((current) => current.filter((item) => item.id !== id)); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "차단 전화번호를 삭제하지 못했습니다."); }
    finally { setBusy(false); }
  }

  const externalUrl = selectedCourse?.externalAccessToken ? `/write/${selectedCourse.externalAccessToken}` : "";
  const exportParams = new URLSearchParams();
  if (leadCourseId) exportParams.set("courseId", leadCourseId);
  if (leadDocumentId) exportParams.set("documentId", leadDocumentId);
  if (leadInstructor) exportParams.set("instructor", leadInstructor);
  if (leadFrom) exportParams.set("from", leadFrom);
  if (leadTo) exportParams.set("to", leadTo);

  return (
    <div className="space-y-6">
      {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
      {notice ? <Alert><AlertDescription className="flex items-center gap-2"><Check className="size-4 text-emerald-600" />{notice}</AlertDescription></Alert> : null}
      {loading ? <div className="flex min-h-80 items-center justify-center gap-2 rounded-xl border border-dashed text-muted-foreground"><Loader2 className="animate-spin" />불러오는 중</div> : (
        <Tabs defaultValue="documents" className="gap-6">
          <TabsList className="h-auto w-full justify-start overflow-x-auto"><TabsTrigger value="documents">문서 관리</TabsTrigger><TabsTrigger value="leads">리드 {leads.length.toLocaleString("ko-KR")}</TabsTrigger><TabsTrigger value="blocked">차단 전화번호</TabsTrigger></TabsList>
          <TabsContent value="documents" className="mt-0">
            <div className="grid items-start gap-5 lg:grid-cols-[18rem_minmax(0,1fr)]">
              <Card className="lg:sticky lg:top-6"><CardHeader className="pb-3"><CardTitle>강의</CardTitle></CardHeader><CardContent className="space-y-3"><div className="relative"><Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="강의 검색" /></div><div className="max-h-[65vh] space-y-1 overflow-y-auto pr-1">{filteredCourses.map((course) => <button key={course.id} type="button" onClick={() => setSelectedCourseId(course.id)} className={`w-full rounded-lg px-3 py-3 text-left transition-colors ${selectedCourseId === course.id ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}><span className="block truncate font-medium">{course.cohort ? `${course.cohort}기 · ` : ""}{course.name}</span><span className={`mt-1 block truncate text-xs ${selectedCourseId === course.id ? "text-primary-foreground/75" : "text-muted-foreground"}`}>{course.instructorName || "강사 미지정"} · 문서 {course.documents.length}</span></button>)}</div></CardContent></Card>
              {selectedCourse ? <div className="space-y-5">
                <Card><CardContent className="flex flex-col gap-4 py-5 xl:flex-row xl:items-center"><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><h2 className="truncate text-xl font-semibold">{selectedCourse.name}</h2><Badge variant={selectedCourse.externalEditEnabled ? "default" : "secondary"}>{selectedCourse.externalEditEnabled ? "외부 작성 허용" : "비활성"}</Badge></div><p className="mt-1 text-sm text-muted-foreground">{selectedCourse.instructorName || "강사 미지정"} · {shortDate(selectedCourse.freeWebinarAt)}</p></div><div className="flex flex-wrap gap-2"><Button variant="outline" disabled={!externalUrl} onClick={() => void copyText(new URL(externalUrl, window.location.origin).toString()).then(() => setNotice("외부 작성 주소를 복사했습니다.")).catch((caught: unknown) => setError(caught instanceof Error ? caught.message : "주소를 복사하지 못했습니다."))}><Copy />주소 복사</Button><Button variant="outline" disabled={busy} onClick={() => void updateAccess(selectedCourse.externalEditEnabled, true)}><RefreshCw />재발급</Button><Button variant={selectedCourse.externalEditEnabled ? "outline" : "default"} disabled={busy} onClick={() => void updateAccess(!selectedCourse.externalEditEnabled)}>{selectedCourse.externalEditEnabled ? "비활성화" : "외부 작성 활성화"}</Button><Button onClick={() => setNewDocumentOpen(true)}><FilePlus2 />새 문서</Button></div></CardContent></Card>
                <Card><CardHeader><CardTitle>문서 {selectedCourse.documents.length}</CardTitle></CardHeader><CardContent>{selectedCourse.documents.length ? <Table><TableHeader><TableRow><TableHead>제목</TableHead><TableHead>상태</TableHead><TableHead>리드</TableHead><TableHead>수정일</TableHead><TableHead className="text-right">작업</TableHead></TableRow></TableHeader><TableBody>{selectedCourse.documents.map((document) => <TableRow key={document.id}><TableCell><button type="button" className="font-medium hover:underline" onClick={() => router.push(`/services/instagram-management/documents/${document.id}`)}>{document.title}</button></TableCell><TableCell><Badge variant={document.status === "published" ? "default" : "secondary"}>{document.status === "published" ? "공개" : "비공개"}</Badge></TableCell><TableCell>{document.leadCount.toLocaleString("ko-KR")}</TableCell><TableCell className="text-muted-foreground">{dateTime(document.updatedAt)}</TableCell><TableCell><div className="flex justify-end gap-1"><Button variant="ghost" size="icon-sm" aria-label="문서 편집" onClick={() => router.push(`/services/instagram-management/documents/${document.id}`)}><FileText /></Button>{document.status === "published" ? <><Button variant="ghost" size="icon-sm" aria-label="공개 페이지 주소 복사" onClick={() => void copyText(new URL(`/article/${document.slug}`, window.location.origin).toString()).then(() => setNotice("공개 페이지 주소를 복사했습니다.")).catch((caught: unknown) => setError(caught instanceof Error ? caught.message : "주소를 복사하지 못했습니다."))}><Copy /></Button><Button variant="ghost" size="icon-sm" asChild><a aria-label="공개 페이지 열기" href={`/article/${document.slug}`} target="_blank" rel="noopener noreferrer"><ExternalLink /></a></Button></> : null}<Button variant="ghost" size="icon-sm" aria-label="문서 삭제" disabled={busy} onClick={() => void deleteDocument(document.id)}><Trash2 /></Button></div></TableCell></TableRow>)}</TableBody></Table> : <div className="flex min-h-56 flex-col items-center justify-center rounded-xl border border-dashed text-center"><FileText className="mb-3 size-7 text-muted-foreground" /><p className="font-medium">등록된 문서가 없습니다</p><Button className="mt-4" size="sm" onClick={() => setNewDocumentOpen(true)}><FilePlus2 />새 문서</Button></div>}</CardContent></Card>
              </div> : <Card><CardContent className="flex min-h-80 items-center justify-center text-muted-foreground">강의를 선택해 주세요.</CardContent></Card>}
            </div>
          </TabsContent>
          <TabsContent value="leads" className="mt-0 space-y-5">
            <div className="grid gap-3 sm:grid-cols-3"><Card><CardContent className="py-5"><p className="text-sm text-muted-foreground">현재 결과</p><p className="mt-1 text-3xl font-semibold">{filteredLeads.length.toLocaleString("ko-KR")}</p></CardContent></Card><Card><CardContent className="py-5"><p className="text-sm text-muted-foreground">오늘</p><p className="mt-1 text-3xl font-semibold">{todayLeadCount.toLocaleString("ko-KR")}</p></CardContent></Card><Card><CardContent className="py-5"><p className="text-sm text-muted-foreground">최근 7일</p><p className="mt-1 text-3xl font-semibold">{lastSevenDaysLeadCount.toLocaleString("ko-KR")}</p></CardContent></Card></div>
            <Card><CardContent className="grid gap-3 py-5 md:grid-cols-3 xl:grid-cols-6"><select className="h-10 rounded-lg border bg-background px-3 text-sm" value={leadInstructor} onChange={(event) => setLeadInstructor(event.target.value)}><option value="">전체 강사</option>{instructors.map((name) => <option key={name}>{name}</option>)}</select><select className="h-10 rounded-lg border bg-background px-3 text-sm" value={leadCourseId} onChange={(event) => { setLeadCourseId(event.target.value); setLeadDocumentId(""); }}><option value="">전체 강의</option>{courses.map((course) => <option key={course.id} value={course.id}>{course.name}</option>)}</select><select className="h-10 rounded-lg border bg-background px-3 text-sm" value={leadDocumentId} onChange={(event) => setLeadDocumentId(event.target.value)}><option value="">전체 문서</option>{allDocuments.filter((document) => !leadCourseId || document.courseId === leadCourseId).map((document) => <option key={document.id} value={document.id}>{document.title}</option>)}</select><Input type="date" aria-label="시작일" value={leadFrom} onChange={(event) => setLeadFrom(event.target.value)} /><Input type="date" aria-label="종료일" value={leadTo} onChange={(event) => setLeadTo(event.target.value)} /><Button asChild><a href={`/api/instagram-management/leads/export?${exportParams.toString()}`}><ExternalLink />Excel 다운로드</a></Button></CardContent></Card>
            <Card><CardContent className="pt-6"><Table><TableHeader><TableRow><TableHead>등록일</TableHead><TableHead>이름</TableHead><TableHead>전화번호</TableHead><TableHead>강사</TableHead><TableHead>강의</TableHead><TableHead>문서</TableHead><TableHead>유입</TableHead></TableRow></TableHeader><TableBody>{filteredLeads.map((lead) => <TableRow key={lead.id}><TableCell className="whitespace-nowrap">{dateTime(lead.createdAt)}</TableCell><TableCell>{lead.name}</TableCell><TableCell className="font-mono">{lead.phone}</TableCell><TableCell>{lead.instructorName}</TableCell><TableCell>{lead.courseName}</TableCell><TableCell>{lead.documentTitle}</TableCell><TableCell>{lead.utmSource || lead.referrer || "-"}</TableCell></TableRow>)}</TableBody></Table>{!filteredLeads.length ? <div className="flex min-h-44 items-center justify-center text-sm text-muted-foreground">조건에 맞는 리드가 없습니다.</div> : null}</CardContent></Card>
          </TabsContent>
          <TabsContent value="blocked" className="mt-0 space-y-5">
            <Card><CardHeader><CardTitle>전화번호 추가</CardTitle></CardHeader><CardContent className="grid gap-3 sm:grid-cols-[14rem_minmax(0,1fr)_auto]"><div className="space-y-2"><Label htmlFor="blocked-phone">전화번호</Label><Input id="blocked-phone" value={blockedPhone} onChange={(event) => setBlockedPhone(event.target.value)} placeholder="010-0000-0000" /></div><div className="space-y-2"><Label htmlFor="blocked-memo">메모</Label><Input id="blocked-memo" value={blockedMemo} onChange={(event) => setBlockedMemo(event.target.value)} maxLength={500} /></div><Button className="self-end" disabled={busy || !blockedPhone.trim()} onClick={() => void addBlockedPhone()}><Ban />차단</Button></CardContent></Card>
            <Card><CardContent className="pt-6"><Table><TableHeader><TableRow><TableHead>전화번호</TableHead><TableHead>메모</TableHead><TableHead>등록일</TableHead><TableHead className="text-right">삭제</TableHead></TableRow></TableHeader><TableBody>{blockedPhones.map((item) => <TableRow key={item.id}><TableCell className="font-mono">{item.phone}</TableCell><TableCell>{item.memo || "-"}</TableCell><TableCell>{dateTime(item.createdAt)}</TableCell><TableCell className="text-right"><Button size="icon-sm" variant="ghost" aria-label="차단 전화번호 삭제" disabled={busy} onClick={() => void deleteBlockedPhone(item.id)}><Trash2 /></Button></TableCell></TableRow>)}</TableBody></Table>{!blockedPhones.length ? <div className="flex min-h-40 items-center justify-center text-sm text-muted-foreground">차단된 전화번호가 없습니다.</div> : null}</CardContent></Card>
          </TabsContent>
        </Tabs>
      )}

      <Dialog open={newDocumentOpen} onOpenChange={setNewDocumentOpen}><DialogContent><DialogHeader><DialogTitle>새 문서</DialogTitle></DialogHeader><div className="space-y-2"><Label htmlFor="new-document-title">제목</Label><Input id="new-document-title" autoFocus value={newTitle} onChange={(event) => setNewTitle(event.target.value)} maxLength={200} onKeyDown={(event) => { if (event.key === "Enter" && newTitle.trim()) void createDocument(); }} /></div><DialogFooter><Button disabled={busy || !newTitle.trim()} onClick={() => void createDocument()}>{busy ? <Loader2 className="animate-spin" /> : <FilePlus2 />}만들기</Button></DialogFooter></DialogContent></Dialog>
    </div>
  );
}
