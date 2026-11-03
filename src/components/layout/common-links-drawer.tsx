"use client";
import { useEffect, useState } from "react";
import { ChevronUp, ExternalLink, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { CommonLink } from "@/lib/admin/common-links";
export function CommonLinksDrawer(){const [links,setLinks]=useState<CommonLink[]>([]);useEffect(()=>{void fetch("/api/common-links").then(r=>r.ok?r.json():null).then(v=>setLinks(v?.links??[])).catch(()=>{});},[]);if(!links.length)return null;return <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" className="w-full justify-between text-slate-200 hover:bg-white/10 hover:text-white"><span className="flex items-center gap-2"><Link2 />공통 링크</span><ChevronUp /></Button></DropdownMenuTrigger><DropdownMenuContent side="top" align="start" className="w-72"><DropdownMenuLabel>공통 링크</DropdownMenuLabel>{links.map(link=><DropdownMenuItem key={`${link.label}-${link.url}`} asChild><a href={link.url} target="_blank" rel="noopener noreferrer"><span className="min-w-0 flex-1 truncate">{link.label}</span><ExternalLink className="size-3.5" /></a></DropdownMenuItem>)}</DropdownMenuContent></DropdownMenu>}
