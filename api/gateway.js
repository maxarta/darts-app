// server/app.ts
import { Hono } from "hono";
import { cors } from "hono/cors";

// lib/telegram/init-data.ts
import crypto from "crypto";
function parseInitData(initData) {
  const params = new URLSearchParams(initData);
  const result = {};
  params.forEach((value, key) => {
    result[key] = value;
  });
  return result;
}
function validateInitData(initData, botToken) {
  if (!initData || !botToken) {
    return { valid: false };
  }
  const params = parseInitData(initData);
  const hash = params.hash;
  if (!hash) return { valid: false };
  const dataCheckString = Object.keys(params).filter((k) => k !== "hash").sort().map((k) => `${k}=${params[k]}`).join("\n");
  const secretKey = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
  const calculatedHash = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
  if (calculatedHash !== hash) {
    return { valid: false };
  }
  const authDate = Number(params.auth_date);
  if (authDate && Date.now() / 1e3 - authDate > 86400) {
    return { valid: false };
  }
  let user;
  if (params.user) {
    try {
      user = JSON.parse(params.user);
    } catch {
      return { valid: false };
    }
  }
  return { valid: true, user };
}
function parseStartParam(startParam) {
  if (!startParam) return {};
  const match = startParam.match(/^ch_(-?\d+)$/);
  if (match) {
    return { channelChatId: Number(match[1]) };
  }
  return {};
}

// lib/api/auth.ts
var WEB_CLUB_CHAT_ID = -1000000000001;
function getInitDataFromRequest(req) {
  const header = req.headers.get("x-telegram-init-data");
  if (header) return header;
  const url = new URL(req.url);
  return url.searchParams.get("initData");
}
function isWebAuthHeader(req) {
  const web = req.headers.get("x-web-auth");
  const legacy = req.headers.get("x-dev-auth");
  return web === "local" || legacy === "local";
}
function webAuthUser(req) {
  if (!isWebAuthHeader(req)) return null;
  const initData = getInitDataFromRequest(req);
  if (initData && initData.length > 0 && initData !== "dev") return null;
  return {
    id: 1,
    first_name: "\u0418\u0433\u0440\u043E\u043A"
  };
}
function authenticateRequest(req) {
  const webUser = webAuthUser(req);
  if (webUser) {
    return { ok: true, ctx: { user: webUser, initData: "web" } };
  }
  const initData = getInitDataFromRequest(req);
  if (!initData) {
    return { ok: false, error: "Missing auth", status: 401 };
  }
  const botToken = process.env.BOT_TOKEN?.trim();
  if (!botToken) {
    return { ok: false, error: "Server misconfigured", status: 500 };
  }
  const { valid, user } = validateInitData(initData, botToken);
  if (!valid || !user) {
    return { ok: false, error: "Invalid init data", status: 401 };
  }
  return { ok: true, ctx: { user, initData } };
}
function isWebSession(initData) {
  return initData === "web" || initData === "dev";
}
function jsonError(message, status) {
  return Response.json({ error: message }, { status });
}

// lib/supabase/server.ts
import { createClient } from "@supabase/supabase-js";
var adminClient = null;
function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  }
  if (!adminClient) {
    adminClient = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
  }
  return adminClient;
}
function isSupabaseConfigured() {
  return Boolean(
    process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

// lib/telegram/bot.ts
import { Bot } from "grammy";
var bot = null;
function getTelegramBot() {
  const token = process.env.BOT_TOKEN;
  if (!token) throw new Error("BOT_TOKEN is required");
  if (!bot) {
    bot = new Bot(token);
  }
  return bot;
}

// lib/telegram/user-photo.ts
function telegramAvatarPath(telegramId) {
  return `/api/telegram/avatar/${telegramId}`;
}
function isCustomClubPhoto(photoUrl) {
  return Boolean(photoUrl?.startsWith("data:image/"));
}
function shouldPreserveClubDisplayName(existing, telegramFirstName) {
  if (!existing) return false;
  if (isCustomClubPhoto(existing.photo_url)) return true;
  if (existing.username == null && existing.first_name.trim().length > 0 && existing.first_name !== telegramFirstName) {
    return true;
  }
  return false;
}
function resolveStoredPhotoUrl(_userId, photoUrl) {
  if (!photoUrl || photoUrl.length === 0) return null;
  if (photoUrl.startsWith("/api/telegram/avatar/")) return null;
  return photoUrl;
}
function botFileUrl(filePath) {
  const token = process.env.BOT_TOKEN?.trim();
  if (!token) throw new Error("BOT_TOKEN is required");
  return `https://api.telegram.org/file/bot${token}/${filePath}`;
}
async function getTelegramProfilePhotoFileUrl(telegramUserId) {
  try {
    const bot2 = getTelegramBot();
    const photos = await bot2.api.getUserProfilePhotos(telegramUserId, {
      limit: 1
    });
    if (!photos.total_count || photos.photos.length === 0) return null;
    const sizes = photos.photos[0];
    const largest = sizes[sizes.length - 1];
    if (!largest) return null;
    const file = await bot2.api.getFile(largest.file_id);
    if (!file.file_path) return null;
    return botFileUrl(file.file_path);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!msg.includes("user not found")) {
      console.warn("[telegram/user-photo] getUserProfilePhotos", telegramUserId, e);
    }
    return null;
  }
}
function isPublicPhotoUrl(url) {
  return url.startsWith("https://") && !url.includes("/bot") && !url.includes("api.telegram.org/file/bot");
}
function pickPhotoUrlToStore(telegramId, initPhotoUrl, existingPhotoUrl) {
  if (isCustomClubPhoto(existingPhotoUrl)) {
    return existingPhotoUrl;
  }
  if (initPhotoUrl && isPublicPhotoUrl(initPhotoUrl)) return initPhotoUrl;
  if (existingPhotoUrl && isPublicPhotoUrl(existingPhotoUrl)) {
    return existingPhotoUrl;
  }
  if (existingPhotoUrl?.startsWith("/api/telegram/avatar/")) {
    return existingPhotoUrl;
  }
  return telegramAvatarPath(telegramId);
}
async function resolveAvatarUpstreamUrl(telegramId, storedPhotoUrl) {
  const fileUrl = await getTelegramProfilePhotoFileUrl(telegramId);
  if (fileUrl) return fileUrl;
  if (storedPhotoUrl && isPublicPhotoUrl(storedPhotoUrl)) {
    return storedPhotoUrl;
  }
  return null;
}
async function syncUserProfilePhoto(user, existingPhotoUrl) {
  if (isCustomClubPhoto(existingPhotoUrl)) {
    return existingPhotoUrl;
  }
  const db = getSupabaseAdmin();
  const stored = pickPhotoUrlToStore(
    user.id,
    user.photo_url,
    existingPhotoUrl
  );
  const { error } = await db.from("users").update({ photo_url: stored }).eq("telegram_id", user.id);
  if (error) throw error;
  return stored;
}
async function syncUserProfilePhotos(users) {
  await Promise.all(
    users.filter((u) => !isCustomClubPhoto(u.existingPhotoUrl)).map((u) => syncUserProfilePhoto(u, u.existingPhotoUrl))
  );
}

// lib/db/users.ts
async function getUserPhotoUrl(telegramId) {
  const profile = await getUserProfile(telegramId);
  return profile?.photo_url ?? null;
}
async function getUserProfile(telegramId) {
  const db = getSupabaseAdmin();
  const { data, error } = await db.from("users").select("telegram_id, first_name, username, photo_url").eq("telegram_id", telegramId).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    telegram_id: data.telegram_id,
    first_name: data.first_name ?? String(telegramId),
    username: data.username ?? null,
    photo_url: data.photo_url ?? null
  };
}
async function upsertUser(user) {
  const db = getSupabaseAdmin();
  const existing = await getUserProfile(user.id);
  const existingPhotoUrl = existing?.photo_url ?? null;
  const photo_url = pickPhotoUrlToStore(
    user.id,
    user.photo_url,
    existingPhotoUrl
  );
  const preserveName = shouldPreserveClubDisplayName(
    existing,
    user.first_name
  );
  if (!existing) {
    const { error } = await db.from("users").insert({
      telegram_id: user.id,
      username: user.username ?? null,
      first_name: user.first_name,
      last_name: user.last_name ?? null,
      photo_url
    });
    if (error) throw error;
  } else {
    const { error } = await db.from("users").update({
      username: preserveName ? existing.username : user.username ?? null,
      first_name: preserveName ? existing.first_name : user.first_name,
      last_name: user.last_name ?? null,
      photo_url
    }).eq("telegram_id", user.id);
    if (error) throw error;
  }
  if (!isCustomClubPhoto(photo_url) && !isCustomClubPhoto(existingPhotoUrl)) {
    try {
      await syncUserProfilePhoto(user, existingPhotoUrl);
    } catch (e) {
      console.warn("[users] syncUserProfilePhoto", user.id, e);
    }
  }
  return user.id;
}

