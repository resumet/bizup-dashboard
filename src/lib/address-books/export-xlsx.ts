import writeXlsxFile, { type Row } from "write-excel-file/node";

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
    color: "#ffffff",
    backgroundColor: "#111827",
  }));
  const sheetData: Row[] = [
    header,
    ...contacts.map(
      (contact): Row => [
        contact.name ?? "",
        { value: contact.normalized_phone, type: String },
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
