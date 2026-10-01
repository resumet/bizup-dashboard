"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Ban, Check, Circle, Copy, ExternalLink, FileSpreadsheet, Loader2, Pencil, RefreshCw, Save, Trash2, Users } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { activeInstagramCourses, instagramCourseOptionLabel } from "@/lib/course-documents/course-options";
import { COURSE_DOCUMENT_MATERIAL_LIMIT } from "@/lib/course-documents/materials";
import type { BlockedPhone, CourseDocumentCourse, CourseDocumentMaterial } from "@/lib/course-documents/types";

type LoadResponse = { courses?: CourseDocumentCourse[]; blockedPhones?: BlockedPhone[]; message?: string };

function dateTime(value: string) {
  return new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Seoul" }).format(new Date(value));
}

async function copyText(value: string) {
  if (!navigator.clipboard?.writeText) throw new Error("클립보드 복사를 지원하지 않는 브라우저입니다.");
  await navigator.clipboard.writeText(value);
}

function materialSnapshots(courses: CourseDocumentCourse[]) {
  return Object.fromEntries(courses.map((course) => [
    course.id,
    course.materials.map((material) => ({ ...material })),
  ]));
}

function StatusBadge({ label, color }: { label: string; color: "blue" | "yellow" }) {
  const colorClass = color === "blue" ? "text-blue-600" : "text-yellow-500";
  return <Badge variant="outline"><Circle aria-hidden="true" className={`${colorClass} fill-current`} />{label}</Badge>;
}

