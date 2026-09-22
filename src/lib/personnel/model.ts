import { z } from "zod";

export const statusLabels = { employed: "재직", resigned: "퇴사", dismissed: "해고" } as const;
export const actionLabels = { hire: "신규채용", update: "정보 수정", rehire: "재입사", resign: "퇴사", dismiss: "해고", reveal: "주민번호 조회" } as const;
export type Personnel = {
  id: string; user_id: string | null; email: string; name: string; address: string; phone: string; memo: string;
  employment_start_date: string; contract_end_date: string | null; annual_salary: number | null;
  bank_name: string; bank_account: string;
  status: keyof typeof statusLabels; version: number; has_resident_number: boolean;
};
export type PersonnelList = { items: Pick<Personnel, "id" | "user_id" | "email" | "name" | "employment_start_date" | "status" | "version">[]; total: number; accounts: { id: string; email: string }[] };
export type PersonnelDetail = {
  employee: Personnel;
  periods: { id: string; start_date: string; end_date: string | null; end_reason: string | null }[];
  events: { id: string; action: keyof typeof actionLabels; reason: string; effective_date: string; actor_name: string; created_at: string }[];
  leave: { year: number; baseGranted: number; extraGranted: number; used: number; pending: number; remaining: number; availableToRequest: number; upcoming: number };
};
const text = (max: number) => z.string().trim().max(max);
export const personnelInput = z.object({
  id: z.uuid().optional(), expected_version: z.number().int().positive().optional(),
  action: z.enum(["hire", "update", "rehire", "resign", "dismiss"]),
  user_id: z.uuid().nullable(), email: z.email().max(254), name: text(100).min(1), address: text(500), phone: text(40), memo: text(10000),
  resident_number: z.string().regex(/^(?:\d{6}-?[1-8]\d{6})?$/, "주민번호 13자리를 확인해 주세요.").optional(),
  bank_name: text(100).optional(), bank_account: text(50).regex(/^[0-9 -]*$/, "계좌번호는 숫자, 공백, 하이픈만 입력해 주세요.").optional(),
  employment_start_date: z.iso.date(), contract_end_date: z.iso.date().nullable(), annual_salary: z.number().int().min(0).max(999999999999).nullable(),
  effective_date: z.iso.date(), reason: text(2000).min(1),
}).strict().superRefine((value, ctx) => {
  if (value.action !== "hire" && (!value.id || value.expected_version === undefined)) ctx.addIssue({ code: "custom", message: "직원 및 수정 버전을 확인해 주세요." });
  if (value.contract_end_date && value.contract_end_date < value.employment_start_date) ctx.addIssue({ code: "custom", message: "계약 종료일은 입사일 이후여야 합니다." });
});
