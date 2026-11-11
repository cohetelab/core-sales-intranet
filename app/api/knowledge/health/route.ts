import { baaldaServerUrl } from "@/lib/baalda";

export const dynamic = "force-dynamic";

export async function GET() {
  const serverUrl = baaldaServerUrl();
  const headers = { "Cache-Control": "no-store" };
  if (!serverUrl) return Response.json({ status: "unconfigured" }, { headers });
  try {
    const response = await fetch(`${serverUrl}/health`, {
      cache: "no-store",
      signal: AbortSignal.timeout(4000),
      redirect: "error",
    });
    const body = response.ok ? await response.json() : null;
    return Response.json({ status: response.ok && body?.ok === true ? "ready" : "unreachable" }, { headers });
  } catch {
    return Response.json({ status: "unreachable" }, { headers });
  }
}