// lib/db/channels.ts
var MEMBER_STATUSES = /* @__PURE__ */ new Set([
  "creator",
  "administrator",
  "member"
]);
var ADMIN_ROLES = /* @__PURE__ */ new Set(["creator", "administrator"]);
function roleFromTelegramStatus(status) {
  if (status === "creator" || status === "administrator") return status;
  return "member";
}
async function fetchTelegramMemberRole(telegramChatId, userId) {
  try {
    const bot2 = getTelegramBot();
    const member = await bot2.api.getChatMember(telegramChatId, userId);
    return roleFromTelegramStatus(member.status);
  } catch {
    return "member";
  }
}
async function ensureChannel(telegramChatId, title) {
  const db = getSupabaseAdmin();
  const { data: existing } = await db.from("channels").select("*").eq("telegram_chat_id", telegramChatId).maybeSingle();
  if (existing) return existing;
  const { data, error } = await db.from("channels").insert({
    telegram_chat_id: telegramChatId,
    title: title ?? `Channel ${telegramChatId}`
  }).select().single();
  if (error) throw error;
  return data;
}
async function verifyChannelMembership(telegramChatId, userId) {
  try {
    const bot2 = getTelegramBot();
    const member = await bot2.api.getChatMember(telegramChatId, userId);
    return MEMBER_STATUSES.has(member.status);
  } catch {
    return false;
  }
}
async function registerChannelMember(channelId, telegramChatId, userId, role) {
  const skipVerify = telegramChatId === WEB_CLUB_CHAT_ID || process.env.NODE_ENV === "development" && process.env.ALLOW_DEV_AUTH === "true";
  let resolvedRole = role;
  if (!skipVerify) {
    const isMember = await verifyChannelMembership(telegramChatId, userId);
    if (!isMember) {
      throw new Error("NOT_CHANNEL_MEMBER");
    }
    resolvedRole = await fetchTelegramMemberRole(telegramChatId, userId);
  } else if (!resolvedRole) {
    resolvedRole = userId === 1 ? "creator" : "member";
  }
  const db = getSupabaseAdmin();
  const { error } = await db.from("channel_members").upsert(
    {
      channel_id: channelId,
      user_id: userId,
      role: resolvedRole ?? "member",
      last_verified_at: (/* @__PURE__ */ new Date()).toISOString()
    },
    { onConflict: "channel_id,user_id" }
  );
  if (error) throw error;
  return resolvedRole ?? "member";
}
async function getChannelMemberRole(channelId, userId) {
  const db = getSupabaseAdmin();
  const { data } = await db.from("channel_members").select("role").eq("channel_id", channelId).eq("user_id", userId).maybeSingle();
  if (!data?.role) return null;
  const role = data.role;
  if (role === "creator" || role === "administrator" || role === "member") {
    return role;
  }
  return "member";
}
async function isChannelAdmin(channelId, userId) {
  if (process.env.NODE_ENV === "development" && process.env.ALLOW_DEV_AUTH === "true" && userId === 1) {
    return true;
  }
  const role = await getChannelMemberRole(channelId, userId);
  return role != null && ADMIN_ROLES.has(role);
}
async function getChannelMembers(channelId) {
  const db = getSupabaseAdmin();
  const { data, error } = await db.from("channel_members").select(
    `
      user_id,
      role,
      last_verified_at,
      users (
        telegram_id,
        username,
        first_name,
        last_name,
        photo_url
      )
    `
  ).eq("channel_id", channelId).order("last_verified_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

// app/api/auth/session/route.ts
async function POST(req) {
  try {
    const auth = authenticateRequest(req);
    if (!auth.ok) return jsonError(auth.error, auth.status);
    if (!isSupabaseConfigured()) {
      return jsonError(
        "\u0411\u0430\u0437\u0430 \u043D\u0435 \u043D\u0430\u0441\u0442\u0440\u043E\u0435\u043D\u0430: \u0434\u043E\u0431\u0430\u0432\u044C\u0442\u0435 SUPABASE_URL \u0438 SUPABASE_SERVICE_ROLE_KEY \u043D\u0430 Vercel",
        503
      );
    }
    const body = await req.json().catch(() => ({}));
    const startParam = body.startParam || body.start_param || void 0;
    const { channelChatId } = parseStartParam(startParam);
    await upsertUser(auth.ctx.user);
    const stored = await getUserProfile(auth.ctx.user.id);
    const user = {
      ...auth.ctx.user,
      first_name: stored?.first_name || auth.ctx.user.first_name,
      username: stored?.username ?? auth.ctx.user.username,
      photo_url: resolveStoredPhotoUrl(auth.ctx.user.id, stored?.photo_url) ?? auth.ctx.user.photo_url
    };
    let channel = null;
    let isChannelAdmin2 = false;
    const web = isWebSession(auth.ctx.initData);
    const chatId = channelChatId ?? (web ? WEB_CLUB_CHAT_ID : void 0);
    if (chatId) {
      channel = await ensureChannel(
        chatId,
        body.channelTitle ?? (web ? "\u041A\u043B\u0443\u0431" : void 0)
      );
      const role = await registerChannelMember(
        channel.id,
        chatId,
        auth.ctx.user.id,
        web ? "creator" : void 0
      );
      isChannelAdmin2 = ADMIN_ROLES.has(role);
    }
    return Response.json({
      user,
      channel,
      isChannelAdmin: isChannelAdmin2
    });
  } catch (e) {
    console.error("[auth/session]", e);
    const message = e instanceof Error ? e.message : "Server error";
    if (message === "NOT_CHANNEL_MEMBER") {
      return jsonError("\u041D\u0435\u0442 \u0434\u043E\u0441\u0442\u0443\u043F\u0430 \u043A \u044D\u0442\u043E\u043C\u0443 \u043A\u043B\u0443\u0431\u0443", 403);
    }
    if (message.includes("Invalid URL") || message.includes("SUPABASE_URL")) {
      return jsonError(
        "\u041D\u0435\u0432\u0435\u0440\u043D\u044B\u0439 SUPABASE_URL \u043D\u0430 \u0441\u0435\u0440\u0432\u0435\u0440\u0435 (\u043D\u0443\u0436\u0435\u043D https://\u2026.supabase.co)",
        503
      );
    }
    if (message.includes("PGRST") || message.includes("relation") || message.includes("schema cache")) {
      return jsonError(
        "\u0422\u0430\u0431\u043B\u0438\u0446\u044B \u0432 Supabase \u043D\u0435 \u0441\u043E\u0437\u0434\u0430\u043D\u044B \u2014 \u0432\u044B\u043F\u043E\u043B\u043D\u0438\u0442\u0435 supabase/migrations/001_initial.sql",
        503
      );
    }
    return jsonError(message, 500);
  }
}

// lib/darts/rules.ts
var UNLIMITED_ROUNDS = 9999;
function defaultSettings(mode) {
  const score = typeof mode === "string" ? Number(mode) : mode;
  return {
    startingScore: score,
    doubleOut: true,
    legsToWin: 3,
    maxRounds: UNLIMITED_ROUNDS,
    startRule: "straight",
    finishRule: "double"
  };
}
function throwPoints(input) {
  if (input.segment === "miss") return 0;
  if (input.segment === "bull25") return input.multiplier === 2 ? 50 : 25;
  if (input.segment === "bull50") return 50;
  return input.segment * input.multiplier;
}
function isCheckoutThrow(remaining, input, doubleOut) {
  const pts = throwPoints(input);
  if (remaining - pts !== 0) return false;
  if (!doubleOut) return true;
  if (input.segment === "bull50") return true;
  if (input.segment === "bull25" && input.multiplier === 2) return true;
  return input.multiplier === 2;
}
function isBust(remaining, visitThrows, doubleOut) {
  let running = remaining;
  for (const t of visitThrows) {
    const after = running - throwPoints(t);
    if (after < 0) return true;
    if (after === 0) {
      return !isCheckoutThrow(running, t, doubleOut);
    }
    if (after === 1 && doubleOut) return true;
    running = after;
  }
  return false;
}
function applyVisit(remaining, visitThrows, settings) {
  const visitTotal = visitThrows.reduce((s, t) => s + throwPoints(t), 0);
  const bust = isBust(remaining, visitThrows, settings.doubleOut);
  if (bust) {
    return { bust: true, remaining, visitTotal, legWon: false };
  }
  const after = remaining - visitTotal;
  const legWon = after === 0;
  return { bust: false, remaining: after, visitTotal, legWon };
}
function calculatePpr(startingScore, remaining, dartsThrown) {
  if (dartsThrown === 0) return 0;
  const scored = startingScore - remaining;
  return Math.round(scored / (dartsThrown / 3) * 10) / 10;
}

// lib/game/throws-from-db.ts
function segmentFromDb(segment, multiplier) {
  if (segment === "miss") return { segment: "miss", multiplier: 1 };
  if (segment === "bull25")
    return { segment: "bull25", multiplier: multiplier === 2 ? 2 : 1 };
  if (segment === "bull50") return { segment: "bull50", multiplier: 1 };
  return {
    segment: Number(segment),
    multiplier
  };
}
function segmentToDb(segment) {
  if (typeof segment === "number") return String(segment);
  return segment;
}

// lib/darts/visit-index.ts
function getActiveVisitIndex(dartsThrown, visitScore, awaitingVisitEnd = false) {
  if (dartsThrown === 0) return 0;
  if (dartsThrown % 3 === 0) {
    if (awaitingVisitEnd || visitScore > 0) {
      return dartsThrown / 3 - 1;
    }
    return dartsThrown / 3;
  }
  return Math.floor(dartsThrown / 3);
}

// lib/tournament/bracket.ts
function generateRoundRobinPairings(participantIds) {
  const ids = [...participantIds];
  if (ids.length % 2 === 1) {
    ids.push(-1);
  }
  const n = ids.length;
  const rounds = n - 1;
  const pairings = [];
  const fixed = ids[0];
  let rotating = ids.slice(1);
  for (let r = 0; r < rounds; r++) {
    const round = [fixed, ...rotating];
    for (let i = 0; i < n / 2; i++) {
      const a = round[i];
      const b = round[n - 1 - i];
      if (a !== -1 && b !== -1) {
        pairings.push([a, b]);
      }
    }
    rotating = [rotating[rotating.length - 1], ...rotating.slice(0, -1)];
  }
  return pairings;
}
function shuffleInPlace(items, random = Math.random) {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
function sortStandings(standings) {
  return [...standings].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    return b.legsDiff - a.legsDiff;
  });
}
function generatePlayoffBracket(qualifiedIds, size) {
  const seeds = sortStandings(
    qualifiedIds.map((id, i) => ({
      userId: id,
      points: qualifiedIds.length - i,
      legsDiff: 0,
      name: ""
    }))
  ).map((s) => s.userId);
  const bracketSize = size;
  const padded = [...seeds];
  while (padded.length < bracketSize) padded.push(null);
  const matches = [];
  const round1Pairs = [];
  for (let i = 0; i < bracketSize / 2; i++) {
    round1Pairs.push([padded[i], padded[bracketSize - 1 - i]]);
  }
  round1Pairs.forEach(([p1, p2], slot) => {
    matches.push({ round: 1, slot, player1Id: p1, player2Id: p2 });
  });
  let prevRoundCount = bracketSize / 2;
  let round = 2;
  while (prevRoundCount > 1) {
    for (let slot = 0; slot < prevRoundCount / 2; slot++) {
      matches.push({
        round,
        slot,
        player1Id: null,
        player2Id: null
      });
    }
    prevRoundCount /= 2;
    round++;
  }
  return matches;
}

// lib/tournament/playoff-display.ts
function getPlayoffRoundTitle(round, totalRounds) {
  if (round === totalRounds) return "\u0424\u0438\u043D\u0430\u043B";
  if (round === totalRounds - 1) return "\u041F\u043E\u043B\u0443\u0444\u0438\u043D\u0430\u043B";
  if (round === 1 && totalRounds === 3) return "1/4 \u0444\u0438\u043D\u0430\u043B\u0430";
  return `\u0420\u0430\u0443\u043D\u0434 ${round}`;
}
function getPlayoffRoundCount(playoffSize) {
  return playoffSize === 8 ? 3 : 2;
}

// lib/tournament/variant.ts
function normalizeTournamentVariant(value) {
  return value === "kenny" ? "kenny" : "standard";
}
function variantFromTournamentRow(row) {
  if (row.variant != null && row.variant !== "") {
    return normalizeTournamentVariant(row.variant);
  }
  if (row.settings && typeof row.settings === "object") {
    const v = row.settings.variant;
    if (v != null) return normalizeTournamentVariant(v);
  }
  return "standard";
}
function isMissingVariantColumnError(error) {
  const msg = (error.message ?? "").toLowerCase();
  return msg.includes("variant") && msg.includes("column");
}

// lib/tournament/game-context.ts
async function getTournamentContextForMatch(matchId) {
  const db = getSupabaseAdmin();
  const { data: rr } = await db.from("round_robin_matches").select("tournament_id").eq("id", matchId).maybeSingle();
  if (rr) {
    const { data: tournament2 } = await db.from("tournaments").select("id, name, variant, settings").eq("id", rr.tournament_id).single();
    if (!tournament2) return null;
    return {
      tournamentId: tournament2.id,
      name: tournament2.name,
      stage: "\u041A\u0440\u0443\u0433\u043E\u0432\u043E\u0439 \u044D\u0442\u0430\u043F",
      variant: variantFromTournamentRow(tournament2)
    };
  }
  const { data: po } = await db.from("playoff_matches").select("tournament_id, round").eq("id", matchId).maybeSingle();
  if (!po) return null;
  const { data: tournament } = await db.from("tournaments").select("id, name, playoff_size, variant, settings").eq("id", po.tournament_id).single();
  if (!tournament) return null;
  const playoffSize = tournament.playoff_size === 8 ? 8 : 4;
  const totalRounds = getPlayoffRoundCount(playoffSize);
  return {
    tournamentId: tournament.id,
    name: tournament.name,
    stage: getPlayoffRoundTitle(po.round, totalRounds),
    variant: variantFromTournamentRow(tournament)
  };
}

// lib/game/multiplayer.ts
var MIN_PLAYERS_FOR_STATS = 2;
function isMultiplayerGame(players) {
  return (players?.length ?? 0) >= MIN_PLAYERS_FOR_STATS;
}
function gameIdsWithMinPlayers(rows, minPlayers = MIN_PLAYERS_FOR_STATS) {
  const counts = /* @__PURE__ */ new Map();
  for (const row of rows) {
    counts.set(row.game_id, (counts.get(row.game_id) ?? 0) + 1);
  }
  const ids = /* @__PURE__ */ new Set();
  for (const [gameId, count] of counts) {
    if (count >= minPlayers) ids.add(gameId);
  }
  return ids;
}

// lib/db/games.ts
function parseSettings(mode, raw) {
  if (raw && typeof raw === "object") {
    return { ...defaultSettings(mode), ...raw };
  }
  return defaultSettings(mode);
}
async function createGame(params) {
  const db = getSupabaseAdmin();
  const settings = {
    ...defaultSettings(params.mode),
    ...params.settings
  };
  const { data: game, error } = await db.from("games").insert({
    channel_id: params.channelId,
    mode: params.mode,
    settings,
    created_by: params.createdBy,
    tournament_match_id: params.tournamentMatchId ?? null
  }).select().single();
  if (error) throw error;
  const players = params.playerIds.map((userId, order_index) => ({
    game_id: game.id,
    user_id: userId,
    order_index,
    remaining_score: settings.startingScore,
    score_at_visit_start: settings.startingScore,
    legs_won: 0,
    visit_score: 0,
    darts_thrown: 0,
    awaiting_visit_end: false
  }));
  const { error: pErr } = await db.from("game_players").insert(players);
  if (pErr) throw pErr;
  return getGame(game.id);
}
async function getGame(gameId) {
  const db = getSupabaseAdmin();
  const { data: game, error } = await db.from("games").select("*").eq("id", gameId).single();
  if (error) throw error;
  const { data: players } = await db.from("game_players").select("*, users(first_name, username)").eq("game_id", gameId).order("order_index");
  const settings = parseSettings(game.mode, game.settings);
  const enriched = (players ?? []).map((p) => ({
    ...p,
    ppr: calculatePpr(settings.startingScore, p.remaining_score, p.darts_thrown)
  }));
  const active = enriched.find(
    (p) => p.order_index === game.current_player_index
  );
  let activeVisitThrows = [];
  if (active && game.status === "active") {
    activeVisitThrows = await getCurrentVisitThrows(gameId, active.id);
  }
  const tournamentContext = game.tournament_match_id ? await getTournamentContextForMatch(game.tournament_match_id) : null;
  return {
    game: { ...game, settings },
    players: enriched,
    activeVisitThrows,
    tournamentContext
  };
}
async function recordThrow(gameId, input) {
  const db = getSupabaseAdmin();
  const { game, players } = await getGame(gameId);
  if (game.status !== "active") throw new Error("GAME_NOT_ACTIVE");
  const settings = parseSettings(game.mode, game.settings);
  const active = players.find(
    (p) => p.order_index === game.current_player_index
  );
  if (!active) throw new Error("NO_ACTIVE_PLAYER");
  if (active.awaiting_visit_end) throw new Error("VISIT_FULL");
  const visitThrows = await getCurrentVisitThrows(gameId, active.id);
  if (visitThrows.length >= 3) throw new Error("VISIT_FULL");
  const points = throwPoints(input);
  const dartIndex = visitThrows.length + 1;
  const visitIndex = getActiveVisitIndex(
    active.darts_thrown,
    active.visit_score,
    active.awaiting_visit_end
  );
  await db.from("throws").insert({
    game_id: gameId,
    game_player_id: active.id,
    visit_index: visitIndex,
    dart_index: dartIndex,
    segment: segmentToDb(input.segment),
    multiplier: input.multiplier,
    points
  });
  const newVisitThrows = [...visitThrows, input];
  const visitTotal = newVisitThrows.reduce((s, t) => s + throwPoints(t), 0);
  const bust = applyVisit(
    active.score_at_visit_start,
    newVisitThrows,
    settings
  ).bust;
  const newDartsThrown = active.darts_thrown + 1;
  await db.from("game_players").update({
    visit_score: bust ? 0 : visitTotal,
    darts_thrown: newDartsThrown,
    remaining_score: bust ? active.score_at_visit_start : active.score_at_visit_start - visitTotal,
    awaiting_visit_end: newDartsThrown % 3 === 0
  }).eq("id", active.id);
  return getGame(gameId);
}
async function getVisitThrows(gameId, gamePlayerId, visitIndex) {
  const db = getSupabaseAdmin();
  const { data: throws } = await db.from("throws").select("*").eq("game_id", gameId).eq("game_player_id", gamePlayerId).eq("visit_index", visitIndex).order("dart_index");
  return (throws ?? []).map(
    (t) => segmentFromDb(t.segment, t.multiplier)
  );
}
async function getCurrentVisitThrows(gameId, gamePlayerId) {
  const db = getSupabaseAdmin();
  const { data: player } = await db.from("game_players").select("darts_thrown, visit_score, awaiting_visit_end").eq("id", gamePlayerId).single();
  const visitIndex = getActiveVisitIndex(
    player?.darts_thrown ?? 0,
    player?.visit_score ?? 0,
    player?.awaiting_visit_end ?? false
  );
  return getVisitThrows(gameId, gamePlayerId, visitIndex);
}
async function undoLastThrow(gameId) {
  const db = getSupabaseAdmin();
  const { game, players } = await getGame(gameId);
  const active = players.find(
    (p) => p.order_index === game.current_player_index
  );
  if (!active) throw new Error("NO_ACTIVE_PLAYER");
  const activeThrows = await getCurrentVisitThrows(gameId, active.id);
  if (activeThrows.length > 0) {
    const visitIndex = getActiveVisitIndex(
      active.darts_thrown,
      active.visit_score,
      active.awaiting_visit_end
    );
    const { data: lastThrow } = await db.from("throws").select("*").eq("game_id", gameId).eq("game_player_id", active.id).eq("visit_index", visitIndex).order("dart_index", { ascending: false }).limit(1).maybeSingle();
    if (!lastThrow) throw new Error("NOTHING_TO_UNDO");
    await db.from("throws").delete().eq("id", lastThrow.id);
    const visitThrows = await getCurrentVisitThrows(gameId, active.id);
    const visitTotal = visitThrows.reduce((s, t) => s + throwPoints(t), 0);
    const bust = visitThrows.length > 0 && applyVisit(
      active.score_at_visit_start,
      visitThrows,
      parseSettings(game.mode, game.settings)
    ).bust;
    const newDartsThrown = Math.max(0, active.darts_thrown - 1);
    await db.from("game_players").update({
      visit_score: bust ? 0 : visitTotal,
      darts_thrown: newDartsThrown,
      remaining_score: bust ? active.score_at_visit_start : active.score_at_visit_start - visitTotal,
      awaiting_visit_end: newDartsThrown > 0 && newDartsThrown % 3 === 0
    }).eq("id", active.id);
    return getGame(gameId);
  }
  const reverted = await revertLastEndVisit(gameId, game, players, active);
  if (!reverted) throw new Error("NOTHING_TO_UNDO");
  return getGame(gameId);
}
async function revertLastEndVisit(gameId, game, players, active) {
  const db = getSupabaseAdmin();
  const settings = parseSettings(game.mode, game.settings);
  const playerCount = players.length;
  const prevIndex = (game.current_player_index - 1 + playerCount) % playerCount;
  const prev = players.find((p) => p.order_index === prevIndex);
  if (!prev || prev.darts_thrown === 0 || prev.darts_thrown % 3 !== 0) {
    return false;
  }
  const activeVisitIndex = getActiveVisitIndex(
    active.darts_thrown,
    active.visit_score,
    active.awaiting_visit_end
  );
  const activeThrows = await getVisitThrows(
    gameId,
    active.id,
    activeVisitIndex
  );
  if (activeThrows.length > 0) return false;
  const prevVisitIndex = prev.darts_thrown / 3 - 1;
  const prevThrows = await getVisitThrows(gameId, prev.id, prevVisitIndex);
  if (prevThrows.length === 0) return false;
  const visitTotal = prevThrows.reduce((s, t) => s + throwPoints(t), 0);
  let visitStartScore = prev.remaining_score + visitTotal;
  const result = applyVisit(visitStartScore, prevThrows, settings);
  if (result.legWon) return false;
  if (result.bust) {
    visitStartScore = prev.remaining_score;
  }
  await db.from("game_players").update({
    remaining_score: result.bust ? visitStartScore : visitStartScore - visitTotal,
    visit_score: result.bust ? 0 : visitTotal,
    score_at_visit_start: visitStartScore,
    darts_thrown: prevVisitIndex * 3 + 3,
    awaiting_visit_end: true
  }).eq("id", prev.id);
  let nextRound = game.current_round;
  if ((prevIndex + 1) % playerCount === 0) {
    nextRound = Math.max(1, nextRound - 1);
  }
  await db.from("games").update({
    current_player_index: prevIndex,
    current_round: nextRound
  }).eq("id", gameId);
  return true;
}
async function endVisit(gameId) {
  const db = getSupabaseAdmin();
  const { game, players } = await getGame(gameId);
  const settings = parseSettings(game.mode, game.settings);
  const active = players.find(
    (p) => p.order_index === game.current_player_index
  );
  if (!active) throw new Error("NO_ACTIVE_PLAYER");
  const visitIndex = getActiveVisitIndex(
    active.darts_thrown,
    active.visit_score,
    active.awaiting_visit_end
  );
  let visitThrows = await getVisitThrows(gameId, active.id, visitIndex);
  while (visitThrows.length < 3) {
    const dartIndex = visitThrows.length + 1;
    await db.from("throws").insert({
      game_id: gameId,
      game_player_id: active.id,
      visit_index: visitIndex,
      dart_index: dartIndex,
      segment: "miss",
      multiplier: 1,
      points: 0
    });
    visitThrows = [...visitThrows, { segment: "miss", multiplier: 1 }];
  }
  const visitStartDarts = visitIndex * 3;
  const visitTotal = visitThrows.reduce((s, t) => s + throwPoints(t), 0);
  await db.from("game_players").update({
    visit_score: visitTotal,
    darts_thrown: visitStartDarts + 3,
    remaining_score: active.score_at_visit_start - visitTotal
  }).eq("id", active.id);
  const result = applyVisit(
    active.score_at_visit_start,
    visitThrows,
    settings
  );
  let legsWon = active.legs_won;
  let remaining = result.bust ? active.score_at_visit_start : result.remaining;
  if (result.legWon) {
    legsWon += 1;
    remaining = settings.startingScore;
  }
  await db.from("game_players").update({
    remaining_score: remaining,
    legs_won: legsWon,
    visit_score: 0,
    score_at_visit_start: remaining,
    awaiting_visit_end: false
  }).eq("id", active.id);
  let gameFinished = false;
  let nextPlayerIndex = (game.current_player_index + 1) % players.length;
  let nextLeg = game.current_leg;
  let nextRound = game.current_round;
  if (result.legWon && legsWon >= settings.legsToWin) {
    gameFinished = true;
    await db.from("games").update({
      status: "finished",
      finished_at: (/* @__PURE__ */ new Date()).toISOString()
    }).eq("id", gameId);
    if (game.tournament_match_id) {
      await handleTournamentMatchWin(
        game.tournament_match_id,
        active.user_id
      );
    }
  } else {
    if (nextPlayerIndex === 0) {
      nextRound += 1;
    }
    if (result.legWon) {
      nextLeg += 1;
      nextRound = 1;
      for (const p of players) {
        if (p.id !== active.id) {
          await db.from("game_players").update({
            remaining_score: settings.startingScore,
            score_at_visit_start: settings.startingScore,
            visit_score: 0,
            awaiting_visit_end: false
          }).eq("id", p.id);
        }
      }
    }
    await db.from("games").update({
      current_player_index: nextPlayerIndex,
      current_leg: nextLeg,
      current_round: nextRound
    }).eq("id", gameId);
  }
  return getGame(gameId);
}
async function handleTournamentMatchWin(matchRef, winnerId) {
  const db = getSupabaseAdmin();
  const { data: rr } = await db.from("round_robin_matches").select("*").eq("id", matchRef).maybeSingle();
  if (rr) {
    const p1Win = rr.player1_id === winnerId;
    await db.from("round_robin_matches").update({
      played: true,
      points_p1: p1Win ? 2 : 0,
      points_p2: p1Win ? 0 : 2
    }).eq("id", matchRef);
    return;
  }
  const { data: po } = await db.from("playoff_matches").select("*").eq("id", matchRef).maybeSingle();
  if (po) {
    await db.from("playoff_matches").update({ winner_id: winnerId }).eq("id", matchRef);
    const { data: nextRound } = await db.from("playoff_matches").select("*").eq("tournament_id", po.tournament_id).eq("round", po.round + 1).eq("slot", Math.floor(po.slot / 2)).maybeSingle();
    if (nextRound) {
      const field = po.slot % 2 === 0 ? "player1_id" : "player2_id";
      await db.from("playoff_matches").update({ [field]: winnerId }).eq("id", nextRound.id);
    }
  }
}
async function restartGame(gameId) {
  const db = getSupabaseAdmin();
  const { game, players } = await getGame(gameId);
  const settings = parseSettings(game.mode, game.settings);
  await db.from("throws").delete().eq("game_id", gameId);
  await db.from("games").update({
    status: "active",
    current_player_index: 0,
    current_leg: 1,
    current_round: 1,
    finished_at: null
  }).eq("id", gameId);
  for (const p of players) {
    await db.from("game_players").update({
      remaining_score: settings.startingScore,
      score_at_visit_start: settings.startingScore,
      legs_won: 0,
      visit_score: 0,
      darts_thrown: 0,
      awaiting_visit_end: false
    }).eq("id", p.id);
  }
  return getGame(gameId);
}
async function cancelGame(gameId) {
  const db = getSupabaseAdmin();
  const { error } = await db.from("games").update({
    status: "cancelled",
    finished_at: (/* @__PURE__ */ new Date()).toISOString()
  }).eq("id", gameId);
  if (error) throw error;
  return getGame(gameId);
}
async function listChannelGames(channelId, limit = 50) {
  const db = getSupabaseAdmin();
  const { data, error } = await db.from("games").select(
    `
      id, mode, status, settings, created_at, finished_at, current_round,
      game_players (
        user_id, legs_won, remaining_score,
        users (first_name, username, photo_url)
      )
    `
  ).eq("channel_id", channelId).eq("status", "finished").order("created_at", { ascending: false }).limit(limit);
  if (error) throw error;
  return (data ?? []).filter((g) => isMultiplayerGame(g.game_players));
}
async function listChannelActiveGames(channelId, limit = 50) {
  const db = getSupabaseAdmin();
  const { data, error } = await db.from("games").select(
    `
      id, mode, status, settings, created_at, finished_at, current_round,
      game_players (
        user_id, legs_won, remaining_score,
        users (first_name, username, photo_url)
      )
    `
  ).eq("channel_id", channelId).eq("status", "active").order("created_at", { ascending: false }).limit(limit);
  if (error) throw error;
  return (data ?? []).filter((g) => isMultiplayerGame(g.game_players));
}

// app/api/games/route.ts
async function POST2(req) {
  const auth = authenticateRequest(req);
  if (!auth.ok) return jsonError(auth.error, auth.status);
  const body = await req.json();
  const { channelId, mode, playerIds, settings, telegramChatId } = body;
  if (!channelId || !mode || !Array.isArray(playerIds) || playerIds.length < 1) {
    return jsonError("Invalid payload", 400);
  }
  if (telegramChatId) {
    await registerChannelMember(
      channelId,
      Number(telegramChatId),
      auth.ctx.user.id
    );
  }
  const db = getSupabaseAdmin();
  for (const pid of playerIds) {
    const { data: m } = await db.from("channel_members").select("user_id").eq("channel_id", channelId).eq("user_id", pid).maybeSingle();
    if (!m) return jsonError(`Player ${pid} not in channel registry`, 400);
  }
  const result = await createGame({
    channelId,
    mode: mode === "301" ? "301" : "501",
    playerIds,
    createdBy: auth.ctx.user.id,
    settings
  });
  return Response.json(result);
}

// lib/db/import-local-game.ts
function findFinishedGameWinner(params) {
  const settings = {
    ...defaultSettings(params.mode),
    ...params.settings
  };
  const legsToWin = settings.legsToWin ?? 1;
  const byLegs = params.players.find((p) => p.legsWon >= legsToWin);
  if (byLegs) return byLegs.userId;
  if (params.status !== "finished") return null;
  const atZero = params.players.filter((p) => p.remainingScore === 0);
  if (atZero.length === 1) return atZero[0].userId;
  return null;
}
async function handleTournamentMatchWin2(matchRef, winnerId) {
  const db = getSupabaseAdmin();
  const { data: rr } = await db.from("round_robin_matches").select("*").eq("id", matchRef).maybeSingle();
  if (rr) {
    if (rr.played) return;
    const p1Win = rr.player1_id === winnerId;
    await db.from("round_robin_matches").update({
      played: true,
      points_p1: p1Win ? 2 : 0,
      points_p2: p1Win ? 0 : 2
    }).eq("id", matchRef);
    return;
  }
  const { data: po } = await db.from("playoff_matches").select("*").eq("id", matchRef).maybeSingle();
  if (po) {
    if (po.winner_id) return;
    await db.from("playoff_matches").update({ winner_id: winnerId }).eq("id", matchRef);
    const { data: nextRound } = await db.from("playoff_matches").select("*").eq("tournament_id", po.tournament_id).eq("round", po.round + 1).eq("slot", Math.floor(po.slot / 2)).maybeSingle();
    if (nextRound) {
      const field = po.slot % 2 === 0 ? "player1_id" : "player2_id";
      if (nextRound[field] == null) {
        await db.from("playoff_matches").update({ [field]: winnerId }).eq("id", nextRound.id);
      }
    }
  }
}
async function linkTournamentMatchGame(matchId, matchType, gameId) {
  const db = getSupabaseAdmin();
  const table = matchType === "rr" ? "round_robin_matches" : "playoff_matches";
  await db.from(table).update({ game_id: gameId }).eq("id", matchId);
}
async function applyFinishedTournamentResult(params, gameId) {
  if (!params.tournamentMatchId || !params.tournamentMatchType) return;
  if (params.status !== "finished") return;
  await linkTournamentMatchGame(
    params.tournamentMatchId,
    params.tournamentMatchType,
    gameId
  );
  const winnerId = findFinishedGameWinner(params);
  if (winnerId) {
    await handleTournamentMatchWin2(params.tournamentMatchId, winnerId);
  }
}
async function importLocalGame(params) {
  const db = getSupabaseAdmin();
  const { data: existing } = await db.from("games").select("id, status").eq("client_game_id", params.localId).maybeSingle();
  if (existing) {
    if (params.status === "finished") {
      if (existing.status !== "finished") {
        await db.from("games").update({
          status: "finished",
          finished_at: (/* @__PURE__ */ new Date()).toISOString(),
          current_player_index: params.currentPlayerIndex,
          current_leg: params.currentLeg,
          current_round: params.currentRound
        }).eq("id", existing.id);
      }
      await applyFinishedTournamentResult(params, existing.id);
    }
    return getGame(existing.id);
  }
  const settings = {
    ...defaultSettings(params.mode),
    ...params.settings
  };
  const finishedAt = params.status === "finished" || params.status === "cancelled" ? (/* @__PURE__ */ new Date()).toISOString() : null;
  const { data: game, error: gameErr } = await db.from("games").insert({
    channel_id: params.channelId,
    mode: params.mode,
    settings,
    created_by: params.createdBy,
    tournament_match_id: params.tournamentMatchId,
    client_game_id: params.localId,
    status: params.status,
    current_player_index: params.currentPlayerIndex,
    current_leg: params.currentLeg,
    current_round: params.currentRound,
    finished_at: finishedAt
  }).select().single();
  if (gameErr) throw gameErr;
  const playerRows = params.players.map((p) => ({
    game_id: game.id,
    user_id: p.userId,
    order_index: p.orderIndex,
    remaining_score: p.remainingScore,
    legs_won: p.legsWon,
    visit_score: p.visitScore,
    darts_thrown: p.dartsThrown,
    score_at_visit_start: p.scoreAtVisitStart,
    awaiting_visit_end: p.awaitingVisitEnd
  }));
  const { data: insertedPlayers, error: pErr } = await db.from("game_players").insert(playerRows).select();
  if (pErr) throw pErr;
  const playerIdByOrder = new Map(
    (insertedPlayers ?? []).map((p) => [p.order_index, p.id])
  );
  if (params.throws.length > 0) {
    const throwRows = params.throws.map((t) => {
      const gamePlayerId = playerIdByOrder.get(t.orderIndex);
      if (!gamePlayerId) {
        throw new Error("PLAYER_NOT_FOUND_FOR_THROW");
      }
      return {
        game_id: game.id,
        game_player_id: gamePlayerId,
        visit_index: t.visitIndex,
        dart_index: t.dartIndex,
        segment: t.segment,
        multiplier: t.multiplier,
        points: t.points
      };
    });
    const { error: tErr } = await db.from("throws").insert(throwRows);
    if (tErr) throw tErr;
  }
  if (params.status !== "cancelled" && params.tournamentMatchId && params.tournamentMatchType) {
    await linkTournamentMatchGame(
      params.tournamentMatchId,
      params.tournamentMatchType,
      game.id
    );
  }
  if (params.status === "finished" && params.tournamentMatchId) {
    const winnerId = findFinishedGameWinner(params);
    if (winnerId) {
      await handleTournamentMatchWin2(params.tournamentMatchId, winnerId);
    }
  }
  return getGame(game.id);
}

// app/api/games/sync/route.ts
async function POST3(req) {
  const auth = authenticateRequest(req);
  if (!auth.ok) return jsonError(auth.error, auth.status);
  const body = await req.json();
  const {
    localId,
    channelId,
    mode,
    settings,
    playerIds,
    tournamentMatchId,
    tournamentMatchType,
    status,
    currentPlayerIndex,
    currentLeg,
    currentRound,
    players,
    throws
  } = body;
  if (!localId || !channelId || !mode || !Array.isArray(playerIds) || playerIds.length < 1 || !Array.isArray(players) || !Array.isArray(throws)) {
    return jsonError("Invalid payload", 400);
  }
  const result = await importLocalGame({
    localId,
    channelId,
    mode: mode === "301" ? "301" : "501",
    settings,
    playerIds,
    createdBy: auth.ctx.user.id,
    tournamentMatchId: tournamentMatchId ?? null,
    tournamentMatchType: tournamentMatchType ?? null,
    status: status === "finished" || status === "cancelled" ? status : "finished",
    currentPlayerIndex: Number(currentPlayerIndex) || 0,
    currentLeg: Number(currentLeg) || 1,
    currentRound: Number(currentRound) || 1,
    players,
    throws
  });
  return Response.json({
    gameId: result.game.id,
    game: result
  });
}

// app/api/games/[gameId]/route.ts
async function GET(req, { params }) {
  const auth = authenticateRequest(req);
  if (!auth.ok) return jsonError(auth.error, auth.status);
  const { gameId } = await params;
  const result = await getGame(gameId);
  return Response.json(result);
}

// app/api/games/[gameId]/throw/route.ts
async function POST4(req, { params }) {
  const auth = authenticateRequest(req);
  if (!auth.ok) return jsonError(auth.error, auth.status);
  const { gameId } = await params;
  const body = await req.json();
  const input = body.throw;
  if (!input?.segment) return jsonError("Invalid throw", 400);
  const result = await recordThrow(gameId, input);
  return Response.json(result);
}

// app/api/games/[gameId]/undo/route.ts
async function POST5(req, { params }) {
  const auth = authenticateRequest(req);
  if (!auth.ok) return jsonError(auth.error, auth.status);
  const { gameId } = await params;
  const result = await undoLastThrow(gameId);
  return Response.json(result);
}

// app/api/games/[gameId]/end-visit/route.ts
async function POST6(req, { params }) {
  const auth = authenticateRequest(req);
  if (!auth.ok) return jsonError(auth.error, auth.status);
  const { gameId } = await params;
  const result = await endVisit(gameId);
  return Response.json(result);
}

// app/api/games/[gameId]/restart/route.ts
async function POST7(req, { params }) {
  const auth = authenticateRequest(req);
  if (!auth.ok) return jsonError(auth.error, auth.status);
  const { gameId } = await params;
  const result = await restartGame(gameId);
  return Response.json(result);
}

// app/api/games/[gameId]/leave/route.ts
async function POST8(req, { params }) {
  const auth = authenticateRequest(req);
  if (!auth.ok) return jsonError(auth.error, auth.status);
  const { gameId } = await params;
  const result = await cancelGame(gameId);
  return Response.json(result);
}

// lib/stats/game-winners.ts
function getFinishedGameWinnerIds(players, isFinished) {
  if (!isFinished || players.length === 0) return /* @__PURE__ */ new Set();
  const maxLegs = Math.max(...players.map((p) => p.legs_won));
  if (maxLegs <= 0) return /* @__PURE__ */ new Set();
  return new Set(
    players.filter((p) => p.legs_won === maxLegs).map((p) => p.user_id)
  );
}

// lib/stats/player-stats.ts
function gameSettings(mode, raw) {
  return {
    ...defaultSettings(mode),
    ...typeof raw === "object" && raw !== null ? raw : {}
  };
}
function getGameWinnerIds(game) {
  const settings = gameSettings(game.mode, game.settings);
  const players = game.game_players;
  if (players.length === 0) return /* @__PURE__ */ new Set();
  const maxLegs = Math.max(...players.map((p) => p.legs_won));
  if (maxLegs < settings.legsToWin) return /* @__PURE__ */ new Set();
  return getFinishedGameWinnerIds(players, true);
}
function computePlayerStats(userId, games) {
  let gamesPlayed = 0;
  let legsWon = 0;
  let totalPpr = 0;
  let pprCount = 0;
  let wins = 0;
  const winRounds = [];
  for (const game of games) {
    const player = game.game_players.find((p) => p.user_id === userId);
    if (!player) continue;
    gamesPlayed++;
    legsWon += player.legs_won;
    const settings = gameSettings(game.mode, game.settings);
    const ppr = calculatePpr(
      settings.startingScore,
      player.remaining_score,
      player.darts_thrown
    );
    if (player.darts_thrown > 0) {
      totalPpr += ppr;
      pprCount++;
    }
    const winners = getGameWinnerIds(game);
    if (winners.has(userId)) {
      wins++;
      winRounds.push(game.current_round);
    }
  }
  const avgWinRound = winRounds.length > 0 ? Math.round(
    winRounds.reduce((sum, r) => sum + r, 0) / winRounds.length * 10
  ) / 10 : null;
  return {
    gamesPlayed,
    legsWon,
    avgPpr: pprCount ? Math.round(totalPpr / pprCount * 10) / 10 : 0,
    wins,
    avgWinRound
  };
}

// lib/db/stats.ts
async function getMultiplayerGameIdSet(gameIds) {
  if (gameIds.length === 0) return /* @__PURE__ */ new Set();
  const db = getSupabaseAdmin();
  const { data, error } = await db.from("game_players").select("game_id").in("game_id", gameIds);
  if (error) throw error;
  return gameIdsWithMinPlayers(data ?? []);
}
function gameIdFromRow(row) {
  const raw = row.games;
  const g = Array.isArray(raw) ? raw[0] : raw;
  return g.id;
}
async function getChannelFinishedGamesForStats(channelId) {
  const db = getSupabaseAdmin();
  const { data, error } = await db.from("games").select(
    `
      id, mode, settings, current_round,
      game_players (user_id, legs_won, remaining_score, darts_thrown)
    `
  ).eq("channel_id", channelId).eq("status", "finished");
  if (error) throw error;
  return (data ?? []).filter(
    (g) => isMultiplayerGame(g.game_players)
  );
}
async function getPlayerStats(channelId, userId) {
  const games = await getChannelFinishedGamesForStats(channelId);
  return computePlayerStats(userId, games);
}
async function getChannelLeaderboard(channelId) {
  const db = getSupabaseAdmin();
  const { data: members, error: membersErr } = await db.from("channel_members").select("user_id, users(first_name, username, photo_url)").eq("channel_id", channelId);
  if (membersErr) throw membersErr;
  const leaderboard = [];
  for (const m of members ?? []) {
    const stats = await getPlayerStats(channelId, m.user_id);
    const u = m.users;
    leaderboard.push({
      userId: m.user_id,
      name: u?.first_name ?? u?.username ?? String(m.user_id),
      photoUrl: resolveStoredPhotoUrl(m.user_id, u?.photo_url),
      ...stats
    });
  }
  return leaderboard.sort((a, b) => b.wins - a.wins || b.avgPpr - a.avgPpr);
}
async function getPlayerGameHistory(channelId, userId, limit = 100) {
  const db = getSupabaseAdmin();
  const { data, error } = await db.from("game_players").select(
    `
      legs_won, remaining_score, darts_thrown,
      games!inner (id, mode, status, created_at, finished_at, channel_id)
    `
  ).eq("user_id", userId).eq("games.channel_id", channelId).eq("games.status", "finished").order("created_at", { ascending: false, foreignTable: "games" }).limit(limit);
  if (error) throw error;
  const rows = data ?? [];
  const gameIds = [...new Set(rows.map(gameIdFromRow))];
  const multiplayerIds = await getMultiplayerGameIdSet(gameIds);
  return rows.filter((row) => multiplayerIds.has(gameIdFromRow(row)));
}
function gameMetaFromPlayerRow(row) {
  const gRaw = row.games;
  const g = Array.isArray(gRaw) ? gRaw[0] : gRaw;
  return {
    finishedAt: g?.finished_at ?? null,
    createdAt: g?.created_at ?? ""
  };
}
async function getEligiblePlayerRows(channelId, userId, gameId) {
  const db = getSupabaseAdmin();
  let query = db.from("game_players").select(
    `
      id, game_id,
      games!inner (id, channel_id, status, finished_at, created_at)
    `
  ).eq("user_id", userId).eq("games.channel_id", channelId).eq("games.status", "finished");
  if (gameId) {
    query = query.eq("games.id", gameId);
  }
  const { data, error } = await query;
  if (error) throw error;
  const rows = data ?? [];
  const gameIds = [...new Set(rows.map((r) => r.game_id))];
  const multiplayerIds = await getMultiplayerGameIdSet(gameIds);
  return rows.filter((r) => multiplayerIds.has(r.game_id));
}
async function getPlayerThrowsByGame(channelId, userId) {
  const eligible = await getEligiblePlayerRows(channelId, userId);
  if (eligible.length === 0) return [];
  const gamePlayerIds = eligible.map((r) => r.id);
  const gameMeta = new Map(
    eligible.map((r) => [r.game_id, gameMetaFromPlayerRow(r)])
  );
  const db = getSupabaseAdmin();
  const { data: throwRows, error: throwErr } = await db.from("throws").select(
    "segment, multiplier, visit_index, dart_index, game_id, game_player_id"
  ).in("game_player_id", gamePlayerIds).order("visit_index").order("dart_index");
  if (throwErr) throw throwErr;
  const grouped = /* @__PURE__ */ new Map();
  for (const t of throwRows ?? []) {
    const list = grouped.get(t.game_id) ?? [];
    list.push(segmentFromDb(t.segment, t.multiplier));
    grouped.set(t.game_id, list);
  }
  return [...grouped.entries()].map(([gameId, throws]) => {
    const meta = gameMeta.get(gameId);
    return {
      gameId,
      finishedAt: meta.finishedAt,
      createdAt: meta.createdAt,
      throws
    };
  }).sort((a, b) => {
    const aTime = a.finishedAt ?? a.createdAt;
    const bTime = b.finishedAt ?? b.createdAt;
    return bTime.localeCompare(aTime);
  });
}

// app/api/stats/player/route.ts
async function GET2(req) {
  try {
    const auth = authenticateRequest(req);
    if (!auth.ok) return jsonError(auth.error, auth.status);
    const url = new URL(req.url);
    const channelId = url.searchParams.get("channelId");
    const userId = Number(url.searchParams.get("userId") ?? auth.ctx.user.id);
    if (!channelId) return jsonError("channelId required", 400);
    if (!Number.isFinite(userId)) return jsonError("Invalid userId", 400);
    const db = getSupabaseAdmin();
    const { data: member, error: memberErr } = await db.from("channel_members").select("user_id").eq("channel_id", channelId).eq("user_id", auth.ctx.user.id).maybeSingle();
    if (memberErr) throw memberErr;
    if (!member) return jsonError("Not a channel member", 403);
    const stats = await getPlayerStats(channelId, userId);
    const history = await getPlayerGameHistory(channelId, userId);
    const throwsByGameList = await getPlayerThrowsByGame(channelId, userId);
    const throwsByGame = Object.fromEntries(
      throwsByGameList.map((g) => [g.gameId, g.throws])
    );
    const allThrows = throwsByGameList.flatMap((g) => g.throws);
    const { data: userRow, error: userErr } = await db.from("users").select("first_name, username, photo_url").eq("telegram_id", userId).maybeSingle();
    if (userErr) throw userErr;
    if (!isCustomClubPhoto(userRow?.photo_url)) {
      void syncUserProfilePhoto(
        {
          id: userId,
          photo_url: userRow?.photo_url ?? void 0
        },
        userRow?.photo_url ?? null
      ).catch((e) => console.warn("[stats/player] sync photo", e));
    }
    const profile = {
      name: userRow?.first_name ?? userRow?.username ?? `\u0418\u0433\u0440\u043E\u043A #${userId}`,
      photoUrl: resolveStoredPhotoUrl(userId, userRow?.photo_url)
    };
    return Response.json({
      stats,
      history,
      userId,
      profile,
      allThrows,
      throwsByGame
    });
  } catch (e) {
    console.error("[stats/player]", e);
    const message = e instanceof Error ? e.message : "\u041E\u0448\u0438\u0431\u043A\u0430 \u0437\u0430\u0433\u0440\u0443\u0437\u043A\u0438 \u0441\u0442\u0430\u0442\u0438\u0441\u0442\u0438\u043A\u0438";
    return jsonError(message, 500);
  }
}

// app/api/stats/leaderboard/route.ts
async function GET3(req) {
  try {
    const auth = authenticateRequest(req);
    if (!auth.ok) return jsonError(auth.error, auth.status);
    const url = new URL(req.url);
    const channelId = url.searchParams.get("channelId");
    if (!channelId) return jsonError("channelId required", 400);
    const db = getSupabaseAdmin();
    const { data: member, error: memberErr } = await db.from("channel_members").select("user_id").eq("channel_id", channelId).eq("user_id", auth.ctx.user.id).maybeSingle();
    if (memberErr) throw memberErr;
    if (!member) return jsonError("Not a channel member", 403);
    const leaderboard = await getChannelLeaderboard(channelId);
    return Response.json({ leaderboard });
  } catch (e) {
    console.error("[stats/leaderboard]", e);
    const message = e instanceof Error ? e.message : "\u041E\u0448\u0438\u0431\u043A\u0430 \u0437\u0430\u0433\u0440\u0443\u0437\u043A\u0438 \u0443\u0447\u0430\u0441\u0442\u043D\u0438\u043A\u043E\u0432";
    return jsonError(message, 500);
  }
}

// lib/tournament/name.ts
var MONTHS_NOMINATIVE_RU = [
  "\u044F\u043D\u0432\u0430\u0440\u044C",
  "\u0444\u0435\u0432\u0440\u0430\u043B\u044C",
  "\u043C\u0430\u0440\u0442",
  "\u0430\u043F\u0440\u0435\u043B\u044C",
  "\u043C\u0430\u0439",
  "\u0438\u044E\u043D\u044C",
  "\u0438\u044E\u043B\u044C",
  "\u0430\u0432\u0433\u0443\u0441\u0442",
  "\u0441\u0435\u043D\u0442\u044F\u0431\u0440\u044C",
  "\u043E\u043A\u0442\u044F\u0431\u0440\u044C",
  "\u043D\u043E\u044F\u0431\u0440\u044C",
  "\u0434\u0435\u043A\u0430\u0431\u0440\u044C"
];
function capitalizeMonth(month) {
  return month.charAt(0).toUpperCase() + month.slice(1);
}
function generateTournamentName(date = /* @__PURE__ */ new Date()) {
  const month = capitalizeMonth(MONTHS_NOMINATIVE_RU[date.getMonth()]);
  const year = date.getFullYear();
  return `\u0422\u0443\u0440\u043D\u0438\u0440 \u2022 ${month} ${year}`;
}

// lib/tournament/settings.ts
var FINAL_MATCH_LEGS_TO_WIN = 2;
function parseTournamentSettings(raw) {
  const legsToWin = raw && typeof raw === "object" && "legsToWin" in raw && raw.legsToWin === 2 ? 2 : 1;
  return { legsToWin };
}
function gameSettingsForTournament(mode, tournamentSettings, options) {
  const base = defaultSettings(mode);
  const legsToWin = options?.final ? FINAL_MATCH_LEGS_TO_WIN : tournamentSettings.legsToWin;
  return {
    legsToWin,
    doubleOut: base.doubleOut,
    maxRounds: base.maxRounds
  };
}
function normalizeLegsToWin(value) {
  return value === 2 ? 2 : 1;
}

// lib/db/tournaments.ts
function normalizeTournamentParticipantIds(ids) {
  return [...new Set(ids)];
}
async function assertChannelTournamentParticipants(channelId, participantIds) {
  const db = getSupabaseAdmin();
  const { data, error } = await db.from("channel_members").select("user_id").eq("channel_id", channelId).in("user_id", participantIds);
  if (error) throw error;
  const registered = new Set((data ?? []).map((m) => m.user_id));
  const missing = participantIds.filter((id) => !registered.has(id));
  if (missing.length > 0) {
    throw new Error(
      `\u0418\u0433\u0440\u043E\u043A\u0438 \u043D\u0435 \u0432 \u0440\u0435\u0435\u0441\u0442\u0440\u0435 \u043A\u0430\u043D\u0430\u043B\u0430: ${missing.join(", ")}. \u041F\u0443\u0441\u0442\u044C \u043E\u0442\u043A\u0440\u043E\u044E\u0442 \u043C\u0438\u043D\u0438-\u0430\u043F\u043F \u0438\u0437 \u043A\u0430\u043D\u0430\u043B\u0430.`
    );
  }
}
async function createTournament(params) {
  const db = getSupabaseAdmin();
  const participantIds = normalizeTournamentParticipantIds(params.participantIds);
  if (participantIds.length < 3) {
    throw new Error("At least 3 participants required");
  }
  if (participantIds.length < params.playoffSize) {
    throw new Error(
      `At least ${params.playoffSize} participants required for top-${params.playoffSize} playoff`
    );
  }
  const name = params.name?.trim() || generateTournamentName();
  const mode = params.mode === "301" ? "301" : "501";
  const legsToWin = normalizeLegsToWin(params.legsToWin);
  const variant = normalizeTournamentVariant(params.variant);
  const settings = { legsToWin, variant };
  const baseRow = {
    channel_id: params.channelId,
    name,
    mode,
    playoff_size: params.playoffSize,
    settings,
    status: "round_robin",
    created_by: params.createdBy
  };
  let { data: tournament, error } = await db.from("tournaments").insert({ ...baseRow, variant }).select().single();
  if (error && isMissingVariantColumnError(error)) {
    ({ data: tournament, error } = await db.from("tournaments").insert(baseRow).select().single());
  }
  if (error) throw error;
  if (!tournament) throw new Error("Tournament insert failed");
  try {
    const participants = participantIds.map((userId) => ({
      tournament_id: tournament.id,
      user_id: userId
    }));
    const { error: participantsError } = await db.from("tournament_participants").insert(participants);
    if (participantsError) throw participantsError;
  } catch (e) {
    await db.from("tournaments").delete().eq("id", tournament.id);
    throw e;
  }
  return getTournament(tournament.id);
}
async function drawRoundRobin(tournamentId) {
  const db = getSupabaseAdmin();
  const { tournament, participants, roundRobinMatches } = await getTournament(tournamentId);
  if (tournament.status !== "round_robin") {
    throw new Error("Tournament is not in round robin stage");
  }
  if (roundRobinMatches.length > 0) {
    throw new Error("Round robin draw already completed");
  }
  const participantIds = participants.map((p) => p.user_id);
  if (participantIds.length < 3) {
    throw new Error("At least 3 participants required");
  }
  const pairings = shuffleInPlace(
    generateRoundRobinPairings(participantIds)
  );
  const matches = pairings.map(([p1, p2]) => ({
    tournament_id: tournamentId,
    player1_id: p1,
    player2_id: p2
  }));
  const { data: inserted, error } = await db.from("round_robin_matches").insert(matches).select();
  if (error) throw error;
  return {
    tournament,
    roundRobinMatches: inserted ?? []
  };
}
async function getTournament(tournamentId) {
  const db = getSupabaseAdmin();
  const { data: tournament, error: tournamentError } = await db.from("tournaments").select("*").eq("id", tournamentId).single();
  if (tournamentError || !tournament) {
    throw new Error("Tournament not found");
  }
  const tournamentWithVariant = {
    ...tournament,
    variant: variantFromTournamentRow(tournament)
  };
  const { data: participants } = await db.from("tournament_participants").select("*, users(first_name, username, photo_url)").eq("tournament_id", tournamentId);
  const { data: rrMatches } = await db.from("round_robin_matches").select("*").eq("tournament_id", tournamentId).order("id");
  const { data: playoffMatches } = await db.from("playoff_matches").select("*").eq("tournament_id", tournamentId).order("round").order("slot");
  const standings = buildStandings(participants ?? [], rrMatches ?? []);
  return {
    tournament: tournamentWithVariant,
    participants: participants ?? [],
    roundRobinMatches: rrMatches ?? [],
    playoffMatches: playoffMatches ?? [],
    standings
  };
}
function buildStandings(participants, matches) {
  const map = /* @__PURE__ */ new Map();
  for (const p of participants) {
    map.set(p.user_id, {
      userId: p.user_id,
      points: p.rr_points,
      legsDiff: p.rr_legs_diff,
      name: p.users?.first_name ?? p.users?.username ?? String(p.user_id)
    });
  }
  for (const m of matches) {
    if (!m.played || m.points_p1 == null) continue;
    const s1 = map.get(m.player1_id);
    const s2 = map.get(m.player2_id);
    if (s1) s1.points += m.points_p1;
    if (s2 && m.points_p2 != null) s2.points += m.points_p2;
  }
  return sortStandings([...map.values()]);
}
async function startPlayoff(tournamentId) {
  const db = getSupabaseAdmin();
  const { tournament, standings } = await getTournament(tournamentId);
  const qualified = standings.slice(0, tournament.playoff_size).map((s) => s.userId);
  const seeds = generatePlayoffBracket(qualified, tournament.playoff_size);
  await db.from("playoff_matches").insert(
    seeds.map((s) => ({
      tournament_id: tournamentId,
      round: s.round,
      slot: s.slot,
      player1_id: s.player1Id,
      player2_id: s.player2Id
    }))
  );
  await db.from("tournaments").update({ status: "playoff" }).eq("id", tournamentId);
  return getTournament(tournamentId);
}
async function createMatchGame(tournamentId, matchId, matchType, channelId, createdBy) {
  const db = getSupabaseAdmin();
  const table = matchType === "rr" ? "round_robin_matches" : "playoff_matches";
  const { data: match } = await db.from(table).select("*").eq("id", matchId).single();
  if (!match) throw new Error("MATCH_NOT_FOUND");
  const { tournament } = await getTournament(tournamentId);
  const playerIds = matchType === "rr" ? [match.player1_id, match.player2_id] : [match.player1_id, match.player2_id].filter(Boolean);
  if (playerIds.length < 2) throw new Error("PLAYERS_NOT_READY");
  const tournamentSettings = parseTournamentSettings(tournament.settings);
  const playoffSize = tournament.playoff_size === 8 ? 8 : 4;
  const isFinalMatch = matchType === "playoff" && match.round === getPlayoffRoundCount(playoffSize);
  const { game } = await createGame({
    channelId,
    mode: tournament.mode,
    playerIds,
    createdBy,
    settings: gameSettingsForTournament(tournament.mode, tournamentSettings, {
      final: isFinalMatch
    }),
    tournamentMatchId: matchId
  });
  await db.from(table).update({ game_id: game.id }).eq("id", matchId);
  return game;
}
async function listChannelTournaments(channelId) {
  const db = getSupabaseAdmin();
  const { data } = await db.from("tournaments").select("*").eq("channel_id", channelId).order("created_at", { ascending: false });
  return data ?? [];
}
async function listCreatorActiveTournaments(channelId, createdBy) {
  const db = getSupabaseAdmin();
  const { data } = await db.from("tournaments").select("id, name, status, settings, created_at, created_by").eq("channel_id", channelId).eq("created_by", createdBy).in("status", ["round_robin", "playoff"]).order("created_at", { ascending: false });
  return data ?? [];
}
async function listChannelActiveTournaments(channelId) {
  const db = getSupabaseAdmin();
  const { data } = await db.from("tournaments").select("id, name, status, settings, created_at").eq("channel_id", channelId).in("status", ["round_robin", "playoff"]).order("created_at", { ascending: false });
  return data ?? [];
}
async function listChannelFinishedTournaments(channelId) {
  const db = getSupabaseAdmin();
  const { data } = await db.from("tournaments").select("id, name, status, settings, created_at").eq("channel_id", channelId).eq("status", "finished").order("created_at", { ascending: false });
  return data ?? [];
}
async function finishTournament(tournamentId) {
  const { tournament, playoffMatches } = await getTournament(tournamentId);
  if (tournament.status === "finished") {
    return;
  }
  if (tournament.status !== "playoff") {
    throw new Error("\u0417\u0430\u0432\u0435\u0440\u0448\u0438\u0442\u044C \u043C\u043E\u0436\u043D\u043E \u0442\u043E\u043B\u044C\u043A\u043E \u0442\u0443\u0440\u043D\u0438\u0440 \u043D\u0430 \u0441\u0442\u0430\u0434\u0438\u0438 \u043F\u043B\u0435\u0439-\u043E\u0444\u0444");
  }
  if (playoffMatches.length === 0) {
    throw new Error("\u041F\u043B\u0435\u0439-\u043E\u0444\u0444 \u0435\u0449\u0451 \u043D\u0435 \u043D\u0430\u0447\u0430\u0442");
  }
  const maxRound = Math.max(...playoffMatches.map((m) => m.round));
  const finals = playoffMatches.filter((m) => m.round === maxRound);
  if (finals.length === 0 || !finals.every((m) => m.winner_id != null)) {
    throw new Error("\u0421\u043D\u0430\u0447\u0430\u043B\u0430 \u043D\u0443\u0436\u043D\u043E \u043E\u043F\u0440\u0435\u0434\u0435\u043B\u0438\u0442\u044C \u043F\u043E\u0431\u0435\u0434\u0438\u0442\u0435\u043B\u044F \u0432 \u0444\u0438\u043D\u0430\u043B\u0435");
  }
  const db = getSupabaseAdmin();
  const { error } = await db.from("tournaments").update({ status: "finished" }).eq("id", tournamentId);
  if (error) throw error;
}
async function deleteTournament(tournamentId) {
  const db = getSupabaseAdmin();
  const { data: rr } = await db.from("round_robin_matches").select("game_id").eq("tournament_id", tournamentId);
  const { data: po } = await db.from("playoff_matches").select("game_id").eq("tournament_id", tournamentId);
  const gameIds = [...rr ?? [], ...po ?? []].map((m) => m.game_id).filter((id) => Boolean(id));
  if (gameIds.length > 0) {
    await db.from("throws").delete().in("game_id", gameIds);
    await db.from("game_players").delete().in("game_id", gameIds);
    await db.from("games").delete().in("id", gameIds);
  }
  const { error } = await db.from("tournaments").delete().eq("id", tournamentId);
  if (error) throw error;
}

// app/api/tournaments/route.ts
async function GET4(req) {
  const auth = authenticateRequest(req);
  if (!auth.ok) return jsonError(auth.error, auth.status);
  const url = new URL(req.url);
  const channelId = url.searchParams.get("channelId");
  if (!channelId) return jsonError("channelId required", 400);
  const createdByParam = url.searchParams.get("createdBy");
  if (createdByParam) {
    const createdBy = Number(createdByParam);
    if (!Number.isFinite(createdBy)) {
      return jsonError("Invalid createdBy", 400);
    }
    const rows = await listCreatorActiveTournaments(channelId, createdBy);
    const tournaments2 = rows.map((t) => ({
      id: t.id,
      name: t.name,
      status: t.status,
      variant: variantFromTournamentRow(t),
      created_at: t.created_at
    }));
    return Response.json({ tournaments: tournaments2 });
  }
  const tournaments = await listChannelTournaments(channelId);
  return Response.json({ tournaments });
}
async function POST9(req) {
  const auth = authenticateRequest(req);
  if (!auth.ok) return jsonError(auth.error, auth.status);
  try {
    const body = await req.json();
    const { channelId, name, participantIds, playoffSize, legsToWin, variant } = body;
    const tournamentVariant = normalizeTournamentVariant(variant);
    if (!channelId || !Array.isArray(participantIds) || participantIds.length < 1) {
      return jsonError("Invalid payload", 400);
    }
    const ids = normalizeTournamentParticipantIds(
      participantIds.map((id) => Number(id)).filter((id) => Number.isFinite(id))
    );
    if (ids.length < 3) {
      return jsonError("At least 3 participants required", 400);
    }
    const playoff = playoffSize === 8 ? 8 : 4;
    if (ids.length < playoff) {
      return jsonError(
        `At least ${playoff} participants required for top-${playoff} playoff`,
        400
      );
    }
    await upsertUser(auth.ctx.user);
    await assertChannelTournamentParticipants(channelId, ids);
    if (tournamentVariant === "kenny") {
      const admin = await isChannelAdmin(channelId, auth.ctx.user.id);
      if (!admin) {
        return jsonError("\u0422\u0443\u0440\u043D\u0438\u0440 \u041A\u0435\u043D\u043D\u0438 \u043C\u043E\u0433\u0443\u0442 \u0441\u043E\u0437\u0434\u0430\u0432\u0430\u0442\u044C \u0442\u043E\u043B\u044C\u043A\u043E \u0430\u0434\u043C\u0438\u043D\u044B \u0433\u0440\u0443\u043F\u043F\u044B", 403);
      }
    }
    const tournament = await createTournament({
      channelId,
      name,
      variant: tournamentVariant,
      participantIds: ids,
      playoffSize: playoff,
      legsToWin: normalizeLegsToWin(legsToWin),
      createdBy: auth.ctx.user.id
    });
    return Response.json(tournament);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to create tournament";
    const status = message.includes("not found") ? 404 : 400;
    return jsonError(message, status);
  }
}

// lib/channel/manual-players.ts
function isManualPlayerId(userId) {
  return Number.isFinite(userId) && userId < 0;
}
function allocateManualPlayerId() {
  return -(Date.now() * 1e3 + Math.floor(Math.random() * 1e3));
}
var MAX_PHOTO_DATA_URL_CHARS = 18e4;
function assertPhotoUrl(photoUrl) {
  if (photoUrl == null || photoUrl === "") return null;
  if (photoUrl.startsWith("data:image/")) {
    if (photoUrl.length > MAX_PHOTO_DATA_URL_CHARS) {
      throw new Error("\u0424\u043E\u0442\u043E \u0441\u043B\u0438\u0448\u043A\u043E\u043C \u0431\u043E\u043B\u044C\u0448\u043E\u0435 \u2014 \u0432\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0434\u0440\u0443\u0433\u043E\u0435");
    }
    return photoUrl;
  }
  if (photoUrl.startsWith("https://") || photoUrl.startsWith("/api/telegram/avatar/")) {
    return photoUrl;
  }
  throw new Error("\u041D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u044B\u0439 URL \u0444\u043E\u0442\u043E");
}
async function assertChannelMembership(channelId, userId) {
  const db = getSupabaseAdmin();
  const { data } = await db.from("channel_members").select("user_id").eq("channel_id", channelId).eq("user_id", userId).maybeSingle();
  return Boolean(data);
}
async function createManualChannelPlayer(channelId, name, photoUrl) {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("\u0412\u0432\u0435\u0434\u0438\u0442\u0435 \u0438\u043C\u044F");
  if (trimmed.length > 40) throw new Error("\u0418\u043C\u044F \u0441\u043B\u0438\u0448\u043A\u043E\u043C \u0434\u043B\u0438\u043D\u043D\u043E\u0435");
  const storedPhoto = photoUrl === void 0 ? null : assertPhotoUrl(photoUrl ?? null);
  const db = getSupabaseAdmin();
  const telegramId = allocateManualPlayerId();
  const { error: userError } = await db.from("users").insert({
    telegram_id: telegramId,
    username: null,
    first_name: trimmed,
    last_name: null,
    photo_url: storedPhoto
  });
  if (userError) throw userError;
  const { error: memberError } = await db.from("channel_members").insert({
    channel_id: channelId,
    user_id: telegramId,
    role: "member",
    last_verified_at: (/* @__PURE__ */ new Date()).toISOString()
  });
  if (memberError) {
    await db.from("users").delete().eq("telegram_id", telegramId);
    throw memberError;
  }
  return {
    user_id: telegramId,
    users: {
      first_name: trimmed,
      username: null,
      photo_url: storedPhoto
    }
  };
}
async function updateChannelPlayer(channelId, userId, patch) {
  const inChannel = await assertChannelMembership(channelId, userId);
  if (!inChannel) throw new Error("\u0418\u0433\u0440\u043E\u043A \u043D\u0435 \u0432 \u044D\u0442\u043E\u043C \u043A\u0430\u043D\u0430\u043B\u0435");
  const db = getSupabaseAdmin();
  const updates = {};
  if (patch.name !== void 0) {
    const trimmed = patch.name.trim();
    if (!trimmed) throw new Error("\u0412\u0432\u0435\u0434\u0438\u0442\u0435 \u0438\u043C\u044F");
    if (trimmed.length > 40) throw new Error("\u0418\u043C\u044F \u0441\u043B\u0438\u0448\u043A\u043E\u043C \u0434\u043B\u0438\u043D\u043D\u043E\u0435");
    updates.first_name = trimmed;
    updates.username = null;
  }
  if (patch.photo_url !== void 0) {
    updates.photo_url = assertPhotoUrl(patch.photo_url);
  }
  if (Object.keys(updates).length === 0) {
    throw new Error("\u041D\u0435\u0447\u0435\u0433\u043E \u043E\u0431\u043D\u043E\u0432\u043B\u044F\u0442\u044C");
  }
  const { data, error } = await db.from("users").update(updates).eq("telegram_id", userId).select("telegram_id, first_name, username, photo_url").single();
  if (error) throw error;
  return {
    user_id: data.telegram_id,
    users: {
      first_name: data.first_name,
      username: data.username ?? null,
      photo_url: data.photo_url ?? null
    }
  };
}
async function removeChannelPlayer(channelId, userId) {
  const inChannel = await assertChannelMembership(channelId, userId);
  if (!inChannel) throw new Error("\u0418\u0433\u0440\u043E\u043A \u043D\u0435 \u0432 \u044D\u0442\u043E\u043C \u043A\u0430\u043D\u0430\u043B\u0435");
  const db = getSupabaseAdmin();
  const { error } = await db.from("channel_members").delete().eq("channel_id", channelId).eq("user_id", userId);
  if (error) throw error;
  if (isManualPlayerId(userId)) {
    const { error: userError } = await db.from("users").delete().eq("telegram_id", userId);
    if (userError) {
      console.warn("[manual-players] keep user after remove", userId, userError);
    }
  }
}

// app/api/tournaments/[tournamentId]/route.ts
async function GET5(req, { params }) {
  const auth = authenticateRequest(req);
  if (!auth.ok) return jsonError(auth.error, auth.status);
  const { tournamentId } = await params;
  try {
    const data = await getTournament(tournamentId);
    const toSync = data.participants.flatMap((p) => {
      const u = Array.isArray(p.users) ? p.users[0] : p.users;
      if (!u) return [];
      const userId = p.user_id;
      if (isManualPlayerId(userId) || isCustomClubPhoto(u.photo_url)) {
        return [];
      }
      return [
        {
          id: userId,
          photo_url: u.photo_url ?? void 0,
          existingPhotoUrl: u.photo_url ?? null
        }
      ];
    });
    void syncUserProfilePhotos(toSync).catch(
      (e) => console.warn("[tournaments/get] sync photos", e)
    );
    const participants = data.participants.map((p) => {
      const u = Array.isArray(p.users) ? p.users[0] : p.users;
      if (!u) return p;
      return {
        ...p,
        users: {
          ...u,
          photo_url: resolveStoredPhotoUrl(
            p.user_id,
            u.photo_url
          )
        }
      };
    });
    return Response.json({ ...data, participants });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Tournament not found";
    return jsonError(message, 404);
  }
}
async function DELETE(req, { params }) {
  const auth = authenticateRequest(req);
  if (!auth.ok) return jsonError(auth.error, auth.status);
  const { tournamentId } = await params;
  await deleteTournament(tournamentId);
  return Response.json({ ok: true });
}

// app/api/tournaments/[tournamentId]/draw/route.ts
async function POST10(req, { params }) {
  const auth = authenticateRequest(req);
  if (!auth.ok) return jsonError(auth.error, auth.status);
  const { tournamentId } = await params;
  try {
    await drawRoundRobin(tournamentId);
    const data = await getTournament(tournamentId);
    return Response.json(data);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to run round robin draw";
    const status = message.includes("not found") ? 404 : message.includes("already") ? 409 : 400;
    return jsonError(message, status);
  }
}

// app/api/tournaments/[tournamentId]/match/route.ts
async function POST11(req, { params }) {
  const auth = authenticateRequest(req);
  if (!auth.ok) return jsonError(auth.error, auth.status);
  const { tournamentId } = await params;
  const body = await req.json();
  const { matchId, matchType, channelId } = body;
  if (!matchId || !channelId) return jsonError("Invalid payload", 400);
  const game = await createMatchGame(
    tournamentId,
    matchId,
    matchType === "playoff" ? "playoff" : "rr",
    channelId,
    auth.ctx.user.id
  );
  return Response.json({ game });
}

// app/api/tournaments/[tournamentId]/playoff/route.ts
async function POST12(req, { params }) {
  const auth = authenticateRequest(req);
  if (!auth.ok) return jsonError(auth.error, auth.status);
  const { tournamentId } = await params;
  const data = await startPlayoff(tournamentId);
  return Response.json(data);
}

// app/api/tournaments/[tournamentId]/finish/route.ts
async function POST13(req, { params }) {
  const auth = authenticateRequest(req);
  if (!auth.ok) return jsonError(auth.error, auth.status);
  const { tournamentId } = await params;
  try {
    const { tournament } = await getTournament(tournamentId);
    const db = getSupabaseAdmin();
    const { data: member, error: memberErr } = await db.from("channel_members").select("user_id").eq("channel_id", tournament.channel_id).eq("user_id", auth.ctx.user.id).maybeSingle();
    if (memberErr) throw memberErr;
    if (!member) return jsonError("Not a channel member", 403);
    await finishTournament(tournamentId);
    return Response.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0437\u0430\u0432\u0435\u0440\u0448\u0438\u0442\u044C \u0442\u0443\u0440\u043D\u0438\u0440";
    const status = message.includes("Not found") ? 404 : 400;
    return jsonError(message, status);
  }
}

// app/api/telegram/webhook/route.ts
import { webhookCallback } from "grammy";

// lib/telegram/handlers.ts
import { Bot as Bot2 } from "grammy";
function webAppBaseUrl() {
  return (process.env.WEBAPP_URL ?? "https://project-lxy5p.vercel.app").trim().replace(/\/$/, "");
}
function botUsername() {
  return (process.env.BOT_USERNAME ?? "darts_kenny_bot").trim().replace(/^@/, "");
}
function channelStartParam(chatId) {
  return `ch_${chatId}`;
}
function miniAppUrl(chatId) {
  const base = webAppBaseUrl();
  const param = encodeURIComponent(channelStartParam(chatId));
  return `${base}?tgWebAppStartParam=${param}`;
}
function miniAppDeepLink(chatId) {
  const param = encodeURIComponent(channelStartParam(chatId));
  return `https://t.me/${botUsername()}?startapp=${param}`;
}
var PLAY_BUTTON = "\u0418\u0433\u0440\u0430\u0442\u044C \u0432 \u0434\u0430\u0440\u0442\u0441";
function playKeyboard(chatId) {
  return {
    inline_keyboard: [
      [{ text: PLAY_BUTTON, web_app: { url: miniAppUrl(chatId) } }]
    ]
  };
}
var WELCOME_TEXT = "\u042F \u0431\u043E\u0442 \u0441 \u043F\u0440\u0438\u043B\u043E\u0436\u0435\u043D\u0438\u0435\u043C \u0434\u043B\u044F \u043F\u043E\u0434\u0441\u0447\u0451\u0442\u0430 \u043E\u0447\u043A\u043E\u0432 \u0432 \u0434\u0430\u0440\u0442\u0441. \u041B\u044E\u0431\u043E\u0439 \u0432 \u044D\u0442\u043E\u0439 \u0433\u0440\u0443\u043F\u043F\u0435 \u043C\u043E\u0436\u0435\u0442 \u0438\u0441\u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u044C \u0435\u0433\u043E \u0434\u043B\u044F \u0438\u0433\u0440\u044B. \u0423\u0447\u0430\u0441\u0442\u043D\u0438\u043A\u0438 \u0432\u044B\u0431\u0438\u0440\u0430\u044E\u0442\u0441\u044F \u0442\u043E\u043B\u044C\u043A\u043E \u0438\u0437 \u044D\u0442\u043E\u0439 \u0433\u0440\u0443\u043F\u043F\u044B. \u0415\u0449\u0451 \u044F \u0443\u043C\u0435\u044E \u0434\u0435\u043B\u0430\u0442\u044C \u0442\u0443\u0440\u043D\u0438\u0440\u044B \u0434\u043B\u044F \u0443\u0447\u0430\u0441\u0442\u043D\u0438\u043A\u043E\u0432 \u0433\u0440\u0443\u043F\u043F\u044B.\n\n\u041D\u0430\u0436\u043C\u0438\u0442\u0435 \xAB\u0418\u0433\u0440\u0430\u0442\u044C \u0432 \u0434\u0430\u0440\u0442\u0441\xBB, \u0447\u0442\u043E\u0431\u044B \u0441\u0447\u0438\u0442\u0430\u0442\u044C \u043E\u0447\u043A\u0438, \u0432\u0435\u0441\u0442\u0438 \u0442\u0443\u0440\u043D\u0438\u0440\u044B \u0438 \u0441\u0442\u0430\u0442\u0438\u0441\u0442\u0438\u043A\u0443 \u0434\u043B\u044F \u044D\u0442\u043E\u0439 \u0433\u0440\u0443\u043F\u043F\u044B.\n\u0421\u0442\u0430\u0442\u0438\u0441\u0442\u0438\u043A\u0430 \u0441\u043A\u0432\u043E\u0437\u043D\u0430\u044F \u2014 \u0432\u0441\u0435, \u043A\u0442\u043E \u0438\u0433\u0440\u0430\u0435\u0442 \u043F\u0440\u043E\u0441\u0442\u043E \u0438\u043B\u0438 \u0432 \u0442\u0443\u0440\u043D\u0438\u0440\u0435, \u043F\u043E\u043F\u0430\u0434\u0430\u044E\u0442 \u0432 \u0441\u0442\u0430\u0442\u0438\u0441\u0442\u0438\u043A\u0443.\n\n<b>\u0412\u043D\u0438\u043C\u0430\u043D\u0438\u0435!</b> \u041A\u0430\u0436\u0434\u044B\u0439 \u0436\u0435\u043B\u0430\u044E\u0449\u0438\u0439 \u0438\u0433\u0440\u0430\u0442\u044C \u0434\u043E\u043B\u0436\u0435\u043D \u043E\u0442\u043A\u0440\u044B\u0442\u044C \u043F\u0440\u0438\u043B\u043E\u0436\u0435\u043D\u0438\u0435 \u0445\u043E\u0442\u044F \u0431\u044B \u043E\u0434\u0438\u043D \u0440\u0430\u0437 \u0438\u0437 \u044D\u0442\u043E\u0439 \u0433\u0440\u0443\u043F\u043F\u044B.";
async function sendWelcome(ctx) {
  const chat = ctx.chat;
  if (!chat) return;
  try {
    await ctx.reply(WELCOME_TEXT, {
      parse_mode: "HTML",
      reply_markup: playKeyboard(chat.id)
    });
    return;
  } catch (e) {
    console.error("[telegram] welcome with web_app failed", e);
  }
  try {
    await ctx.reply(WELCOME_TEXT, {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [{ text: PLAY_BUTTON, url: miniAppDeepLink(chat.id) }]
        ]
      }
    });
    return;
  } catch (e) {
    console.error("[telegram] welcome with url button failed", e);
  }
  await ctx.reply(
    `${WELCOME_TEXT}

\u041E\u0442\u043A\u0440\u043E\u0439\u0442\u0435 \u0441\u0441\u044B\u043B\u043A\u0443:
${miniAppDeepLink(chat.id)}`,
    { parse_mode: "HTML" }
  );
}
function createBotWithHandlers() {
  const token = process.env.BOT_TOKEN?.trim();
  if (!token) {
    throw new Error("BOT_TOKEN is not configured");
  }
  const bot2 = new Bot2(token);
  bot2.command("start", async (ctx) => {
    try {
      await sendWelcome(ctx);
    } catch (e) {
      console.error("[telegram] /start failed", e);
    }
  });
  bot2.on("my_chat_member", async (ctx) => {
    const next = ctx.myChatMember.new_chat_member.status;
    if (next !== "member" && next !== "administrator") return;
    const prev = ctx.myChatMember.old_chat_member.status;
    if (prev === "member" || prev === "administrator") return;
    try {
      await sendWelcome(ctx);
    } catch (e) {
      console.error("[telegram] my_chat_member failed", e);
    }
  });
  bot2.catch((err) => {
    console.error("[telegram] bot error", err);
  });
  return bot2;
}

