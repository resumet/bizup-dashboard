import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  AlertCircle,
  CheckCircle2,
  Search,
  ShieldCheck,
  UserRoundCheck,
  UsersRound,
} from "lucide-react";

import { AdminManagementButton } from "@/components/admin/admin-management-button";
import { UserRoleSelect } from "@/components/admin/user-role-select";
import { UserAccountMenu } from "@/components/auth/user-account-menu";
import { BrandHomeLink } from "@/components/layout/brand-home-link";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  isSuperAdminEmail,
  SUPER_ADMIN_EMAIL,
} from "@/lib/admin/access";
import { loadAdminUsers } from "@/lib/admin/users";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

type AdminUsersPageProps = {
  searchParams: Promise<{ q?: string | string[] }>;
};

const dateFormatter = new Intl.DateTimeFormat("ko-KR", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Seoul",
});

function formatDate(value: string | null) {
  return value ? dateFormatter.format(new Date(value)) : "기록 없음";
}

function roleLabel(role: string) {
  if (role === "super_admin") return "최고관리자";
  if (role === "admin") return "관리자";
  if (role === "user" || role === "operator" || role === "viewer") return "사용자";
  return role;
}

function accountRoleLabel(role: "super_admin" | "admin" | "user") {
  if (role === "super_admin") return "최고관리자";
  if (role === "admin") return "관리자";
  return "사용자";
}

