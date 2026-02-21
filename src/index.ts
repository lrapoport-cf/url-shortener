import { handleCreate } from "./handlers/create";
import { handleRedirect } from "./handlers/redirect";
import { handleStats } from "./handlers/stats";
import { ClickCounter } from "./durable-objects/click-counter";

// Re-export the Durable Object class
export { ClickCounter };

export interface Env {
  URLS: KVNamespace;
  ANALYTICS_DB: D1Database;
  CLICK_COUNTER: DurableObjectNamespace;
}

// HTML UI (embedded for simplicity)
const HTML_UI = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>URL Shortener</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #f5f5f5;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .container {
      background: white;
      padding: 40px;
      border-radius: 12px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.1);
      max-width: 500px;
      width: 100%;
    }
    h1 {
      margin-bottom: 8px;
      color: #333;
    }
    .subtitle {
      color: #666;
      margin-bottom: 24px;
    }
    .form-group {
      margin-bottom: 16px;
    }
    label {
      display: block;
      margin-bottom: 6px;
      font-weight: 500;
      color: #333;
    }
    input {
      width: 100%;
      padding: 12px;
      border: 1px solid #ddd;
      border-radius: 6px;
      font-size: 16px;
    }
    input:focus {
      outline: none;
      border-color: #f38020;
    }
    .optional {
      color: #999;
      font-weight: normal;
    }
    button {
      width: 100%;
      padding: 14px;
      background: #f38020;
      color: white;
      border: none;
      border-radius: 6px;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.2s;
    }
    button:hover { background: #e06f10; }
    button:disabled {
      background: #ccc;
      cursor: not-allowed;
    }
    .result {
      margin-top: 24px;
      padding: 16px;
      background: #e8f5e9;
      border-radius: 6px;
      display: none;
    }
    .result.show { display: block; }
    .result.error {
      background: #ffebee;
      color: #c62828;
    }
    .result-url {
      display: flex;
      gap: 8px;
      margin-top: 8px;
    }
    .result-url input {
      flex: 1;
      background: white;
    }
    .result-url button {
      width: auto;
      padding: 12px 20px;
    }
    .stats-link {
      margin-top: 12px;
    }
    .stats-link a {
      color: #f38020;
      text-decoration: none;
    }
    .stats-link a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <div class="container">
    <h1>URL Shortener</h1>
    <p class="subtitle">Create short links with analytics</p>
    
    <form id="shorten-form">
      <div class="form-group">
        <label for="url">URL to shorten</label>
        <input type="url" id="url" name="url" placeholder="https://example.com/very/long/url" required>
      </div>
      
      <div class="form-group">
        <label for="slug">Custom slug <span class="optional">(optional)</span></label>
        <input type="text" id="slug" name="slug" placeholder="my-custom-link" pattern="[a-zA-Z0-9\\-]+" maxlength="50">
      </div>
      
      <button type="submit">Shorten URL</button>
    </form>
    
    <div id="result" class="result">
      <strong>Your short URL:</strong>
      <div class="result-url">
        <input type="text" id="short-url" readonly>
        <button type="button" id="copy-btn">Copy</button>
      </div>
      <div class="stats-link">
        <a id="stats-link" href="#" target="_blank">View statistics</a>
      </div>
    </div>
  </div>
  
  <script>
    const form = document.getElementById('shorten-form');
    const result = document.getElementById('result');
    const shortUrlInput = document.getElementById('short-url');
    const copyBtn = document.getElementById('copy-btn');
    const statsLink = document.getElementById('stats-link');
    
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const url = document.getElementById('url').value;
      const slug = document.getElementById('slug').value || undefined;
      
      const submitBtn = form.querySelector('button[type="submit"]');
      submitBtn.disabled = true;
      submitBtn.textContent = 'Creating...';
      
      try {
        const response = await fetch('/api/shorten', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url, slug })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
          throw new Error(data.error || 'Failed to create short URL');
        }
        
        const fullUrl = window.location.origin + data.shortUrl;
        shortUrlInput.value = fullUrl;
        statsLink.href = '/api/stats/' + data.slug;
        
        result.classList.remove('error');
        result.classList.add('show');
        
        // Reset form
        form.reset();
        
      } catch (error) {
        result.innerHTML = '<strong>Error:</strong> ' + error.message;
        result.classList.add('error', 'show');
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Shorten URL';
      }
    });
    
    copyBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(shortUrlInput.value);
        copyBtn.textContent = 'Copied!';
        setTimeout(() => { copyBtn.textContent = 'Copy'; }, 2000);
      } catch {
        shortUrlInput.select();
      }
    });
  </script>
</body>
</html>`;

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // Serve HTML UI at root
    if (path === "/" && request.method === "GET") {
      return new Response(HTML_UI, {
        headers: { "Content-Type": "text/html" },
      });
    }

    // API: Create short URL
    if (path === "/api/shorten" && request.method === "POST") {
      return handleCreate(request, env);
    }

    // API: Get stats
    const statsMatch = path.match(/^\/api\/stats\/([a-zA-Z0-9-]+)$/);
    if (statsMatch && request.method === "GET") {
      return handleStats(request, env, statsMatch[1]);
    }

    // Redirect: /:code
    const redirectMatch = path.match(/^\/([a-zA-Z0-9-]+)$/);
    if (redirectMatch && request.method === "GET") {
      // Attach ctx to request for waitUntil
      (request as any).ctx = ctx;
      return handleRedirect(request, env, redirectMatch[1]);
    }

    // 404 for everything else
    return Response.json(
      { error: "Not Found" },
      { status: 404 }
    );
  },
};
