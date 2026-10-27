"use client";

import Link from "next/link";
import {
  ArrowRight,
  BookOpenCheck,
  Camera,
  ClipboardList,
  MonitorPlay,
  Radio,
  UsersRound,
  type LucideIcon,
} from "lucide-react";

import {
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
  getDashboardCourseDestinations,
  type CourseDestination,
} from "@/lib/work/instructor-course-search";

const destinationIcons: Record<CourseDestination["kind"], LucideIcon> = {
  instagram: Camera,
  youtube: MonitorPlay,
  webinar: Radio,
  students: UsersRound,
  wbs: ClipboardList,
  detail: BookOpenCheck,
};

export function DashboardCourseOptions({ courseId }: { courseId: string }) {
  return (
    <DropdownMenuContent align="start" className="min-w-64 p-1.5">
      {getDashboardCourseDestinations(courseId).map((destination) => {
        const DestinationIcon = destinationIcons[destination.kind];
        return (
          <DropdownMenuItem key={destination.href} asChild className="px-2.5 py-2.5">
            <Link href={destination.href}>
              <DestinationIcon className="size-4 text-muted-foreground" aria-hidden="true" />
              <span>{destination.label}</span>
              <ArrowRight className="ml-auto size-4 text-muted-foreground" aria-hidden="true" />
            </Link>
          </DropdownMenuItem>
        );
      })}
    </DropdownMenuContent>
  );
}
