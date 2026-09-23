"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { WORK_SERVICE_CARD_GROUPS } from "@/lib/work/service-card-settings";

export function WorkServiceCardSettingsButton({hiddenRoutes}:{hiddenRoutes:string[]}) {
  const router=useRouter();
  const [open,setOpen]=useState(false);
  const [draftHidden,setDraftHidden]=useState<Set<string>>(new Set(hiddenRoutes));
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState("");

  function changeOpen(next:boolean) {
    if(saving) return;
    setOpen(next);
    if(next) { setDraftHidden(new Set(hiddenRoutes)); setError(""); }
  }

  function setVisible(route:string,visible:boolean) {
    setDraftHidden(current=>{
      const next=new Set(current);
      if(visible) next.delete(route); else next.add(route);
      return next;
    });
  }

  async function save() {
    setSaving(true);setError("");
    try {
      const response=await fetch("/api/work/service-card-settings",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({hiddenRoutes:[...draftHidden]})});
      const body=await response.json();
      if(!response.ok) throw new Error(body.message);
      setOpen(false);
      router.refresh();
    } catch(reason) { setError(reason instanceof Error ? reason.message : "카드 표시 설정을 저장하지 못했습니다."); }
    finally { setSaving(false); }
  }

  return <Dialog open={open} onOpenChange={changeOpen}>
    <Button variant="outline" size="sm" onClick={()=>changeOpen(true)}><Settings2 />설정</Button>
    <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
      <DialogHeader><DialogTitle>카드 표시 설정</DialogTitle><DialogDescription>모든 사용자의 강의관리 화면에 표시할 카드를 선택하세요.</DialogDescription></DialogHeader>
      <div className="space-y-5">{WORK_SERVICE_CARD_GROUPS.map(group=><section key={group.title} className="space-y-2"><h3 className="font-semibold">{group.title}</h3><div className="grid gap-2 sm:grid-cols-2">{group.items.map(item=><label key={item.route} className="flex cursor-pointer items-center gap-3 rounded-md border p-3 text-sm hover:bg-muted/40"><Checkbox checked={!draftHidden.has(item.route)} disabled={saving} onCheckedChange={checked=>setVisible(item.route,checked===true)} aria-label={`${item.title} 표시`} /><span className="min-w-0 flex-1">{item.title}</span></label>)}</div></section>)}</div>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <DialogFooter><Button type="button" variant="ghost" className="mr-auto" disabled={saving} onClick={()=>setDraftHidden(new Set())}>전체 표시</Button><DialogClose asChild><Button variant="outline" disabled={saving}>취소</Button></DialogClose><Button disabled={saving} onClick={()=>void save()}>{saving ? <LoaderCircle className="animate-spin"/> : null}{saving ? "저장 중…" : "저장"}</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}
