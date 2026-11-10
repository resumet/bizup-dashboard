type AdminAccountMenuItem = {
  label: string;
  href: string;
  external?: boolean;
};

export const ADMIN_ACCOUNT_MENU_ITEMS: readonly AdminAccountMenuItem[] = [
  { label: "관리자 설정", href: "/admin" },
  { label: "회사자료", href: "https://drive.google.com/drive/folders/1g9i2dpRiuPy6rmgMamh59IvQl3g0c449?usp=drive_link", external: true },
  { label: "입출금 장부", href: "/services/cash-ledger" },
  { label: "임직원 관리", href: "/hr/personnel" },
  { label: "비품 관리", href: "/admin/supplies" },
  { label: "캘린더 항목 관리", href: "/admin/calendar" },
  { label: "실험실", href: "/admin/labs" },
] as const;
