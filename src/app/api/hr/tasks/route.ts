import { createClient } from "@/lib/supabase/server";
import { getAuthenticatedUser } from "@/lib/supabase/auth";

export async function POST(request: Request) {
  const supabase = await createClient();
  const user = await getAuthenticatedUser(supabase);
  const body = await request.json();
  const { data, error } = await supabase.from("work_tasks").insert({ workspace_id: body.workspaceId, title: String(body.title ?? "").trim(), creator_id: user!.id, assignee_id: user!.id }).select("id,title,description,planned_date,status,assignee_id,creator_id").single();
  if (error) return Response.json({ message: error.message }, { status: 400 });
  return Response.json(data);
}
