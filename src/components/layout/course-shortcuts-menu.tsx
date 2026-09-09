"use client";

import { useRef, useState } from "react";
import { ChevronDown, ExternalLink } from "lucide-react";

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

const COMMON_LINK: CourseQuickLink = {
  label: "무료강의멘트",
  url: "https://docs.google.com/spreadsheets/d/1uVAgx23JXDqxl5uAjgpGywDyg9F7vZ74wJcsAC1p14c/edit?gid=1923105310#gid=1923105310",
};

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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const requestId = useRef(0);

  async function loadCourses(open: boolean) {
    if (!open) return;
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
            <DropdownMenuSubContent className="w-48"><ShortcutItem link={COMMON_LINK} /></DropdownMenuSubContent>
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
