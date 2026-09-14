import { TaskDetailPage } from "@/components/hr/tasks";
export default async function Page({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; return <TaskDetailPage id={id} />; }
