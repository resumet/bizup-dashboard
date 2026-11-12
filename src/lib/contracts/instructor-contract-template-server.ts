import "server-only";

import { ZodError } from "zod";

import { hasAdminAccess } from "@/lib/admin/access";
import {
  BUILT_IN_INSTRUCTOR_CONTRACT_TEMPLATE_ID,
  DEFAULT_INSTRUCTOR_CONTRACT_TEMPLATE,
  renderInstructorContractTemplate,
  type InstructorContractDetail,
  type InstructorContractInstructor,
  type InstructorContractParty,
  type InstructorContractListItem,
  type InstructorContractTemplate,
  type InstructorContractTemplateRecord,
  type InstructorContractValues,
} from "@/lib/contracts/instructor-contract";
import {
  parseInstructorContractTemplate,
  parseInstructorContractValues,
  parseRenderedInstructorContractContent,
} from "@/lib/contracts/instructor-contract-validation";
import { requireCourseOperationsMembership } from "@/lib/course-operations/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

type TemplateRow = {
  id: string;
  name: string;
  template: unknown;
  created_at: string;
  updated_at: string;
};

type ContractListRow = {
  id: string;
  title: string;
  template_name: string;
  instructor_name: string;
  lecture_name: string;
  created_by_name: string;
  created_by: string | null;
  created_at: string;
};

type ContractDetailRow = ContractListRow & {
  contract_values: unknown;
  rendered_content: unknown;
};

type InstructorRow = {
  id: string;
  name: string;
  address: string;
  phone: string;
  email: string;
  updated_at: string;
  party_type?: "instructor" | "supplier";
  details?: Record<string, string>;
};

const TEMPLATE_COLUMNS = "id,name,template,created_at,updated_at";
const CONTRACT_LIST_COLUMNS = "id,title,template_name,instructor_name,lecture_name,created_by_name,created_by,created_at";
const CONTRACT_DETAIL_COLUMNS = `${CONTRACT_LIST_COLUMNS},contract_values,rendered_content`;
const INSTRUCTOR_COLUMNS = "id,name,address,phone,email,updated_at,party_type,details";

export class InstructorContractError extends Error {
  constructor(message: string, public readonly status = 400) {
    super(message);
  }
}

export function instructorContractResponseError(error: unknown) {
  if (error instanceof InstructorContractError) {
    return Response.json({ message: error.message }, { status: error.status });
  }
  if (error instanceof ZodError) {
    return Response.json({ message: error.issues[0]?.message ?? "입력값을 확인해 주세요." }, { status: 400 });
  }
  if (error instanceof SyntaxError) {
    return Response.json({ message: "요청 내용을 확인해 주세요." }, { status: 400 });
  }
  console.error("instructor_contract_failed", error instanceof Error ? error.message : error);
  return Response.json({ message: "계약서를 처리하지 못했습니다. 잠시 후 다시 시도해 주세요." }, { status: 500 });
}

export function assertInstructorContractOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return;
  const host = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim()
    || request.headers.get("host")
    || new URL(request.url).host;
  try {
    const source = new URL(origin);
    if (["http:", "https:"].includes(source.protocol) && source.host === host) return;
  } catch {
    // Malformed origins are rejected below.
  }
  throw new InstructorContractError("다른 사이트에서 보낸 요청은 허용하지 않습니다.", 403);
}

export async function requireInstructorContractContext() {
  const user = await getAuthenticatedUser(await createClient());
  if (!user) throw new InstructorContractError("로그인이 필요합니다.", 401);
  const membership = await requireCourseOperationsMembership(user.id);
  return {
    admin: createAdminClient(),
    workspaceId: membership.workspace_id as string,
    user,
    isAdmin: hasAdminAccess(user.email, membership.role),
  };
}

type ContractContext = Awaited<ReturnType<typeof requireInstructorContractContext>>;

export function assertCanManageInstructorContractTemplates(context: Pick<ContractContext, "isAdmin">) {
  if (!context.isAdmin) {
    throw new InstructorContractError("관리자만 계약서 템플릿을 관리할 수 있습니다.", 403);
  }
}

