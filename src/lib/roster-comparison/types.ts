export type ComparisonKey = "phone" | "email";
export type ComparisonContact = { name: string; phone: string; email: string; source: string; rowNumber: number; refunded?: boolean };
export type ComparisonPerson = { name: string; phone: string; email: string; sources: string[]; rowCount: number };
export type ComparisonRoster = { id: string; name: string; courseName: string; count: number; updatedAt: string };
export type RosterDuplicatesResult = {
  matchBy: ComparisonKey;
  duplicates: ComparisonPerson[];
  invalid: ComparisonContact[];
  totalRows: number;
  uniqueCount: number;
  duplicateRows: number;
};
export type RosterComparisonResult = {
  matchBy: ComparisonKey;
  payerOnly: ComparisonPerson[];
  studentOnly: ComparisonPerson[];
  invalidPayers: ComparisonContact[];
  invalidStudents: ComparisonContact[];
  payerRows: number;
  studentRows: number;
  payerCount: number;
  studentCount: number;
  matchedCount: number;
  payerDuplicateRows: number;
  studentDuplicateRows: number;
};
