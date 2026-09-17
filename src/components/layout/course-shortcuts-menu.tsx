"use client";

import { useRef, useState } from "react";
import { Check, ChevronDown, Copy, ExternalLink } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { CourseQuickLink, CourseQuickLinks } from "@/lib/course-operations/quick-links";

function ShortcutItem({ link }: { link: CourseQuickLink }) {
  if (!link.url) {
    return <DropdownMenuItem disabled>{link.label}<span className="ml-auto text-xs">미등록</span></DropdownMenuItem>;
  }
  return (
    <DropdownMenuItem asChild>
      <a href={link.url} target="_blank" rel="noopener noreferrer">
        {link.label}<ExternalLink className="ml-auto size-3.5" />
      </a>
    </DropdownMenuItem>
  );
}

export function CourseShortcutsMenu() {
  const [courses, setCourses] = useState<CourseQuickLinks[]>([]);
  const [commonLinks, setCommonLinks] = useState<CourseQuickLink[]>([]);
  const [commonLoading, setCommonLoading] = useState(false);
  const [commonError, setCommonError] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copyStatus, setCopyStatus] = useState<{ label: string; state: "copying" | "copied" | "error" } | null>(null);
  const requestId = useRef(0);

  async function loadCommonLinks() {
    setCommonLoading(true); setCommonError("");
    try {
      const response = await fetch("/api/common-links", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message);
      setCommonLinks(body.links);
    } catch { setCommonError("공통 링크를 불러오지 못했습니다."); }
    finally { setCommonLoading(false); }
  }

  async function copyLink(link: CourseQuickLink) {
    setCopyStatus({ label: link.label, state: "copying" });
    try {
      await navigator.clipboard.writeText(link.url);
      setCopyStatus({ label: link.label, state: "copied" });
    } catch {
      setCopyStatus({ label: link.label, state: "error" });
    }
  }

  async function loadCourses(open: boolean) {
    if (!open) return;
    void loadCommonLinks();
    setCopyStatus(null);
    const currentRequest = ++requestId.current;
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/course-operations/quick-links", { cache: "no-store" });
      const body = await response.json() as { courses?: CourseQuickLinks[]; message?: string };
      if (!response.ok || !body.courses) throw new Error(body.message || "강의 링크를 불러오지 못했습니다.");
      if (currentRequest === requestId.current) setCourses(body.courses);
    } catch {
      if (currentRequest === requestId.current) setError("강의 링크를 불러오지 못했습니다.");
    } finally {
      if (currentRequest === requestId.current) setLoading(false);
    }
  }

  return (
    <DropdownMenu onOpenChange={loadCourses}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="shrink-0">바로가기<ChevronDown className="size-3.5" /></Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-60 max-w-[calc(100vw-2rem)]">
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>공통</DropdownMenuSubTrigger>
          <DropdownMenuPortal>
            <DropdownMenuSubContent className="max-h-[var(--radix-dropdown-menu-content-available-height)] w-72 max-w-[calc(100vw-2rem)] overflow-y-auto">
              {commonLoading ? <DropdownMenuItem disabled>공통 링크 불러오는 중…</DropdownMenuItem> : commonError ? <>
                <DropdownMenuLabel className="whitespace-normal text-destructive">{commonError}</DropdownMenuLabel>
                <DropdownMenuItem onSelect={event => { event.preventDefault(); void loadCommonLinks(); }}>다시 시도</DropdownMenuItem>
              </> : !commonLinks.length ? <DropdownMenuItem disabled>등록된 공통 링크가 없습니다.</DropdownMenuItem> : commonLinks.map((link, index) => (
                <div key={`${index}-${link.label}`} className="grid grid-cols-[minmax(0,1fr)_auto] gap-1">
                  <ShortcutItem link={link} />
                  <DropdownMenuItem
                    asChild
                    disabled={copyStatus?.state === "copying"}
                    onSelect={(event) => { event.preventDefault(); void copyLink(link); }}
                  >
                    <button type="button" aria-label={`${link.label} 링크 복사`} className="justify-center">
                      {copyStatus?.label === link.label && copyStatus.state === "copied" ? <><Check className="size-3.5" />완료</> : <><Copy className="size-3.5" />복사</>}
                    </button>
                  </DropdownMenuItem>
                </div>
              ))}
              <p role="status" aria-live="polite" className={`px-1.5 text-xs ${copyStatus ? "pt-2" : ""} ${copyStatus?.state === "error" ? "text-destructive" : "text-muted-foreground"}`}>
                {copyStatus?.state === "copied" ? `${copyStatus.label} 링크를 복사했습니다.` : copyStatus?.state === "error" ? "복사하지 못했습니다. 브라우저의 클립보드 권한을 확인한 뒤 다시 시도해 주세요." : ""}
              </p>
            </DropdownMenuSubContent>
          </DropdownMenuPortal>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        {loading ? <DropdownMenuItem disabled>강의 링크 불러오는 중…</DropdownMenuItem> : error ? (
          <>
            <DropdownMenuLabel className="whitespace-normal text-destructive">{error}</DropdownMenuLabel>
            <DropdownMenuItem onSelect={(event) => { event.preventDefault(); void loadCourses(true); }}>다시 시도</DropdownMenuItem>
          </>
        ) : courses.length === 0 ? <DropdownMenuItem disabled>등록된 강의가 없습니다.</DropdownMenuItem> : courses.map((course) => (
          <DropdownMenuSub key={course.id}>
            <DropdownMenuSubTrigger>
              <span className="min-w-0"><span className="block truncate">{course.instructorName}</span><span className="block truncate text-xs text-muted-foreground">{course.name}</span></span>
            </DropdownMenuSubTrigger>
            <DropdownMenuPortal>
              <DropdownMenuSubContent className="max-h-[var(--radix-dropdown-menu-content-available-height)] w-52 max-w-[calc(100vw-2rem)] overflow-y-auto">
                <DropdownMenuLabel className="whitespace-normal">{course.name}</DropdownMenuLabel>
                {course.links.map((link, index) => <ShortcutItem key={`${link.label}-${index}`} link={link} />)}
              </DropdownMenuSubContent>
            </DropdownMenuPortal>
          </DropdownMenuSub>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
