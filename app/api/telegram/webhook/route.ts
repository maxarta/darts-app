import { webhookCallback } from "grammy";
import { createBotWithHandlers } from "@/lib/telegram/handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

let handler: ((req: Request) => Promise<Response>) | null = null;

function getHandler() {
  if (!handler) {
    handler = webhookCallback(createBotWithHandlers(), "std/http");
  }
  return handler;
}

export async function POST(req: Request) {
  const token = process.env.BOT_TOKEN?.trim();
  if (!token) {
    return Response.json({ error: "BOT_TOKEN not configured" }, { status: 503 });
  }

  try {
    return await getHandler()(req);
  } catch (e) {
    console.error("[telegram/webhook]", e);
    // Telegram повторяет доставку при 5xx — отвечаем 200, чтобы не копить очередь
    return new Response("OK", { status: 200 });
  }
}