// app/api/telegram/webhook/route.ts
var handler = null;
function getHandler() {
  if (!handler) {
    handler = webhookCallback(createBotWithHandlers(), "std/http");
  }
  return handler;
}
async function POST14(req) {
  const token = process.env.BOT_TOKEN?.trim();
  if (!token) {
    return Response.json({ error: "BOT_TOKEN not configured" }, { status: 503 });
  }
  try {
    return await getHandler()(req);
  } catch (e) {
    console.error("[telegram/webhook]", e);
    return new Response("OK", { status: 200 });
  }
}

// app/api/telegram/avatar/[telegramId]/route.ts
async function GET6(_req, { params }) {
  const { telegramId: raw } = await params;
  const telegramId = Number(raw);
  if (!Number.isFinite(telegramId) || telegramId <= 0) {
    return new Response(null, { status: 404 });
  }
  const storedPhotoUrl = await getUserPhotoUrl(telegramId);
  const fileUrl = await resolveAvatarUpstreamUrl(telegramId, storedPhotoUrl);
  if (!fileUrl) {
    return new Response(null, { status: 404 });
  }
  const upstream = await fetch(fileUrl);
  if (!upstream.ok) {
    return new Response(null, { status: 404 });
  }
  const body = await upstream.arrayBuffer();
  return new Response(body, {
    headers: {
      "Content-Type": upstream.headers.get("content-type") ?? "image/jpeg",
      "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800"
    }
  });
}

