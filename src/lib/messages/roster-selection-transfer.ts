const STORAGE_PREFIX = "bizup:roster-message-selection:";
const MAX_SELECTED_RECIPIENTS = 1_000;

type RosterSelectionTransfer = {
  version: 1;
  sourceId: string;
  selectedIds: string[];
  recipients?: RosterSelectionRecipient[];
};

export type RosterSelectionRecipient = {
  id: string;
  name: string;
  phone: string;
};

export function rosterSelectionStorageKey(selectionKey: string) {
  return `${STORAGE_PREFIX}${selectionKey}`;
}

export function serializeRosterSelection(
  sourceId: string,
  selectedIds: string[],
  recipients: RosterSelectionRecipient[] = [],
) {
  const uniqueIds = [...new Set(selectedIds)];
  const selected = new Set(uniqueIds);
  const payload: RosterSelectionTransfer = {
    version: 1,
    sourceId,
    selectedIds: uniqueIds,
    recipients: recipients.filter(
      (recipient, index, items) =>
        selected.has(recipient.id) &&
        items.findIndex((item) => item.id === recipient.id) === index,
    ),
  };
  return JSON.stringify(payload);
}

export function parseRosterSelectionRecipients(
  value: string | null,
  expectedSourceId: string,
) {
  const selectedIds = parseRosterSelection(value, expectedSourceId);
  if (selectedIds.length === 0 || !value) return [];
  try {
    const payload = JSON.parse(value) as Partial<RosterSelectionTransfer>;
    if (!Array.isArray(payload.recipients)) return [];
    const selected = new Set(selectedIds);
    return payload.recipients.filter(
      (recipient, index, items): recipient is RosterSelectionRecipient =>
        Boolean(
          recipient &&
            typeof recipient.id === "string" &&
            typeof recipient.name === "string" &&
            typeof recipient.phone === "string" &&
            selected.has(recipient.id) &&
            items.findIndex((item) => item?.id === recipient.id) === index,
        ),
    );
  } catch {
    return [];
  }
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
