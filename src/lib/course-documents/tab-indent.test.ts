import assert from "node:assert/strict";
import test from "node:test";

import { Schema, type Node as ProseMirrorNode } from "@tiptap/pm/model";
import { EditorState, TextSelection } from "@tiptap/pm/state";

import { indentSelectionWithThreeSpaces } from "./tab-indent";

const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: { content: "inline*", group: "block" },
    text: { group: "inline" },
    hardBreak: { inline: true, group: "inline", selectable: false },
  },
});

function paragraph(text = "") {
  return schema.node("paragraph", null, text ? schema.text(text) : undefined);
}

function textblockStarts(doc: ProseMirrorNode) {
  const starts: number[] = [];
  doc.descendants((node, position) => {
    if (node.isTextblock) starts.push(position + 1);
  });
  return starts;
}

function indent(doc: ProseMirrorNode, from: number, to = from) {
  let state = EditorState.create({ doc, selection: TextSelection.create(doc, from, to) });
  const handled = indentSelectionWithThreeSpaces(state, (transaction) => {
    state = state.apply(transaction);
  });
  return { handled, doc: state.doc };
}

test("Tab inserts three spaces at the cursor", () => {
  const doc = schema.node("doc", null, [paragraph("abcdef")]);
  const [start] = textblockStarts(doc);
  const result = indent(doc, start + 3);

  assert.equal(result.handled, true);
  assert.equal(result.doc.child(0).textContent, "abc   def");
});

test("Tab indents every paragraph touched by a text selection", () => {
  const doc = schema.node("doc", null, [
    paragraph("first line"),
    paragraph("second line"),
    paragraph("third line"),
  ]);
  const starts = textblockStarts(doc);
  const result = indent(doc, starts[0] + 2, starts[2] + 2);

  assert.deepEqual(
    Array.from({ length: result.doc.childCount }, (_, index) => result.doc.child(index).textContent),
    ["   first line", "   second line", "   third line"],
  );
});

test("Tab indents selected hard-break lines without changing earlier lines", () => {
  const doc = schema.node("doc", null, [
    schema.node("paragraph", null, [
      schema.text("alpha"),
      schema.node("hardBreak"),
      schema.text("beta"),
      schema.node("hardBreak"),
      schema.text("gamma"),
    ]),
  ]);
  const [start] = textblockStarts(doc);
  const secondLineStart = start + "alpha".length + 1;
  const thirdLineStart = secondLineStart + "beta".length + 1;
  const result = indent(doc, secondLineStart + 1, thirdLineStart + 2);

  assert.deepEqual(result.doc.child(0).toJSON().content, [
    { type: "text", text: "alpha" },
    { type: "hardBreak" },
    { type: "text", text: "   beta" },
    { type: "hardBreak" },
    { type: "text", text: "   gamma" },
  ]);
});

test("Tab also indents an empty paragraph inside the selection", () => {
  const doc = schema.node("doc", null, [paragraph("first"), paragraph(), paragraph("third")]);
  const starts = textblockStarts(doc);
  const result = indent(doc, starts[0] + 1, starts[2] + 1);

  assert.deepEqual(
    Array.from({ length: result.doc.childCount }, (_, index) => result.doc.child(index).textContent),
    ["   first", "   ", "   third"],
  );
});
