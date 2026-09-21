import { annualLeaveDays, leaveDaysForUnit, supportEarnedDays } from "@/lib/hr-leave/policy";
import { assertWorkspaceMember, loadLeaveBalance, requireHrLeaveContext } from "@/lib/hr-leave/server";
import type { HrLeaveUnit, HrSupportType, HrSupportUnit } from "@/lib/hr-leave/types";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function text(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function yearOf(date: string) {
  return Number(date.slice(0, 4));
}

async function audit(workspaceId: string, actorId: string, eventType: string, entityId: string, metadata: object) {
  const { admin } = await requireHrLeaveContext();
  await admin.from("audit_logs").insert({
    workspace_id: workspaceId,
    actor_id: actorId,
    event_type: eventType,
    entity_type: "hr_leave",
    entity_id: entityId,
    metadata,
  });
}

export async function POST(request: Request) {
  try {
    const context = await requireHrLeaveContext();
    const { admin, workspaceId, user, isAdmin } = context;
    const body = await request.json() as Record<string, unknown>;
    const action = text(body.action, 40);

    if (action === "grant") {
      if (!isAdmin) return Response.json({ message: "관리자만 기본 휴가를 부여할 수 있습니다." }, { status: 403 });
      const userId = text(body.userId, 50);
      const employmentStartDate = text(body.employmentStartDate, 10);
      const year = Number(body.year);
      if (!UUID.test(userId) || !DATE.test(employmentStartDate) || !Number.isInteger(year) || year < 2000 || year > 2100) {
        return Response.json({ message: "직원, 입사일과 부여 연도를 확인해 주세요." }, { status: 400 });
      }
      await assertWorkspaceMember(admin, workspaceId, userId);
      const grantedDays = annualLeaveDays(employmentStartDate, year);
      const currentBalance = await loadLeaveBalance(context, userId, year);
      if (grantedDays + currentBalance.extraGranted < currentBalance.used + currentBalance.pending) {
        return Response.json({ message: "이미 사용했거나 승인 대기 중인 휴가보다 적게 부여할 수 없습니다." }, { status: 409 });
      }
      const { error: profileError } = await admin.from("hr_leave_profiles").upsert({
        workspace_id: workspaceId,
        user_id: userId,
        employment_start_date: employmentStartDate,
        created_by: user.id,
        updated_by: user.id,
      }, { onConflict: "workspace_id,user_id" });
      if (profileError) throw profileError;
      const { data, error } = await admin.from("hr_annual_leave_grants").upsert({
        workspace_id: workspaceId,
        user_id: userId,
        grant_year: year,
        granted_days: grantedDays,
        employment_start_date: employmentStartDate,
        granted_by: user.id,
      }, { onConflict: "workspace_id,user_id,grant_year" }).select("*").single();
      if (error) throw error;
      await audit(workspaceId, user.id, "hr_leave.base_granted", data.id, { userId, year, grantedDays, employmentStartDate });
      return Response.json(data);
    }

    if (action === "request") {
      const leaveDate = text(body.leaveDate, 10);
      const unit = text(body.unit, 10) as HrLeaveUnit;
      const reason = text(body.reason, 1000);
      if (!DATE.test(leaveDate) || !["full", "am", "pm"].includes(unit)) {
        return Response.json({ message: "휴가 날짜와 사용 단위를 확인해 주세요." }, { status: 400 });
      }
      if (leaveDate < context.today || yearOf(leaveDate) !== yearOf(context.today)) {
        return Response.json({ message: "현재 연도의 오늘 이후 날짜로 신청해 주세요." }, { status: 400 });
      }
      const { data: overlaps, error: overlapError } = await admin.from("hr_leave_requests").select("unit")
        .eq("workspace_id", workspaceId).eq("user_id", user.id).eq("leave_date", leaveDate)
        .in("status", ["pending", "approved"]);
      if (overlapError) throw overlapError;
      if ((overlaps ?? []).some((row) => unit === "full" || row.unit === "full" || row.unit === unit)) {
        return Response.json({ message: "같은 날짜와 시간에 이미 신청한 휴가가 있습니다." }, { status: 409 });
      }
      const balance = await loadLeaveBalance(context, user.id, yearOf(leaveDate));
      const days = leaveDaysForUnit(unit);
      if (balance.availableToRequest < days) {
        return Response.json({ message: "신청 가능한 휴가가 부족합니다. 승인 대기 신청도 차감해 계산합니다." }, { status: 409 });
      }
      const { data, error } = await admin.from("hr_leave_requests").insert({
        workspace_id: workspaceId, user_id: user.id, leave_date: leaveDate, unit, reason,
      }).select("*").single();
      if (error) throw error;
      await audit(workspaceId, user.id, "hr_leave.requested", data.id, { leaveDate, unit, days });
      return Response.json(data, { status: 201 });
    }

    if (action === "support") {
      const supportDate = text(body.supportDate, 10);
      const supportType = text(body.supportType, 30) as HrSupportType;
      let unit = text(body.unit, 10) as HrSupportUnit;
      const note = text(body.note, 1000);
      if (supportType === "night_webinar") unit = "half";
      if (!DATE.test(supportDate) || !["night_webinar", "weekend_holiday"].includes(supportType) || !["half", "full"].includes(unit)) {
        return Response.json({ message: "지원근무 날짜, 종류와 시간을 확인해 주세요." }, { status: 400 });
      }
      if (supportDate > context.today || yearOf(supportDate) !== yearOf(context.today)) {
        return Response.json({ message: "현재 연도에 실제로 지원한 날짜를 입력해 주세요." }, { status: 400 });
      }
      const { data: duplicate, error: duplicateError } = await admin.from("hr_leave_support_records").select("id")
        .eq("workspace_id", workspaceId).eq("user_id", user.id).eq("support_date", supportDate)
        .eq("support_type", supportType).in("status", ["pending", "approved"]).limit(1).maybeSingle();
      if (duplicateError) throw duplicateError;
      if (duplicate) return Response.json({ message: "같은 날짜의 동일한 지원근무 기록이 있습니다." }, { status: 409 });
      const { data, error } = await admin.from("hr_leave_support_records").insert({
        workspace_id: workspaceId, user_id: user.id, support_date: supportDate, support_type: supportType, unit, note,
      }).select("*").single();
      if (error) throw error;
      await audit(workspaceId, user.id, "hr_leave.support_recorded", data.id, { supportDate, supportType, unit, earnedDays: supportEarnedDays(supportType, unit) });
      return Response.json(data, { status: 201 });
    }

    return Response.json({ message: "지원하지 않는 휴가 작업입니다." }, { status: 400 });
  } catch (error) {
    return Response.json({ message: error instanceof Error ? error.message : "휴가 정보를 저장하지 못했습니다." }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  try {
    const context = await requireHrLeaveContext();
    const { admin, workspaceId, user, isAdmin } = context;
    const body = await request.json() as Record<string, unknown>;
    const action = text(body.action, 40);
    const id = text(body.id, 50);
    if (!UUID.test(id)) return Response.json({ message: "처리할 기록을 확인해 주세요." }, { status: 400 });

    if (action === "review_request") {
      if (!isAdmin) return Response.json({ message: "관리자만 휴가 신청을 검토할 수 있습니다." }, { status: 403 });
      const status = text(body.status, 10);
      if (!["approved", "rejected"].includes(status)) return Response.json({ message: "검토 상태를 확인해 주세요." }, { status: 400 });
      const { data: target, error: targetError } = await admin.from("hr_leave_requests").select("*")
        .eq("id", id).eq("workspace_id", workspaceId).eq("status", "pending").maybeSingle();
      if (targetError) throw targetError;
      if (!target) return Response.json({ message: "승인 대기 중인 휴가 신청을 찾을 수 없습니다." }, { status: 404 });
      if (status === "approved") {
        const balance = await loadLeaveBalance(context, target.user_id, yearOf(target.leave_date));
        if (balance.availableToRequest < 0) return Response.json({ message: "직원의 휴가 잔여량이 부족합니다." }, { status: 409 });
      }
      const { data, error } = await admin.from("hr_leave_requests").update({
        status, review_note: text(body.reviewNote, 1000), reviewed_by: user.id, reviewed_at: new Date().toISOString(),
      }).eq("id", id).eq("status", "pending").select("*").single();
      if (error) throw error;
      await audit(workspaceId, user.id, `hr_leave.request_${status}`, id, { targetUserId: target.user_id });
      return Response.json(data);
    }

    if (action === "review_support") {
      if (!isAdmin) return Response.json({ message: "관리자만 추가휴가 적립을 검토할 수 있습니다." }, { status: 403 });
      const status = text(body.status, 10);
      if (!["approved", "rejected"].includes(status)) return Response.json({ message: "검토 상태를 확인해 주세요." }, { status: 400 });
      const { data, error } = await admin.from("hr_leave_support_records").update({
        status, review_note: text(body.reviewNote, 1000), reviewed_by: user.id, reviewed_at: new Date().toISOString(),
      }).eq("id", id).eq("workspace_id", workspaceId).eq("status", "pending").select("*").maybeSingle();
      if (error) throw error;
      if (!data) return Response.json({ message: "승인 대기 중인 지원근무 기록을 찾을 수 없습니다." }, { status: 404 });
      await audit(workspaceId, user.id, `hr_leave.support_${status}`, id, { targetUserId: data.user_id, earnedDays: data.earned_days });
      return Response.json(data);
    }

    if (action === "cancel_request" || action === "cancel_support") {
      const table = action === "cancel_request" ? "hr_leave_requests" : "hr_leave_support_records";
      let query = admin.from(table).select("id,user_id,status").eq("id", id).eq("workspace_id", workspaceId);
      if (!isAdmin) query = query.eq("user_id", user.id);
      const { data: target, error: targetError } = await query.maybeSingle();
      if (targetError) throw targetError;
      if (!target || !["pending", "approved"].includes(target.status) || (!isAdmin && target.status !== "pending")) {
        return Response.json({ message: "취소할 수 있는 기록을 찾을 수 없습니다." }, { status: 404 });
      }
      if (action === "cancel_support" && target.status === "approved") {
        const { data: support, error: supportError } = await admin.from("hr_leave_support_records")
          .select("support_date,earned_days").eq("id", id).single();
        if (supportError) throw supportError;
        const balance = await loadLeaveBalance(context, target.user_id, yearOf(support.support_date));
        if (balance.availableToRequest - Number(support.earned_days) < 0) {
          return Response.json({ message: "이미 사용한 휴가 때문에 이 추가휴가를 취소할 수 없습니다." }, { status: 409 });
        }
      }
      const { data, error } = await admin.from(table).update({ status: "cancelled" }).eq("id", id).select("*").single();
      if (error) throw error;
      await audit(workspaceId, user.id, `${action}ed`, id, { targetUserId: target.user_id });
      return Response.json(data);
    }

    return Response.json({ message: "지원하지 않는 휴가 작업입니다." }, { status: 400 });
  } catch (error) {
    return Response.json({ message: error instanceof Error ? error.message : "휴가 정보를 변경하지 못했습니다." }, { status: 400 });
  }
}
