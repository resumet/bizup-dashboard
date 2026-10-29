"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarCog,
  ChevronDown,
  FlaskConical,
  Loader2,
  LogOut,
  Mail,
  PackageCheck,
  Settings2,
  UserRound,
  UsersRound,
  WalletCards,
  type LucideIcon,
} from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { isSuperAdminEmail } from "@/lib/admin/access";
import { ADMIN_ACCOUNT_MENU_ITEMS } from "@/lib/admin/navigation";
import { createClient } from "@/lib/supabase/client";

const adminMenuIcons: Record<
  (typeof ADMIN_ACCOUNT_MENU_ITEMS)[number]["href"],
  LucideIcon
> = {
  "/admin": Settings2,
  "/services/cash-ledger": WalletCards,
  "/hr/personnel": UsersRound,
  "/admin/supplies": PackageCheck,
  "/admin/calendar": CalendarCog,
  "/admin/labs": FlaskConical,
};

export function UserAccountMenu({
  email,
  name,
  showDetailLabel = false,
}: {
  email: string;
  name: string;
  showDetailLabel?: boolean;
}) {
  const router = useRouter();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const isSuperAdmin = isSuperAdminEmail(email);

  async function signOut() {
    setIsSigningOut(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signOut({ scope: "local" });

    if (error) {
      setIsSigningOut(false);
      return;
    }

    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="flex min-w-0 items-center gap-2">
    <NotificationBell key={email} />
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className={`min-w-0 max-w-72 gap-2 px-2 ${showDetailLabel ? "h-auto flex-1 justify-start py-1.5" : ""}`}
          aria-label={`${name} 계정 상세보기`}
        >
          <Avatar className="size-7">
            <AvatarFallback>{Array.from(name)[0] ?? "사"}</AvatarFallback>
          </Avatar>
          <span className="hidden min-w-0 flex-1 text-left sm:block">
            <span className="block truncate text-sm">{name}</span>
            {showDetailLabel ? <span className="block text-[11px] font-normal text-slate-400">상세보기</span> : null}
          </span>
          <ChevronDown className="size-3.5" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-64">
        <DropdownMenuLabel className="space-y-1 py-2">
          <span className="block text-xs font-normal">로그인한 계정</span>
          <span className="flex items-center gap-2 truncate text-sm text-foreground">
            <UserRound className="size-3.5 shrink-0" aria-hidden="true" />
            {name}
          </span>
          <span className="flex items-center gap-2 truncate text-sm text-foreground">
            <Mail className="size-3.5 shrink-0" aria-hidden="true" />
            {email}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {isSuperAdmin ? (
          <>
            <DropdownMenuLabel>관리자 메뉴</DropdownMenuLabel>
            {ADMIN_ACCOUNT_MENU_ITEMS.map(({ label, href }) => {
              const Icon = adminMenuIcons[href];
              return (
                <DropdownMenuItem key={href} asChild>
                  <Link href={href}>
                    <Icon aria-hidden="true" />
                    {label}
                  </Link>
                </DropdownMenuItem>
              );
            })}
            <DropdownMenuSeparator />
          </>
        ) : null}
        <DropdownMenuItem
          variant="destructive"
          disabled={isSigningOut}
          onSelect={(event) => {
            event.preventDefault();
            void signOut();
          }}
        >
          {isSigningOut ? <Loader2 className="animate-spin" /> : <LogOut />}
          {isSigningOut ? "로그아웃 중..." : "로그아웃"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
    </div>
  );
}