function databaseError(error: { code?: string; message: string }) {
  const value = `${error.code ?? ""} ${error.message}`;
  if (/PGRST20[45]|42P01|42703/u.test(value)) {
    throw new InstructorContractError("계약서 데이터베이스 마이그레이션을 먼저 적용해 주세요.", 503);
  }
  throw new Error(`Instructor contract database: ${error.code ?? error.message}`);
}

function normalizeTemplate(row: TemplateRow): InstructorContractTemplateRecord {
  const template = parseInstructorContractTemplate(row.template);
  if (!template) throw new Error("저장된 계약서 템플릿 형식이 올바르지 않습니다.");
  return {
    id: row.id,
    name: row.name,
    template,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function builtInInstructorContractTemplate(): InstructorContractTemplateRecord {
  return {
    id: BUILT_IN_INSTRUCTOR_CONTRACT_TEMPLATE_ID,
    name: "기본 계약서",
    template: DEFAULT_INSTRUCTOR_CONTRACT_TEMPLATE,
    createdAt: null,
    updatedAt: null,
    isBuiltIn: true,
  };
}

export async function loadInstructorContractTemplates(workspaceId: string) {
  const { data, error } = await createAdminClient()
    .from("instructor_contract_templates")
    .select(TEMPLATE_COLUMNS)
    .eq("workspace_id", workspaceId)
    .order("updated_at", { ascending: false })
    .order("id", { ascending: false });
  if (error) databaseError(error);
  return ((data ?? []) as TemplateRow[]).map(normalizeTemplate);
}

export async function loadInstructorContractCreationTemplates(workspaceId: string) {
  const templates = await loadInstructorContractTemplates(workspaceId);
  return templates.length ? templates : [builtInInstructorContractTemplate()];
}

function duplicateTemplateName(error: { code?: string; message: string }) {
  return error.code === "23505" && /workspace_name/u.test(error.message);
}

export async function createInstructorContractTemplate(
  context: ContractContext,
  input: { name: string; template: InstructorContractTemplate },
) {
  assertCanManageInstructorContractTemplates(context);
  const now = new Date().toISOString();
  const { data, error } = await context.admin
    .from("instructor_contract_templates")
    .insert({
      workspace_id: context.workspaceId,
      name: input.name,
      template: input.template,
      created_by: context.user.id,
      updated_by: context.user.id,
      created_at: now,
      updated_at: now,
    })
    .select(TEMPLATE_COLUMNS)
    .single();
  if (error) {
    if (duplicateTemplateName(error)) throw new InstructorContractError("같은 이름의 계약서 템플릿이 이미 있습니다.", 409);
    databaseError(error);
  }
  return normalizeTemplate(data as TemplateRow);
}

export async function updateInstructorContractTemplate(
  context: ContractContext,
  templateId: string,
  input: { name: string; template: InstructorContractTemplate },
) {
  assertCanManageInstructorContractTemplates(context);
  const { data, error } = await context.admin
    .from("instructor_contract_templates")
    .update({
      name: input.name,
      template: input.template,
      updated_by: context.user.id,
      updated_at: new Date().toISOString(),
    })
    .eq("workspace_id", context.workspaceId)
    .eq("id", templateId)
    .select(TEMPLATE_COLUMNS)
    .maybeSingle();
  if (error) {
    if (duplicateTemplateName(error)) throw new InstructorContractError("같은 이름의 계약서 템플릿이 이미 있습니다.", 409);
    databaseError(error);
  }
  if (!data) throw new InstructorContractError("계약서 템플릿을 찾을 수 없습니다.", 404);
  return normalizeTemplate(data as TemplateRow);
}

export async function deleteInstructorContractTemplate(context: ContractContext, templateId: string) {
  assertCanManageInstructorContractTemplates(context);
  const { data, error } = await context.admin
    .from("instructor_contract_templates")
    .delete()
    .eq("workspace_id", context.workspaceId)
    .eq("id", templateId)
    .select("id")
    .maybeSingle();
  if (error) databaseError(error);
  if (!data) throw new InstructorContractError("계약서 템플릿을 찾을 수 없습니다.", 404);
}

function normalizeContractListItem(row: ContractListRow): InstructorContractListItem {
  return {
    id: row.id,
    title: row.title,
    templateName: row.template_name,
    instructorName: row.instructor_name,
    lectureName: row.lecture_name,
    createdByName: row.created_by_name,
    createdById: row.created_by,
    createdAt: row.created_at,
  };
}

export async function loadInstructorContracts(context: ContractContext) {
  const contracts: InstructorContractListItem[] = [];
  const pageSize = 500;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await context.admin
      .from("instructor_contracts")
      .select(CONTRACT_LIST_COLUMNS)
      .eq("workspace_id", context.workspaceId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, from + pageSize - 1);
    if (error) databaseError(error);
    const rows = (data ?? []) as ContractListRow[];
    contracts.push(...rows.map(normalizeContractListItem));
    if (rows.length < pageSize) return contracts;
  }
}

function normalizeInstructor(row: InstructorRow): InstructorContractInstructor {
  return {
    id: row.id,
    instructorName: row.name,
    address: row.address,
    phone: row.phone,
    email: row.email,
    updatedAt: row.updated_at,
  };
}

function normalizeParty(row: InstructorRow): InstructorContractParty {
  return {
    ...normalizeInstructor(row),
    partyType: row.party_type === "supplier" ? "supplier" : "instructor",
    details: row.details && typeof row.details === "object" ? row.details : {},
  };
}

export async function loadInstructorContractParties(context: ContractContext) {
  const { data, error } = await context.admin
    .from("instructor_contract_instructors")
    .select(INSTRUCTOR_COLUMNS)
    .eq("workspace_id", context.workspaceId)
    .order("name", { ascending: true })
    .order("id", { ascending: true });
  if (error) databaseError(error);
  return ((data ?? []) as InstructorRow[]).map(normalizeParty);
}

export async function loadInstructorContractInstructors(context: ContractContext) {
  return (await loadInstructorContractParties(context)).filter((party) => party.partyType === "instructor");
}

export async function createInstructorContractInstructor(
  context: ContractContext,
  input: Omit<InstructorContractParty, "id" | "updatedAt">,
) {
  const now = new Date().toISOString();
  const { data, error } = await context.admin
    .from("instructor_contract_instructors")
    .insert({
      workspace_id: context.workspaceId,
      name: input.instructorName,
      address: input.address,
      phone: input.phone,
      email: input.email,
      party_type: input.partyType,
      details: input.details,
      created_by: context.user.id,
      updated_by: context.user.id,
      created_at: now,
      updated_at: now,
    })
    .select(INSTRUCTOR_COLUMNS)
    .single();
  if (error) {
    if (error.code === "23505") throw new InstructorContractError("같은 이름의 강사 정보가 이미 있습니다.", 409);
    databaseError(error);
  }
  return normalizeParty(data as InstructorRow);
}

export async function updateInstructorContractInstructor(
  context: ContractContext,
  instructorId: string,
  input: Omit<InstructorContractParty, "id" | "updatedAt">,
) {
  const { data, error } = await context.admin
    .from("instructor_contract_instructors")
    .update({
      name: input.instructorName,
      address: input.address,
      phone: input.phone,
      email: input.email,
      party_type: input.partyType,
      details: input.details,
      updated_by: context.user.id,
      updated_at: new Date().toISOString(),
    })
    .eq("workspace_id", context.workspaceId)
    .eq("id", instructorId)
    .select(INSTRUCTOR_COLUMNS)
    .maybeSingle();
  if (error) {
    if (error.code === "23505") throw new InstructorContractError("같은 이름의 거래처 정보가 이미 있습니다.", 409);
    databaseError(error);
  }
  if (!data) throw new InstructorContractError("거래처 정보를 찾을 수 없습니다.", 404);
  return normalizeParty(data as InstructorRow);
}

export async function deleteInstructorContractInstructor(context: ContractContext, instructorId: string) {
  const { data, error } = await context.admin
    .from("instructor_contract_instructors")
    .delete()
    .eq("workspace_id", context.workspaceId)
    .eq("id", instructorId)
    .select("id")
    .maybeSingle();
  if (error) databaseError(error);
  if (!data) throw new InstructorContractError("강사 정보를 찾을 수 없습니다.", 404);
}

function contractTitle(values: InstructorContractValues) {
  const instructor = values.instructorName.trim() || "강사명 미입력";
  const lecture = values.lectureName.trim() || "강의명 미입력";
  return `${instructor} - ${lecture} 계약서`.slice(0, 200);
}

function createdByName(context: ContractContext) {
  const name = context.user.displayName?.trim()
    || context.user.email?.split("@")[0]?.trim()
    || "사용자";
  return name.slice(0, 100);
}

async function selectedTemplate(context: ContractContext, templateId: string) {
  if (templateId === BUILT_IN_INSTRUCTOR_CONTRACT_TEMPLATE_ID) {
    return { id: null, name: "기본 계약서", template: DEFAULT_INSTRUCTOR_CONTRACT_TEMPLATE };
  }
  const { data, error } = await context.admin
    .from("instructor_contract_templates")
    .select(TEMPLATE_COLUMNS)
    .eq("workspace_id", context.workspaceId)
    .eq("id", templateId)
    .maybeSingle();
  if (error) databaseError(error);
  if (!data) throw new InstructorContractError("선택한 계약서 템플릿을 찾을 수 없습니다.", 404);
  const normalized = normalizeTemplate(data as TemplateRow);
  return { id: normalized.id, name: normalized.name, template: normalized.template };
}

export async function createInstructorContract(
  context: ContractContext,
  templateId: string,
  values: InstructorContractValues,
) {
  const template = await selectedTemplate(context, templateId);
  const renderedContent = renderInstructorContractTemplate(template.template, values);
  const { data, error } = await context.admin
    .from("instructor_contracts")
    .insert({
      workspace_id: context.workspaceId,
      template_id: template.id,
      template_name: template.name,
      title: contractTitle(values),
      instructor_name: values.instructorName.trim(),
      lecture_name: values.lectureName.trim(),
      contract_values: values,
      rendered_content: renderedContent,
      created_by: context.user.id,
      created_by_name: createdByName(context),
    })
    .select("id")
    .single();
  if (error) databaseError(error);
  const { error: draftError } = await context.admin
    .from("instructor_contract_drafts")
    .delete()
    .eq("workspace_id", context.workspaceId)
    .eq("user_id", context.user.id);
  if (draftError) databaseError(draftError);
  return data as { id: string };
}

export async function loadInstructorContract(context: ContractContext, contractId: string): Promise<InstructorContractDetail> {
  const { data, error } = await context.admin
    .from("instructor_contracts")
    .select(CONTRACT_DETAIL_COLUMNS)
    .eq("workspace_id", context.workspaceId)
    .eq("id", contractId)
    .maybeSingle();
  if (error) databaseError(error);
  if (!data) throw new InstructorContractError("계약서를 찾을 수 없습니다.", 404);
  const row = data as ContractDetailRow;
  const values = parseInstructorContractValues(row.contract_values);
  const renderedContent = parseRenderedInstructorContractContent(row.rendered_content);
  if (!values || !renderedContent) throw new Error("저장된 계약서 형식이 올바르지 않습니다.");
  return {
    ...normalizeContractListItem(row),
    values,
    renderedContent,
  };
}

export async function deleteInstructorContract(context: ContractContext, contractId: string) {
  const { data: current, error: currentError } = await context.admin
    .from("instructor_contracts")
    .select("id,created_by")
    .eq("workspace_id", context.workspaceId)
    .eq("id", contractId)
    .maybeSingle();
  if (currentError) databaseError(currentError);
  if (!current) throw new InstructorContractError("계약서를 찾을 수 없습니다.", 404);
  if (!context.isAdmin && current.created_by !== context.user.id) {
    throw new InstructorContractError("작성자 또는 관리자만 계약서를 삭제할 수 있습니다.", 403);
  }
  const { error } = await context.admin
    .from("instructor_contracts")
    .delete()
    .eq("workspace_id", context.workspaceId)
    .eq("id", contractId);
  if (error) databaseError(error);
}