// app/api/channels/[channelId]/current/route.ts
async function GET7(req, { params }) {
  try {
    const auth = authenticateRequest(req);
    if (!auth.ok) return jsonError(auth.error, auth.status);
    const { channelId } = await params;
    const db = getSupabaseAdmin();
    const { data: member, error: memberErr } = await db.from("channel_members").select("user_id").eq("channel_id", channelId).eq("user_id", auth.ctx.user.id).maybeSingle();
    if (memberErr) throw memberErr;
    if (!member) return jsonError("Not a channel member", 403);
    const [games, tournamentRows] = await Promise.all([
      listChannelActiveGames(channelId),
      listChannelActiveTournaments(channelId)
    ]);
    const tournaments = tournamentRows.map((t) => ({
      id: t.id,
      name: t.name,
      status: t.status,
      variant: variantFromTournamentRow(t),
      created_at: t.created_at
    }));
    return Response.json({ games, tournaments });
  } catch (e) {
    console.error("[channels/current]", e);
    const message = e instanceof Error ? e.message : "\u041E\u0448\u0438\u0431\u043A\u0430 \u0437\u0430\u0433\u0440\u0443\u0437\u043A\u0438 \u0442\u0435\u043A\u0443\u0449\u0438\u0445 \u0438\u0433\u0440";
    return jsonError(message, 500);
  }
}

