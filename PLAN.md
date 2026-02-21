# URL Shortener with Analytics

A Cloudflare Workers application demonstrating D1, Durable Objects, and KV usage.

## Overview

| Storage | Purpose |
|---------|---------|
| **KV** | Store short code → URL mappings (fast reads for redirects) |
| **D1** | Store click analytics (timestamp, referrer, country, user agent) |
| **Durable Objects** | Real-time click counter per short URL (atomic counting) |

---

## Project Structure

```
/Users/lrapoport/Projects/mine/url-shortener/
├── src/
│   ├── index.ts                      # Main router + types
│   ├── handlers/
│   │   ├── create.ts                 # POST /api/shorten
│   │   ├── redirect.ts               # GET /:code
│   │   └── stats.ts                  # GET /api/stats/:code
│   ├── durable-objects/
│   │   └── click-counter.ts          # Real-time counter DO
│   └── ui/
│       └── index.html                # Simple form UI
├── schema.sql                        # D1 analytics schema
├── wrangler.jsonc                    # Wrangler configuration
├── package.json
└── tsconfig.json
```

---

## Implementation Tasks

| # | Task | Details |
|---|------|---------|
| 1 | Create project directory | `/Users/lrapoport/Projects/mine/url-shortener` |
| 2 | Initialize npm + install deps | `wrangler`, `typescript`, `@cloudflare/workers-types` |
| 3 | Create `tsconfig.json` | Workers-compatible TypeScript config |
| 4 | Create `wrangler.jsonc` | KV, D1, DO bindings with local dev settings |
| 5 | Create `schema.sql` | D1 table for click analytics |
| 6 | Create `ClickCounter` DO | Atomic increment/read counter |
| 7 | Create `create.ts` handler | Validate URL, validate slug, check uniqueness, store in KV |
| 8 | Create `redirect.ts` handler | KV lookup, DO increment, D1 analytics insert, 302 redirect |
| 9 | Create `stats.ts` handler | Return total clicks (DO) + recent clicks (D1) |
| 10 | Create `index.ts` router | Route requests to handlers, serve UI |
| 11 | Create `index.html` UI | Form for URL + optional slug, display result |
| 12 | Test locally | `wrangler dev` with local persistence |

---

## Configuration

### wrangler.jsonc

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "url-shortener",
  "main": "src/index.ts",
  "compatibility_date": "2024-01-01",

  // KV for URL mappings
  "kv_namespaces": [
    {
      "binding": "URLS",
      "id": "<will be created>"
    }
  ],

  // D1 for analytics
  "d1_databases": [
    {
      "binding": "ANALYTICS_DB",
      "database_name": "url-shortener-analytics",
      "database_id": "<will be created>"
    }
  ],

  // Durable Objects for real-time counters
  "durable_objects": {
    "bindings": [
      {
        "name": "CLICK_COUNTER",
        "class_name": "ClickCounter"
      }
    ]
  },

  "migrations": [
    {
      "tag": "v1",
      "new_classes": ["ClickCounter"]
    }
  ]
}
```

### schema.sql

```sql
CREATE TABLE clicks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  short_code TEXT NOT NULL,
  clicked_at TEXT NOT NULL,
  referrer TEXT,
  country TEXT,
  user_agent TEXT
);

CREATE INDEX idx_clicks_code ON clicks(short_code);
```

---

## Validation Rules

### URL Validation
- Must be valid URL format
- Must start with `http://` or `https://`

### Slug Validation
- Alphanumeric characters and hyphens only: `/^[a-zA-Z0-9-]+$/`
- Minimum 1 character, maximum 50 characters
- If not provided, generate random 6-char alphanumeric

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/` | Serve HTML UI |
| `POST` | `/api/shorten` | Create short URL |
| `GET` | `/api/stats/:code` | Get click statistics |
| `GET` | `/:code` | Redirect to target URL |

### POST /api/shorten

**Request:**
```json
{
  "url": "https://example.com",
  "slug": "my-link"
}
```

**Response 201 (Created):**
```json
{
  "shortUrl": "/my-link",
  "slug": "my-link"
}
```

**Response 400 (Bad Request):**
```json
{ "error": "Invalid URL format. Must be a valid http:// or https:// URL." }
```
```json
{ "error": "Invalid slug format. Use only letters, numbers, and hyphens (1-50 chars)." }
```

**Response 409 (Conflict):**
```json
{ "error": "Slug already exists" }
```

### GET /api/stats/:code

**Response 200:**
```json
{
  "slug": "my-link",
  "targetUrl": "https://example.com",
  "totalClicks": 42,
  "recentClicks": [
    {
      "clicked_at": "2024-01-15T10:30:00Z",
      "country": "US",
      "referrer": "https://google.com",
      "user_agent": "Mozilla/5.0..."
    }
  ]
}
```

**Response 404:**
```json
{ "error": "Short URL not found" }
```

### GET /:code

**Response 302:** Redirects to target URL

**Response 404:**
```json
{ "error": "Short URL not found" }
```

---

## Request Flow

### Creating a Short URL

```
POST /api/shorten
       │
       ▼
┌─────────────────┐
│ Validate URL    │──── Invalid ───▶ 400 Bad Request
│ (http/https)    │
└────────┬────────┘
         │ Valid
         ▼
┌─────────────────┐
│ Validate/Generate│──── Invalid ───▶ 400 Bad Request
│ Slug            │
└────────┬────────┘
         │ Valid
         ▼
┌─────────────────┐
│ Check KV for    │──── Exists ────▶ 409 Conflict
│ existing slug   │
└────────┬────────┘
         │ Not exists
         ▼
┌─────────────────┐
│ Store in KV     │
│ slug → url      │
└────────┬────────┘
         │
         ▼
    201 Created
```

### Redirecting a Short URL

```
GET /:code
       │
       ▼
┌─────────────────┐
│ Lookup in KV    │──── Not found ──▶ 404 Not Found
└────────┬────────┘
         │ Found
         ▼
┌─────────────────┐
│ Get DO stub     │
│ Increment count │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Insert D1 row   │ (async, non-blocking)
│ (analytics)     │
└────────┬────────┘
         │
         ▼
  302 Redirect
```

---

## Local Development

```bash
# Install dependencies
npm install

# Apply D1 schema locally
npx wrangler d1 execute url-shortener-analytics --local --file=schema.sql

# Start dev server
npx wrangler dev
```

---

## Testing Checklist

- [ ] Create short URL with custom slug
- [ ] Create short URL with auto-generated slug
- [ ] Reject invalid URLs (not http/https)
- [ ] Reject invalid slugs (special characters)
- [ ] Reject duplicate slugs
- [ ] Redirect works and increments counter
- [ ] Analytics recorded in D1
- [ ] Stats endpoint returns correct data
- [ ] UI form works end-to-end
