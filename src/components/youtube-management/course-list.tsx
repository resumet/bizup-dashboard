"use client";

import { useMemo, useState, type CSSProperties } from "react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { distinctChipColors } from "@/lib/chip-colors";
import { formatWebinarDate } from "@/lib/course-operations/webinar-proximity";
import { groupYoutubeCourses, orderedChannelChips, YOUTUBE_COURSE_GROUPS, type AppearanceChannel } from "@/lib/youtube-management/course-list";
import type { YoutubeFilmingAlert } from "@/lib/youtube-management/filming-alert";
import type { CourseMedia } from "@/lib/youtube-management/model";
import type { YoutubeFilmingAlertWeeks } from "@/lib/youtube-management/settings";

type YoutubeCourse = CourseMedia & {
  appearanceNotRequired: boolean;
  appearanceChannels: AppearanceChannel[];
  appearanceCount: number;
  confirmedAppearanceCount: number;
  uploadCompletedCount: number;
  filmingAlert: YoutubeFilmingAlert;
};

export function YoutubeCourseList({ courses, filmingAlertWeeks, embedded = false }: { courses: YoutubeCourse[]; filmingAlertWeeks: YoutubeFilmingAlertWeeks; embedded?: boolean }) {
  const [search, setSearch] = useState("");
  const visible = courses.filter((course) =>
    `${course.name} ${course.instructor_name} ${course.cohort}`.toLowerCase().includes(search.toLowerCase()),
  );
  const grouped = groupYoutubeCourses(visible);
  const channelColors = useMemo(() => distinctChipColors(courses.flatMap(course =>
    course.appearanceChannels.map(channel => channel.name.trim()).filter(Boolean))), [courses]);
  const totalAlertCount = courses.reduce((total, course) => total + course.filmingAlert.alertCount, 0);
  const affectedCourseCount = courses.filter((course) => course.filmingAlert.alertCount > 0).length;

  return <div className={embedded ? "space-y-6" : "w-full space-y-6 px-5 py-8 lg:px-8"}>
    {!embedded ? <Link href="/work" className="text-sm hover:underline">← 운영 워크스페이스</Link> : null}
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-2xl font-semibold">강사 출연 유튜브 관리</h1>
    </div>
    <section aria-label="촬영 일정 미확정 요약" className="grid gap-3 sm:grid-cols-3">
      <div className="rounded-lg border bg-card p-4">
        <p className="text-sm text-muted-foreground">촬영 일정 미확정</p>
        <p className={totalAlertCount > 0 ? "mt-1 text-2xl font-semibold text-destructive" : "mt-1 text-2xl font-semibold"}>{totalAlertCount}건</p>
      </div>
      <div className="rounded-lg border bg-card p-4">
        <p className="text-sm text-muted-foreground">확인 필요 강의</p>
        <p className="mt-1 text-2xl font-semibold">{affectedCourseCount}개</p>
      </div>
      <div className="rounded-lg border bg-card p-4">
        <p className="text-sm text-muted-foreground">알림 기준</p>
        <p className="mt-1 text-lg font-semibold">무료강의 {filmingAlertWeeks}주 전</p>
      </div>
    </section>
    <Input aria-label="강의 검색" placeholder="강의명, 강사명, 기수 검색" value={search} onChange={(event) => setSearch(event.target.value)} />
    <div className="space-y-4">{YOUTUBE_COURSE_GROUPS.map((group) => {
      const items = grouped[group.key];
      return <details key={group.key} open={group.defaultOpen} className="group rounded-lg border">
        <summary className="cursor-pointer px-4 py-3 font-medium">{group.label}<span className="ml-2 text-sm text-muted-foreground">{items.length}</span></summary>
        {items.length ? <div className="w-full overflow-x-auto"><Table className="min-w-[1280px] w-full">
          <TableHeader><TableRow>
            <TableHead>강의</TableHead><TableHead>강사</TableHead><TableHead>기수</TableHead><TableHead>웨비나 날짜</TableHead>
            <TableHead>출연 채널</TableHead><TableHead>확정 채널</TableHead><TableHead className="text-right">업로드 완료</TableHead><TableHead className="text-right">촬영 일정 미확정</TableHead>
          </TableRow></TableHeader>
          <TableBody>{items.map((course) => <TableRow key={course.id}>
            <TableCell><Link className="font-medium hover:underline" href={`/services/youtube-management/${course.id}`}>{course.name}</Link></TableCell>
            <TableCell>{course.instructor_name || "—"}</TableCell><TableCell>{course.cohort || "—"}</TableCell>
            <TableCell><time dateTime={course.free_webinar_at || undefined}>{formatWebinarDate(course.free_webinar_at)}</time></TableCell>
            <TableCell><ChannelChips channels={course.appearanceChannels} colors={channelColors} disabled={course.appearanceNotRequired} /></TableCell>
            <TableCell><ChannelChips channels={course.appearanceChannels.filter((channel) => channel.confirmed)} colors={channelColors} disabled={course.appearanceNotRequired} emptyLabel="미확정" /></TableCell>
            <TableCell className="text-right">{course.appearanceNotRequired ? "-" : `${course.uploadCompletedCount}개`}</TableCell>
            <TableCell className="text-right">{course.filmingAlert.deadlineReached
              ? course.filmingAlert.alertCount > 0
                ? <Badge variant="destructive">{course.filmingAlert.alertCount}건</Badge>
                : "0건"
              : "—"}</TableCell>
          </TableRow>)}</TableBody>
        </Table></div> : <p className="p-5 text-sm text-muted-foreground">해당 상태의 강의가 없습니다.</p>}
      </details>;
    })}</div>
  </div>;
}

function ChannelChips({ channels, colors, disabled, emptyLabel = "-" }: { channels: AppearanceChannel[]; colors: Map<string, CSSProperties>; disabled: boolean; emptyLabel?: string }) {
  if (disabled) return <span className="text-muted-foreground">진행하지 않음</span>;
  const chips = orderedChannelChips(channels);
  if (!chips.length) return <span className="text-muted-foreground">{emptyLabel}</span>;
  return <div className="flex min-w-44 flex-wrap gap-1.5">{chips.map(({ name, href, declined }) => {
    const label = <>{name}{declined && <span className="sr-only"> (출연 불가)</span>}</>;
    return <Badge key={href || name} asChild={Boolean(href)} variant="outline" className="max-w-44 truncate font-medium"
      style={declined ? { backgroundColor: "#f3f4f6", borderColor: "#d1d5db", color: "#4b5563", textDecoration: "line-through" } : colors.get(name)}
      title={declined ? `${name} · 출연 불가` : name}>
      {href ? <a href={href} target="_blank" rel="noopener noreferrer">{label}<span className="sr-only"> (새 탭에서 열기)</span></a> : label}
    </Badge>;
  })}</div>;
}