export function InstagramManagementWorkspace() {
  const router = useRouter();
  const [courses, setCourses] = useState<CourseDocumentCourse[]>([]);
  const [blockedPhones, setBlockedPhones] = useState<BlockedPhone[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [savingMaterials, setSavingMaterials] = useState(false);
  const [savedMaterialsByCourse, setSavedMaterialsByCourse] = useState<Record<string, CourseDocumentMaterial[]>>({});
  const [planningSheetOpen, setPlanningSheetOpen] = useState(false);
  const [planningSheetUrl, setPlanningSheetUrl] = useState("");
  const [blockedDialogOpen, setBlockedDialogOpen] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [blockedPhone, setBlockedPhone] = useState("");
  const [blockedMemo, setBlockedMemo] = useState("");
  const [todayKoreaDate] = useState(() => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date()));

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/instagram-management", { cache: "no-store" });
      const body = await response.json() as LoadResponse;
      if (!response.ok || !body.courses || !body.blockedPhones) throw new Error(body.message ?? "데이터를 불러오지 못했습니다.");
      const activeCourses = activeInstagramCourses(body.courses, todayKoreaDate);
      setCourses(body.courses);
      setSavedMaterialsByCourse(materialSnapshots(body.courses));
      setBlockedPhones(body.blockedPhones);
      setSelectedCourseId((current) => current && activeCourses.some((course) => course.id === current) ? current : activeCourses[0]?.id ?? "");
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
        if (!response.ok || !body.courses || !body.blockedPhones) throw new Error(body.message ?? "데이터를 불러오지 못했습니다.");
        const activeCourses = activeInstagramCourses(body.courses, todayKoreaDate);
        setCourses(body.courses);
        setSavedMaterialsByCourse(materialSnapshots(body.courses));
        setBlockedPhones(body.blockedPhones);
        setSelectedCourseId(activeCourses[0]?.id ?? "");
      })
      .catch((caught: unknown) => { if (active) setError(caught instanceof Error ? caught.message : "데이터를 불러오지 못했습니다."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [todayKoreaDate]);

  const activeCourses = useMemo(() => activeInstagramCourses(courses, todayKoreaDate), [courses, todayKoreaDate]);
  const selectedCourse = activeCourses.find((course) => course.id === selectedCourseId);

  async function post(payload: Record<string, unknown>) {
    const response = await fetch("/api/instagram-management", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const body = await response.json() as { id?: string; setting?: { enabled: boolean; accessToken: string }; materials?: CourseDocumentMaterial[]; planningSheetUrl?: string; blockedPhone?: BlockedPhone; message?: string };
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

  function updateMaterial(position: number, changes: Partial<Pick<CourseDocumentMaterial, "title" | "referencePlanningNumber">>) {
    if (!selectedCourse) return;
    setCourses((current) => current.map((course) => course.id === selectedCourse.id ? {
      ...course,
      materials: course.materials.map((material) => material.position === position ? { ...material, ...changes } : material),
    } : course));
  }

  async function saveMaterials() {
    if (!selectedCourse) return;
    const savedMaterials = savedMaterialsByCourse[selectedCourse.id] ?? [];
    const savedByPosition = new Map(savedMaterials.map((material) => [material.position, material]));
    const changedMaterials = selectedCourse.materials.filter((material) => {
      const saved = savedByPosition.get(material.position);
      return material.title !== (saved?.title ?? "")
        || material.referencePlanningNumber !== (saved?.referencePlanningNumber ?? "");
    });
    if (!changedMaterials.length) return;
    setSavingMaterials(true); setError(""); setNotice("");
    try {
      const body = await post({
        action: "save-materials",
        courseId: selectedCourse.id,
        materials: changedMaterials.map((material) => ({
          position: material.position,
          title: material.title,
          referencePlanningNumber: material.referencePlanningNumber,
        })),
      });
      if (!body.materials || body.materials.length !== changedMaterials.length) throw new Error("저장된 인스타 자료를 확인하지 못했습니다.");
      const updatedByPosition = new Map(body.materials.map((material) => [material.position, material]));
      const updatedTitleByDocumentId = new Map(body.materials.flatMap((material) => material.documentId ? [[material.documentId, material.title] as const] : []));
      const nextMaterials = selectedCourse.materials.map((material) => updatedByPosition.get(material.position) ?? material);
      setCourses((current) => current.map((course) => course.id === selectedCourse.id ? {
          ...course,
          materials: nextMaterials,
          documents: course.documents.map((document) => updatedTitleByDocumentId.has(document.id) ? { ...document, title: updatedTitleByDocumentId.get(document.id)! } : document),
      } : course));
      setSavedMaterialsByCourse((current) => ({ ...current, [selectedCourse.id]: nextMaterials.map((material) => ({ ...material })) }));
      setNotice(`인스타 자료 변경사항 ${changedMaterials.length}개를 저장했습니다.`);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "인스타 자료를 저장하지 못했습니다."); }
    finally { setSavingMaterials(false); }
  }

  function openPlanningSheet() {
    if (!selectedCourse) return;
    setPlanningSheetUrl(selectedCourse.planningSheetUrl);
    setPlanningSheetOpen(true);
  }

  async function savePlanningSheet() {
    if (!selectedCourse) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const body = await post({ action: "save-planning-sheet", courseId: selectedCourse.id, url: planningSheetUrl });
      if (body.planningSheetUrl === undefined) throw new Error("저장된 기획시트 URL을 확인하지 못했습니다.");
      setCourses((current) => current.map((course) => course.id === selectedCourse.id ? { ...course, planningSheetUrl: body.planningSheetUrl! } : course));
      setPlanningSheetUrl(body.planningSheetUrl);
      setPlanningSheetOpen(false);
      setNotice(body.planningSheetUrl ? "기획시트 URL을 저장했습니다." : "기획시트 URL을 삭제했습니다.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "기획시트 URL을 저장하지 못했습니다."); }
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
      setBlockedPhones((current) => [body.blockedPhone!, ...current]); setBlockedPhone(""); setBlockedMemo(""); setBlockedDialogOpen(false); setNotice("차단 전화번호를 추가했습니다.");
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
  const assignedDocumentIds = new Set(selectedCourse?.materials.flatMap((material) => material.documentId ? [material.documentId] : []) ?? []);
  const legacyDocuments = selectedCourse?.documents.filter((document) => !assignedDocumentIds.has(document.id)) ?? [];
  const assignedMaterialCount = selectedCourse?.materials.filter((material) => material.title).length ?? 0;
  const selectedSavedMaterials = selectedCourse ? savedMaterialsByCourse[selectedCourse.id] ?? [] : [];
  const selectedSavedByPosition = new Map(selectedSavedMaterials.map((material) => [material.position, material]));
  const materialChangeCount = selectedCourse?.materials.filter((material) => {
    const saved = selectedSavedByPosition.get(material.position);
    return material.title !== (saved?.title ?? "")
      || material.referencePlanningNumber !== (saved?.referencePlanningNumber ?? "");
  }).length ?? 0;
  return (
    <TooltipProvider delayDuration={300}>
    <div className="space-y-6">
      {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
      {notice ? <Alert><AlertDescription className="flex items-center gap-2"><Check className="size-4 text-emerald-600" />{notice}</AlertDescription></Alert> : null}
      {loading ? <div className="flex min-h-80 items-center justify-center gap-2 rounded-xl border border-dashed text-muted-foreground"><Loader2 className="animate-spin" />불러오는 중</div> : (
        <>
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" asChild><Link href="/services/instagram-management/leads"><Users />리드 보기</Link></Button>
            <Button variant="outline" onClick={() => setBlockedDialogOpen(true)}><Ban />차단 전화번호</Button>
          </div>
            {selectedCourse ? <div className="space-y-5">
                <Card>
                  <CardContent className="grid min-w-0 grid-cols-1 gap-x-4 gap-y-2 py-5 xl:grid-cols-[minmax(16rem,1fr)_auto]">
                    <div className="min-w-0 xl:col-start-1 xl:row-start-2">
                      <label className="sr-only" htmlFor="instagram-course">강의 선택</label>
                      <select id="instagram-course" className="h-10 w-full rounded-lg border bg-background px-3 text-sm font-medium" value={selectedCourseId} onChange={(event) => setSelectedCourseId(event.target.value)}>
                        {activeCourses.map((course) => <option key={course.id} value={course.id}>{instagramCourseOptionLabel(course)}</option>)}
                      </select>
                    </div>
                    <div className="flex justify-end xl:col-start-2 xl:row-start-1">
                      <Badge variant={selectedCourse.externalEditEnabled ? "default" : "secondary"}>{selectedCourse.externalEditEnabled ? "외부 작성 허용" : "비활성"}</Badge>
                    </div>
                    <div className="flex flex-wrap justify-end gap-2 xl:col-start-2 xl:row-start-2">
                      <Button variant="outline" disabled={busy} onClick={openPlanningSheet}><FileSpreadsheet />기획시트</Button>
                      <Button variant="outline" disabled={!externalUrl} onClick={() => void copyText(new URL(externalUrl, window.location.origin).toString()).then(() => setNotice("외부 작성 주소를 복사했습니다.")).catch((caught: unknown) => setError(caught instanceof Error ? caught.message : "주소를 복사하지 못했습니다."))}><Copy />주소 복사</Button>
                      <Button variant="outline" disabled={busy} onClick={() => void updateAccess(selectedCourse.externalEditEnabled, true)}><RefreshCw />재발급</Button>
                      <Button variant={selectedCourse.externalEditEnabled ? "outline" : "default"} disabled={busy} onClick={() => void updateAccess(!selectedCourse.externalEditEnabled)}>{selectedCourse.externalEditEnabled ? "비활성화" : "외부 작성 활성화"}</Button>
                      <Button disabled={savingMaterials || materialChangeCount === 0} onClick={() => void saveMaterials()}>
                        {savingMaterials ? <Loader2 className="animate-spin" /> : <Save />}
                        {savingMaterials ? "저장 중" : materialChangeCount ? `저장하기 (${materialChangeCount})` : "저장됨"}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader><CardTitle>인스타 자료 <span className="text-sm font-normal text-muted-foreground">{assignedMaterialCount}/{COURSE_DOCUMENT_MATERIAL_LIMIT}</span></CardTitle></CardHeader>
                  <CardContent><div className="rounded-lg border"><Table><TableHeader className="sticky top-0 z-10 bg-background"><TableRow className="hover:bg-background"><TableHead className="w-16 text-center">번호</TableHead><TableHead className="w-32 text-center">참고기획번호</TableHead><TableHead className="min-w-72">제목</TableHead><TableHead className="w-32">작성 상태</TableHead><TableHead className="w-28">공개 상태</TableHead><TableHead className="w-32 text-right">작업</TableHead></TableRow></TableHeader><TableBody>{selectedCourse.materials.map((material) => {
                  const document = selectedCourse.documents.find((item) => item.id === material.documentId);
                  return <TableRow key={material.position}><TableCell className="text-center font-mono text-sm text-muted-foreground">{String(material.position).padStart(2, "0")}</TableCell><TableCell><Input className="mx-auto w-20 text-center font-mono" aria-label={`${material.position}번 참고기획번호`} value={material.referencePlanningNumber} inputMode="numeric" maxLength={2} placeholder="00" disabled={savingMaterials} onChange={(event) => updateMaterial(material.position, { referencePlanningNumber: event.target.value.replace(/\D/g, "").slice(0, 2) })} /></TableCell><TableCell><Input aria-label={`${material.position}번 자료 제목`} value={material.title} maxLength={200} placeholder="강사가 작성할 글의 제목" disabled={savingMaterials} onChange={(event) => updateMaterial(material.position, { title: event.target.value })} /></TableCell><TableCell>{document ? <StatusBadge label="작성됨" color="blue" /> : <StatusBadge label="미작성" color="yellow" />}</TableCell><TableCell>{document ? <StatusBadge label={document.status === "published" ? "공개" : "비공개"} color={document.status === "published" ? "blue" : "yellow"} /> : <span className="text-sm text-muted-foreground">-</span>}</TableCell><TableCell><div className="flex justify-end gap-1">{document ? <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon-sm" aria-label="문서 수정 및 리드게이트 설정" disabled={savingMaterials} onClick={() => router.push(`/services/instagram-management/documents/${document.id}`)}><Pencil /></Button></TooltipTrigger><TooltipContent>문서 수정 및 리드게이트 설정</TooltipContent></Tooltip> : null}{document?.status === "published" ? <Button variant="ghost" size="icon-sm" asChild><a aria-label={`${material.position}번 공개 글 열기`} href={`/article/${document.slug}`} target="_blank" rel="noopener noreferrer"><ExternalLink /></a></Button> : null}{document ? <Button variant="ghost" size="icon-sm" aria-label={`${material.position}번 글 삭제`} disabled={busy || savingMaterials} onClick={() => void deleteDocument(document.id)}><Trash2 /></Button> : null}</div></TableCell></TableRow>;
                })}</TableBody></Table></div></CardContent>
                </Card>
                {legacyDocuments.length ? <Card><CardHeader><CardTitle>이전 방식 미연결 글 {legacyDocuments.length}</CardTitle></CardHeader><CardContent><Table><TableHeader><TableRow><TableHead>제목</TableHead><TableHead>상태</TableHead><TableHead>수정일</TableHead><TableHead className="text-right">작업</TableHead></TableRow></TableHeader><TableBody>{legacyDocuments.map((document) => <TableRow key={document.id}><TableCell className="font-medium">{document.title}</TableCell><TableCell><Badge variant={document.status === "published" ? "default" : "secondary"}>{document.status === "published" ? "공개" : "비공개"}</Badge></TableCell><TableCell className="text-muted-foreground">{dateTime(document.updatedAt)}</TableCell><TableCell><div className="flex justify-end gap-1"><Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon-sm" aria-label="문서 수정 및 리드게이트 설정" onClick={() => router.push(`/services/instagram-management/documents/${document.id}`)}><Pencil /></Button></TooltipTrigger><TooltipContent>문서 수정 및 리드게이트 설정</TooltipContent></Tooltip>{document.status === "published" ? <Button variant="ghost" size="icon-sm" asChild><a aria-label="이전 공개 글 열기" href={`/article/${document.slug}`} target="_blank" rel="noopener noreferrer"><ExternalLink /></a></Button> : null}<Button variant="ghost" size="icon-sm" aria-label="이전 글 삭제" disabled={busy} onClick={() => void deleteDocument(document.id)}><Trash2 /></Button></div></TableCell></TableRow>)}</TableBody></Table></CardContent></Card> : null}
              </div> : <Card><CardContent className="flex min-h-80 items-center justify-center text-muted-foreground">진행 중인 강의가 없습니다.</CardContent></Card>}
        </>
      )}
      <Dialog open={blockedDialogOpen} onOpenChange={(open) => { if (!busy) setBlockedDialogOpen(open); }}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>차단 전화번호</DialogTitle>
            <DialogDescription className="sr-only">차단할 전화번호와 메모를 저장하고 기존 차단 전화번호를 관리합니다.</DialogDescription>
          </DialogHeader>
          {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
          <form className="grid gap-3 sm:grid-cols-[14rem_minmax(0,1fr)_auto]" onSubmit={(event) => { event.preventDefault(); void addBlockedPhone(); }}>
            <div className="space-y-2"><Label htmlFor="blocked-phone">전화번호</Label><Input id="blocked-phone" value={blockedPhone} onChange={(event) => setBlockedPhone(event.target.value)} placeholder="010-0000-0000" disabled={busy} autoFocus /></div>
            <div className="space-y-2"><Label htmlFor="blocked-memo">메모</Label><Input id="blocked-memo" value={blockedMemo} onChange={(event) => setBlockedMemo(event.target.value)} maxLength={500} disabled={busy} /></div>
            <Button className="self-end" type="submit" disabled={busy || !blockedPhone.trim()}>{busy ? <Loader2 className="animate-spin" /> : <Save />}저장</Button>
          </form>
          <div className="rounded-lg border"><Table><TableHeader><TableRow><TableHead>전화번호</TableHead><TableHead>메모</TableHead><TableHead>등록일</TableHead><TableHead className="text-right">삭제</TableHead></TableRow></TableHeader><TableBody>{blockedPhones.map((item) => <TableRow key={item.id}><TableCell className="font-mono">{item.phone}</TableCell><TableCell>{item.memo || "-"}</TableCell><TableCell>{dateTime(item.createdAt)}</TableCell><TableCell className="text-right"><Button size="icon-sm" variant="ghost" aria-label="차단 전화번호 삭제" disabled={busy} onClick={() => void deleteBlockedPhone(item.id)}><Trash2 /></Button></TableCell></TableRow>)}</TableBody></Table>{!blockedPhones.length ? <div className="flex min-h-32 items-center justify-center text-sm text-muted-foreground">차단된 전화번호가 없습니다.</div> : null}</div>
        </DialogContent>
      </Dialog>
      <Dialog open={planningSheetOpen} onOpenChange={(open) => { if (!busy) setPlanningSheetOpen(open); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>기획시트</DialogTitle>
            <DialogDescription className="sr-only">선택한 강의의 기획시트 URL을 저장하거나 저장된 기획시트를 엽니다.</DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void savePlanningSheet(); }}>
            <div className="space-y-2">
              <Label htmlFor="planning-sheet-url">기획시트 URL</Label>
              <Input id="planning-sheet-url" type="url" value={planningSheetUrl} maxLength={2048} placeholder="https://docs.google.com/spreadsheets/..." disabled={busy} autoFocus onChange={(event) => setPlanningSheetUrl(event.target.value)} />
            </div>
            <DialogFooter className="sm:justify-between">
              <div>{selectedCourse?.planningSheetUrl ? <Button type="button" variant="outline" asChild><a href={selectedCourse.planningSheetUrl} target="_blank" rel="noopener noreferrer"><ExternalLink />기획시트 열기</a></Button> : null}</div>
              <div className="flex gap-2"><Button type="button" variant="outline" disabled={busy} onClick={() => setPlanningSheetOpen(false)}>취소</Button><Button type="submit" disabled={busy}>{busy ? <Loader2 className="animate-spin" /> : <Save />}저장</Button></div>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
    </TooltipProvider>
  );
}
