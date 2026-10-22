import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { externalMarketingWbs, formatWbsCountdown } from "@/lib/external-marketing/wbs";
import { getWebinarDayDifference } from "@/lib/course-operations/webinar-proximity";

export function ExternalMarketingWbs({ webinarDate, today }: { webinarDate: string; today: string }) {
  const milestones = externalMarketingWbs(webinarDate, today).sort((a, b) => {
    if (!a.dueDate) return b.dueDate ? 1 : 0;
    if (!b.dueDate) return -1;
    return a.dueDate.localeCompare(b.dueDate);
  });
  const webinarDays = milestones.some((milestone) => milestone.dueDate) ? getWebinarDayDifference(webinarDate, today) : null;
  const webinarCountdown = webinarDays === null ? "미입력" : webinarDays === 0 ? "D-Day" : webinarDays > 0 ? `D-${webinarDays}` : `D+${Math.abs(webinarDays)}`;
  const advertising = milestones.find((milestone) => milestone.key === "advertising");
  const creative = milestones.find((milestone) => milestone.key === "creative");
  const advertisingDays = advertising?.daysLeft ?? null;
  const advertisingSummary = advertisingDays === null ? "" : advertisingDays > 0
    ? `광고가 시작되어야 하는 날짜까지 ${advertisingDays}일 남았습니다.`
    : advertisingDays === 0 ? "오늘은 광고가 시작되어야 하는 날입니다."
      : `광고가 시작되어야 하는 날짜가 ${Math.abs(advertisingDays)}일 지났습니다.`;
  const overdueStyle = "bg-neutral-100 hover:bg-neutral-100 dark:bg-neutral-800 dark:hover:bg-neutral-800";
  return <div className="space-y-3">
    <Card><CardHeader><CardTitle>일정 요약</CardTitle></CardHeader><CardContent>
      {advertisingDays !== null && creative?.dueDate ? <p className="text-sm leading-relaxed">
        {advertisingSummary}{" "}
        {creative.daysLeft !== null && creative.daysLeft < 0 ? <>
          광고 소재 전달 마감일인 <strong className="tabular-nums">{creative.dueDate}</strong>이 지났으니 소재 수령 여부를 광고주에게 문의하세요.
        </> : <>광고 소재를 <strong className="tabular-nums">{creative.dueDate}{creative.daysLeft === 0 ? " (오늘)" : ""}</strong>까지 받아야 하니 광고주에게 문의하세요.</>}
      </p> : <p className="text-sm text-muted-foreground">사전설정에서 웨비나 날짜를 입력하면 광고개시일까지 남은 일수와 소재전달 마감일이 표시됩니다.</p>}
    </CardContent></Card>
    <Card><CardHeader><CardTitle>WBS</CardTitle></CardHeader><CardContent>
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
    </CardContent></Card>
  </div>;
}
