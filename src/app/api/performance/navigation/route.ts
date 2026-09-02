import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

type NavigationMetric = {
  from?: unknown;
  to?: unknown;
  requestedUrl?: unknown;
  navigationType?: unknown;
  durationMs?: unknown;
};

const ALLOWED_NAVIGATION_TYPES = new Set(["push", "replace", "traverse"]);

export async function POST(request: Request) {
  const startedAt = performance.now();
  try {
    const supabase = await createClient();
    const user = await getAuthenticatedUser(supabase);
    if (!user) return new Response(null, { status: 401 });

    const body = (await request.json()) as NavigationMetric;
    const from = typeof body.from === "string" ? body.from.slice(0, 500) : "";
    const to = typeof body.to === "string" ? body.to.slice(0, 500) : "";
    const requestedUrl =
      typeof body.requestedUrl === "string"
        ? body.requestedUrl.slice(0, 500)
        : "";
    const navigationType =
      typeof body.navigationType === "string" &&
      ALLOWED_NAVIGATION_TYPES.has(body.navigationType)
        ? body.navigationType
        : "unknown";
    const durationMs =
      typeof body.durationMs === "number" &&
      Number.isFinite(body.durationMs) &&
      body.durationMs >= 0
        ? Math.min(Math.round(body.durationMs), 120_000)
        : null;

    if (!to.startsWith("/") || durationMs === null) {
      return new Response(null, { status: 400 });
    }

    console.info(
      JSON.stringify({
        event: "client_navigation",
        from,
        to,
        requestedUrl,
        navigationType,
        durationMs,
      }),
    );
    return new Response(null, {
      status: 204,
      headers: {
        "Server-Timing": `metric;dur=${(performance.now() - startedAt).toFixed(1)}`,
      },
    });
  } catch {
    return new Response(null, { status: 400 });
  }
}