// app/api/channels/[channelId]/games/route.ts
async function GET8(req, { params }) {
  try {
    const auth = authenticateRequest(req);
    if (!auth.ok) return jsonError(auth.error, auth.status);
    const { channelId } = await params;
    const db = getSupabaseAdmin();
    const { data: member, error: memberErr } = await db.from("channel_members").select("user_id").eq("channel_id", channelId).eq("user_id", auth.ctx.user.id).maybeSingle();
    if (memberErr) throw memberErr;
    if (!member) return jsonError("Not a channel member", 403);
    const games = await listChannelGames(channelId);
    return Response.json({ games });
  } catch (e) {
    console.error("[channels/games]", e);
    const message = e instanceof Error ? e.message : "\u041E\u0448\u0438\u0431\u043A\u0430 \u0437\u0430\u0433\u0440\u0443\u0437\u043A\u0438 \u0430\u0440\u0445\u0438\u0432\u0430 \u0438\u0433\u0440";
    return jsonError(message, 500);
  }
}

// app/api/channels/[channelId]/players/route.ts
async function GET9(req, { params }) {
  const auth = authenticateRequest(req);
  if (!auth.ok) return jsonError(auth.error, auth.status);
  const { channelId } = await params;
  const isMember = await assertChannelMembership(channelId, auth.ctx.user.id);
  if (!isMember && !isWebSession(auth.ctx.initData)) {
    return jsonError("Not a channel member", 403);
  }
  const members = await getChannelMembers(channelId);
  const membersWithPhotos = members.map((m) => {
    const u = Array.isArray(m.users) ? m.users[0] : m.users;
    if (!u) return m;
    return {
      ...m,
      users: {
        ...u,
        photo_url: resolveStoredPhotoUrl(m.user_id, u.photo_url)
      }
    };
  });
  return Response.json({ members: membersWithPhotos });
}
async function POST15(req, { params }) {
  const auth = authenticateRequest(req);
  if (!auth.ok) return jsonError(auth.error, auth.status);
  const { channelId } = await params;
  const isMember = await assertChannelMembership(channelId, auth.ctx.user.id);
  if (!isMember && !isWebSession(auth.ctx.initData)) {
    return jsonError("Not a channel member", 403);
  }
  const body = await req.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name : "";
  const photoUrl = body.photo_url === null || typeof body.photo_url === "string" ? body.photo_url : void 0;
  try {
    const player = await createManualChannelPlayer(channelId, name, photoUrl);
    return Response.json({ member: player }, { status: 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "\u041E\u0448\u0438\u0431\u043A\u0430";
    return jsonError(message, 400);
  }
}

// app/api/channels/[channelId]/players/[userId]/route.ts
async function requireMember(channelId, authUserId, initData) {
  const isMember = await assertChannelMembership(channelId, authUserId);
  if (!isMember && !isWebSession(initData)) {
    return false;
  }
  return true;
}
async function PATCH(req, { params }) {
  const auth = authenticateRequest(req);
  if (!auth.ok) return jsonError(auth.error, auth.status);
  const { channelId, userId: raw } = await params;
  const userId = Number(raw);
  if (!Number.isFinite(userId)) return jsonError("\u041D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u044B\u0439 \u0438\u0433\u0440\u043E\u043A", 400);
  if (!await requireMember(channelId, auth.ctx.user.id, auth.ctx.initData)) {
    return jsonError("Not a channel member", 403);
  }
  const body = await req.json().catch(() => ({}));
  const patch = {};
  if (typeof body.name === "string") patch.name = body.name;
  if ("photo_url" in body) {
    patch.photo_url = body.photo_url === null || typeof body.photo_url === "string" ? body.photo_url : void 0;
  }
  try {
    const member = await updateChannelPlayer(channelId, userId, patch);
    return Response.json({ member });
  } catch (e) {
    const message = e instanceof Error ? e.message : "\u041E\u0448\u0438\u0431\u043A\u0430";
    const status = message.includes("\u043D\u0435 \u0432 \u044D\u0442\u043E\u043C") ? 404 : 400;
    return jsonError(message, status);
  }
}
async function DELETE2(req, { params }) {
  const auth = authenticateRequest(req);
  if (!auth.ok) return jsonError(auth.error, auth.status);
  const { channelId, userId: raw } = await params;
  const userId = Number(raw);
  if (!Number.isFinite(userId)) return jsonError("\u041D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u044B\u0439 \u0438\u0433\u0440\u043E\u043A", 400);
  if (userId === auth.ctx.user.id) {
    return jsonError("\u041D\u0435\u043B\u044C\u0437\u044F \u0443\u0434\u0430\u043B\u0438\u0442\u044C \u0441\u0435\u0431\u044F \u0438\u0437 \u0441\u043F\u0438\u0441\u043A\u0430", 400);
  }
  if (!await requireMember(channelId, auth.ctx.user.id, auth.ctx.initData)) {
    return jsonError("Not a channel member", 403);
  }
  try {
    await removeChannelPlayer(channelId, userId);
    return Response.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "\u041E\u0448\u0438\u0431\u043A\u0430";
    const status = message.includes("\u043D\u0435 \u0432 \u044D\u0442\u043E\u043C") ? 404 : 400;
    return jsonError(message, status);
  }
}

// app/api/channels/[channelId]/tournaments/route.ts
async function GET10(req, { params }) {
  try {
    const auth = authenticateRequest(req);
    if (!auth.ok) return jsonError(auth.error, auth.status);
    const { channelId } = await params;
    const db = getSupabaseAdmin();
    const { data: member, error: memberErr } = await db.from("channel_members").select("user_id").eq("channel_id", channelId).eq("user_id", auth.ctx.user.id).maybeSingle();
    if (memberErr) throw memberErr;
    if (!member) return jsonError("Not a channel member", 403);
    const rows = await listChannelFinishedTournaments(channelId);
    const tournaments = rows.map((t) => ({
      id: t.id,
      name: t.name,
      status: t.status,
      variant: variantFromTournamentRow(t),
      created_at: t.created_at
    }));
    return Response.json({ tournaments });
  } catch (e) {
    console.error("[channels/tournaments]", e);
    const message = e instanceof Error ? e.message : "\u041E\u0448\u0438\u0431\u043A\u0430 \u0437\u0430\u0433\u0440\u0443\u0437\u043A\u0438 \u0430\u0440\u0445\u0438\u0432\u0430 \u0442\u0443\u0440\u043D\u0438\u0440\u043E\u0432";
    return jsonError(message, 500);
  }
}

// app/api/channels/[channelId]/members/route.ts
async function GET11(req, { params }) {
  const auth = authenticateRequest(req);
  if (!auth.ok) return jsonError(auth.error, auth.status);
  const { channelId } = await params;
  const db = getSupabaseAdmin();
  const { data: member } = await db.from("channel_members").select("user_id").eq("channel_id", channelId).eq("user_id", auth.ctx.user.id).maybeSingle();
  if (!member) return jsonError("Not a channel member", 403);
  const members = await getChannelMembers(channelId);
  if (!isWebSession(auth.ctx.initData)) {
    const toSync = members.flatMap((m) => {
      const u = Array.isArray(m.users) ? m.users[0] : m.users;
      if (!u) return [];
      const userId = m.user_id;
      if (isManualPlayerId(userId)) return [];
      if (isCustomClubPhoto(u.photo_url)) return [];
      return [
        {
          id: userId,
          photo_url: u.photo_url ?? void 0,
          existingPhotoUrl: u.photo_url ?? null
        }
      ];
    });
    void syncUserProfilePhotos(toSync).catch(
      (e) => console.warn("[channels/members] sync photos", e)
    );
  }
  const membersWithPhotos = members.map((m) => {
    const u = Array.isArray(m.users) ? m.users[0] : m.users;
    if (!u) return m;
    return {
      ...m,
      users: {
        ...u,
        photo_url: resolveStoredPhotoUrl(m.user_id, u.photo_url)
      }
    };
  });
  return Response.json({ members: membersWithPhotos });
}

// server/app.ts
function withParams(params) {
  return { params: Promise.resolve(params) };
}
async function call(handler2, req, params = {}) {
  if (!handler2) {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" }
    });
  }
  return handler2(req, withParams(params));
}
function createApp() {
  const app2 = new Hono();
  app2.use(
    "*",
    cors({
      origin: "*",
      allowHeaders: [
        "Content-Type",
        "x-telegram-init-data",
        "x-web-auth",
        "x-dev-auth"
      ],
      allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"]
    })
  );
  app2.get("/api/health", (c) => c.json({ ok: true }));
  app2.post("/api/auth/session", (c) => call(POST, c.req.raw));
  app2.post("/api/games", (c) => call(POST2, c.req.raw));
  app2.post("/api/games/sync", (c) => call(POST3, c.req.raw));
  app2.get(
    "/api/games/:gameId",
    (c) => call(GET, c.req.raw, { gameId: c.req.param("gameId") })
  );
  app2.post(
    "/api/games/:gameId/throw",
    (c) => call(POST4, c.req.raw, { gameId: c.req.param("gameId") })
  );
  app2.post(
    "/api/games/:gameId/undo",
    (c) => call(POST5, c.req.raw, { gameId: c.req.param("gameId") })
  );
  app2.post(
    "/api/games/:gameId/end-visit",
    (c) => call(POST6, c.req.raw, { gameId: c.req.param("gameId") })
  );
  app2.post(
    "/api/games/:gameId/restart",
    (c) => call(POST7, c.req.raw, { gameId: c.req.param("gameId") })
  );
  app2.post(
    "/api/games/:gameId/leave",
    (c) => call(POST8, c.req.raw, { gameId: c.req.param("gameId") })
  );
  app2.get("/api/stats/player", (c) => call(GET2, c.req.raw));
  app2.get(
    "/api/stats/leaderboard",
    (c) => call(GET3, c.req.raw)
  );
  app2.get("/api/tournaments", (c) => call(GET4, c.req.raw));
  app2.post("/api/tournaments", (c) => call(POST9, c.req.raw));
  app2.get(
    "/api/tournaments/:tournamentId",
    (c) => call(GET5, c.req.raw, {
      tournamentId: c.req.param("tournamentId")
    })
  );
  app2.delete(
    "/api/tournaments/:tournamentId",
    (c) => call(DELETE, c.req.raw, {
      tournamentId: c.req.param("tournamentId")
    })
  );
  app2.post(
    "/api/tournaments/:tournamentId/draw",
    (c) => call(POST10, c.req.raw, {
      tournamentId: c.req.param("tournamentId")
    })
  );
  app2.post(
    "/api/tournaments/:tournamentId/match",
    (c) => call(POST11, c.req.raw, {
      tournamentId: c.req.param("tournamentId")
    })
  );
  app2.post(
    "/api/tournaments/:tournamentId/playoff",
    (c) => call(POST12, c.req.raw, {
      tournamentId: c.req.param("tournamentId")
    })
  );
  app2.post(
    "/api/tournaments/:tournamentId/finish",
    (c) => call(POST13, c.req.raw, {
      tournamentId: c.req.param("tournamentId")
    })
  );
  app2.post(
    "/api/telegram/webhook",
    (c) => call(POST14, c.req.raw)
  );
  app2.get(
    "/api/telegram/avatar/:telegramId",
    (c) => call(GET6, c.req.raw, {
      telegramId: c.req.param("telegramId")
    })
  );
  app2.get(
    "/api/channels/:channelId/current",
    (c) => call(GET7, c.req.raw, {
      channelId: c.req.param("channelId")
    })
  );
  app2.get(
    "/api/channels/:channelId/games",
    (c) => call(GET8, c.req.raw, { channelId: c.req.param("channelId") })
  );
  app2.get(
    "/api/channels/:channelId/players",
    (c) => call(GET9, c.req.raw, {
      channelId: c.req.param("channelId")
    })
  );
  app2.post(
    "/api/channels/:channelId/players",
    (c) => call(POST15, c.req.raw, {
      channelId: c.req.param("channelId")
    })
  );
  app2.patch(
    "/api/channels/:channelId/players/:userId",
    (c) => call(PATCH, c.req.raw, {
      channelId: c.req.param("channelId"),
      userId: c.req.param("userId")
    })
  );
  app2.delete(
    "/api/channels/:channelId/players/:userId",
    (c) => call(DELETE2, c.req.raw, {
      channelId: c.req.param("channelId"),
      userId: c.req.param("userId")
    })
  );
  app2.get(
    "/api/channels/:channelId/tournaments",
    (c) => call(GET10, c.req.raw, {
      channelId: c.req.param("channelId")
    })
  );
  app2.get(
    "/api/channels/:channelId/members",
    (c) => call(GET11, c.req.raw, {
      channelId: c.req.param("channelId")
    })
  );
  app2.notFound((c) => {
    if (c.req.path.startsWith("/api/")) {
      return c.json({ error: "Not found" }, 404);
    }
    return c.text("Not found", 404);
  });
  return app2;
}

// server/vercel-entry.ts
var config = {
  runtime: "nodejs",
  maxDuration: 30
};
var app = createApp();
function restoreRequest(req) {
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
async function handle(req) {
  return app.fetch(restoreRequest(req));
}
var GET12 = handle;
var POST16 = handle;
var PUT = handle;
var PATCH2 = handle;
var DELETE3 = handle;
var OPTIONS = handle;
var HEAD = handle;
export {
  DELETE3 as DELETE,
  GET12 as GET,
  HEAD,
  OPTIONS,
  PATCH2 as PATCH,
  POST16 as POST,
  PUT,
  config
};
