const STORAGE_PREFIX = "bizup:roster-message-selection:";
const MAX_SELECTED_RECIPIENTS = 1_000;

type RosterSelectionTransfer = {
  version: 1;
  sourceId: string;
  selectedIds: string[];
};

export function rosterSelectionStorageKey(selectionKey: string) {
  return `${STORAGE_PREFIX}${selectionKey}`;
}

export function serializeRosterSelection(
  sourceId: string,
  selectedIds: string[],
) {
  const payload: RosterSelectionTransfer = {
    version: 1,
    sourceId,
    selectedIds: [...new Set(selectedIds)],
  };
  return JSON.stringify(payload);
}

export function parseRosterSelection(
  value: string | null,
  expectedSourceId: string,
) {
  if (!value) return [];
  try {
    const payload = JSON.parse(value) as Partial<RosterSelectionTransfer>;
    if (
      payload.version !== 1 ||
      payload.sourceId !== expectedSourceId ||
      !Array.isArray(payload.selectedIds)
    ) {
      return [];
    }
    const selectedIds = [
      ...new Set(
        payload.selectedIds.filter(
          (id): id is string => typeof id === "string" && id.length > 0,
        ),
      ),
    ];
    return selectedIds.length <= MAX_SELECTED_RECIPIENTS ? selectedIds : [];
  } catch {
    return [];
  }
}
