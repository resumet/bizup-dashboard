import type { RosterRow } from "@/lib/jobs/types";
import { dedupeMessageRecipientsByPhone } from "@/lib/messages/dispatch";

export function selectCombinedRosterMessageTargets<T extends RosterRow>(
  rows: T[],
  selectedIds: Iterable<string>,
  onlyGroupChatNonParticipants: boolean,
) {
  const selected = new Set(selectedIds);
  return dedupeMessageRecipientsByPhone(
    rows.filter(
      (row) =>
        selected.has(row.id) &&
        (!onlyGroupChatNonParticipants ||
          (!row.groupChatJoined && !row.isExtraParticipant)),
    ),
    (row) => row.normalizedPhone,
  );
}
