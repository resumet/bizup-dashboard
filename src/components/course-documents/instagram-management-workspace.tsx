"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Ban, Check, Circle, Copy, ExternalLink, FileSpreadsheet, Loader2, Pencil, RefreshCw, Save, Trash2, Upload, Users } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { instagramCourseOptionLabel } from "@/lib/course-documents/course-options";
import { instagramProgressSummary, progressPercentage } from "@/lib/course-documents/instagram-progress";
import { instagramDmMaterialHref, instagramDmMaterialValue, instagramExternalDmPath } from "@/lib/course-documents/instagram-upload";
import type { BlockedPhone, CourseDocumentCourse, CourseDocumentMaterial } from "@/lib/course-documents/types";
import { formatWebinarDate } from "@/lib/course-operations/webinar-proximity";

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

type InstagramSettingsDraft = {
  accountUrl: string;
  totalCount: string;
  planningCompletedCount: string;
  filmingCompletedCount: string;
};

type InstagramUploadDraft = {
  position: number;
  uploadedUrl: string;
  dmMaterial: string;
  externalDmUrl: string;
};

function instagramSettingsDraft(course: CourseDocumentCourse): InstagramSettingsDraft {
  return {
    accountUrl: course.instagramAccountUrl,
    totalCount: String(course.instagramTotalCount),
    planningCompletedCount: String(course.materials.filter((item) => item.planningCompleted).length),
    filmingCompletedCount: String(course.materials.filter((item) => item.filmingCompleted).length),
  };
}

function materialHasChanges(current: CourseDocumentMaterial, saved?: CourseDocumentMaterial) {
  return current.title !== (saved?.title ?? "")
    || current.referencePlanningNumber !== (saved?.referencePlanningNumber ?? "")
    || current.planningCompleted !== (saved?.planningCompleted ?? false)
    || current.filmingDate !== (saved?.filmingDate ?? "")
    || current.filmingCompleted !== (saved?.filmingCompleted ?? false)
    || current.uploadDate !== (saved?.uploadDate ?? "")
    || current.uploadCompleted !== (saved?.uploadCompleted ?? false)
    || current.uploadedUrl !== (saved?.uploadedUrl ?? "")
    || current.dmMaterial !== (saved?.dmMaterial ?? "");
}

function StatusBadge({ label, color }: { label: string; color: "blue" | "yellow" }) {
  const colorClass = color === "blue" ? "text-blue-600" : "text-yellow-500";
  return <Badge variant="outline"><Circle aria-hidden="true" className={`${colorClass} fill-current`} />{label}</Badge>;
}

