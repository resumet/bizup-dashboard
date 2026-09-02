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
};

export function compareRosterRecords(
  current: StoredRosterRecord[],
  incoming: StoredRosterRecord[],
): RosterDiffResult {
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

  incoming.forEach((record) => {
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
    removals: current.filter((_, index) => !matchedCurrentIndexes.has(index)),
    matches,
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
  options: { approveAdditions: boolean; approveRemovals: boolean },
) {
  const diff = compareRosterRecords(current, incoming);
  const currentBuckets = new Map<string, StoredRosterRecord[]>();
  current.forEach((record) => {
    const bucket = currentBuckets.get(record.normalizedPhone) ?? [];
    bucket.push(record);
    currentBuckets.set(record.normalizedPhone, bucket);
  });

  const nextRecords = incoming.flatMap((record) => {
    const matched = currentBuckets.get(record.normalizedPhone)?.shift();
    if (!matched) return options.approveAdditions ? [record] : [];

    const normalizedValues = {
      ...record.normalizedValues,
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
      },
    ];
  });

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
    sourceRowNumber: index + 2,
    isDuplicate: (phoneCounts.get(record.normalizedPhone) ?? 0) > 1,
  }));
}
