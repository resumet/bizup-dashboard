import type { RosterRow } from "@/lib/jobs/types";
import { resolveRosterMessageTargets } from "@/lib/messages/roster-recipients";

export function selectCombinedRosterMessageTargets<T extends RosterRow>(
  rows: T[],
  selectedIds: Iterable<string>,
  onlyGroupChatNonParticipants: boolean,
) {
  const selected = new Set(selectedIds);
  return resolveRosterMessageTargets(
    rows.filter(
      (row) =>
        selected.has(row.id) &&
        (!onlyGroupChatNonParticipants ||
          (!row.groupChatJoined && !row.isExtraParticipant)),
    ),
  );
}
