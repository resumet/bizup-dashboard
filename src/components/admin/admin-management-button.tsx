import Link from "next/link";
import { ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { isMainAdminEmail } from "@/lib/admin/access";

export function AdminManagementButton({ email }: { email: string }) {
  if (!isMainAdminEmail(email)) return null;

  return (
    <Button
      asChild
      variant="outline"
      size="sm"
      className="border-violet-500/40 bg-violet-500/10 text-violet-700 hover:bg-violet-500/20 dark:text-violet-300"
    >
      <Link
        href="/admin/users"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Admin 관리 새 창에서 열기"
      >
        <ShieldCheck />
        Admin 관리
      </Link>
    </Button>
  );
}
