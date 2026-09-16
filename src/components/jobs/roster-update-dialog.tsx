"use client";

import { useId, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  FileSpreadsheet,
  Loader2,
  Minus,
  Plus,
  Upload,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { formatPhone } from "@/lib/jobs/filter";
import type { NameConflictDecisions } from "@/lib/import/roster-diff";

type DiffItem = {
  phone: string;
  name: string;
  email: string;
  courseName: string;
  optionName: string;
};

type UpdatePreview = {
  file: { name: string; checksumSha256: string };
  currentVersion: number;
  summary: {
    current: number;
    incoming: number;
    additions: number;
    removals: number;
    unchanged: number;
    nameConflicts: number;
    excludedOrderRows: number;
  };
  orderStatusFiltered: boolean;
  nameConflicts: Array<{ id: string; incoming: DiffItem; rowNumber: number; otherNames: string[] }>;
  additions: DiffItem[];
  removals: DiffItem[];
};

export function RosterUpdateDialog({ jobId, label = "엑셀 추가" }: { jobId: string; label?: string }) {
  const router = useRouter();
  const fileInputId = useId();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<UpdatePreview | null>(null);
  const [selectedAdditionIndexes, setSelectedAdditionIndexes] = useState<number[]>([]);
  const [selectedRemovalIndexes, setSelectedRemovalIndexes] = useState<number[]>([]);
  const [nameConflictDecisions, setNameConflictDecisions] = useState<NameConflictDecisions>({});
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState("");

  function reset() {
    setFile(null);
    setPreview(null);
    setSelectedAdditionIndexes([]);
    setSelectedRemovalIndexes([]);
    setNameConflictDecisions({});
    setError("");
  }

  function handleOpenChange(nextOpen: boolean) {
    if (applying) return;
    setOpen(nextOpen);
    if (!nextOpen) reset();
  }

  async function compareFile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) return;
    setLoading(true);
    setError("");
    setPreview(null);
    setSelectedAdditionIndexes([]);
    setSelectedRemovalIndexes([]);
    setNameConflictDecisions({});
    try {
      const formData = new FormData();
      formData.set("action", "preview");
      formData.set("file", file);
      const response = await fetch(`/api/jobs/${jobId}/imports`, {
        method: "POST",
        body: formData,
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.message ?? "새 명단을 비교하지 못했습니다.");
      setPreview(body as UpdatePreview);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "새 명단을 비교하지 못했습니다.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function applyUpdate() {
    if (!file || !preview) return;
    if (preview.nameConflicts.some(({ id }) => !nameConflictDecisions[id])) {
      setError("이름이 다른 모든 항목의 추가 여부를 먼저 선택해 주세요.");
      return;
    }
    setApplying(true);
    setError("");
    try {
      const formData = new FormData();
      formData.set("action", "apply");
      formData.set("file", file);
      formData.set("expectedVersion", String(preview.currentVersion));
      formData.set("expectedChecksum", preview.file.checksumSha256);
      formData.set("selectedAdditionIndexes", JSON.stringify(selectedAdditionIndexes));
      formData.set("selectedRemovalIndexes", JSON.stringify(selectedRemovalIndexes));
      formData.set("nameConflictDecisions", JSON.stringify(nameConflictDecisions));
      const response = await fetch(`/api/jobs/${jobId}/imports`, {
        method: "POST",
        body: formData,
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.message ?? "새 명단을 적용하지 못했습니다.");
      setOpen(false);
      reset();
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "새 명단을 적용하지 못했습니다.",
      );
    } finally {
      setApplying(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <FileSpreadsheet />
          {label}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[92vh] grid-rows-[auto_minmax(0,1fr)_auto] sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>새 명단 비교 및 적용</DialogTitle>
          <DialogDescription>
            기존 최신 명단과 새 CSV·XLSX 파일을 전화번호 기준으로 비교합니다.
            주문상태 컬럼이 있으면 결제완료 행만 가져옵니다. 회원명과 휴대전화번호도 자동으로 인식합니다.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 overflow-y-auto pr-1">
          {error ? (
            <Alert variant="destructive" className="mb-4">
              <AlertCircle />
              <AlertTitle>처리할 수 없습니다.</AlertTitle>
              <AlertDescription className="whitespace-pre-line">
                {error}
              </AlertDescription>
            </Alert>
          ) : null}

          {!preview ? (
            <form onSubmit={compareFile} className="space-y-5">
              <label
                htmlFor={fileInputId}
                className="flex min-h-56 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed bg-muted/35 p-6 text-center transition-colors hover:bg-muted/60"
              >
                <span className="mb-4 grid size-11 place-items-center rounded-full bg-background shadow-sm">
                  <Upload className="size-5 text-primary" />
                </span>
                {file ? (
                  <>
                    <span className="font-medium">{file.name}</span>
                    <span className="mt-2 text-sm text-muted-foreground">
                      {(file.size / 1024).toFixed(1)}KB
                    </span>
                  </>
                ) : (
                  <>
                    <span className="font-medium">새 명단 파일 선택</span>
                    <span className="mt-2 text-sm text-muted-foreground">
                      UTF-8 CSV 또는 XLSX · 최대 20MB
                    </span>
                  </>
                )}
                <input
                  id={fileInputId}
                  type="file"
                  accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  className="sr-only"
                  disabled={loading}
                  onChange={(event) => {
                    setFile(event.target.files?.[0] ?? null);
                    setError("");
                  }}
                />
              </label>
              <div className="flex justify-end">
                <Button type="submit" disabled={!file || loading}>
                  {loading ? <Loader2 className="animate-spin" /> : <Upload />}
                  {loading ? "비교 중" : "기존 명단과 비교"}
                </Button>
              </div>
            </form>
          ) : (
            <div className="space-y-5">
              {preview.orderStatusFiltered ? (
                <Alert>
                  <AlertTitle>결제완료 항목만 비교했습니다</AlertTitle>
                  <AlertDescription>결제완료 {preview.summary.incoming}행을 가져오고, 다른 주문상태 {preview.summary.excludedOrderRows}행은 제외했습니다. 새 파일에 없는 기존 수강생은 삭제를 승인하지 않으면 유지됩니다.</AlertDescription>
                </Alert>
              ) : null}
              {preview.nameConflicts.length > 0 ? (
                <Alert variant="destructive">
                  <AlertCircle />
                  <AlertTitle>같은 전화번호에 다른 이름이 있습니다: {preview.summary.nameConflicts}행</AlertTitle>
                  <AlertDescription className="block space-y-3">
                    <p>기존 명단 또는 새 파일 안에서 이름이 다릅니다. 각 행의 추가 여부를 선택해 주세요. 기존 수강생 정보는 유지하며, ‘추가’를 선택하면 별도 수강생으로 추가합니다.</p>
                    <div className="max-h-80 overflow-auto rounded-lg border">
                      <Table>
                        <TableHeader><TableRow><TableHead>엑셀 행</TableHead><TableHead>전화번호</TableHead><TableHead>비교된 다른 이름</TableHead><TableHead>새 파일 이름</TableHead><TableHead>추가 여부</TableHead></TableRow></TableHeader>
                        <TableBody>
                          {preview.nameConflicts.map((conflict) => (
                            <TableRow key={conflict.id}>
                              <TableCell>{conflict.rowNumber}</TableCell>
                              <TableCell className="font-mono">{formatPhone(conflict.incoming.phone)}</TableCell>
                              <TableCell>{conflict.otherNames.map((name) => name || "이름 없음").join(", ")}</TableCell>
                              <TableCell>{conflict.incoming.name || "이름 없음"}</TableCell>
                              <TableCell>
                                <select
                                  className="rounded-md border bg-background p-2 text-foreground"
                                  aria-label={`${conflict.rowNumber}행 ${conflict.incoming.name || "이름 없음"} 추가 여부`}
                                  value={nameConflictDecisions[conflict.id] ?? ""}
                                  disabled={applying}
                                  onChange={(event) => {
                                    const value = event.target.value;
                                    setNameConflictDecisions((current) => {
                                      const next = { ...current };
                                      if (value === "add" || value === "skip") next[conflict.id] = value;
                                      else delete next[conflict.id];
                                      return next;
                                    });
                                  }}
                                >
                                  <option value="">선택해 주세요</option>
                                  <option value="add">추가</option>
                                  <option value="skip">추가 안 함</option>
                                </select>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </AlertDescription>
                </Alert>
              ) : null}
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <DiffMetric label="기존 명단" value={preview.summary.current} />
                <DiffMetric label="새 파일" value={preview.summary.incoming} />
                <DiffMetric label="유지" value={preview.summary.unchanged} />
                <DiffMetric
                  label="신규 추가"
                  value={preview.summary.additions}
                  tone="add"
                />
                <DiffMetric
                  label="새 파일에서 제외"
                  value={preview.summary.removals}
                  tone="remove"
                />
              </div>

              <Tabs defaultValue="additions">
                <TabsList>
                  <TabsTrigger value="additions">
                    <Plus /> 신규 {preview.summary.additions}명
                  </TabsTrigger>
                  <TabsTrigger value="removals">
                    <Minus /> 제외 {preview.summary.removals}명
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="additions">
                  <p className="my-3 text-sm text-muted-foreground">추가할 수강생을 체크해 주세요. 체크를 해제하면 추가 대상에서 빠집니다.</p>
                  <DiffTable
                    items={preview.additions}
                    selectedIndexes={selectedAdditionIndexes}
                    onSelectionChange={setSelectedAdditionIndexes}
                    actionLabel="추가"
                    disabled={applying}
                    emptyMessage="새롭게 추가되는 항목이 없습니다."
                  />
                </TabsContent>
                <TabsContent value="removals">
                  <p className="my-3 text-sm text-muted-foreground">기존 명단에서 삭제할 수강생만 체크해 주세요. 체크하지 않은 수강생은 유지됩니다.</p>
                  <DiffTable
                    items={preview.removals}
                    selectedIndexes={selectedRemovalIndexes}
                    onSelectionChange={setSelectedRemovalIndexes}
                    actionLabel="삭제"
                    disabled={applying}
                    emptyMessage="새 파일에서 제외된 항목이 없습니다."
                  />
                </TabsContent>
              </Tabs>

              <p className="text-sm font-medium" aria-live="polite">
                추가 선택 {selectedAdditionIndexes.length + Object.values(nameConflictDecisions).filter((decision) => decision === "add").length}명 · 삭제 선택 {selectedRemovalIndexes.length}명
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="sm:justify-between">
          {preview ? (
            <Button variant="outline" onClick={reset} disabled={applying}>
              다른 파일 선택
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={applying}
            >
              취소
            </Button>
            {preview ? (
              <Button onClick={applyUpdate} disabled={applying || preview.nameConflicts.some(({ id }) => !nameConflictDecisions[id])}>
                {applying ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <FileSpreadsheet />
                )}
                {applying ? "적용 중" : "선택 내용 적용"}
              </Button>
            ) : null}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DiffMetric({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "add" | "remove";
}) {
  return (
    <Card>
      <CardContent className="pt-5">
        <p className="text-xs text-muted-foreground">{label}</p>
        <div className="mt-1 flex items-center gap-2">
          <strong className="text-xl tabular-nums">
            {value.toLocaleString("ko-KR")}명
          </strong>
          {tone ? (
            <Badge variant={tone === "remove" ? "destructive" : "secondary"}>
              {tone === "add" ? "추가" : "삭제 검토"}
            </Badge>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function DiffTable({
  items,
  emptyMessage,
  selectedIndexes,
  onSelectionChange,
  actionLabel,
  disabled,
}: {
  items: DiffItem[];
  emptyMessage: string;
  selectedIndexes: number[];
  onSelectionChange: (indexes: number[]) => void;
  actionLabel: string;
  disabled: boolean;
}) {
  const selected = new Set(selectedIndexes);
  if (items.length === 0) {
    return (
      <div className="rounded-xl border py-12 text-center text-muted-foreground">
        {emptyMessage}
      </div>
    );
  }
  return (
    <div className="max-h-80 overflow-auto rounded-xl border">
      <Table>
        <TableHeader className="sticky top-0 bg-background">
          <TableRow>
            <TableHead className="w-24">
              <label className="flex items-center gap-2">
                <Checkbox
                  aria-label={`${actionLabel} 대상 전체 선택`}
                  checked={selected.size === items.length ? true : selected.size > 0 ? "indeterminate" : false}
                  disabled={disabled}
                  onCheckedChange={(value) => onSelectionChange(value === true ? items.map((_, index) => index) : [])}
                />
                {actionLabel}
              </label>
            </TableHead>
            <TableHead>이름</TableHead>
            <TableHead>전화번호</TableHead>
            <TableHead>이메일</TableHead>
            <TableHead>강의명</TableHead>
            <TableHead>옵션명</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item, index) => (
            <TableRow key={`${item.phone}-${index}`}>
              <TableCell>
                <Checkbox
                  aria-label={`${item.name || "이름 없음"} ${formatPhone(item.phone)} ${actionLabel}`}
                  checked={selected.has(index)}
                  disabled={disabled}
                  onCheckedChange={(value) => onSelectionChange(value === true
                    ? [...selectedIndexes, index]
                    : selectedIndexes.filter((selectedIndex) => selectedIndex !== index))}
                />
              </TableCell>
              <TableCell className="font-medium">{item.name || "-"}</TableCell>
              <TableCell className="font-mono">
                {formatPhone(item.phone)}
              </TableCell>
              <TableCell>{item.email || "-"}</TableCell>
              <TableCell>{item.courseName || "-"}</TableCell>
              <TableCell>{item.optionName || "-"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
