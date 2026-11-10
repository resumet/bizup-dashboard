"use client";

import { Loader2, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";

export function InstructorContractDeleteButton({ id, title }: { id: string; title: string }) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  async function remove() {
    if (deleting || !window.confirm(`“${title}” 계약서를 삭제할까요?`)) return;
    setDeleting(true);
    const response = await fetch(`/api/contracts/${id}`, { method: "DELETE" });
    if (!response.ok) {
      const body = await response.json().catch(() => ({})) as { message?: string };
      window.alert(body.message ?? "계약서를 삭제하지 못했습니다.");
      setDeleting(false);
      return;
    }
    router.refresh();
  }
  return <Button type="button" size="icon-sm" variant="ghost" className="text-destructive" aria-label={`${title} 삭제`} onClick={() => void remove()} disabled={deleting}>{deleting ? <Loader2 className="animate-spin" /> : <Trash2 />}</Button>;
}
