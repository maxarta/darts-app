import { createApp } from "./app";

export const config = {
  runtime: "nodejs",
  maxDuration: 30,
};

const app = createApp();

/**
 * vercel.json rewrites `/api/:path*` → `/api/gateway?__p=:path*`.
 * Restore the original `/api/...` path before handing off to Hono.
 */
function restoreRequest(req: Request): Request {
  const url = new URL(req.url);
  if (url.pathname === "/api/gateway" || url.pathname === "/api/gateway/") {
    const rest = url.searchParams.get("__p");
    if (rest != null) {
      url.pathname = rest ? `/api/${rest}` : "/api";
      url.searchParams.delete("__p");
      return new Request(url, req);
    }
  }
  return req;
}

async function handle(req: Request): Promise<Response> {
  return app.fetch(restoreRequest(req));
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
export const OPTIONS = handle;
export const HEAD = handle;
