import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { externalMarketingWbs, formatWbsCountdown } from "@/lib/external-marketing/wbs";
import { getWebinarDayDifference } from "@/lib/course-operations/webinar-proximity";

export function ExternalMarketingWbs({ webinarDate, today }: { webinarDate: string; today: string }) {
  const milestones = externalMarketingWbs(webinarDate, today).sort((a, b) =>
    Math.abs(a.daysLeft ?? Number.MAX_SAFE_INTEGER) - Math.abs(b.daysLeft ?? Number.MAX_SAFE_INTEGER)
    || a.dueDate.localeCompare(b.dueDate));
  const webinarDays = milestones.some((milestone) => milestone.dueDate) ? getWebinarDayDifference(webinarDate, today) : null;
  const webinarCountdown = webinarDays === null ? "미입력" : webinarDays === 0 ? "D-Day" : webinarDays > 0 ? `D-${webinarDays}` : `D+${Math.abs(webinarDays)}`;
  const overdueStyle = "bg-neutral-100 hover:bg-neutral-100 dark:bg-neutral-800 dark:hover:bg-neutral-800";
  return <Card><CardHeader><CardTitle>WBS</CardTitle></CardHeader><CardContent>
    {!webinarDate ? <p className="mb-4 text-sm text-muted-foreground">사전설정 또는 외부 입력 주소에서 웨비나 날짜를 입력하면 일정이 자동 계산됩니다.</p> : null}
    <Table aria-label="외부마케팅대행 WBS"><TableHeader><TableRow>
      <TableHead>업무</TableHead><TableHead>계산 기준</TableHead><TableHead>예정일</TableHead><TableHead>남은 날짜</TableHead>
    </TableRow></TableHeader><TableBody>{milestones.map((milestone) => <TableRow key={milestone.key} className={milestone.key === "creative" ? "bg-yellow-100 hover:bg-yellow-100 dark:bg-yellow-950 dark:hover:bg-yellow-950" : milestone.daysLeft !== null && milestone.daysLeft < 0 ? overdueStyle : ""}>
      <TableCell className="font-medium">{milestone.label}</TableCell><TableCell>{milestone.basis}</TableCell>
      <TableCell className="tabular-nums">{milestone.dueDate || "미입력"}</TableCell>
      <TableCell className={`font-medium tabular-nums ${milestone.daysLeft !== null && milestone.daysLeft < 0 ? "text-destructive" : ""}`}>{formatWbsCountdown(milestone.daysLeft)}</TableCell>
    </TableRow>)}
      <TableRow className={webinarDays !== null && webinarDays < 0 ? overdueStyle : ""}>
        <TableCell className="font-medium">웨비나 날짜</TableCell><TableCell>D-Day</TableCell>
        <TableCell className="tabular-nums">{webinarDate || "미입력"}</TableCell><TableCell className="font-semibold tabular-nums">{webinarCountdown}</TableCell>
      </TableRow>
    </TableBody></Table>
  </CardContent></Card>;
}
