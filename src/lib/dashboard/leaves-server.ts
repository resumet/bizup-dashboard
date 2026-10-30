import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { loadWorkspacePeople } from "@/lib/work-tasks/server";
import {
  dashboardLeaveItems,
  shiftDashboardDate,
  type DashboardLeaveRequest,
} from "./leaves";

type DashboardLeaveContext = {
  workspaceId: string;
  user: { id: string };
};

export async function loadDashboardLeaves(context: DashboardLeaveContext, today: string) {
  const admin = createAdminClient();
  const access = await admin.rpc("personnel_access", {
    p_workspace_id: context.workspaceId,
    p_user_id: context.user.id,
  });
  if (access.error) throw new Error("Dashboard leave personnel access lookup failed");
  if (access.data !== true) throw new Error("휴가자 정보를 보려면 활성 직원 권한이 필요합니다.");

  const until = shiftDashboardDate(today, 7);
  const loadRequests = async () => {
    const requests: DashboardLeaveRequest[] = [];
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await admin.from("hr_leave_requests")
        .select("id,user_id,leave_date,unit,status")
        .eq("workspace_id", context.workspaceId)
        .in("status", ["approved", "pending"])
        .gte("leave_date", today)
        .lte("leave_date", until)
        .order("leave_date")
        .order("id")
        .range(offset, offset + 499);
      if (error) throw new Error(`Dashboard leave lookup failed: ${error.code}`);
      requests.push(...(data ?? []) as DashboardLeaveRequest[]);
      if (!data || data.length < 500) return requests;
    }
  };

  const [people, requests] = await Promise.all([
    loadWorkspacePeople(context.workspaceId),
    loadRequests(),
  ]);
  return dashboardLeaveItems(requests, people, today);
}
