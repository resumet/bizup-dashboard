"use client";

import { BadgeCheck, CheckCircle2, Download, Eraser, Loader2, Printer } from "lucide-react";
import { useRef, useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CONTRACT_PRINT_STYLES } from "@/components/contracts/instructor-contract-document";
import type { InstructorContractSignerMethod, InstructorContractSigningStatus } from "@/lib/contracts/instructor-contract";
import { printHtmlDocument } from "@/lib/course-settlements/print";

export function PublicInstructorContractSigning({
  token,
  instructorName,
  signingStatus,
  signedAt,
  title,
}: {
  token: string;
  instructorName: string;
  signingStatus: InstructorContractSigningStatus;
  signedAt: string | null;
  title: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [method, setMethod] = useState<InstructorContractSignerMethod>("signature");
  const [signerName, setSignerName] = useState(instructorName);
  const [agreed, setAgreed] = useState(false);
  const [hasMark, setHasMark] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [completed, setCompleted] = useState(signingStatus === "completed");

  function clearCanvas() {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    setHasMark(false);
  }

  function point(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = event.currentTarget;
    const rect = canvas.getBoundingClientRect();
    return { x: (event.clientX - rect.left) * canvas.width / rect.width, y: (event.clientY - rect.top) * canvas.height / rect.height };
  }

  function startDrawing(event: React.PointerEvent<HTMLCanvasElement>) {
    if (method !== "signature") return;
    const context = event.currentTarget.getContext("2d");
    if (!context) return;
    const current = point(event);
    event.currentTarget.setPointerCapture(event.pointerId);
    context.strokeStyle = "#0f172a";
    context.lineWidth = 5;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.beginPath();
    context.moveTo(current.x, current.y);
    drawing.current = true;
  }

  function draw(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current || method !== "signature") return;
    const context = event.currentTarget.getContext("2d");
    if (!context) return;
    const current = point(event);
    context.lineTo(current.x, current.y);
    context.stroke();
    setHasMark(true);
  }

  function seal() {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    clearCanvas();
    const name = `${(signerName.trim() || instructorName).replace(/\s+/gu, "")}인`;
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const radius = Math.min(canvas.height * 0.39, 86);
    context.strokeStyle = "#b91c1c";
    context.fillStyle = "#b91c1c";
    context.lineWidth = 8;
    context.beginPath();
    context.arc(centerX, centerY, radius, 0, Math.PI * 2);
    context.stroke();
    context.lineWidth = 2.5;
    context.beginPath();
    context.arc(centerX, centerY, radius - 13, 0, Math.PI * 2);
    context.stroke();
    const characters = Array.from(name).slice(0, 6);
    const columns = characters.length > 1 ? 2 : 1;
    const rows = Math.ceil(characters.length / columns);
    const fontSize = Math.max(27, Math.min(52, radius * (rows > 2 ? 0.5 : 0.62)));
    context.font = `bold ${fontSize}px serif`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    characters.forEach((character, index) => {
      const row = Math.floor(index / columns);
      const column = index % columns;
      const x = centerX + (column - (columns - 1) / 2) * fontSize * 0.9;
      const y = centerY + (row - (rows - 1) / 2) * fontSize * 0.9;
      context.fillText(character, x, y);
    });
    setHasMark(true);
  }

  async function uploadSeal(file: File) {
    if (!file.type.startsWith("image/")) { setMessage("도장 이미지 파일을 선택해 주세요."); return; }
    if (file.size > 3 * 1024 * 1024) { setMessage("도장 파일은 3MB 이하로 올려 주세요."); return; }
    const url = URL.createObjectURL(file);
    try {
      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const value = new Image();
        value.onload = () => resolve(value);
        value.onerror = () => reject(new Error("도장 이미지를 읽지 못했습니다."));
        value.src = url;
      });
      const canvas = canvasRef.current;
      const context = canvas?.getContext("2d");
      if (!canvas || !context) throw new Error("도장 이미지를 처리하지 못했습니다.");
      clearCanvas();
      const source = document.createElement("canvas");
      const sourceContext = source.getContext("2d");
      if (!sourceContext) throw new Error("도장 이미지를 처리하지 못했습니다.");
      const resizeScale = Math.min(1, 1200 / Math.max(image.naturalWidth, image.naturalHeight));
      source.width = Math.max(1, Math.round(image.naturalWidth * resizeScale));
      source.height = Math.max(1, Math.round(image.naturalHeight * resizeScale));
      sourceContext.drawImage(image, 0, 0, source.width, source.height);
      const pixels = sourceContext.getImageData(0, 0, source.width, source.height);
      for (let index = 0; index < pixels.data.length; index += 4) {
        const red = pixels.data[index] ?? 0;
        const green = pixels.data[index + 1] ?? 0;
        const blue = pixels.data[index + 2] ?? 0;
        const brightness = (red + green + blue) / 3;
        const spread = Math.max(red, green, blue) - Math.min(red, green, blue);
        if (brightness > 238 && spread < 26) pixels.data[index + 3] = 0;
        else if (brightness > 215 && spread < 20) pixels.data[index + 3] = Math.round((238 - brightness) / 23 * 255);
      }
      sourceContext.putImageData(pixels, 0, 0);
      const side = Math.min(canvas.height - 22, 180);
      const scale = Math.min(side / source.width, side / source.height);
      const width = source.width * scale;
      const height = source.height * scale;
      context.drawImage(source, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
      setMethod("seal");
      setHasMark(true);
      setMessage("도장 배경을 투명하게 처리했습니다. 필요하면 다시 업로드할 수 있습니다.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "도장 이미지를 처리하지 못했습니다.");
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  async function submit() {
    const canvas = canvasRef.current;
    if (!canvas || !hasMark) { setMessage("서명하거나 도장을 만들어 주세요."); return; }
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch(`/api/public/contracts/${token}/sign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signerName, method, signatureImageData: canvas.toDataURL("image/png"), agreed }),
      });
      const result = await response.json() as { message?: string };
      if (!response.ok) throw new Error(result.message || "전자서명을 완료하지 못했습니다.");
      setCompleted(true);
      setMessage("전자서명이 완료되었습니다. 완료된 계약서를 PDF로 내려받을 수 있습니다.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "전자서명을 완료하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  function printOriginal() {
    const documentElement = document.getElementById("public-contract-document");
    const contractElement = documentElement?.querySelector(".contract-document");
    if (!contractElement) return;
    printHtmlDocument(`${title}_서명완료`, `${CONTRACT_PRINT_STYLES}<main class="contract-print">${contractElement.outerHTML}</main>`);
  }

  if (completed) {
    return (
      <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-5" aria-label="전자계약 완료">
        <div className="flex gap-3"><CheckCircle2 className="mt-0.5 size-5 text-emerald-700" aria-hidden="true" /><div><h2 className="font-semibold text-emerald-950">전자계약이 완료되었습니다.</h2><p className="mt-1 text-sm text-emerald-900">{signedAt ? new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "medium", timeStyle: "short" }).format(new Date(signedAt)) : "방금"} 서명 완료</p></div></div>
        <div className="mt-4 flex flex-wrap gap-2"><Button type="button" onClick={printOriginal}><Printer aria-hidden="true" />원본 형태로 PDF 저장</Button><Button variant="outline" asChild><a href={`/api/public/contracts/${token}/pdf`}><Download aria-hidden="true" />PDF 다운로드</a></Button></div>
        {message ? <p className="mt-3 text-sm text-emerald-900" role="status">{message}</p> : null}
      </section>
    );
  }

  return (
    <section className="space-y-5 rounded-xl border bg-card p-5 shadow-sm" aria-label="전자서명">
      <div><h2 className="font-semibold">전자서명</h2><p className="mt-1 text-sm text-muted-foreground">계약 내용을 모두 확인한 뒤 서명 또는 도장으로 동의해 주세요.</p></div>
      <div className="space-y-2"><Label htmlFor="public-contract-signer">서명자 이름</Label><Input id="public-contract-signer" value={signerName} maxLength={200} onChange={(event) => setSignerName(event.target.value)} /></div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant={method === "signature" ? "default" : "outline"} onClick={() => { setMethod("signature"); clearCanvas(); }}>직접 서명</Button>
        <Button type="button" variant={method === "seal" ? "default" : "outline"} onClick={() => { setMethod("seal"); clearCanvas(); }}>도장 찍기</Button>
      </div>
      <div className="overflow-hidden rounded-lg border bg-white">
        <canvas ref={canvasRef} width={640} height={220} className="h-44 w-full touch-none" aria-label={method === "signature" ? "서명 입력 영역" : "도장 미리보기"} onPointerDown={startDrawing} onPointerMove={draw} onPointerUp={() => { drawing.current = false; }} onPointerCancel={() => { drawing.current = false; }} />
      </div>
      <div className="flex flex-wrap gap-2">
        {method === "seal" ? <Button type="button" variant="outline" onClick={seal}><BadgeCheck aria-hidden="true" />이름으로 도장 만들기</Button> : null}
        <label className="inline-flex"><Button type="button" variant="outline" asChild><span><BadgeCheck aria-hidden="true" />도장 파일 업로드</span></Button><Input className="sr-only" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadSeal(file); event.target.value = ""; }} /></label>
        <Button type="button" variant="ghost" onClick={clearCanvas}><Eraser aria-hidden="true" />지우기</Button>
      </div>
      <label className="flex items-start gap-2 text-sm leading-6"><Checkbox checked={agreed} onCheckedChange={(value) => setAgreed(value === true)} /><span>계약서 전문을 읽었고, 위 서명 또는 도장으로 계약 체결에 동의합니다.</span></label>
      {message ? <Alert variant={message.includes("완료") ? "default" : "destructive"}><AlertDescription>{message}</AlertDescription></Alert> : null}
      <Button type="button" className="w-full" disabled={saving} onClick={() => void submit()}>{saving ? <Loader2 className="animate-spin" aria-hidden="true" /> : <BadgeCheck aria-hidden="true" />}{saving ? "전자서명 처리 중" : "전자서명 완료"}</Button>
    </section>
  );
}
