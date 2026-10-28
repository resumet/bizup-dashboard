import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import { AppShell } from "@/components/layout/app-shell";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { inviteRedirectScript } from "@/lib/supabase/invite-redirect-script";
import { createClient } from "@/lib/supabase/server";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "BizUp | 서비스 대시보드",
  description: "비즈업 운영자를 위한 서비스 대시보드",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const user = await getAuthenticatedUser(await createClient());
  const email = user?.email ?? null;
  const userName = user?.displayName ?? "사용자";

  return (
    <html
      lang="ko"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-background text-foreground">
        <Script id="supabase-invite-redirect" strategy="beforeInteractive">{inviteRedirectScript}</Script>
        <AppShell email={email} userName={userName}>
          {children}
        </AppShell>
      </body>
    </html>
  );
}
