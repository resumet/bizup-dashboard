import { normalizePhoneForStorage } from "@/lib/import/roster";

export type MergeableAddressBookContact = {
  normalized_phone: string;
  name: string | null;
  email: string | null;
};

export type MergedAddressBookContact = MergeableAddressBookContact;

export type ExcludedMergeContact = MergeableAddressBookContact & {
  sourceBookId: string;
  sourceBookName: string;
};

function cleanOptionalValue(value: string | null) {
  const cleaned = value?.trim();
  return cleaned ? cleaned : null;
}

export function mergeAddressBookContacts(
  contactGroups: readonly (readonly MergeableAddressBookContact[])[],
  options: { callSalesOnly?: boolean; excludedPhones?: readonly string[] } = {},
) {
  const contactsByPhone = new Map<string, MergedAddressBookContact>();
  const excludedContacts: Array<MergeableAddressBookContact & { sourceGroupIndex: number }> = [];
  let sourceContactCount = 0;
  let duplicateCount = 0;

  for (const [sourceGroupIndex, contacts] of contactGroups.entries()) {
    for (const contact of contacts) {
      sourceContactCount += 1;
      const normalizedPhone = contact.normalized_phone.trim();
      if (options.callSalesOnly && !normalizedPhone.startsWith("010")) {
        excludedContacts.push({ ...contact, normalized_phone: normalizedPhone, sourceGroupIndex });
        continue;
      }
      if (!normalizedPhone) continue;

      const name = cleanOptionalValue(contact.name);
      const email = cleanOptionalValue(contact.email);
      const phoneKey = normalizePhoneForStorage(normalizedPhone);
      if (!phoneKey) continue;
      const existing = contactsByPhone.get(phoneKey);

      if (!existing) {
        contactsByPhone.set(phoneKey, {
          normalized_phone: normalizedPhone,
          name,
          email,
        });
        continue;
      }

      duplicateCount += 1;
      contactsByPhone.set(phoneKey, {
        normalized_phone: existing.normalized_phone,
        name: existing.name ?? name,
        email: existing.email ?? email,
      });
    }
  }

  const excludedPhones = new Set((options.excludedPhones ?? [])
    .map(normalizePhoneForStorage).filter((phone): phone is string => Boolean(phone)));
  let matchedExclusionCount = 0;
  for (const phone of excludedPhones) {
    if (contactsByPhone.delete(phone)) matchedExclusionCount += 1;
  }

  return {
    contacts: Array.from(contactsByPhone.values()),
    sourceContactCount,
    duplicateCount,
    matchedExclusionCount,
    excludedContacts,
  };
}
