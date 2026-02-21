import { DurableObject } from "cloudflare:workers";

export class ClickCounter extends DurableObject {
  async increment(): Promise<number> {
    const currentCount = (await this.ctx.storage.get<number>("count")) ?? 0;
    const newCount = currentCount + 1;
    await this.ctx.storage.put("count", newCount);
    return newCount;
  }

  async getCount(): Promise<number> {
    return (await this.ctx.storage.get<number>("count")) ?? 0;
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
