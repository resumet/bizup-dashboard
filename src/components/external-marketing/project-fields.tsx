import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ExternalMarketingInfo } from "@/lib/external-marketing/model";

export function ExternalMarketingProjectFields({ value, onChange, disabled = false, showWebinarDate = true }: {
  value: ExternalMarketingInfo;
  onChange: (value: ExternalMarketingInfo) => void;
  disabled?: boolean;
  showWebinarDate?: boolean;
}) {
  function patch(next: Partial<ExternalMarketingInfo>) {
    onChange({ ...value, ...next });
  }
  return <div className="grid gap-5">
    <div className="grid gap-4 sm:grid-cols-3">
      <div className="grid gap-2 sm:col-span-2"><Label htmlFor="external-course-name">강의명</Label><Input id="external-course-name" value={value.courseName} maxLength={200} disabled={disabled} onChange={(event) => patch({ courseName: event.target.value })} /></div>
      <div className="grid gap-2"><Label htmlFor="external-cohort">기수</Label><Input id="external-cohort" value={value.cohort} maxLength={80} disabled={disabled} onChange={(event) => patch({ cohort: event.target.value })} /></div>
    </div>
    <div className="grid gap-4 sm:grid-cols-3">
      <div className="grid gap-2"><Label htmlFor="external-instructor-name">강사명</Label><Input id="external-instructor-name" value={value.instructorName} maxLength={120} disabled={disabled} onChange={(event) => patch({ instructorName: event.target.value })} /></div>
      <div className="grid gap-2"><Label htmlFor="external-affiliate-name">관계사</Label><Input id="external-affiliate-name" value={value.affiliateName} maxLength={120} disabled={disabled} onChange={(event) => patch({ affiliateName: event.target.value })} /></div>
      <div className="grid gap-2"><Label htmlFor="external-project-manager">담당PM</Label><Input id="external-project-manager" value={value.projectManager} maxLength={120} disabled={disabled} onChange={(event) => patch({ projectManager: event.target.value })} /></div>
    </div>
    {showWebinarDate ? <div className="grid gap-2"><Label htmlFor="external-webinar-date">웨비나 날짜</Label><Input id="external-webinar-date" type="date" value={value.webinarDate} disabled={disabled} onChange={(event) => patch({ webinarDate: event.target.value })} /></div> : null}
    <fieldset className="grid gap-3"><div className="flex items-center justify-between gap-3"><legend className="text-sm font-medium">채널별 랜딩페이지</legend><Button type="button" size="sm" variant="outline" disabled={disabled || value.landingPages.length >= 20} onClick={() => patch({ landingPages: [...value.landingPages, { channel: "", url: "" }] })}><Plus />채널 추가</Button></div>
      {value.landingPages.length ? <div className="grid gap-2">{value.landingPages.map((page, index) => <div key={index} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[minmax(8rem,0.35fr)_1fr_auto]">
        <Input aria-label={`랜딩페이지 ${index + 1} 채널명`} placeholder="예: Google" value={page.channel} maxLength={80} disabled={disabled} onChange={(event) => patch({ landingPages: value.landingPages.map((item, itemIndex) => itemIndex === index ? { ...item, channel: event.target.value } : item) })} />
        <Input aria-label={`랜딩페이지 ${index + 1} 주소`} placeholder="https://" type="url" value={page.url} maxLength={2048} disabled={disabled} onChange={(event) => patch({ landingPages: value.landingPages.map((item, itemIndex) => itemIndex === index ? { ...item, url: event.target.value } : item) })} />
        <Button type="button" size="icon" variant="ghost" disabled={disabled} aria-label={`랜딩페이지 ${index + 1} 삭제`} onClick={() => patch({ landingPages: value.landingPages.filter((_, itemIndex) => itemIndex !== index) })}><Trash2 /></Button>
      </div>)}</div> : <p className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground">채널 추가를 눌러 랜딩페이지를 입력해 주세요.</p>}
    </fieldset>
    <div className="grid gap-2"><Label htmlFor="external-creative-drive">광고소재 드라이브 주소</Label><Input id="external-creative-drive" type="url" placeholder="https://drive.google.com/..." value={value.creativeDriveUrl} maxLength={2048} disabled={disabled} onChange={(event) => patch({ creativeDriveUrl: event.target.value })} /></div>
    <div className="grid gap-2"><Label htmlFor="external-previous-creative-notion">이전 기수 광고소재 정리 링크</Label><Input id="external-previous-creative-notion" type="url" placeholder="https://app.notion.com/p/..." value={value.previousCohortCreativeNotionUrl} maxLength={2048} disabled={disabled} onChange={(event) => patch({ previousCohortCreativeNotionUrl: event.target.value })} /><p className="text-sm text-muted-foreground">이전 기수의 광고소재가 정리된 노션 페이지 주소를 입력해 주세요.</p></div>
  </div>;
}
