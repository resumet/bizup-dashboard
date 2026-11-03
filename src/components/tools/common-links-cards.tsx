"use client";

import { Copy, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { CommonLink } from "@/lib/admin/common-links";

export function CommonLinksCards({links}:{links:CommonLink[]}){
  async function copy(url:string){try{await navigator.clipboard.writeText(url);}catch{/* Clipboard permission can be unavailable in embedded browsers. */}}
  if(!links.length)return <p className="text-sm text-muted-foreground">등록된 링크가 없습니다.</p>;
  return <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{links.map(link=><Card key={`${link.label}-${link.url}`} className="h-full"><CardContent className="flex min-h-32 flex-col gap-4 p-5"><h3 className="font-semibold leading-snug tracking-tight">{link.label}</h3><p className="line-clamp-2 text-sm text-muted-foreground" title={link.url}>{link.url}</p><div className="mt-auto flex flex-wrap gap-2"><Button size="sm" asChild><a href={link.url} target="_blank" rel="noopener noreferrer"><ExternalLink />바로가기</a></Button><Button type="button" size="sm" variant="outline" onClick={()=>void copy(link.url)}><Copy />복사</Button></div></CardContent></Card>)}</div>;
}
