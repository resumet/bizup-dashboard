import { z } from "zod";

const id = z.uuid();
const date = z.iso.date();
const text = (min: number, max: number) => z.string().trim().min(min).max(max);
const version = z.number().int().nonnegative();
const edit = { id, expected_version: version };
const times = { work_date: date, check_in_at: z.iso.datetime({ offset: true }), check_out_at: z.iso.datetime({ offset: true }).nullable(), reason: text(1, 2000) };
const leave = { start_date: date, end_date: date, unit: z.enum(["full", "am", "pm"]), private_reason: text(0, 2000).optional(), admin_reason: text(0, 2000).optional() };
const person = { name: text(1, 100), department: text(0, 100), role: z.enum(["employee", "admin"]), employment_start_date: date };
const policy = z.object({ weekdays: z.array(z.number().int().min(1).max(7)).min(1).max(7), start: z.number().int().min(0).max(1439), end: z.number().int().min(1).max(1440), split: z.number().int().min(1).max(1439), breaks: z.array(z.tuple([z.number().int(), z.number().int()])).max(20), grace: z.number().int().min(0).max(120), holidays: z.array(z.object({ date, name: text(1, 100) }).strict()).max(1000) }).strict();
const policyBody = { effective_from: date, config: policy, expected_version: version };
export const commandSchemas = {
  "attendance.in": z.object({}).strict(),
  "attendance.out": z.object(edit).strict(),
  "task.create": z.object({ title: text(1, 150), description: text(0, 10000).optional(), assignee_id: id.optional(), watcher_ids: z.array(id).max(100).optional(), planned_date: date.optional() }).strict(),
  "task.update": z.object({ ...edit, title: text(1, 150).optional(), description: text(0, 10000).optional(), watcher_ids: z.array(id).max(100).optional(), planned_date: date.optional() }).strict(),
  "task.status": z.object({ ...edit, status: z.enum(["ready", "doing", "done", "cancelled"]), reason: text(0, 1000).optional() }).strict(),
  "task.transfer": z.object({ ...edit, new_assignee_id: id, handover_note: text(1, 2000) }).strict(),
  "task.comment": z.object({ id, body: text(1, 10000) }).strict(),
  "review.submit": z.object({ work_date: date, expected_version: version, note: text(0, 3000), items: z.array(z.object({ id, expected_version: version, work_note: text(0, 3000).optional() }).strict()).max(10000) }).strict(),
  "leave.create": z.object({ ...leave, employee_id: id.optional() }).strict(),
  "leave.update": z.object({ ...edit, ...leave }).strict(),
  "leave.cancel": z.object({ ...edit, reason: text(1, 2000), admin_reason: text(0, 2000).optional() }).strict(),
  "correction.request": z.object(times).strict(),
  "correction.direct": z.object({ ...times, employee_id: id, expected_version: version }).strict(),
  "correction.resolve": z.object({ id, decision: z.enum(["applied", "rejected"]), reason: text(1, 2000) }).strict(),
  "employee.update": z.object({ ...edit, ...person, active: z.boolean(), employment_end_date: date.nullable().optional(), reason: text(1, 2000) }).strict(),
  "invitation.reserve": z.object({ ...person, email: z.email().max(254) }).strict(),
  "invitation.retry": z.object({ id }).strict(),
  "invitation.inspect": z.object({ id }).strict(),
  "policy.preview": z.object(policyBody).strict(),
  "policy.save": z.object({ ...policyBody, confirm_impact: z.array(z.record(z.string(), z.unknown())).max(10000) }).strict(),
  "notification.read": z.object({ id }).strict(),
};
export type HrAction = keyof typeof commandSchemas;
export const queryResources = ["context", "directory", "today", "tasks", "task", "records", "leaves", "calendar", "leave.preview", "notifications", "employees", "policies", "admin", "outbox"] as const;
export const queryFilter = z.object({ id: id.optional(), employee_id: id.optional(), assignee_id: id.optional(), date: date.optional(), from: date.optional(), to: date.optional(), planned_date: date.optional(), start_date: date.optional(), end_date: date.optional(), unit: z.enum(["full", "am", "pm"]).optional(), scope: z.enum(["all", "assigned", "created", "watching"]).optional(), status: z.enum(["all", "open", "ready", "doing", "done", "cancelled"]).optional(), q: text(0, 150).optional(), department: text(0, 100).optional(), base: text(0, 30).optional(), needs_attention: z.enum(["true", "false"]).optional(), review_missing: z.enum(["true", "false"]).optional(), page: z.coerce.number().int().min(0).max(100000).optional(), limit: z.coerce.number().int().min(1).max(100).optional() }).strict();
