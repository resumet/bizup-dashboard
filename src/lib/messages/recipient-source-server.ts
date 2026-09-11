import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { AddressBookContactRow } from "@/lib/address-books/load";
import { loadJobEnrollmentRows } from "@/lib/jobs/server";
import { dedupeMessageRecipientsByPhone } from "./dispatch";
import { parseRecipientSource } from "./recipient-source";

export async function loadMessageSource(supabase: SupabaseClient, sourceId: string) {
  const source = parseRecipientSource(sourceId);
  if (source.kind === "roster") {
    const { data, error } = await supabase.from("course_jobs")
      .select("id,name,workspace_id,latest_version,valid_count,status").eq("id", source.id).maybeSingle();
    if (error || !data) throw new Error("수강생 명단을 찾을 수 없거나 접근 권한이 없습니다.");
    if (data.status !== "ready") throw new Error("분석이 완료된 수강생 명단을 선택해 주세요.");
    return { ...source, name: data.name as string, workspace_id: data.workspace_id as string, contact_count: data.valid_count as number, version: data.latest_version as number };
  }
  const { data, error } = await supabase.from("address_books")
    .select("id,name,workspace_id,contact_count").eq("id", source.id).maybeSingle();
  if (error || !data) throw new Error("주소록을 찾을 수 없거나 접근 권한이 없습니다.");
  return { ...source, name: data.name as string, workspace_id: data.workspace_id as string, contact_count: data.contact_count as number, version: undefined };
}

export async function loadRosterMessageContacts(
  supabase: SupabaseClient,
  jobId: string,
  version: number,
  selectedIds?: string[],
): Promise<AddressBookContactRow[]> {
  const rows = await loadJobEnrollmentRows(supabase, jobId, version);
  const selected = selectedIds ? new Set(selectedIds) : null;
  return dedupeMessageRecipientsByPhone(
    rows
      .filter((row) => !selected || selected.has(row.id))
      .map((row) => ({
        id: row.id,
        name: row.values?.customerName ?? "",
        email: row.values?.email ?? "",
        normalized_phone: row.normalizedPhone,
      })),
    (contact) => contact.normalized_phone,
  );
}
