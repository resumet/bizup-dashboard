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
  options: { callSalesOnly?: boolean } = {},
) {
  const contactsByPhone = new Map<string, MergedAddressBookContact>();
  const excludedContacts: Array<MergeableAddressBookContact & { sourceGroupIndex: number }> = [];
  let sourceContactCount = 0;

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
      const existing = contactsByPhone.get(normalizedPhone);

      if (!existing) {
        contactsByPhone.set(normalizedPhone, {
          normalized_phone: normalizedPhone,
          name,
          email,
        });
        continue;
      }

      contactsByPhone.set(normalizedPhone, {
        normalized_phone: normalizedPhone,
        name: existing.name ?? name,
        email: existing.email ?? email,
      });
    }
  }

  return {
    contacts: Array.from(contactsByPhone.values()),
    sourceContactCount,
    duplicateCount: sourceContactCount - excludedContacts.length - contactsByPhone.size,
    excludedContacts,
  };
}
