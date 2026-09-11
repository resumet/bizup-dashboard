"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ListFilter, Search } from "lucide-react";

import { MessageDialog } from "@/components/jobs/roster-detail-client";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type {
  CombinedCourseRosterRow,
  LinkableRosterJob,
} from "@/lib/course-operations/types";
import { selectCombinedRosterMessageTargets } from "@/lib/course-operations/combined-roster";
import {
  filterRosterRows,
  formatPhone,
  sortRosterRows,
  uniqueValues,
} from "@/lib/jobs/filter";
import {
  type LinkedCourseOptionInvite,
  EMPTY_ROSTER_FILTERS,
  type RosterFilters,
  type RosterSort,
} from "@/lib/jobs/types";
import { buildCourseOptionInviteMap } from "@/lib/messages/invite";

const ALL_VALUE = "__all__";

export function CombinedCourseRosterClient({
  courseId,
  courseName,
  rows,
  rosterJobs,
  linkedCourseOptionInvites,
}: {
  courseId: string;
  courseName: string;
  rows: CombinedCourseRosterRow[];
  rosterJobs: LinkableRosterJob[];
  linkedCourseOptionInvites: LinkedCourseOptionInvite[];
}) {
  const [filters, setFilters] = useState<RosterFilters>(EMPTY_ROSTER_FILTERS);
  const [sourceJobId, setSourceJobId] = useState("");
  const [sort, setSort] = useState<RosterSort>("original");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const filteredRows = useMemo(() => {
    const filtered = (filterRosterRows(
      rows,
      filters,
    ) as CombinedCourseRosterRow[]).filter(
      (row) => !sourceJobId || row.sourceJobId === sourceJobId,
    );
    return sort === "original"
      ? filtered
      : (sortRosterRows(filtered, sort) as CombinedCourseRosterRow[]);
  }, [filters, rows, sort, sourceJobId]);
  const selectedRows = useMemo(
    () => rows.filter((row) => selected.has(row.id)),
    [rows, selected],
  );
  const messageSelectedRows = useMemo(
    () => selectCombinedRosterMessageTargets(selectedRows, selected, false),
    [selected, selectedRows],
  );
  const allFilteredSelected =
    filteredRows.length > 0 &&
    filteredRows.every((row) => selected.has(row.id));
  const optionInvites = useMemo(
    () =>
      buildCourseOptionInviteMap(
        rows.map((row) => row.values.optionName),
        linkedCourseOptionInvites,
      ),
    [linkedCourseOptionInvites, rows],
  );
  const primaryJob = rosterJobs[0];

  function setFilter<K extends keyof RosterFilters>(
    key: K,
    value: RosterFilters[K],
  ) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function toggleRow(id: string, checked: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function toggleFiltered(checked: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      for (const row of filteredRows) {
        if (checked) next.add(row.id);
        else next.delete(row.id);
      }
      return next;
    });
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <div className="mb-3 flex flex-wrap gap-2">
            <Badge variant="outline">연결 명단 {rosterJobs.length}개</Badge>
            <Badge variant="secondary">전체 {rows.length.toLocaleString()}명</Badge>
            <Badge variant={selected.size ? "default" : "outline"}>
              선택 {selected.size.toLocaleString()}명
            </Badge>
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">
            {courseName} 통합 수강생 명단
          </h1>
          <p className="mt-2 text-muted-foreground">
            연결된 모든 명단을 한곳에서 확인하고 선택한 사람에게 메시지를 보냅니다.
          </p>
        </div>
        {primaryJob ? (
          <MessageDialog
            jobId={primaryJob.id}
            jobName={`${courseName}-통합명단`}
            defaultCourseName={courseName}
            rows={rows}
            filteredRows={filteredRows}
            selectedRows={messageSelectedRows}
            filters={filters}
            defaultOptionInvites={optionInvites}
            disabled={messageSelectedRows.length === 0}
            selectedOnly
            sendEndpoint={`/api/course-operations/${courseId}/messages`}
          />
        ) : null}
      </div>

      <Card>
        <CardHeader className="border-b">
          <CardTitle className="flex items-center gap-2">
            <ListFilter className="size-5" />명단 필터
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          <div className="relative xl:col-span-2">
            <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="이름·전화·이메일·추천인·비고"
              aria-label="통합 수강생 검색"
              value={filters.keyword}
              onChange={(event) => setFilter("keyword", event.target.value)}
            />
          </div>
          <FilterSelect
            value={sourceJobId}
            placeholder="전체 출처 명단"
            items={rosterJobs.map((job) => ({ value: job.id, label: job.name }))}
            onChange={setSourceJobId}
          />
          <FilterSelect
            value={filters.optionName}
            placeholder="전체 옵션"
            items={uniqueValues(rows, "optionName").map((value) => ({
              value,
              label: value,
            }))}
            onChange={(value) => setFilter("optionName", value)}
          />
          <FilterSelect
            value={filters.source}
            placeholder="전체 유입 경로"
            items={uniqueValues(rows, "source").map((value) => ({
              value,
              label: value,
            }))}
            onChange={(value) => setFilter("source", value)}
          />
          <Select
            value={sort}
            onValueChange={(value) => setSort(value as RosterSort)}
          >
            <SelectTrigger aria-label="수강생 이름 정렬">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="original">명단·원래 목록순</SelectItem>
              <SelectItem value="nameAsc">이름 오름차순</SelectItem>
              <SelectItem value="nameDesc">이름 내림차순</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    aria-label="필터 결과 전체 선택"
                    checked={allFilteredSelected}
                    onCheckedChange={(value) => toggleFiltered(value === true)}
                  />
                </TableHead>
                <TableHead>이름</TableHead>
                <TableHead>출처 명단</TableHead>
                <TableHead>연락처</TableHead>
                <TableHead>이메일</TableHead>
                <TableHead>옵션명</TableHead>
                <TableHead>추천인</TableHead>
                <TableHead>유입 경로</TableHead>
                <TableHead>광고 매체</TableHead>
                <TableHead>단톡방</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={selected.has(row.id) ? "selected" : undefined}
                >
                  <TableCell>
                    <Checkbox
                      aria-label={`${row.values.customerName || "수강생"} 선택`}
                      checked={selected.has(row.id)}
                      onCheckedChange={(value) =>
                        toggleRow(row.id, value === true)
                      }
                    />
                  </TableCell>
                  <TableCell className="font-medium">
                    {row.values.customerName || "-"}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" asChild>
                      <Link href={`/services/course-roster/${row.sourceJobId}`}>
                        {row.sourceJobName}
                      </Link>
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-sm">
                    {formatPhone(row.normalizedPhone)}
                  </TableCell>
                  <TableCell>{row.values.email || "-"}</TableCell>
                  <TableCell>{row.values.optionName || "-"}</TableCell>
                  <TableCell>{row.values.referrer || "-"}</TableCell>
                  <TableCell>{row.values.source || "-"}</TableCell>
                  <TableCell>{row.values.adMedia || "-"}</TableCell>
                  <TableCell>
                    {row.groupChatJoined ? "참여" : "미참여"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        {filteredRows.length === 0 ? (
          <div className="border-t py-14 text-center text-sm text-muted-foreground">
            조건에 맞는 수강생이 없습니다.
          </div>
        ) : null}
      </Card>
    </div>
  );
}

function FilterSelect({
  value,
  placeholder,
  items,
  onChange,
}: {
  value: string;
  placeholder: string;
  items: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <Select
      value={value || ALL_VALUE}
      onValueChange={(next) => onChange(next === ALL_VALUE ? "" : next)}
    >
      <SelectTrigger aria-label={placeholder}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL_VALUE}>{placeholder}</SelectItem>
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
