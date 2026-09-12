export type CourseOrder = {
  productName: string;
  optionName: string;
  memberName: string;
  phone: string;
  email: string;
  paymentAmount: number;
  refundAmount: number;
  currentAmount: number;
  status: string;
  paymentMethod: string;
  rs: string;
  adMedia: string;
  inflowType: string;
  paymentId: string;
  refundDate: string;
  orderId: string;
  // Import-only identity: persisted through record_key, not a separate DB column.
  splitOrderNumber?: string;
};

export type SavedCourseOrder = CourseOrder & { id: string; updatedAt: string };
export type CourseOrderImport = {
  id: string;
  fileName: string;
  rowCount: number;
  createdAt: string;
};
export type CourseOrdersResponse = {
  orders: SavedCourseOrder[];
  imports: CourseOrderImport[];
};
export type CourseOrderPreview = {
  totalCount: number;
  products: Array<{ name: string; optionName: string; count: number; suggested: boolean }>;
};

export const ORDER_CATEGORY_FILTERS = [
  ["productName", "주문항목명"], ["optionName", "옵션명"], ["status", "주문상태"],
  ["paymentMethod", "결제방법"], ["rs", "RS"], ["adMedia", "트래킹 광고 매체"],
  ["inflowType", "트래킹 유입 구분"],
] as const;
export type OrderCategory = (typeof ORDER_CATEGORY_FILTERS)[number][0];
export type CourseOrderFilters = {
  keyword: string;
  categories: Partial<Record<OrderCategory, string>>;
  refund: "all" | "refunded" | "notRefunded";
  refundFrom: string;
  refundTo: string;
  paymentMin: string;
  paymentMax: string;
  refundMin: string;
  refundMax: string;
  currentMin: string;
  currentMax: string;
};
export const EMPTY_ORDER_FILTERS: CourseOrderFilters = {
  keyword: "", categories: {}, refund: "all", refundFrom: "", refundTo: "",
  paymentMin: "", paymentMax: "", refundMin: "", refundMax: "", currentMin: "", currentMax: "",
};
