import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatEventTime } from "@/lib/shared-calendar/calendar";
import { loadCalendarEvents } from "@/lib/shared-calendar/server";
import type { SupabaseClient } from "@supabase/supabase-js";

export async function CourseCalendarSection({ supabase, workspaceId, courseId }: { supabase: SupabaseClient; workspaceId: string; courseId: string }) {
  const result = await loadCalendarEvents(supabase, workspaceId, { courseId }).then(
    (events) => ({ events, error: "" }),
    () => ({ events: [], error: "연결된 일정을 불러오지 못했습니다. 페이지를 새로고침해 주세요." }),
  );
  return <Card className="mt-6">
    <CardHeader className="flex items-center justify-between gap-3"><CardTitle><h2>공용캘린더 일정</h2></CardTitle><Button asChild variant="outline" size="sm"><Link href={`/calendar?courseId=${courseId}`}>일정 등록</Link></Button></CardHeader>
    <CardContent>
      {result.error ? <p role="alert" className="text-sm text-destructive">{result.error}</p> : result.events.length ? <ul className="divide-y">{result.events.map((event) => <li key={event.id} className="space-y-1 py-3 first:pt-0 last:pb-0">
        <p className="font-medium">{event.title}</p>
        <p className="text-sm text-muted-foreground">{event.event_date.replaceAll("-", ".")} · {formatEventTime(event.start_minutes, event.duration_minutes)} · {event.meeting_type.name}</p>
        {event.notes ? <p className="whitespace-pre-wrap break-words text-sm">{event.notes}</p> : null}
      </li>)}</ul> : <p className="text-sm text-muted-foreground">연결된 일정이 없습니다. 공용캘린더에서 강사 줌미팅에 이 강의를 연결해 주세요.</p>}
    </CardContent>
  </Card>;
}
