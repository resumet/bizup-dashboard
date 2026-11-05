import Link from "next/link";
import { redirect } from "next/navigation";

import { PersonalDashboard } from "@/components/personal-dashboard/personal-dashboard";
import { loadPersonalDashboard } from "@/lib/personal-dashboard/server";
import { requireWorkTaskContext } from "@/lib/work-tasks/server";

export default async function MyDashboardPage() {
  let context: Awaited<ReturnType<typeof requireWorkTaskContext>>;
  try {
    context = await requireWorkTaskContext();
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") redirect("/login");
    if (error instanceof Error && error.message === "PERSONNEL_INACTIVE") {
      return (
        <main className="mx-auto max-w-xl space-y-4 p-8">
          <h1 className="text-xl font-semibold">이용 권한이 없습니다.</h1>
          <Link href="/" className="text-blue-700 underline">기본 대시보드로 돌아가기</Link>
        </main>
      );
    }
    throw error;
  }

  const data = await loadPersonalDashboard({
    admin: context.admin,
    workspaceId: context.workspaceId,
    userId: context.user.id,
    isSuperAdmin: context.isSuperAdmin,
  });

  return (
    <PersonalDashboard
      userId={context.user.id}
      userName={context.user.displayName ?? "사용자"}
      isSuperAdmin={context.isSuperAdmin}
      initialMemos={data.memos}
      initialAssignments={data.assignments}
      people={data.people}
    />
  );
}