export default async function AdminUsersPage({
  searchParams,
}: AdminUsersPageProps) {
  const supabase = await createClient();
  const currentUser = await getAuthenticatedUser(supabase);

  if (!currentUser) redirect("/login");
  if (!isSuperAdminEmail(currentUser.email)) notFound();

  const params = await searchParams;
  const queryValue = Array.isArray(params.q) ? params.q[0] : params.q;
  const query = queryValue?.trim() ?? "";
  const normalizedQuery = query.toLowerCase();
  const result = await loadAdminUsers().then(
    (users) => ({ users, error: null }),
    (error: unknown) => ({
      users: [],
      error:
        error instanceof Error
          ? error.message
          : "계정 정보를 불러오지 못했습니다.",
    }),
  );

  const sortedUsers = result.users.toSorted((left, right) => {
    const leftIsSuperAdmin = isSuperAdminEmail(left.email);
    const rightIsSuperAdmin = isSuperAdminEmail(right.email);
    if (leftIsSuperAdmin !== rightIsSuperAdmin) {
      return leftIsSuperAdmin ? -1 : 1;
    }
    return right.createdAt.localeCompare(left.createdAt);
  });
  const filteredUsers = normalizedQuery
    ? sortedUsers.filter((user) =>
        [
          user.email,
          user.id,
          ...user.providers,
          accountRoleLabel(user.accessRole),
          ...user.workspaces.flatMap((workspace) => [
            workspace.name,
            roleLabel(workspace.role),
          ]),
        ].some((value) => value.toLowerCase().includes(normalizedQuery)),
      )
    : sortedUsers;
  const adminCount = sortedUsers.filter(
    (user) => user.accessRole === "admin",
  ).length;
  const superAdminCount = sortedUsers.filter(
    (user) => user.accessRole === "super_admin",
  ).length;
  const userCount = sortedUsers.filter(
    (user) => user.accessRole === "user",
  ).length;

  return (
    <main className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="mx-auto flex h-18 max-w-[1600px] items-center justify-between gap-4 px-5 lg:px-8">
          <div className="flex items-center gap-3">
            <BrandHomeLink showName={false} />
            <div>
              <p className="font-semibold">사용자 권한 관리</p>
              <p className="text-xs text-muted-foreground">최고관리자 전용</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <AdminManagementButton
              email={currentUser.email ?? SUPER_ADMIN_EMAIL}
            />
            <UserAccountMenu email={currentUser.email ?? SUPER_ADMIN_EMAIL} />
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1600px] space-y-6 px-5 py-8 lg:px-8">
        <section>
          <Badge variant="secondary" className="mb-3">최고관리자 전용</Badge>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            사용자 계정과 권한
          </h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            등록된 계정의 권한과 인증 상태, 최근 로그인 기록을 관리합니다.
          </p>
        </section>

        {result.error ? (
          <Alert variant="destructive">
            <AlertCircle />
            <AlertTitle>계정 정보를 불러오지 못했습니다</AlertTitle>
            <AlertDescription>{result.error}</AlertDescription>
          </Alert>
        ) : (
          <>
            <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="계정 요약">
              {[
                { label: "전체 계정", value: sortedUsers.length, icon: UsersRound },
                { label: "최고관리자", value: superAdminCount, icon: ShieldCheck },
                { label: "관리자", value: adminCount, icon: UserRoundCheck },
                { label: "사용자", value: userCount, icon: CheckCircle2 },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <Card key={item.label}>
                    <CardContent className="flex items-center justify-between p-5">
                      <div>
                        <p className="text-sm text-muted-foreground">{item.label}</p>
                        <p className="mt-1 text-2xl font-semibold">{item.value}명</p>
                      </div>
                      <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
                        <Icon className="size-5" />
                      </span>
                    </CardContent>
                  </Card>
                );
              })}
            </section>

            <Card>
              <CardHeader className="gap-4 border-b sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <CardTitle>계정 목록</CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">
                    최고관리자 계정: {SUPER_ADMIN_EMAIL}
                  </p>
                </div>
                <form method="get" className="flex w-full gap-2 sm:w-auto">
                  <div className="relative min-w-0 flex-1 sm:w-80">
                    <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      name="q"
                      defaultValue={query}
                      className="pl-9"
                      placeholder="이메일, 역할, 워크스페이스 검색"
                      aria-label="사용자 계정 검색"
                    />
                  </div>
                  <Button type="submit" variant="outline">검색</Button>
                  {query ? (
                    <Button asChild variant="ghost">
                      <Link href="/admin/users">초기화</Link>
                    </Button>
                  ) : null}
                </form>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="px-5">계정</TableHead>
                      <TableHead>권한</TableHead>
                      <TableHead>인증</TableHead>
                      <TableHead>워크스페이스</TableHead>
                      <TableHead>가입일</TableHead>
                      <TableHead className="pr-5">최근 로그인</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredUsers.length ? (
                      filteredUsers.map((user) => {
                        const isSuperAdmin = isSuperAdminEmail(user.email);
                        return (
                          <TableRow key={user.id}>
                            <TableCell className="px-5 py-4">
                              <div className="flex items-center gap-2">
                                <span className="font-medium">{user.email}</span>
                                <Badge variant={isSuperAdmin ? "default" : "secondary"}>
                                  {isSuperAdmin ? "최고관리자" : "일반 계정"}
                                </Badge>
                              </div>
                              <p className="mt-1 font-mono text-xs text-muted-foreground">
                                {user.id}
                              </p>
                              {user.providers.length ? (
                                <p className="mt-1 text-xs text-muted-foreground">
                                  로그인 방식: {user.providers.join(", ")}
                                </p>
                              ) : null}
                            </TableCell>
                            <TableCell>
                              {isSuperAdmin ? (
                                <Badge className="gap-1.5">
                                  <ShieldCheck className="size-3.5" />
                                  최고관리자
                                </Badge>
                              ) : (
                                <UserRoleSelect
                                  userId={user.id}
                                  email={user.email}
                                  initialRole={
                                    user.accessRole === "admin" ? "admin" : "user"
                                  }
                                />
                              )}
                            </TableCell>
                            <TableCell>
                              <Badge variant={user.emailConfirmedAt ? "outline" : "destructive"}>
                                {user.emailConfirmedAt ? "인증 완료" : "미인증"}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              {user.workspaces.length ? (
                                <div className="space-y-1.5">
                                  {user.workspaces.map((workspace) => (
                                    <div key={`${workspace.name}-${workspace.joinedAt}`} className="flex items-center gap-2">
                                      <span>{workspace.name}</span>
                                      <Badge variant="outline">{roleLabel(workspace.role)}</Badge>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-muted-foreground">연결 없음</span>
                              )}
                            </TableCell>
                            <TableCell>{formatDate(user.createdAt)}</TableCell>
                            <TableCell className="pr-5">
                              {formatDate(user.lastSignInAt)}
                            </TableCell>
                          </TableRow>
                        );
                      })
                    ) : (
                      <TableRow>
                        <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                          {query ? "검색 조건에 맞는 계정이 없습니다." : "등록된 계정이 없습니다."}
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </main>
  );
}
