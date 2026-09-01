import {
  buildPhoneSalesCsv,
  normalizePhoneSalesContacts,
  phoneSalesListFilename,
} from "@/lib/phone-sales/jobs";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

type Context = {
  params: Promise<{ jobId: string }>;
};

function contentDisposition(filename: string) {
  return `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

export async function GET(_request: Request, { params }: Context) {
  const { jobId } = await params;
  const supabase = await createClient();
  const user = await getAuthenticatedUser(supabase);
  if (!user) {
    return Response.json({ message: "로그인이 필요합니다." }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("phone_sales_jobs")
    .select("instructor_name,contacts,created_at")
    .eq("id", jobId)
    .maybeSingle();

  if (error) {
    return Response.json({ message: error.message }, { status: 400 });
  }
  if (!data) {
    return Response.json(
      { message: "전화세일즈 작업을 찾을 수 없습니다." },
      { status: 404 },
    );
  }

  const csv = buildPhoneSalesCsv(normalizePhoneSalesContacts(data.contacts));
  const filename = phoneSalesListFilename(
    String(data.instructor_name ?? ""),
    String(data.created_at),
  );
  return new Response(csv, {
    headers: {
      "Content-Disposition": contentDisposition(filename),
      "Content-Type": "text/csv;charset=utf-8",
    },
  });
}