export function InstagramManagementWorkspace({ courseId }: { courseId?: string }) {
  const router = useRouter();
  const endpoint = courseId ? `/api/instagram-management?courseId=${courseId}` : "/api/instagram-management?view=list";
  const [courses, setCourses] = useState<CourseDocumentCourse[]>([]);
  const [blockedPhones, setBlockedPhones] = useState<BlockedPhone[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [savingMaterials, setSavingMaterials] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [savingUpload, setSavingUpload] = useState(false);
  const [savedMaterialsByCourse, setSavedMaterialsByCourse] = useState<Record<string, CourseDocumentMaterial[]>>({});
  const [settingsDraft, setSettingsDraft] = useState<InstagramSettingsDraft>({
    accountUrl: "",
    totalCount: "0",
    planningCompletedCount: "0",
    filmingCompletedCount: "0",
  });
  const [planningSheetOpen, setPlanningSheetOpen] = useState(false);
  const [planningSheetUrl, setPlanningSheetUrl] = useState("");
  const [blockedDialogOpen, setBlockedDialogOpen] = useState(false);
  const [uploadDraft, setUploadDraft] = useState<InstagramUploadDraft | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [blockedPhone, setBlockedPhone] = useState("");
  const [blockedMemo, setBlockedMemo] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(endpoint, { cache: "no-store" });
      const body = await response.json() as LoadResponse;
      if (!response.ok || !body.courses || !body.blockedPhones) throw new Error(body.message ?? "데이터를 불러오지 못했습니다.");
      setCourses(body.courses);
      setSavedMaterialsByCourse(materialSnapshots(body.courses));
      setBlockedPhones(body.blockedPhones);
      const loadedCourse = body.courses.find((course) => course.id === courseId);
      if (loadedCourse) setSettingsDraft(instagramSettingsDraft(loadedCourse));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "데이터를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    fetch(endpoint, { cache: "no-store" })
      .then(async (response) => ({ response, body: await response.json() as LoadResponse }))
      .then(({ response, body }) => {
        if (!active) return;
        if (!response.ok || !body.courses || !body.blockedPhones) throw new Error(body.message ?? "데이터를 불러오지 못했습니다.");
        setCourses(body.courses);
        setSavedMaterialsByCourse(materialSnapshots(body.courses));
        setBlockedPhones(body.blockedPhones);
        const loadedCourse = body.courses.find((course) => course.id === courseId);
        if (loadedCourse) setSettingsDraft(instagramSettingsDraft(loadedCourse));
      })
      .catch((caught: unknown) => { if (active) setError(caught instanceof Error ? caught.message : "데이터를 불러오지 못했습니다."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [courseId, endpoint]);

  const selectedCourse = courses.find((course) => course.id === courseId);

  async function post(payload: Record<string, unknown>) {
    const response = await fetch("/api/instagram-management", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const body = await response.json() as {
      id?: string;
      setting?: { enabled: boolean; accessToken: string };
      instagramSettings?: { accountUrl: string; totalCount: number };
      material?: CourseDocumentMaterial;
      materials?: CourseDocumentMaterial[];
      planningSheetUrl?: string;
      blockedPhone?: BlockedPhone;
      message?: string;
    };
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

  function updateMaterial(position: number, changes: Partial<Omit<CourseDocumentMaterial, "position" | "documentId">>) {
    if (!selectedCourse) return;
    const nextMaterials = selectedCourse.materials.map((material) => material.position === position ? { ...material, ...changes } : material);
    setCourses((current) => current.map((course) => course.id === selectedCourse.id ? {
      ...course,
      materials: nextMaterials,
    } : course));
    setSettingsDraft((current) => ({
      ...current,
      planningCompletedCount: String(nextMaterials.filter((item) => item.planningCompleted).length),
      filmingCompletedCount: String(nextMaterials.filter((item) => item.filmingCompleted).length),
    }));
  }

  function updateProgress(position: number, field: "planning" | "filming" | "upload", checked: boolean) {
    if (field === "planning") {
      updateMaterial(position, checked
        ? { planningCompleted: true }
        : { planningCompleted: false, filmingCompleted: false, uploadCompleted: false });
      return;
    }
    if (field === "filming") {
      updateMaterial(position, checked
        ? { planningCompleted: true, filmingCompleted: true }
        : { filmingCompleted: false, uploadCompleted: false });
      return;
    }
    updateMaterial(position, checked
      ? { planningCompleted: true, filmingCompleted: true, uploadCompleted: true }
      : { uploadCompleted: false });
  }

  function openUploadDialog(material: CourseDocumentMaterial) {
    const document = material.documentId ? selectedCourse?.documents.find((item) => item.id === material.documentId) : undefined;
    const externalPath = instagramExternalDmPath(document);
    const externalDmUrl = externalPath ? new URL(externalPath, window.location.origin).toString() : "";
    const dmMaterial = instagramDmMaterialValue(material.dmMaterial, document);
    setUploadDraft({
      position: material.position,
      uploadedUrl: material.uploadedUrl,
      dmMaterial: dmMaterial.startsWith("/") ? new URL(dmMaterial, window.location.origin).toString() : dmMaterial,
      externalDmUrl,
    });
  }

  async function saveUploadDetails() {
    if (!selectedCourse || !uploadDraft) return;
    setSavingUpload(true); setError(""); setNotice("");
    try {
      const body = await post({
        action: "save-upload-links",
        courseId: selectedCourse.id,
        position: uploadDraft.position,
        uploadedUrl: uploadDraft.uploadedUrl,
        dmMaterial: uploadDraft.dmMaterial,
      });
      if (!body.material) throw new Error("저장된 업로드 정보를 확인하지 못했습니다.");
      const savedMaterial = body.material;
      const mergeUploadDetails = (material: CourseDocumentMaterial): CourseDocumentMaterial => ({
        ...material,
        uploadedUrl: savedMaterial.uploadedUrl,
        dmMaterial: savedMaterial.dmMaterial,
      });
      setCourses((current) => current.map((course) => course.id === selectedCourse.id ? {
        ...course,
        materials: course.materials.map((material) => material.position === savedMaterial.position ? mergeUploadDetails(material) : material),
      } : course));
      setSavedMaterialsByCourse((current) => ({
        ...current,
        [selectedCourse.id]: (current[selectedCourse.id] ?? []).map((material) => material.position === savedMaterial.position ? mergeUploadDetails(material) : material),
      }));
      setUploadDraft(null);
      setNotice(`${savedMaterial.position}번 콘텐츠의 업로드 정보를 저장했습니다.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "업로드 정보를 저장하지 못했습니다.");
    } finally {
      setSavingUpload(false);
    }
  }

  async function saveInstagramSettings() {
    if (!selectedCourse) return;
    const totalCount = Number(settingsDraft.totalCount);
    const planningCompletedCount = Number(settingsDraft.planningCompletedCount);
    const filmingCompletedCount = Number(settingsDraft.filmingCompletedCount);
    setSavingSettings(true); setError(""); setNotice("");
    try {
      const body = await post({
        action: "save-instagram-settings",
        courseId: selectedCourse.id,
        accountUrl: settingsDraft.accountUrl,
        totalCount,
        planningCompletedCount,
        filmingCompletedCount,
      });
      if (!body.instagramSettings || !body.materials) throw new Error("저장된 인스타그램 진행 설정을 확인하지 못했습니다.");
      const nextMaterials = body.materials;
      setCourses((current) => current.map((course) => course.id === selectedCourse.id ? {
        ...course,
        instagramAccountUrl: body.instagramSettings!.accountUrl,
        instagramTotalCount: body.instagramSettings!.totalCount,
        materials: nextMaterials,
      } : course));
      setSavedMaterialsByCourse((current) => ({
        ...current,
        [selectedCourse.id]: nextMaterials.map((material) => ({ ...material })),
      }));
      setSettingsDraft({
        accountUrl: body.instagramSettings.accountUrl,
        totalCount: String(body.instagramSettings.totalCount),
        planningCompletedCount: String(nextMaterials.filter((item) => item.planningCompleted).length),
        filmingCompletedCount: String(nextMaterials.filter((item) => item.filmingCompleted).length),
      });
      setNotice("인스타그램 진행 설정을 저장했습니다.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "인스타그램 진행 설정을 저장하지 못했습니다.");
    } finally {
      setSavingSettings(false);
    }
  }

  async function saveMaterials() {
    if (!selectedCourse) return;
    const savedMaterials = savedMaterialsByCourse[selectedCourse.id] ?? [];
    const savedByPosition = new Map(savedMaterials.map((material) => [material.position, material]));
    const changedMaterials = selectedCourse.materials.filter((material) => {
      const saved = savedByPosition.get(material.position);
      return materialHasChanges(material, saved);
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
          planningCompleted: material.planningCompleted,
          filmingDate: material.filmingDate,
          filmingCompleted: material.filmingCompleted,
          uploadDate: material.uploadDate,
          uploadCompleted: material.uploadCompleted,
          uploadedUrl: material.uploadedUrl,
          dmMaterial: material.dmMaterial,
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

  // A fresh preview URL avoids reusing the former dashboard preview in messengers.
  const externalUrl = selectedCourse?.externalAccessToken ? `/write/${selectedCourse.externalAccessToken}?preview=instagram` : "";
  const assignedDocumentIds = new Set(selectedCourse?.materials.flatMap((material) => material.documentId ? [material.documentId] : []) ?? []);
  const selectedDocumentsById = new Map(selectedCourse?.documents.map((document) => [document.id, document] as const) ?? []);
  const legacyDocuments = selectedCourse?.documents.filter((document) => !assignedDocumentIds.has(document.id)) ?? [];
  const selectedSavedMaterials = selectedCourse ? savedMaterialsByCourse[selectedCourse.id] ?? [] : [];
  const selectedSavedByPosition = new Map(selectedSavedMaterials.map((material) => [material.position, material]));
  const materialChangeCount = selectedCourse?.materials.filter((material) => {
    const saved = selectedSavedByPosition.get(material.position);
    return materialHasChanges(material, saved);
  }).length ?? 0;
  const progressSummary = selectedCourse
    ? instagramProgressSummary(selectedCourse.materials, selectedCourse.freeWebinarAt)
    : null;
  const settingsNumbers = {
    totalCount: Number(settingsDraft.totalCount),
    planningCompletedCount: Number(settingsDraft.planningCompletedCount),
    filmingCompletedCount: Number(settingsDraft.filmingCompletedCount),
  };
  const settingsValid = Object.values(settingsNumbers).every((value) => Number.isInteger(value) && value >= 0 && value <= 500)
    && settingsNumbers.filmingCompletedCount <= settingsNumbers.planningCompletedCount
    && settingsNumbers.planningCompletedCount <= settingsNumbers.totalCount;
  return (
    <TooltipProvider delayDuration={300}>
    <div className="space-y-6">
      {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
      {notice ? <Alert><AlertDescription className="flex items-center gap-2"><Check className="size-4 text-emerald-600" />{notice}</AlertDescription></Alert> : null}
      {loading ? <div className="flex min-h-80 items-center justify-center gap-2 rounded-xl border border-dashed text-muted-foreground"><Loader2 className="animate-spin" />불러오는 중</div> : (
        <>
          {!courseId && <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" asChild><Link href="/services/instagram-management/leads"><Users />리드 보기</Link></Button>
            <Button variant="outline" onClick={() => setBlockedDialogOpen(true)}><Ban />차단 전화번호</Button>
          </div>}
            {!courseId ? <div className="space-y-4">{[
              { status: "ongoing", label: "진행중" }, { status: "on_hold", label: "보류" },
              { status: "completed", label: "종료" }, { status: "canceled", label: "취소" },
            ].map(group => {
              const items = courses.filter(course => group.status === "ongoing" ? !["on_hold", "completed", "canceled"].includes(course.status ?? "") : course.status === group.status);
              return <details key={group.status} open={group.status === "ongoing"} className="group rounded-lg border">
                <summary className="cursor-pointer px-4 py-3 font-medium">{group.label} <span className="ml-2 text-sm text-muted-foreground">{items.length}</span></summary>
                <Table><TableHeader><TableRow><TableHead>강의</TableHead><TableHead>강사</TableHead><TableHead>기수</TableHead><TableHead>웨비나 날짜</TableHead><TableHead>작성 자료</TableHead><TableHead>외부 작성</TableHead></TableRow></TableHeader><TableBody>{items.map(course => <TableRow key={course.id}><TableCell><Link className="font-medium hover:underline" href={`/services/instagram-management/${course.id}`}>{course.name}</Link></TableCell><TableCell>{course.instructorName || "—"}</TableCell><TableCell>{course.cohort || "—"}</TableCell><TableCell><time dateTime={course.freeWebinarAt || undefined}>{formatWebinarDate(course.freeWebinarAt)}</time></TableCell><TableCell>{course.documents.length}</TableCell><TableCell>{course.externalEditEnabled ? "외부 작성 허용" : "비활성화"}</TableCell></TableRow>)}</TableBody></Table>
                {!items.length && <p className="p-5 text-sm text-muted-foreground">해당 상태의 강의가 없습니다.</p>}
              </details>;
            })}</div> : selectedCourse ? <div className="space-y-5">
                <h1 className="text-2xl font-semibold">{instagramCourseOptionLabel(selectedCourse)}</h1>
                <Card>
                  <CardHeader><CardTitle>강의 진행 설정</CardTitle></CardHeader>
                  <CardContent>
                    <form className="grid gap-4 md:grid-cols-2 xl:grid-cols-[minmax(20rem,2fr)_repeat(3,minmax(8rem,1fr))_auto]" onSubmit={(event) => { event.preventDefault(); void saveInstagramSettings(); }}>
                      <div className="space-y-2">
                        <Label htmlFor="instagram-account-url">업로드 중인 계정 링크</Label>
                        <Input id="instagram-account-url" type="url" maxLength={2048} placeholder="https://www.instagram.com/..." value={settingsDraft.accountUrl} disabled={savingSettings} onChange={(event) => setSettingsDraft((current) => ({ ...current, accountUrl: event.target.value }))} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="instagram-total-count">전체 진행 건수</Label>
                        <Input id="instagram-total-count" type="number" min={0} max={500} value={settingsDraft.totalCount} disabled={savingSettings} onChange={(event) => setSettingsDraft((current) => ({ ...current, totalCount: event.target.value }))} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="instagram-planning-count">기획 완료 건수</Label>
                        <Input id="instagram-planning-count" type="number" min={0} max={500} value={settingsDraft.planningCompletedCount} disabled={savingSettings} onChange={(event) => setSettingsDraft((current) => ({ ...current, planningCompletedCount: event.target.value }))} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="instagram-filming-count">촬영 완료 건수</Label>
                        <Input id="instagram-filming-count" type="number" min={0} max={500} value={settingsDraft.filmingCompletedCount} disabled={savingSettings} onChange={(event) => setSettingsDraft((current) => ({ ...current, filmingCompletedCount: event.target.value }))} />
                      </div>
                      <Button className="self-end" type="submit" disabled={savingSettings || !settingsValid || materialChangeCount > 0}>
                        {savingSettings ? <Loader2 className="animate-spin" /> : <Save />}
                        설정 저장
                      </Button>
                    </form>
                    <p className="mt-3 text-sm text-muted-foreground">완료 건수를 바꾸면 현재 완료 항목을 우선 유지하고 앞 번호부터 자동으로 맞춥니다. 저장된 내용이 있는 마지막 번호보다 전체 건수를 작게 줄일 수 없습니다. 표에 저장하지 않은 변경이 있으면 표를 먼저 저장해 주세요.</p>
                    {selectedCourse.instagramAccountUrl ? <Button className="mt-3" variant="outline" size="sm" asChild><a href={selectedCourse.instagramAccountUrl} target="_blank" rel="noopener noreferrer"><ExternalLink />계정 열기</a></Button> : null}
                  </CardContent>
                </Card>
                {progressSummary ? <section className="space-y-3">
                  <h2 className="text-xl font-semibold">진행 요약</h2>
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
                    {[
                      { label: "전체 진행", value: `${progressSummary.totalCount}건`, detail: "100%" },
                      { label: "기획 완료", value: `${progressSummary.planningCompletedCount}건`, detail: `${progressPercentage(progressSummary.planningCompletedCount, progressSummary.totalCount)}%` },
                      { label: "촬영 완료", value: `${progressSummary.filmingCompletedCount}건`, detail: `${progressPercentage(progressSummary.filmingCompletedCount, progressSummary.totalCount)}%` },
                      { label: "업로드 완료", value: `${progressSummary.uploadCompletedCount}건`, detail: `${progressPercentage(progressSummary.uploadCompletedCount, progressSummary.totalCount)}%` },
                      { label: "남은 업로드", value: `${progressSummary.remainingUploadCount}건`, detail: progressSummary.deadlineDateKey ? `${progressSummary.deadlineDateKey}까지` : "웨비나 날짜 없음" },
                      { label: "남은 업로드 평일", value: progressSummary.remainingWeekdays === null ? "-" : `${progressSummary.remainingWeekdays}일`, detail: "웨비나 전날까지" },
                    ].map((item) => <Card key={item.label}><CardContent className="space-y-1 pt-5"><p className="text-sm text-muted-foreground">{item.label}</p><p className="text-2xl font-semibold">{item.value}</p><p className="text-xs text-muted-foreground">{item.detail}</p></CardContent></Card>)}
                  </div>
                  {progressSummary.isAtRisk ? <Alert variant="destructive"><AlertTriangle /><AlertDescription>남은 평일 {progressSummary.remainingWeekdays}일보다 업로드 {progressSummary.remainingUploadCount}건이 많습니다. 이대로 올리면 기획된 콘텐츠를 모두 올리지 못할 수도 있습니다.</AlertDescription></Alert> : null}
                </section> : null}
                <div className="space-y-3">
                    <div className="flex justify-end xl:col-start-2 xl:row-start-1">
                      <Badge variant={selectedCourse.externalEditEnabled ? "default" : "secondary"}>{selectedCourse.externalEditEnabled ? "외부 작성 허용" : "비활성화"}</Badge>
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
                </div>
                <div className="overflow-x-auto rounded-lg border"><Table className="min-w-[1840px]"><TableHeader className="sticky top-0 z-10 bg-background"><TableRow className="hover:bg-background"><TableHead className="w-16 text-center">번호</TableHead><TableHead className="w-32 text-center">기획번호</TableHead><TableHead className="min-w-64">제목</TableHead><TableHead className="w-24 text-center">기획 완료</TableHead><TableHead className="w-24 text-center">촬영 완료</TableHead><TableHead className="w-40">촬영 일정</TableHead><TableHead className="w-24 text-center">업로드 완료</TableHead><TableHead className="w-40">업로드 일정</TableHead><TableHead className="w-28 text-center">링크</TableHead><TableHead className="w-28 text-center">DM 자료</TableHead><TableHead className="w-28 text-center">업로드</TableHead><TableHead className="w-28">작성 상태</TableHead><TableHead className="w-24">공개 상태</TableHead><TableHead className="w-32 text-right">작업</TableHead></TableRow></TableHeader><TableBody>{selectedCourse.materials.map((material) => {
                  const document = material.documentId ? selectedDocumentsById.get(material.documentId) : undefined;
                  const displayedDmMaterial = instagramDmMaterialValue(material.dmMaterial, document);
                  const dmMaterialHref = instagramDmMaterialHref(displayedDmMaterial);
                  return <TableRow key={material.position}>
                    <TableCell className="text-center font-mono text-sm text-muted-foreground">{String(material.position).padStart(2, "0")}</TableCell>
                    <TableCell><Input className="mx-auto w-20 text-center font-mono" aria-label={`${material.position}번 기획번호`} value={material.referencePlanningNumber} inputMode="numeric" maxLength={2} placeholder="00" disabled={savingMaterials} onChange={(event) => updateMaterial(material.position, { referencePlanningNumber: event.target.value.replace(/\D/g, "").slice(0, 2) })} /></TableCell>
                    <TableCell><Input aria-label={`${material.position}번 자료 제목`} value={material.title} maxLength={200} placeholder="강사가 작성할 글의 제목" disabled={savingMaterials} onChange={(event) => updateMaterial(material.position, { title: event.target.value })} /></TableCell>
                    <TableCell><div className="flex justify-center"><Checkbox aria-label={`${material.position}번 기획 완료`} checked={material.planningCompleted} disabled={savingMaterials} onCheckedChange={(checked) => updateProgress(material.position, "planning", checked === true)} /></div></TableCell>
                    <TableCell><div className="flex justify-center"><Checkbox aria-label={`${material.position}번 촬영 완료`} checked={material.filmingCompleted} disabled={savingMaterials} onCheckedChange={(checked) => updateProgress(material.position, "filming", checked === true)} /></div></TableCell>
                    <TableCell><Input type="date" aria-label={`${material.position}번 촬영 일정`} value={material.filmingDate} disabled={savingMaterials} onChange={(event) => updateMaterial(material.position, { filmingDate: event.target.value })} /></TableCell>
                    <TableCell><div className="flex justify-center"><Checkbox aria-label={`${material.position}번 업로드 완료`} checked={material.uploadCompleted} disabled={savingMaterials || !material.filmingCompleted} onCheckedChange={(checked) => updateProgress(material.position, "upload", checked === true)} /></div></TableCell>
                    <TableCell><Input type="date" aria-label={`${material.position}번 업로드 일정`} value={material.uploadDate} disabled={savingMaterials} onChange={(event) => updateMaterial(material.position, { uploadDate: event.target.value })} /></TableCell>
                    <TableCell className="text-center">{material.uploadedUrl ? <Button type="button" size="sm" variant="outline" asChild><a href={material.uploadedUrl} target="_blank" rel="noopener noreferrer"><ExternalLink />바로가기</a></Button> : <span className="text-muted-foreground">-</span>}</TableCell>
                    <TableCell className="text-center">{dmMaterialHref ? <Button type="button" size="sm" variant="outline" asChild><a href={dmMaterialHref} target="_blank" rel="noopener noreferrer"><ExternalLink />바로가기</a></Button> : <span className="text-muted-foreground">-</span>}</TableCell>
                    <TableCell><div className="flex justify-center"><Button type="button" size="sm" variant="outline" disabled={savingMaterials || savingUpload} onClick={() => openUploadDialog(material)}><Upload />업로드</Button></div></TableCell>
                    <TableCell>{document ? <StatusBadge label="작성됨" color="blue" /> : <StatusBadge label="미작성" color="yellow" />}</TableCell>
                    <TableCell>{document ? <StatusBadge label={document.status === "published" ? "공개" : "비공개"} color={document.status === "published" ? "blue" : "yellow"} /> : <span className="text-sm text-muted-foreground">-</span>}</TableCell>
                    <TableCell><div className="flex justify-end gap-1">{document ? <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon-sm" aria-label="문서 수정 및 리드게이트 설정" disabled={savingMaterials} onClick={() => router.push(`/services/instagram-management/documents/${document.id}`)}><Pencil /></Button></TooltipTrigger><TooltipContent>문서 수정 및 리드게이트 설정</TooltipContent></Tooltip> : null}{document?.status === "published" ? <Button variant="ghost" size="icon-sm" asChild><a aria-label={`${material.position}번 공개 글 열기`} href={`/article/${document.slug}`} target="_blank" rel="noopener noreferrer"><ExternalLink /></a></Button> : null}{document ? <Button variant="ghost" size="icon-sm" aria-label={`${material.position}번 글 삭제`} disabled={busy || savingMaterials} onClick={() => void deleteDocument(document.id)}><Trash2 /></Button> : null}</div></TableCell>
                  </TableRow>;
                })}</TableBody></Table>{!selectedCourse.materials.length ? <div className="flex min-h-32 items-center justify-center text-sm text-muted-foreground">전체 진행 건수를 입력하고 설정을 저장해 주세요.</div> : null}</div>
                {legacyDocuments.length ? <Card><CardHeader><CardTitle>이전 방식 미연결 글 {legacyDocuments.length}</CardTitle></CardHeader><CardContent><Table><TableHeader><TableRow><TableHead>제목</TableHead><TableHead>상태</TableHead><TableHead>수정일</TableHead><TableHead className="text-right">작업</TableHead></TableRow></TableHeader><TableBody>{legacyDocuments.map((document) => <TableRow key={document.id}><TableCell className="font-medium">{document.title}</TableCell><TableCell><Badge variant={document.status === "published" ? "default" : "secondary"}>{document.status === "published" ? "공개" : "비공개"}</Badge></TableCell><TableCell className="text-muted-foreground">{dateTime(document.updatedAt)}</TableCell><TableCell><div className="flex justify-end gap-1"><Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon-sm" aria-label="문서 수정 및 리드게이트 설정" onClick={() => router.push(`/services/instagram-management/documents/${document.id}`)}><Pencil /></Button></TooltipTrigger><TooltipContent>문서 수정 및 리드게이트 설정</TooltipContent></Tooltip>{document.status === "published" ? <Button variant="ghost" size="icon-sm" asChild><a aria-label="이전 공개 글 열기" href={`/article/${document.slug}`} target="_blank" rel="noopener noreferrer"><ExternalLink /></a></Button> : null}<Button variant="ghost" size="icon-sm" aria-label="이전 글 삭제" disabled={busy} onClick={() => void deleteDocument(document.id)}><Trash2 /></Button></div></TableCell></TableRow>)}</TableBody></Table></CardContent></Card> : null}
              </div> : <Card><CardContent className="flex min-h-80 items-center justify-center text-muted-foreground">강의를 찾을 수 없습니다.</CardContent></Card>}
        </>
      )}
      <Dialog open={uploadDraft !== null} onOpenChange={(open) => { if (!open && !savingUpload) setUploadDraft(null); }}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>업로드 정보</DialogTitle>
            <DialogDescription className="sr-only">선택한 인스타그램 콘텐츠 링크와 DM 자료 링크를 저장합니다.</DialogDescription>
          </DialogHeader>
          {uploadDraft ? <form className="space-y-5" onSubmit={(event) => { event.preventDefault(); void saveUploadDetails(); }}>
            <div className="space-y-2">
              <Label htmlFor="instagram-uploaded-url">업로드 콘텐츠 링크</Label>
              <Input id="instagram-uploaded-url" type="url" maxLength={2048} placeholder="https://www.instagram.com/..." value={uploadDraft.uploadedUrl} disabled={savingUpload} onChange={(event) => setUploadDraft((current) => current ? { ...current, uploadedUrl: event.target.value } : current)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="instagram-dm-material">DM 자료 링크</Label>
              <Input id="instagram-dm-material" type="url" maxLength={2048} placeholder="https://..." value={uploadDraft.dmMaterial} disabled={savingUpload} onChange={(event) => setUploadDraft((current) => current ? { ...current, dmMaterial: event.target.value } : current)} />
              {uploadDraft.externalDmUrl && uploadDraft.dmMaterial === uploadDraft.externalDmUrl ? <p className="text-xs text-muted-foreground">외부에서 작성된 공개 링크를 자동으로 입력했습니다.</p> : null}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" disabled={savingUpload} onClick={() => setUploadDraft(null)}>취소</Button>
              <Button type="submit" disabled={savingUpload}>{savingUpload ? <Loader2 className="animate-spin" /> : <Save />}저장</Button>
            </DialogFooter>
          </form> : null}
        </DialogContent>
      </Dialog>
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
