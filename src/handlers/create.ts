import type { Env } from "../index";

interface CreateRequest {
  url: string;
  slug?: string;
}

interface CreateResponse {
  shortUrl: string;
  slug: string;
}

const SLUG_REGEX = /^[a-zA-Z0-9-]+$/;
const SLUG_MIN_LENGTH = 1;
const SLUG_MAX_LENGTH = 50;

function generateRandomSlug(length = 6): string {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function isValidUrl(urlString: string): boolean {
  try {
    const url = new URL(urlString);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function isValidSlug(slug: string): boolean {
  return (
    SLUG_REGEX.test(slug) &&
    slug.length >= SLUG_MIN_LENGTH &&
    slug.length <= SLUG_MAX_LENGTH
  );
}

export async function handleCreate(
  request: Request,
  env: Env
): Promise<Response> {
  let body: CreateRequest;

  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const { url, slug: customSlug } = body;

  // Validate URL
  if (!url || typeof url !== "string") {
    return Response.json(
      { error: "URL is required" },
      { status: 400 }
    );
  }

  if (!isValidUrl(url)) {
    return Response.json(
      { error: "Invalid URL format. Must be a valid http:// or https:// URL." },
      { status: 400 }
    );
  }

  // Validate or generate slug
  let slug: string;

  if (customSlug) {
    if (typeof customSlug !== "string" || !isValidSlug(customSlug)) {
      return Response.json(
        { error: "Invalid slug format. Use only letters, numbers, and hyphens (1-50 chars)." },
        { status: 400 }
      );
    }
    slug = customSlug;
  } else {
    // Generate random slug, ensuring uniqueness
    let attempts = 0;
    do {
      slug = generateRandomSlug();
      const existing = await env.URLS.get(slug);
      if (!existing) break;
      attempts++;
    } while (attempts < 10);

    if (attempts >= 10) {
      return Response.json(
        { error: "Failed to generate unique slug. Please try again." },
        { status: 500 }
      );
    }
  }

  // Check if slug already exists
  const existing = await env.URLS.get(slug);
  if (existing) {
    return Response.json(
      { error: "Slug already exists" },
      { status: 409 }
    );
  }

  // Store in KV
  await env.URLS.put(slug, url);

  const response: CreateResponse = {
    shortUrl: `/${slug}`,
    slug,
  };

  return Response.json(response, { status: 201 });
}
