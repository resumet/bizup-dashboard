import Link from "next/link";
import { CheckCircle2, Circle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PREPARATION_STATUS_COLUMNS, type DashboardPreparationStatus } from "@/lib/dashboard/preparation-status";

export function PreparationStatusTable({ rows }: { rows: DashboardPreparationStatus[] }) {
  return <Card className="gap-0 overflow-hidden border-slate-200 bg-white py-0 shadow-sm">
    <CardHeader className="border-b px-5 py-4 sm:px-6"><CardTitle className="text-lg font-semibold tracking-tight">사전준비알림</CardTitle></CardHeader>
    <CardContent className="overflow-x-auto p-0"><Table className="min-w-[980px]"><TableHeader><TableRow>
      <TableHead>강사</TableHead><TableHead>강의</TableHead>{PREPARATION_STATUS_COLUMNS.map((column) => <TableHead key={column.key} className="text-center">{column.label}</TableHead>)}
    </TableRow></TableHeader><TableBody>{rows.map((row) => <TableRow key={row.courseId}>
      <TableCell className="font-medium">{row.instructorName}</TableCell>
      <TableCell><Link href={`/services/course-wbs?courseId=${encodeURIComponent(row.courseId)}`} className="hover:underline">{row.courseName}</Link></TableCell>
      {PREPARATION_STATUS_COLUMNS.map((column) => {
        const completed = row.completion[column.key];
        return <TableCell key={column.key} className="text-center"><Badge variant="outline" className={completed ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" : "border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300"}>{completed ? <CheckCircle2 aria-hidden="true" /> : <Circle aria-hidden="true" />}{completed ? "완료" : "미완료"}</Badge></TableCell>;
      })}
    </TableRow>)}{!rows.length ? <TableRow><TableCell colSpan={PREPARATION_STATUS_COLUMNS.length + 2} className="h-24 text-center text-muted-foreground">진행 중인 강의가 없습니다.</TableCell></TableRow> : null}</TableBody></Table></CardContent>
  </Card>;
}
