"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { ExternalLink, Loader2, Pencil, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { externalMarketingPublicInfoSchema, type ExternalMarketingPublicInfo } from "@/lib/external-marketing/model";
import { ExternalMarketingProjectFields } from "./project-fields";
import { ExternalMarketingSaveToast } from "./save-toast";

export function PublicExternalMarketingProjectInfo({ initialInfo, token, startDate }: {
  initialInfo: ExternalMarketingPublicInfo; token: string; startDate: string;
}) {
  const router = useRouter();
  const [info, setInfo] = useState(initialInfo);
  const [draft, setDraft] = useState<ExternalMarketingPublicInfo>(initialInfo);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function save(event: FormEvent) {
    event.preventDefault();
    setError("");
    setNotice("");
    const parsed = externalMarketingPublicInfoSchema.safeParse({ courseName: draft.courseName, instructorName: draft.instructorName,
      affiliateName: draft.affiliateName, projectManager: draft.projectManager, cohort: draft.cohort,
      webinarDate: draft.webinarDate, creativeDriveUrl: draft.creativeDriveUrl, landingPages: draft.landingPages });
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요."); return; }
    setSaving(true);
    try {
      const response = await fetch(`/api/public/external-marketing/report/${token}/info`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(parsed.data),
      });
      const result = await response.json() as { info?: ExternalMarketingPublicInfo; message?: string };
      if (!response.ok || !result.info) throw new Error(result.message || "정보를 저장하지 못했습니다.");
      setInfo(result.info);
      setOpen(false);
      setNotice("강의 정보를 저장했습니다.");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "정보를 저장하지 못했습니다.");
    } finally { setSaving(false); }
  }

  return <>
    <Card className="mt-6"><CardContent className="pt-6">
      <div className="mb-4 flex justify-end"><Button variant="outline" size="sm" onClick={() => { setDraft(info); setError(""); setOpen(true); }}><Pencil />수정</Button></div>
      <div className="grid gap-4 sm:grid-cols-3 xl:grid-cols-6">
        <div><p className="text-xs text-muted-foreground">강의명</p><p className="mt-1 break-words font-medium">{info.courseName || "—"}</p></div>
        <div><p className="text-xs text-muted-foreground">강사명</p><p className="mt-1 font-medium">{info.instructorName || "—"}</p></div>
        <div><p className="text-xs text-muted-foreground">관계사</p><p className="mt-1 font-medium">{info.affiliateName || "—"}</p></div>
        <div><p className="text-xs text-muted-foreground">담당PM</p><p className="mt-1 font-medium">{info.projectManager || "—"}</p></div>
        <div><p className="text-xs text-muted-foreground">기수</p><p className="mt-1 font-medium">{info.cohort || "—"}</p></div>
        <div><p className="text-xs text-muted-foreground">웨비나 날짜</p><p className="mt-1 font-medium tabular-nums">{info.webinarDate || "미입력"}</p></div>
        <div><p className="text-xs text-muted-foreground">광고 시작일</p><p className="mt-1 font-medium tabular-nums">{startDate}</p></div>
        <div className="sm:col-span-2"><p className="text-xs text-muted-foreground">광고소재 드라이브</p>{info.creativeDriveUrl ? <Link href={info.creativeDriveUrl} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 font-medium text-primary hover:underline">드라이브 열기<ExternalLink className="size-3.5" /></Link> : <p className="mt-1 font-medium">—</p>}</div>
        <div className="sm:col-span-3 xl:col-span-6"><p className="text-xs text-muted-foreground">채널별 랜딩페이지</p><div className="mt-2 flex flex-wrap gap-2">{info.landingPages.length ? info.landingPages.map((page, index) => <Button key={`${page.channel}-${index}`} variant="outline" size="sm" asChild><Link href={page.url} target="_blank" rel="noopener noreferrer">{page.channel}<ExternalLink /></Link></Button>) : <span className="text-sm">—</span>}</div></div>
      </div>
    </CardContent></Card>
    <Dialog open={open} onOpenChange={(value) => { if (!saving) setOpen(value); }}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl"><DialogHeader><DialogTitle>강의 정보 수정</DialogTitle></DialogHeader>
      <form className="grid gap-5" onSubmit={save}>
        <ExternalMarketingProjectFields value={draft} onChange={setDraft} disabled={saving} />
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        <DialogFooter><DialogClose asChild><Button type="button" variant="outline" disabled={saving}>취소</Button></DialogClose><Button type="submit" disabled={saving}>{saving ? <Loader2 className="animate-spin" /> : <Save />}저장</Button></DialogFooter>
      </form>
    </DialogContent></Dialog>
    <ExternalMarketingSaveToast message={notice} onDismiss={setNotice} />
  </>;
}
