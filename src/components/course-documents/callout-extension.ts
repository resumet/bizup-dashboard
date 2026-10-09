import { mergeAttributes, Node } from "@tiptap/core";

import { DEFAULT_CALLOUT_ICON } from "@/lib/course-documents/callout";

export const Callout = Node.create({
  name: "callout",
  group: "block",
  content: "block+",
  defining: true,
  addAttributes() {
    return {
      icon: {
        default: DEFAULT_CALLOUT_ICON,
        parseHTML: (element) => element.getAttribute("data-icon") ?? DEFAULT_CALLOUT_ICON,
        renderHTML: (attributes) => ({ "data-icon": attributes.icon }),
      },
    };
  },
  parseHTML() {
    return [{ tag: "div[data-course-document-callout]", contentElement: "[data-callout-content]" }];
  },
  renderHTML({ node, HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-course-document-callout": "", class: "course-document-callout" }),
      ["span", { class: "course-document-callout-icon", contenteditable: "false", "aria-hidden": "true" }, node.attrs.icon],
      ["div", { "data-callout-content": "", class: "course-document-callout-content" }, 0],
    ];
  },
});
