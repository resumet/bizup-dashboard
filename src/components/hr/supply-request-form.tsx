"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

async function readError(response: Response) {
  const body = await response.json().catch(() => ({})) as { message?: string };
  return body.message ?? "비품을 신청하지 못했습니다.";
}

export function SupplyRequestForm() {
  const router = useRouter();
  const [itemName, setItemName] = useState("");
  const [price, setPrice] = useState("");
  const [purpose, setPurpose] = useState("");
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/hr/supplies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemName,
          priceKrw: Number(price),
          purpose,
          note,
        }),
      });
      if (!response.ok) throw new Error(await readError(response));
      router.push("/hr/supplies");
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "비품을 신청하지 못했습니다.");
      setPending(false);
    }
  }

  return (
    <Card>
      <CardContent>
        <form className="space-y-5" onSubmit={submit}>
          <div className="space-y-2">
            <Label htmlFor="supply-item-name">비품 이름</Label>
            <Input
              id="supply-item-name"
              value={itemName}
              onChange={(event) => setItemName(event.target.value)}
              maxLength={120}
              autoComplete="off"
              required
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="supply-price">가격 (원)</Label>
            <Input
              id="supply-price"
              type="number"
              inputMode="numeric"
              value={price}
              onChange={(event) => setPrice(event.target.value)}
              min={0}
              max={Number.MAX_SAFE_INTEGER}
              step={1}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="supply-purpose">신청 목적</Label>
            <Textarea
              id="supply-purpose"
              value={purpose}
              onChange={(event) => setPurpose(event.target.value)}
              maxLength={1000}
              rows={4}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="supply-note">비고</Label>
            <Textarea
              id="supply-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              maxLength={2000}
              rows={4}
            />
          </div>
          {error ? (
            <p className="text-sm text-destructive" role="alert" aria-live="polite">{error}</p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => router.push("/hr/supplies")} disabled={pending}>
              취소
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
              {pending ? "신청 중" : "신청하기"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
