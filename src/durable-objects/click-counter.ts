import { DurableObject } from "cloudflare:workers";

export class ClickCounter extends DurableObject {
  private ensureTable(): void {
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS counter (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        count INTEGER NOT NULL DEFAULT 0,
        first_click_at TEXT NOT NULL,
        last_click_at TEXT NOT NULL
      )
    `);
  }

  async increment(): Promise<number> {
    this.ensureTable();
    const now = new Date().toISOString();

    this.ctx.storage.sql.exec(
      `INSERT INTO counter (id, count, first_click_at, last_click_at)
       VALUES (1, 1, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         count = count + 1,
         last_click_at = ?`,
      now,
      now,
      now
    );

    const result = this.ctx.storage.sql
      .exec(`SELECT count FROM counter WHERE id = 1`)
      .one();
    return (result?.count as number) ?? 0;
  }

  async getCount(): Promise<number> {
    this.ensureTable();
    const result = this.ctx.storage.sql
      .exec(`SELECT count FROM counter WHERE id = 1`)
      .one();
    return (result?.count as number) ?? 0;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/increment" && request.method === "POST") {
      const count = await this.increment();
      return Response.json({ count });
    }

    if (url.pathname === "/count" && request.method === "GET") {
      const count = await this.getCount();
      return Response.json({ count });
    }

    return new Response("Not Found", { status: 404 });
  }
}
