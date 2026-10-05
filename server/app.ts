import { Hono } from "hono";
import { cors } from "hono/cors";

import * as authSession from "@/app/api/auth/session/route";
import * as gamesRoot from "@/app/api/games/route";
import * as gamesSync from "@/app/api/games/sync/route";
import * as gameById from "@/app/api/games/[gameId]/route";
import * as gameThrow from "@/app/api/games/[gameId]/throw/route";
import * as gameUndo from "@/app/api/games/[gameId]/undo/route";
import * as gameEndVisit from "@/app/api/games/[gameId]/end-visit/route";
import * as gameRestart from "@/app/api/games/[gameId]/restart/route";
import * as gameLeave from "@/app/api/games/[gameId]/leave/route";
import * as statsPlayer from "@/app/api/stats/player/route";
import * as statsLeaderboard from "@/app/api/stats/leaderboard/route";
import * as tournamentsRoot from "@/app/api/tournaments/route";
import * as tournamentById from "@/app/api/tournaments/[tournamentId]/route";
import * as tournamentDraw from "@/app/api/tournaments/[tournamentId]/draw/route";
import * as tournamentMatch from "@/app/api/tournaments/[tournamentId]/match/route";
import * as tournamentPlayoff from "@/app/api/tournaments/[tournamentId]/playoff/route";
import * as tournamentFinish from "@/app/api/tournaments/[tournamentId]/finish/route";
import * as telegramWebhook from "@/app/api/telegram/webhook/route";
import * as telegramAvatar from "@/app/api/telegram/avatar/[telegramId]/route";
import * as channelCurrent from "@/app/api/channels/[channelId]/current/route";
import * as channelGames from "@/app/api/channels/[channelId]/games/route";
import * as channelPlayers from "@/app/api/channels/[channelId]/players/route";
import * as channelPlayerById from "@/app/api/channels/[channelId]/players/[userId]/route";
import * as channelTournaments from "@/app/api/channels/[channelId]/tournaments/route";
import * as channelMembers from "@/app/api/channels/[channelId]/members/route";

type Params = Record<string, string>;

function withParams(params: Params) {
  return { params: Promise.resolve(params) };
}

async function call(
  // Next-style route handlers vary by param shape; keep adapter permissive.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handler: ((req: Request, ctx?: any) => Promise<Response> | Response) | undefined,
  req: Request,
  params: Params = {}
) {
  if (!handler) {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }
  return handler(req, withParams(params));
}

export function createApp() {
  const app = new Hono();

  app.use(
    "*",
    cors({
      origin: "*",
      allowHeaders: [
        "Content-Type",
        "x-telegram-init-data",
        "x-web-auth",
        "x-dev-auth",
      ],
      allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    })
  );

  app.get("/api/health", (c) => c.json({ ok: true }));

  app.post("/api/auth/session", (c) => call(authSession.POST, c.req.raw));

  app.post("/api/games", (c) => call(gamesRoot.POST, c.req.raw));
  app.post("/api/games/sync", (c) => call(gamesSync.POST, c.req.raw));
  app.get("/api/games/:gameId", (c) =>
    call(gameById.GET, c.req.raw, { gameId: c.req.param("gameId") })
  );
  app.post("/api/games/:gameId/throw", (c) =>
    call(gameThrow.POST, c.req.raw, { gameId: c.req.param("gameId") })
  );
  app.post("/api/games/:gameId/undo", (c) =>
    call(gameUndo.POST, c.req.raw, { gameId: c.req.param("gameId") })
  );
  app.post("/api/games/:gameId/end-visit", (c) =>
    call(gameEndVisit.POST, c.req.raw, { gameId: c.req.param("gameId") })
  );
  app.post("/api/games/:gameId/restart", (c) =>
    call(gameRestart.POST, c.req.raw, { gameId: c.req.param("gameId") })
  );
  app.post("/api/games/:gameId/leave", (c) =>
    call(gameLeave.POST, c.req.raw, { gameId: c.req.param("gameId") })
  );

  app.get("/api/stats/player", (c) => call(statsPlayer.GET, c.req.raw));
  app.get("/api/stats/leaderboard", (c) =>
    call(statsLeaderboard.GET, c.req.raw)
  );

  app.get("/api/tournaments", (c) => call(tournamentsRoot.GET, c.req.raw));
  app.post("/api/tournaments", (c) => call(tournamentsRoot.POST, c.req.raw));
  app.get("/api/tournaments/:tournamentId", (c) =>
    call(tournamentById.GET, c.req.raw, {
      tournamentId: c.req.param("tournamentId"),
    })
  );
  app.delete("/api/tournaments/:tournamentId", (c) =>
    call(tournamentById.DELETE, c.req.raw, {
      tournamentId: c.req.param("tournamentId"),
    })
  );
  app.post("/api/tournaments/:tournamentId/draw", (c) =>
    call(tournamentDraw.POST, c.req.raw, {
      tournamentId: c.req.param("tournamentId"),
    })
  );
  app.post("/api/tournaments/:tournamentId/match", (c) =>
    call(tournamentMatch.POST, c.req.raw, {
      tournamentId: c.req.param("tournamentId"),
    })
  );
  app.post("/api/tournaments/:tournamentId/playoff", (c) =>
    call(tournamentPlayoff.POST, c.req.raw, {
      tournamentId: c.req.param("tournamentId"),
    })
  );
  app.post("/api/tournaments/:tournamentId/finish", (c) =>
    call(tournamentFinish.POST, c.req.raw, {
      tournamentId: c.req.param("tournamentId"),
    })
  );

  app.post("/api/telegram/webhook", (c) =>
    call(telegramWebhook.POST, c.req.raw)
  );
  app.get("/api/telegram/avatar/:telegramId", (c) =>
    call(telegramAvatar.GET, c.req.raw, {
      telegramId: c.req.param("telegramId"),
    })
  );

  app.get("/api/channels/:channelId/current", (c) =>
    call(channelCurrent.GET, c.req.raw, {
      channelId: c.req.param("channelId"),
    })
  );
  app.get("/api/channels/:channelId/games", (c) =>
    call(channelGames.GET, c.req.raw, { channelId: c.req.param("channelId") })
  );
  app.get("/api/channels/:channelId/players", (c) =>
    call(channelPlayers.GET, c.req.raw, {
      channelId: c.req.param("channelId"),
    })
  );
  app.post("/api/channels/:channelId/players", (c) =>
    call(channelPlayers.POST, c.req.raw, {
      channelId: c.req.param("channelId"),
    })
  );
  app.patch("/api/channels/:channelId/players/:userId", (c) =>
    call(channelPlayerById.PATCH, c.req.raw, {
      channelId: c.req.param("channelId"),
      userId: c.req.param("userId"),
    })
  );
  app.delete("/api/channels/:channelId/players/:userId", (c) =>
    call(channelPlayerById.DELETE, c.req.raw, {
      channelId: c.req.param("channelId"),
      userId: c.req.param("userId"),
    })
  );
  app.get("/api/channels/:channelId/tournaments", (c) =>
    call(channelTournaments.GET, c.req.raw, {
      channelId: c.req.param("channelId"),
    })
  );
  app.get("/api/channels/:channelId/members", (c) =>
    call(channelMembers.GET, c.req.raw, {
      channelId: c.req.param("channelId"),
    })
  );

  app.notFound((c) => {
    if (c.req.path.startsWith("/api/")) {
      return c.json({ error: "Not found" }, 404);
    }
    return c.text("Not found", 404);
  });

  return app;
}

export type AppType = ReturnType<typeof createApp>;
