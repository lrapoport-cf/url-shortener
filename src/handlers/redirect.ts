import type { Env } from "../index";

export async function handleRedirect(
  request: Request,
  env: Env,
  code: string
): Promise<Response> {
  // Look up the target URL in KV
  const targetUrl = await env.URLS.get(code);

  if (!targetUrl) {
    return Response.json(
      { error: "Short URL not found" },
      { status: 404 }
    );
  }

  // Get DO stub and increment counter
  const doId = env.CLICK_COUNTER.idFromName(code);
  const doStub = env.CLICK_COUNTER.get(doId);

  // Increment counter (fire and forget for faster redirect)
  const incrementPromise = doStub.fetch(new Request("https://do/increment", { method: "POST" }));

  // Record analytics in D1 (also fire and forget)
  const cf = request.cf;
  const analyticsPromise = env.ANALYTICS_DB.prepare(
    `INSERT INTO clicks (short_code, clicked_at, referrer, country, user_agent)
     VALUES (?, ?, ?, ?, ?)`
  )
    .bind(
      code,
      new Date().toISOString(),
      request.headers.get("Referer") ?? null,
      (cf?.country as string) ?? null,
      request.headers.get("User-Agent") ?? null
    )
    .run();

  // Wait for both operations using waitUntil if available
  // This allows the redirect to happen immediately while analytics complete in background
  const ctx = (request as any).ctx;
  if (ctx?.waitUntil) {
    ctx.waitUntil(Promise.all([incrementPromise, analyticsPromise]));
  } else {
    // Fallback: just fire and don't wait
    Promise.all([incrementPromise, analyticsPromise]).catch(console.error);
  }

  // Redirect to target URL
  return Response.redirect(targetUrl, 302);
}
