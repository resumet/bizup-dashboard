"use client";

import { useState } from "react";

import { Loader2, Save, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { importAdPerformanceSpreadsheet } from "@/lib/ad-performance/spreadsheet-import";
import type { AdPerformanceDailyMetric, AdPerformanceOrganicChannel } from "@/lib/ad-performance/types";

type NumericMetricField = Exclude<keyof AdPerformanceDailyMetric, "metricDate" | "organicLeads" | "chatRoomMembers">;

type AdPerformanceMetricDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  metric: AdPerformanceDailyMetric;
  isNew: boolean;
  channels: AdPerformanceOrganicChannel[];
  startDate: string;
  busy: boolean;
  error?: string;
  onMetricChange: (metric: AdPerformanceDailyMetric) => void;
  onSave: () => void;
  onDelete?: () => void;
};

const number = new Intl.NumberFormat("ko-KR");
const pairedFields: { label: string; google: NumericMetricField; meta: NumericMetricField; money?: boolean }[] = [
  { label: "노출수", google: "googleImpressions", meta: "metaImpressions" },
  { label: "클릭수", google: "googleClicks", meta: "metaClicks" },
  { label: "광고 DB", google: "googleAdLeads", meta: "metaAdLeads" },
  { label: "광고비", google: "googleSpend", meta: "metaSpend", money: true },
  { label: "랜딩 DB", google: "googleLandingLeads", meta: "metaLandingLeads" },
];

