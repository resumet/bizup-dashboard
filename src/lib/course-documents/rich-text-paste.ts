const CHECKBOX_SELECTOR = [
  'input[type="checkbox"]',
  '[role="checkbox"]',
  '[class*="checkbox" i]',
  '[class*="to-do" i]',
].join(",");

const CHECKED_TEXT_PATTERN = /^\s*(?:☑|✅|✔|✓|\[x\])\s*/iu;
const UNCHECKED_TEXT_PATTERN = /^\s*(?:☐|□|\[\s\])\s*/u;

function firstTextNode(element: Element) {
  const walker = element.ownerDocument.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  return walker.nextNode() as Text | null;
}

function checkedFromElement(element: Element | null) {
  if (!element) return false;
  if (element instanceof HTMLInputElement) return element.checked || element.hasAttribute("checked");
  const ariaChecked = element.getAttribute("aria-checked");
  if (ariaChecked === "true") return true;
  const state = `${element.className} ${element.getAttribute("data-state") ?? ""}`;
  return /(?:checked|checkbox-on|to-do-checked|complete)/iu.test(state);
}

function removeCheckboxControl(control: Element | null) {
  if (!control) return;
  const parent = control.parentElement;
  control.remove();
  if (parent && (parent.tagName === "LABEL" || parent.tagName === "DIV") && !parent.textContent?.trim() && !parent.children.length) {
    parent.remove();
  }
}

function ensureTaskItemContent(item: HTMLLIElement) {
  const existingContent = Array.from(item.children).find((child) => child.tagName === "DIV");
  if (existingContent) return;

  const content = item.ownerDocument.createElement("div");
  const nestedLists = Array.from(item.children).filter((child) => child.matches("ul, ol"));
  const paragraph = item.ownerDocument.createElement("p");
  for (const node of Array.from(item.childNodes)) {
    if (node instanceof Element && nestedLists.includes(node)) continue;
    paragraph.append(node);
  }
  content.append(paragraph);
  for (const list of nestedLists) content.append(list);
  item.append(content);
}

/** Converts Notion-style to-do HTML into Tiptap task-list markup before parsing. */
export function normalizeRichTextPasteHtml(html: string) {
  if (!html || typeof DOMParser === "undefined") return html;

  const document = new DOMParser().parseFromString(html, "text/html");
  let changed = false;

  for (const list of Array.from(document.body.querySelectorAll("ul"))) {
    const items = Array.from(list.children).filter((child): child is HTMLLIElement => child instanceof HTMLLIElement);
    if (!items.length) continue;

    const listLooksLikeTasks = list.getAttribute("data-type") === "taskList"
      || /(?:to.?do|task|check)/iu.test(list.className)
      || items.some((item) => Boolean(item.querySelector(CHECKBOX_SELECTOR)))
      || items.some((item) => {
        const text = item.textContent ?? "";
        return CHECKED_TEXT_PATTERN.test(text) || UNCHECKED_TEXT_PATTERN.test(text);
      });
    if (!listLooksLikeTasks) continue;

    list.setAttribute("data-type", "taskList");
    changed = true;

    for (const item of items) {
      const checkbox = item.querySelector(CHECKBOX_SELECTOR);
      const textNode = firstTextNode(item);
      const originalText = textNode?.data ?? "";
      const checked = checkedFromElement(checkbox) || CHECKED_TEXT_PATTERN.test(originalText);

      if (textNode) {
        textNode.data = originalText.replace(CHECKED_TEXT_PATTERN, "").replace(UNCHECKED_TEXT_PATTERN, "");
      }
      removeCheckboxControl(checkbox);
      item.setAttribute("data-type", "taskItem");
      item.setAttribute("data-checked", String(checked));
      ensureTaskItemContent(item);
    }
  }

  return changed ? document.body.innerHTML : html;
}
