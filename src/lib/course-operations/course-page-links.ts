export const COURSE_PAGE_LINKS = [
  { field: "landingPageLink", column: "landing_page_link", label: "기본 랜딩페이지" },
  { field: "landingPageQrLink", column: "landing_page_qr_link", label: "기본 랜딩 QR" },
  { field: "basicPaymentPageLink", column: "basic_payment_page_link", label: "기본 결제페이지" },
  { field: "paymentLink", column: "payment_link", label: "결제페이지 QR" },
  { field: "inquiryLink", column: "inquiry_link", label: "문의하기 QR" },
] as const;

export function countCoursePageLinks(course: Record<typeof COURSE_PAGE_LINKS[number]["column"], string | null>) {
  return COURSE_PAGE_LINKS.filter(({ column }) => course[column]?.trim()).length;
}