function parseNonnegativeInteger(value: string) {
  const digits = value.replace(/[,\s]/gu, "");
  if (!/^\d+$/u.test(digits)) return 0;
  const parsed = Number(digits);
  return Number.isSafeInteger(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
}

function MetricNumberInput({
  id,
  label,
  value,
  onChange,
  disabled,
  money = false,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (value: number) => void;
  disabled: boolean;
  money?: boolean;
}) {
  return <div className="min-w-0 space-y-1.5">
    <Label htmlFor={id}>{label}</Label>
    <Input
      id={id}
      inputMode="numeric"
      className="text-right tabular-nums"
      value={value ? number.format(value) : ""}
      placeholder={money ? "0원" : "0"}
      disabled={disabled}
      onChange={(event) => onChange(parseNonnegativeInteger(event.target.value))}
    />
  </div>;
}

export function AdPerformanceMetricDialog({
  open,
  onOpenChange,
  metric,
  isNew,
  channels,
  startDate,
  busy,
  error,
  onMetricChange,
  onSave,
  onDelete,
}: AdPerformanceMetricDialogProps) {
  const [spreadsheet, setSpreadsheet] = useState("");
  const [spreadsheetMessage, setSpreadsheetMessage] = useState<{
    kind: "success" | "error";
    text: string;
  } | null>(null);

  function updateNumber(field: NumericMetricField, value: number) {
    onMetricChange({ ...metric, [field]: value });
  }

  function updateOrganic(channelId: string, value: number) {
    onMetricChange({ ...metric, organicLeads: { ...metric.organicLeads, [channelId]: value } });
  }

  function applySpreadsheet(value: string, targetMetric = metric) {
    const result = importAdPerformanceSpreadsheet(value, targetMetric, channels);
    if (!result.ok) {
      setSpreadsheetMessage({ kind: "error", text: result.message });
      return;
    }

    onMetricChange(result.metric);
    const organicSummary = result.importedOrganicChannelNames.length
      ? ` · 오가닉 ${result.importedOrganicChannelNames.join(", ")}`
      : "";
    setSpreadsheetMessage({ kind: "success", text: `선택한 날짜의 값이 입력창에 반영되었습니다${organicSummary}.` });
  }

  function updateMetricDate(metricDate: string) {
    const nextMetric = { ...metric, metricDate };
    onMetricChange(nextMetric);
    if (spreadsheet.trim()) applySpreadsheet(spreadsheet, nextMetric);
  }

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
      <form
        className="flex min-h-0 flex-1 flex-col"
        onSubmit={(event) => {
          event.preventDefault();
          if (!busy) onSave();
        }}
      >
        <DialogHeader className="shrink-0 px-5 pb-4 pt-5 sm:px-6">
          <DialogTitle>{isNew ? "원시데이터 입력" : "원시데이터 수정"}</DialogTitle>
          <DialogDescription>날짜별 광고 및 유입 실적을 입력하세요. 전환율과 합계는 저장 후 자동 계산됩니다.</DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 pb-6 sm:px-6">
          {error ? <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">{error}</p> : null}

          <div className="max-w-xs space-y-1.5">
            <Label htmlFor="ad-metric-date">날짜</Label>
            <Input
              id="ad-metric-date"
              type="date"
              required
              min={startDate || undefined}
              value={metric.metricDate}
              disabled={busy}
              onChange={(event) => updateMetricDate(event.target.value)}
            />
          </div>

          <section aria-labelledby="ad-metric-spreadsheet-heading" className="space-y-2 rounded-lg border bg-muted/20 p-4">
            <div>
              <h3 id="ad-metric-spreadsheet-heading" className="text-sm font-semibold">엑셀 표 붙여넣기</h3>
              <p className="mt-1 text-xs text-muted-foreground">엑셀에서 복사한 표를 붙여넣으면 현재 선택 날짜({metric.metricDate || "날짜 미선택"}) 행의 Google·Meta·오가닉·어드민 누적 DB 값이 아래 입력창에 반영됩니다.</p>
            </div>
            <Textarea
              id="ad-metric-spreadsheet"
              value={spreadsheet}
              rows={5}
              maxLength={100_000}
              disabled={busy}
              className="min-h-28 resize-y bg-background font-mono text-xs"
              placeholder="엑셀 표를 그대로 붙여넣으세요"
              onChange={(event) => {
                const value = event.target.value;
                setSpreadsheet(value);
                if (!value.trim()) {
                  setSpreadsheetMessage(null);
                  return;
                }
                applySpreadsheet(value);
              }}
            />
            {spreadsheetMessage ? <p role={spreadsheetMessage.kind === "error" ? "alert" : "status"} className={`text-xs ${spreadsheetMessage.kind === "error" ? "text-destructive" : "text-muted-foreground"}`}>{spreadsheetMessage.text}</p> : null}
          </section>

          <section aria-labelledby="ad-metric-paid-heading" className="space-y-4">
            <h3 id="ad-metric-paid-heading" className="border-b pb-2 text-sm font-semibold">유료 광고</h3>
            <div className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
              {(["google", "meta"] as const).map((platform) => <div key={platform} className="space-y-4">
                <h4 className="text-sm font-medium text-muted-foreground">{platform === "google" ? "Google" : "Meta"}</h4>
                {pairedFields.map((field) => {
                  const key = field[platform];
                  return <MetricNumberInput
                    key={key}
                    id={`ad-metric-${key}`}
                    label={field.label}
                    value={metric[key]}
                    onChange={(value) => updateNumber(key, value)}
                    disabled={busy}
                    money={field.money}
                  />;
                })}
              </div>)}
            </div>
          </section>

          <section aria-labelledby="ad-metric-organic-heading" className="space-y-4">
            <h3 id="ad-metric-organic-heading" className="border-b pb-2 text-sm font-semibold">유입 채널별 랜딩 DB</h3>
            {channels.length ? <div className="grid gap-4 sm:grid-cols-2">
              {channels.map((channel) => <MetricNumberInput
                key={channel.id}
                id={`ad-metric-organic-${channel.id}`}
                label={channel.name}
                value={metric.organicLeads[channel.id] ?? 0}
                onChange={(value) => updateOrganic(channel.id, value)}
                disabled={busy}
              />)}
            </div> : <p className="text-sm text-muted-foreground">설정된 유입 채널이 없습니다.</p>}
          </section>

          <section aria-labelledby="ad-metric-other-heading" className="space-y-4">
            <h3 id="ad-metric-other-heading" className="border-b pb-2 text-sm font-semibold">기타 실적</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <MetricNumberInput
                id="ad-metric-admin-leads"
                label="관리자 누적 DB"
                value={metric.adminCumulativeLeads}
                onChange={(value) => updateNumber("adminCumulativeLeads", value)}
                disabled={busy}
              />
              <div className="min-w-0 space-y-1.5">
                <Label htmlFor="ad-metric-chat-members">채팅방 인원</Label>
                <Input
                  id="ad-metric-chat-members"
                  inputMode="numeric"
                  className="text-right tabular-nums"
                  value={metric.chatRoomMembers === null ? "" : number.format(metric.chatRoomMembers)}
                  placeholder="미입력"
                  disabled={busy}
                  onChange={(event) => onMetricChange({ ...metric, chatRoomMembers: event.target.value.trim() ? parseNonnegativeInteger(event.target.value) : null })}
                />
              </div>
            </div>
          </section>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2 border-t bg-background px-5 py-4 sm:px-6">
          {!isNew && onDelete ? <Button type="button" variant="destructive" disabled={busy} onClick={onDelete}>
            <Trash2 /> 삭제
          </Button> : null}
          <div className="ml-auto flex gap-2">
            <Button type="button" variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>취소</Button>
            <Button type="submit" disabled={busy}>{busy ? <Loader2 className="animate-spin" /> : <Save />}{isNew ? "추가" : "저장"}</Button>
          </div>
        </div>
      </form>
    </DialogContent>
  </Dialog>;
}
