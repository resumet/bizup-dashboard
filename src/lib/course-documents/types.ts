export type TextDocumentBlock = {
  id: string;
  type: "heading1" | "heading2" | "paragraph";
  content: string;
};

export type ListDocumentBlock = {
  id: string;
  type: "unordered_list" | "ordered_list";
  items: string[];
};

export type ImageDocumentBlock = {
  id: string;
  type: "image";
  url: string;
  alt: string;
};

export type LinkDocumentBlock = {
  id: string;
  type: "link";
  label: string;
  url: string;
};

export type CtaDocumentBlock = {
  id: string;
  type: "cta";
  label: string;
  url: string;
};

export type RichTextAttributeValue = string | number | boolean | null;

export type RichTextMark = {
  type: "bold" | "italic" | "underline" | "strike" | "code" | "link";
  attrs?: Record<string, RichTextAttributeValue>;
};

export type RichTextNode = {
  type:
    | "paragraph"
    | "heading"
    | "bulletList"
    | "orderedList"
    | "listItem"
    | "blockquote"
    | "codeBlock"
    | "horizontalRule"
    | "hardBreak"
    | "text"
    | "image"
    | "buttonLink";
  attrs?: Record<string, RichTextAttributeValue>;
  content?: RichTextNode[];
  marks?: RichTextMark[];
  text?: string;
};

export type RichTextDocumentBlock = {
  id: string;
  type: "rich_text";
  content: RichTextNode;
};

export type CourseDocumentBlock =
  | TextDocumentBlock
  | ListDocumentBlock
  | ImageDocumentBlock
  | LinkDocumentBlock
  | CtaDocumentBlock
  | RichTextDocumentBlock;

export type CourseDocumentStatus = "draft" | "published";

export type CourseDocumentSummary = {
  id: string;
  courseId: string;
  instructorName: string;
  title: string;
  slug: string;
  status: CourseDocumentStatus;
  leadGateEnabled: boolean;
  leadGateAfterBlockId: string | null;
  leadCount: number;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
};

export type CourseDocumentDetail = CourseDocumentSummary & {
  content: CourseDocumentBlock[];
};

export type CourseDocumentCourse = {
  id: string;
  name: string;
  instructorName: string;
  cohort: string;
  freeWebinarAt: string;
  externalEditEnabled: boolean;
  externalAccessToken: string;
  documents: CourseDocumentSummary[];
};

export type CourseDocumentLead = {
  id: string;
  documentId: string;
  documentTitle: string;
  courseId: string;
  courseName: string;
  instructorName: string;
  name: string;
  phone: string;
  utmSource: string;
  utmMedium: string;
  utmCampaign: string;
  utmContent: string;
  referrer: string;
  createdAt: string;
};

export type BlockedPhone = {
  id: string;
  phone: string;
  memo: string;
  createdAt: string;
};
