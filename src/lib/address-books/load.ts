import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export type AddressBookContactRow = {
  id: string;
  name: string | null;
  email: string | null;
  normalized_phone: string;
};

const PAGE_SIZE = 1_000;

export async function loadAddressBookContactsPage(
  supabase: SupabaseClient,
  addressBookId: string,
  {
    page,
    pageSize,
    keyword,
    sort = "nameAsc",
  }: {
    page: number;
    pageSize: number;
    keyword: string;
    sort?: "nameAsc" | "nameDesc";
  },
) {
  const safeKeyword = keyword
    .trim()
    .replace(/[%_,().]/g, " ")
    .replace(/\s+/g, " ");
  const phoneKeyword = keyword.replace(/\D/g, "");
  const shouldCount = Boolean(safeKeyword || phoneKeyword);
  let query = shouldCount
    ? supabase
        .from("address_book_contacts")
        .select("id,name,email,normalized_phone", { count: "exact" })
        .eq("address_book_id", addressBookId)
    : supabase
        .from("address_book_contacts")
        .select("id,name,email,normalized_phone")
        .eq("address_book_id", addressBookId);
  if (safeKeyword || phoneKeyword) {
    const filters = [
      safeKeyword && `name.ilike.%${safeKeyword}%`,
      safeKeyword && `email.ilike.%${safeKeyword}%`,
      phoneKeyword && `normalized_phone.ilike.%${phoneKeyword}%`,
    ]
      .filter(Boolean)
      .join(",");
    query = query.or(filters);
  }
  const from = (page - 1) * pageSize;
  const { data, count, error } = await query
    .order("name", { ascending: sort === "nameAsc", nullsFirst: false })
    .order("id")
    .range(from, from + pageSize - 1);
  if (error) throw new Error(`주소록 연락처 조회 실패: ${error.code}`);
  return {
    contacts: (data ?? []) as AddressBookContactRow[],
    totalCount: shouldCount ? (count ?? 0) : 0,
  };
}

export async function loadAllAddressBookContacts(
  supabase: SupabaseClient,
  addressBookId: string,
) {
  const contacts: AddressBookContactRow[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("address_book_contacts")
      .select("id,name,email,normalized_phone")
      .eq("address_book_id", addressBookId)
      .order("id")
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw new Error(`주소록 연락처 조회 실패: ${error.code}`);
    contacts.push(...((data ?? []) as AddressBookContactRow[]));
    if ((data?.length ?? 0) < PAGE_SIZE) break;
  }
  return contacts;
}
