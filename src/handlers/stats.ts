import type { Env } from "../index";

interface ClickRecord {
  clicked_at: string;
  referrer: string | null;
  country: string | null;
  user_agent: string | null;
}

interface StatsResponse {
  slug: string;
  targetUrl: string;
  totalClicks: number;
  recentClicks: ClickRecord[];
}

export async function handleStats(
  request: Request,
  env: Env,
  code: string
): Promise<Response> {
  // Check if the short URL exists
  const targetUrl = await env.URLS.get(code);

  if (!targetUrl) {
    return Response.json(
      { error: "Short URL not found" },
      { status: 404 }
    );
  }

  // Get total count from Durable Object
  const doId = env.CLICK_COUNTER.idFromName(code);
  const doStub = env.CLICK_COUNTER.get(doId);
  const countResponse = await doStub.fetch(new Request("https://do/count", { method: "GET" }));
  const { count: totalClicks } = await countResponse.json() as { count: number };

  // Get recent clicks from D1 (last 100)
  const { results } = await env.ANALYTICS_DB.prepare(
    `SELECT clicked_at, referrer, country, user_agent
     FROM clicks
     WHERE short_code = ?
     ORDER BY clicked_at DESC
     LIMIT 100`
  )
    .bind(code)
    .all<ClickRecord>();

  const response: StatsResponse = {
    slug: code,
    targetUrl,
    totalClicks,
    recentClicks: results ?? [],
  };

  return Response.json(response);
}
