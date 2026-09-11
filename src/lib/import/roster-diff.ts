import type { StandardField } from "./contract";
import type { StoredRosterRecord } from "./roster";

export type RosterDiffItem = {
  phone: string;
  name: string;
  email: string;
  courseName: string;
  optionName: string;
};

export type RosterDiffResult = {
  additions: StoredRosterRecord[];
  removals: StoredRosterRecord[];
  matches: Array<{
    current: StoredRosterRecord;
    incoming: StoredRosterRecord;
  }>;
  nameConflicts: Array<{
    id: string;
    incoming: StoredRosterRecord;
    otherNames: string[];
  }>;
  protectedCurrent: StoredRosterRecord[];
};

export type NameConflictDecisions = Record<string, "add" | "skip">;

function comparisonName(record: StoredRosterRecord) {
  return record.normalizedValues.customerName.normalize("NFKC").trim();
}

export function compareRosterRecords(
  current: StoredRosterRecord[],
  incoming: StoredRosterRecord[],
): RosterDiffResult {
  const namesByPhone = new Map<string, Set<string>>();
  for (const record of [...current, ...incoming]) {
    const names = namesByPhone.get(record.normalizedPhone) ?? new Set<string>();
    names.add(comparisonName(record));
    namesByPhone.set(record.normalizedPhone, names);
  }
  const conflictPhones = new Set(incoming
    .filter((record) => (namesByPhone.get(record.normalizedPhone)?.size ?? 0) > 1)
    .map((record) => record.normalizedPhone));
  const currentBuckets = new Map<
    string,
    Array<{ index: number; record: StoredRosterRecord }>
  >();
  current.forEach((record, index) => {
    const bucket = currentBuckets.get(record.normalizedPhone) ?? [];
    bucket.push({ index, record });
    currentBuckets.set(record.normalizedPhone, bucket);
  });

  const matchedCurrentIndexes = new Set<number>();
  const matches: RosterDiffResult["matches"] = [];
  const additions: StoredRosterRecord[] = [];
  const nameConflicts: RosterDiffResult["nameConflicts"] = [];

  incoming.forEach((record, index) => {
    if (conflictPhones.has(record.normalizedPhone)) {
      nameConflicts.push({
        id: String(index),
        incoming: record,
        otherNames: [...namesByPhone.get(record.normalizedPhone)!]
          .filter((name) => name !== comparisonName(record)),
      });
      return;
    }
    const match = currentBuckets.get(record.normalizedPhone)?.shift();
    if (!match) {
      additions.push(record);
      return;
    }
    matchedCurrentIndexes.add(match.index);
    matches.push({ current: match.record, incoming: record });
  });

  return {
    additions,
    removals: current.filter((record, index) => !matchedCurrentIndexes.has(index) && !conflictPhones.has(record.normalizedPhone)),
    matches,
    nameConflicts,
    protectedCurrent: current.filter((record) => conflictPhones.has(record.normalizedPhone)),
  };
}

export function toRosterDiffItem(record: StoredRosterRecord): RosterDiffItem {
  return {
    phone: record.normalizedPhone,
    name: record.normalizedValues.customerName,
    email: record.normalizedValues.email,
    courseName: record.normalizedValues.courseName,
    optionName: record.normalizedValues.optionName,
  };
}

export function buildUpdatedRosterRecords(
  current: StoredRosterRecord[],
  incoming: StoredRosterRecord[],
  options: { approveAdditions: boolean; approveRemovals: boolean; nameConflictDecisions?: NameConflictDecisions; preserveSourceRowNumbers?: boolean },
) {
  const diff = compareRosterRecords(current, incoming);
  const decisions = options.nameConflictDecisions ?? {};
  if (diff.nameConflicts.some(({ id }) => decisions[id] !== "add" && decisions[id] !== "skip")) {
    throw new Error("전화번호가 같고 이름이 다른 모든 항목의 추가 여부를 선택해 주세요.");
  }
  const conflictsByIndex = new Map(diff.nameConflicts.map((conflict) => [conflict.id, conflict]));
  const currentBuckets = new Map<string, StoredRosterRecord[]>();
  current.forEach((record) => {
    const bucket = currentBuckets.get(record.normalizedPhone) ?? [];
    bucket.push(record);
    currentBuckets.set(record.normalizedPhone, bucket);
  });

  const nextRecords = incoming.flatMap((record, index) => {
    if (conflictsByIndex.has(String(index))) {
      return decisions[String(index)] === "add" ? [record] : [];
    }
    const matched = currentBuckets.get(record.normalizedPhone)?.shift();
    if (!matched) return options.approveAdditions ? [record] : [];

    const normalizedValues = {
      ...matched.normalizedValues,
      ...Object.fromEntries(Object.entries(record.normalizedValues)
        .filter(([, value]) => typeof value === "string" && value.trim() !== "")),
      groupChatJoined: matched.normalizedValues.groupChatJoined === true,
      memo:
        typeof matched.normalizedValues.memo === "string"
          ? matched.normalizedValues.memo
          : "",
    } as Record<StandardField, string> & {
      groupChatJoined?: boolean;
      memo?: string;
    };
    return [
      {
        ...record,
        normalizedValues,
        isExtraParticipant: matched.isExtraParticipant === true,
        isManuallyAdded: matched.isManuallyAdded === true,
      },
    ];
  });

  nextRecords.push(...diff.protectedCurrent);
  if (!options.approveRemovals) nextRecords.push(...diff.removals);

  const phoneCounts = new Map<string, number>();
  nextRecords.forEach((record) =>
    phoneCounts.set(
      record.normalizedPhone,
      (phoneCounts.get(record.normalizedPhone) ?? 0) + 1,
    ),
  );

  return nextRecords.map((record, index) => ({
    ...record,
    sourceRowNumber: options.preserveSourceRowNumbers ? record.sourceRowNumber : index + 2,
    isDuplicate: (phoneCounts.get(record.normalizedPhone) ?? 0) > 1,
  }));
}
