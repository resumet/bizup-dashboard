import writeXlsxFile, { type Row } from "write-excel-file/node";

import { formatPhone } from "@/lib/jobs/filter";

export type AddressBookExportContact = {
  name: string | null;
  normalized_phone: string;
  email: string | null;
};

export async function buildAddressBookXlsx(
  contacts: AddressBookExportContact[],
) {
  const header = ["이름", "전화번호", "이메일"].map((value) => ({
    value,
    fontWeight: "bold" as const,
    color: "#111827",
    backgroundColor: "#FFFFFF",
  }));
  const sheetData: Row[] = [
    header,
    ...contacts.map(
      (contact): Row => [
        contact.name ?? "",
        { value: formatPhone(contact.normalized_phone), type: String },
        contact.email ?? "",
      ],
    ),
  ];

  return writeXlsxFile(sheetData, {
    sheet: "주소록",
    stickyRowsCount: 1,
    columns: [{ width: 20 }, { width: 18 }, { width: 32 }],
  }).toBuffer();
}
