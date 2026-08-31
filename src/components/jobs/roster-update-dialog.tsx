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
  };
  additions: DiffItem[];
  removals: DiffItem[];
};

export function RosterUpdateDialog({ jobId }: { jobId: string }) {
  const router = useRouter();
  const fileInputId = useId();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<UpdatePreview | null>(null);
  const [approveAdditions, setApproveAdditions] = useState(false);
  const [approveRemovals, setApproveRemovals] = useState(false);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState("");

  function reset() {
    setFile(null);
    setPreview(null);
    setApproveAdditions(false);
    setApproveRemovals(false);
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
    setApplying(true);
    setError("");
    try {
      const formData = new FormData();
      formData.set("action", "apply");
      formData.set("file", file);
      formData.set("expectedVersion", String(preview.currentVersion));
      formData.set("expectedChecksum", preview.file.checksumSha256);
      formData.set("approveAdditions", String(approveAdditions));
      formData.set("approveRemovals", String(approveRemovals));
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
          엑셀 추가
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[92vh] grid-rows-[auto_minmax(0,1fr)_auto] sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>새 명단 비교 및 적용</DialogTitle>
          <DialogDescription>
            기존 최신 명단과 새 CSV·XLSX 파일을 전화번호 기준으로 비교합니다.
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
                  <DiffTable
                    items={preview.additions}
                    emptyMessage="새롭게 추가되는 항목이 없습니다."
                  />
                </TabsContent>
                <TabsContent value="removals">
                  <DiffTable
                    items={preview.removals}
                    emptyMessage="새 파일에서 제외된 항목이 없습니다."
                  />
                </TabsContent>
              </Tabs>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex items-start gap-3 rounded-xl border p-4 text-sm">
                  <Checkbox
                    checked={approveAdditions}
                    disabled={preview.summary.additions === 0}
                    onCheckedChange={(value) =>
                      setApproveAdditions(value === true)
                    }
                  />
                  <span>
                    <span className="block font-medium">
                      신규 {preview.summary.additions}명 추가 승인
                    </span>
                    <span className="mt-1 block text-muted-foreground">
                      체크하지 않으면 신규 항목은 적용하지 않습니다.
                    </span>
                  </span>
                </label>
                <label className="flex items-start gap-3 rounded-xl border border-destructive/30 p-4 text-sm">
                  <Checkbox
                    checked={approveRemovals}
                    disabled={preview.summary.removals === 0}
                    onCheckedChange={(value) =>
                      setApproveRemovals(value === true)
                    }
                  />
                  <span>
                    <span className="block font-medium">
                      제외 {preview.summary.removals}명 삭제 승인
                    </span>
                    <span className="mt-1 block text-muted-foreground">
                      체크하지 않으면 기존 명단에 계속 유지합니다.
                    </span>
                  </span>
                </label>
              </div>
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
              <Button onClick={applyUpdate} disabled={applying}>
                {applying ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <FileSpreadsheet />
                )}
                {applying ? "적용 중" : "승인 내용 적용"}
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
}: {
  items: DiffItem[];
  emptyMessage: string;
}) {
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
