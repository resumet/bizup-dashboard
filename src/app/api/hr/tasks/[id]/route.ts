import { createClient } from "@/lib/supabase/server";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { id } = await params;
  const { status } = await request.json();
  const { data, error } = await supabase.from("work_tasks").update({ status, completed_at: status === "done" ? new Date().toISOString() : null, updated_at: new Date().toISOString() }).eq("id", id).select("id").single();
  if (error) return Response.json({ message: error.message }, { status: 400 });
  return Response.json(data);
}
