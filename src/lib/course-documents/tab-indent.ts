import type { EditorState, Transaction } from "@tiptap/pm/state";

export const THREE_SPACE_INDENT = "   ";

type DispatchTransaction = (transaction: Transaction) => void;

function selectedLineStarts(state: EditorState) {
  const { from, to } = state.selection;
  const positions: number[] = [];

  state.doc.descendants((node, position) => {
    if (!node.isTextblock) return true;

    const contentStart = position + 1;
    const contentEnd = contentStart + node.content.size;
    const lineStarts = [contentStart];

    node.descendants((child, relativePosition) => {
      if (child.type.name === "hardBreak") {
        lineStarts.push(contentStart + relativePosition + child.nodeSize);
      }
    });

    lineStarts.forEach((lineStart, index) => {
      const lineEnd = lineStarts[index + 1] ?? contentEnd;
      const isSelected = lineStart === lineEnd
        ? lineStart >= from && lineStart < to
        : lineStart < to && lineEnd > from;

      if (isSelected) positions.push(lineStart);
    });

    return false;
  });

  return [...new Set(positions)].sort((left, right) => right - left);
}

export function indentSelectionWithThreeSpaces(
  state: EditorState,
  dispatch?: DispatchTransaction,
) {
  const { selection } = state;

  if (selection.empty) {
    if (!selection.$from.parent.isTextblock) return false;
    dispatch?.(state.tr.insertText(THREE_SPACE_INDENT, selection.from).scrollIntoView());
    return true;
  }

  const positions = selectedLineStarts(state);
  if (!positions.length) return false;

  if (dispatch) {
    const transaction = state.tr;
    positions.forEach((position) => transaction.insertText(THREE_SPACE_INDENT, position));
    dispatch(transaction.scrollIntoView());
  }

  return true;
}
