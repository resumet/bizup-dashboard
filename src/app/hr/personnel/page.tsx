import { notFound, redirect } from "next/navigation";
import { PersonnelError, requirePersonnelContext } from "@/lib/personnel/server";
import { PersonnelManager } from "@/components/hr/personnel-manager";

export default async function Page() {
  let context;
  try {
    context = await requirePersonnelContext();
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") redirect("/login");
    if (error instanceof PersonnelError && error.status === 403) notFound();
    throw error;
  }
  return <PersonnelManager today={context.today} />;
}
