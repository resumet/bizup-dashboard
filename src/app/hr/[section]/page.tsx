import { notFound } from "next/navigation";
import { TasksPage } from "@/components/hr/tasks";
import { LeavesPage } from "@/components/hr/leaves";
import { RecordsPage } from "@/components/hr/records";
import { AdminPage } from "@/components/hr/admin";
import { NotificationsPage, ProfilePage } from "@/components/hr/notifications";
export default async function Page({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  switch (section) { case "tasks": return <TasksPage />; case "leaves": return <LeavesPage />; case "records": return <RecordsPage />; case "admin": return <AdminPage />; case "notifications": return <NotificationsPage />; case "profile": return <ProfilePage />; default: notFound(); }
}
