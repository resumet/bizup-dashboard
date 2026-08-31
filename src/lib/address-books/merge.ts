export type MergeableAddressBookContact = {
  normalized_phone: string;
  name: string | null;
  email: string | null;
};

export type MergedAddressBookContact = MergeableAddressBookContact;

function cleanOptionalValue(value: string | null) {
  const cleaned = value?.trim();
  return cleaned ? cleaned : null;
}

export function mergeAddressBookContacts(
  contactGroups: readonly (readonly MergeableAddressBookContact[])[],
) {
  const contactsByPhone = new Map<string, MergedAddressBookContact>();
  let sourceContactCount = 0;

  for (const contacts of contactGroups) {
    for (const contact of contacts) {
      sourceContactCount += 1;
      const normalizedPhone = contact.normalized_phone.trim();
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
    duplicateCount: sourceContactCount - contactsByPhone.size,
  };
}
