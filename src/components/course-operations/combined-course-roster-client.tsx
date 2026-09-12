"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ListFilter, Search } from "lucide-react";

import { MessageDialog } from "@/components/jobs/roster-detail-client";
import { RosterAnalysisCards } from "@/components/jobs/roster-analysis-cards";
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
  analyzeRosterOptions,
  analyzeRosterSources,
  countGroupChatParticipants,
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
  const analysis = useMemo(() => {
    const joined = countGroupChatParticipants(filteredRows);
    return {
      options: analyzeRosterOptions(filteredRows),
      sources: analyzeRosterSources(filteredRows),
      joined,
      notJoined: filteredRows.length - joined,
      joinedPercentage: filteredRows.length
        ? Math.round((joined / filteredRows.length) * 1000) / 10
        : 0,
    };
  }, [filteredRows]);
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
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-7">
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
            value={filters.groupChat}
            onValueChange={(value) =>
              setFilter("groupChat", value as RosterFilters["groupChat"])
            }
          >
            <SelectTrigger aria-label="단톡방 참여 여부">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">단톡방 전체</SelectItem>
              <SelectItem value="notJoined">단톡방 미참여만</SelectItem>
            </SelectContent>
          </Select>
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

      <section aria-label="통합 수강생 현황" className="space-y-5">
        <div>
          <h2 className="text-lg font-semibold">수강생 현황</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            전체 인원을 제외한 통계는 현재 검색·필터 결과 기준입니다.
            여러 명단에 중복 등록된 수강생은 각각 집계합니다.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: "전체 수강생", count: rows.length, detail: `연결 명단 ${rosterJobs.length}개 기준` },
            { label: "현재 필터 인원", count: filteredRows.length, detail: "아래 명단과 동일한 인원" },
            { label: "단톡방 참여", count: analysis.joined, detail: "현재 필터 기준" },
            { label: "단톡방 미참여", count: analysis.notJoined, detail: "현재 필터 기준" },
          ].map((item) => (
            <Card key={item.label}>
              <CardHeader>
                <CardTitle className="text-sm text-muted-foreground">{item.label}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-semibold tabular-nums">
                  {item.count.toLocaleString("ko-KR")}<span className="ml-1 text-base font-normal">명</span>
                </p>
                <p className="mt-2 text-xs text-muted-foreground">{item.detail}</p>
              </CardContent>
            </Card>
          ))}
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">단톡방 참여 현황</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap justify-between gap-2 text-sm">
              <span>참여 {analysis.joined.toLocaleString("ko-KR")}명 · {analysis.joinedPercentage}%</span>
              <span>미참여 {analysis.notJoined.toLocaleString("ko-KR")}명 · {filteredRows.length ? Math.round((analysis.notJoined / filteredRows.length) * 1000) / 10 : 0}%</span>
            </div>
            <div className="flex h-4 overflow-hidden rounded-full bg-muted" aria-hidden="true">
              <div className="h-full bg-emerald-500" style={{ width: `${analysis.joinedPercentage}%` }} />
              <div className="h-full bg-amber-400" style={{ width: `${filteredRows.length ? 100 - analysis.joinedPercentage : 0}%` }} />
            </div>
            <p className="text-xs text-muted-foreground">
              {filteredRows.length ? "초록: 참여 · 노랑: 미참여. 단톡방 미참여만 필터로 대상 명단을 확인할 수 있습니다." : "집계할 수강생이 없습니다."}
            </p>
          </CardContent>
        </Card>
        <RosterAnalysisCards
          sourceItems={analysis.sources}
          optionItems={analysis.options}
          totalCount={filteredRows.length}
          scopeLabel="현재 필터 결과의 수강생"
          defaultExpanded
        />
      </section>

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
