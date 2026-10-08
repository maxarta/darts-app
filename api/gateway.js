var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// lib/supabase/server.ts
import { createClient } from "@supabase/supabase-js";
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
var adminClient;
var init_server = __esm({
  "lib/supabase/server.ts"() {
    "use strict";
    adminClient = null;
  }
});

// lib/darts/rules.ts
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
var UNLIMITED_ROUNDS;
var init_rules = __esm({
  "lib/darts/rules.ts"() {
    "use strict";
    UNLIMITED_ROUNDS = 9999;
  }
});

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
var init_throws_from_db = __esm({
  "lib/game/throws-from-db.ts"() {
    "use strict";
  }
});

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
var init_visit_index = __esm({
  "lib/darts/visit-index.ts"() {
    "use strict";
  }
});

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
var init_bracket = __esm({
  "lib/tournament/bracket.ts"() {
    "use strict";
  }
});

// lib/tournament/playoff-display.ts
function getPlayoffRoundTitle(round, totalRounds) {
  if (round === totalRounds) return "\u0424\u0438\u043D\u0430\u043B";
  if (totalRounds === 2 && round === 1) return "\u041F\u043E\u043B\u0443\u0444\u0438\u043D\u0430\u043B";
  if (totalRounds === 3 && round === 2) return "\u041F\u043E\u043B\u0443\u0444\u0438\u043D\u0430\u043B";
  if (totalRounds === 3 && round === 1) return "1/4 \u0444\u0438\u043D\u0430\u043B\u0430";
  return `\u0420\u0430\u0443\u043D\u0434 ${round}`;
}
function getPlayoffRoundCount(playoffSize) {
  return playoffSize === 8 ? 3 : 2;
}
var init_playoff_display = __esm({
  "lib/tournament/playoff-display.ts"() {
    "use strict";
    init_bracket();
  }
});

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
var init_variant = __esm({
  "lib/tournament/variant.ts"() {
    "use strict";
  }
});

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
var init_game_context = __esm({
  "lib/tournament/game-context.ts"() {
    "use strict";
    init_server();
    init_playoff_display();
    init_variant();
  }
});

// lib/tournament/pair-draw.ts
function drawRandomPairs(playerIds, random = Math.random) {
  const unique = [...new Set(playerIds.filter((id) => Number.isFinite(id)))];
  const shuffled = shuffleInPlace(unique, random);
  const byes = [];
  let pool = shuffled;
  if (pool.length % 2 === 1) {
    byes.push(pool[pool.length - 1]);
    pool = pool.slice(0, -1);
  }
  const pairs = [];
  for (let i = 0; i < pool.length; i += 2) {
    pairs.push([pool[i], pool[i + 1]]);
  }
  return { pairs, byes };
}
function isPairKnockoutFormat(settings) {
  if (!settings || typeof settings !== "object") return false;
  return settings.format === "pair_ko";
}
var init_pair_draw = __esm({
  "lib/tournament/pair-draw.ts"() {
    "use strict";
    init_bracket();
  }
});

// lib/game/multiplayer.ts
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
var MIN_PLAYERS_FOR_STATS;
var init_multiplayer = __esm({
  "lib/game/multiplayer.ts"() {
    "use strict";
    MIN_PLAYERS_FOR_STATS = 2;
  }
});

// lib/game/status.ts
var init_status = __esm({
  "lib/game/status.ts"() {
    "use strict";
  }
});

// lib/tournament/tv-code.ts
function normalizeTvCode(raw) {
  return raw.replace(/\D/g, "").slice(0, TV_CODE_LENGTH);
}
function isValidTvCode(code) {
  return /^\d{4}$/.test(code);
}
function generateTvCode(random = Math.random) {
  const n = Math.floor(random() * 1e4);
  return String(n).padStart(TV_CODE_LENGTH, "0");
}
function readTvCodeFromSettings(settings) {
  if (!settings || typeof settings !== "object") return null;
  const raw = settings.tvCode;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    const code2 = String(Math.trunc(raw)).padStart(TV_CODE_LENGTH, "0");
    return isValidTvCode(code2) ? code2 : null;
  }
  if (typeof raw !== "string") return null;
  const code = normalizeTvCode(raw);
  return isValidTvCode(code) ? code : null;
}
var TV_CODE_LENGTH;
var init_tv_code = __esm({
  "lib/tournament/tv-code.ts"() {
    "use strict";
    TV_CODE_LENGTH = 4;
  }
});

// lib/db/tournament-tv-code.ts
async function tvCodeTaken(code) {
  const db = getSupabaseAdmin();
  const { data, error } = await db.from("tournaments").select("id").contains("settings", { tvCode: code }).limit(1);
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}
async function allocateUniqueTvCode() {
  for (let attempt = 0; attempt < 24; attempt++) {
    const code = generateTvCode();
    if (!await tvCodeTaken(code)) return code;
  }
  throw new Error("\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0432\u044B\u0434\u0435\u043B\u0438\u0442\u044C TV-\u043A\u043E\u0434");
}
async function findTournamentIdByTvCode(rawCode) {
  const code = normalizeTvCode(rawCode);
  if (!isValidTvCode(code)) return null;
  const db = getSupabaseAdmin();
  const { data, error } = await db.from("tournaments").select("id").contains("settings", { tvCode: code }).limit(1).maybeSingle();
  if (error) throw error;
  return data?.id ?? null;
}
async function ensureTournamentTvCode(tournamentId) {
  const db = getSupabaseAdmin();
  const { data: row, error } = await db.from("tournaments").select("settings").eq("id", tournamentId).single();
  if (error) throw error;
  const existing = readTvCodeFromSettings(row.settings);
  if (existing) return existing;
  const code = await allocateUniqueTvCode();
  const prev = row.settings && typeof row.settings === "object" ? { ...row.settings } : {};
  prev.tvCode = code;
  const { error: writeErr } = await db.from("tournaments").update({ settings: prev }).eq("id", tournamentId);
  if (writeErr) throw writeErr;
  return code;
}
var init_tournament_tv_code = __esm({
  "lib/db/tournament-tv-code.ts"() {
    "use strict";
    init_server();
    init_tv_code();
  }
});

// lib/tournament/name.ts
function capitalizeMonth(month) {
  return month.charAt(0).toUpperCase() + month.slice(1);
}
function generateTournamentName(date = /* @__PURE__ */ new Date()) {
  const month = capitalizeMonth(MONTHS_NOMINATIVE_RU[date.getMonth()]);
  const year = date.getFullYear();
  return `\u0422\u0443\u0440\u043D\u0438\u0440 \u2022 ${month} ${year}`;
}
var MONTHS_NOMINATIVE_RU;
var init_name = __esm({
  "lib/tournament/name.ts"() {
    "use strict";
    MONTHS_NOMINATIVE_RU = [
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
  }
});

// lib/tournament/settings.ts
function parseTournamentSettings(raw) {
  const legsToWin = raw && typeof raw === "object" && "legsToWin" in raw && raw.legsToWin === 1 ? 1 : 2;
  const format = raw && typeof raw === "object" && raw.format === "pair_ko" ? "pair_ko" : raw && typeof raw === "object" && raw.format === "legacy" ? "legacy" : void 0;
  return { legsToWin, format };
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
var FINAL_MATCH_LEGS_TO_WIN, DEFAULT_TOURNAMENT_LEGS_TO_WIN;
var init_settings = __esm({
  "lib/tournament/settings.ts"() {
    "use strict";
    init_rules();
    FINAL_MATCH_LEGS_TO_WIN = 2;
    DEFAULT_TOURNAMENT_LEGS_TO_WIN = 2;
  }
});

// lib/db/tournaments.ts
var tournaments_exports = {};
__export(tournaments_exports, {
  assertChannelTournamentParticipants: () => assertChannelTournamentParticipants,
  createMatchGame: () => createMatchGame,
  createTournament: () => createTournament,
  deleteTournament: () => deleteTournament,
  drawRoundRobin: () => drawRoundRobin,
  finishTournament: () => finishTournament,
  getTournament: () => getTournament,
  listChannelActiveTournaments: () => listChannelActiveTournaments,
  listChannelFinishedTournaments: () => listChannelFinishedTournaments,
  listChannelTournaments: () => listChannelTournaments,
  listCreatorActiveTournaments: () => listCreatorActiveTournaments,
  maybeAdvancePairKnockout: () => maybeAdvancePairKnockout,
  normalizeTournamentParticipantIds: () => normalizeTournamentParticipantIds,
  startPlayoff: () => startPlayoff
});
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
  const name = params.name?.trim() || generateTournamentName();
  const mode = params.mode === "301" ? "301" : "501";
  const legsToWin = DEFAULT_TOURNAMENT_LEGS_TO_WIN;
  const variant = normalizeTournamentVariant(params.variant);
  const tvCode = await allocateUniqueTvCode();
  const settings = { legsToWin, variant, format: "pair_ko", tvCode };
  const playoffSize = participantIds.length >= 8 ? 8 : 4;
  const baseRow = {
    channel_id: params.channelId,
    name,
    mode,
    playoff_size: playoffSize,
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
async function insertPairKnockoutRound(tournamentId, round, playerIds) {
  const db = getSupabaseAdmin();
  const { pairs, byes } = drawRandomPairs(playerIds);
  const rows = [
    ...pairs.map(([p1, p2], slot) => ({
      tournament_id: tournamentId,
      round,
      slot,
      player1_id: p1,
      player2_id: p2,
      winner_id: null
    })),
    ...byes.map((byeId, i) => ({
      tournament_id: tournamentId,
      round,
      slot: pairs.length + i,
      player1_id: byeId,
      player2_id: null,
      winner_id: byeId
    }))
  ];
  if (rows.length === 0) {
    throw new Error("\u041D\u0435\u0434\u043E\u0441\u0442\u0430\u0442\u043E\u0447\u043D\u043E \u0438\u0433\u0440\u043E\u043A\u043E\u0432 \u0434\u043B\u044F \u0440\u0430\u0443\u043D\u0434\u0430");
  }
  const { error } = await db.from("playoff_matches").insert(rows);
  if (error) throw error;
}
async function drawRoundRobin(tournamentId) {
  const db = getSupabaseAdmin();
  const { tournament, participants, roundRobinMatches, playoffMatches } = await getTournament(tournamentId);
  if (tournament.status !== "round_robin") {
    throw new Error("Tournament is not in round robin stage");
  }
  const participantIds = participants.map((p) => p.user_id);
  if (participantIds.length < 3) {
    throw new Error("At least 3 participants required");
  }
  if (isPairKnockoutFormat(tournament.settings)) {
    if (playoffMatches.length > 0) {
      throw new Error("\u0416\u0435\u0440\u0435\u0431\u044C\u0451\u0432\u043A\u0430 \u0443\u0436\u0435 \u043F\u0440\u043E\u0432\u0435\u0434\u0435\u043D\u0430");
    }
    await insertPairKnockoutRound(tournamentId, 1, participantIds);
    await db.from("tournaments").update({ status: "playoff" }).eq("id", tournamentId);
    return getTournament(tournamentId);
  }
  if (roundRobinMatches.length > 0) {
    throw new Error("Round robin draw already completed");
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
async function maybeAdvancePairKnockout(tournamentId) {
  const db = getSupabaseAdmin();
  const { tournament, playoffMatches } = await getTournament(tournamentId);
  if (!isPairKnockoutFormat(tournament.settings)) return;
  if (tournament.status !== "playoff") return;
  if (playoffMatches.length === 0) return;
  const maxRound = Math.max(...playoffMatches.map((m) => m.round));
  const current = playoffMatches.filter((m) => m.round === maxRound);
  if (!current.every((m) => m.winner_id != null)) return;
  const winners = current.map((m) => m.winner_id).filter((id) => Number.isFinite(id));
  if (winners.length <= 1) {
    return;
  }
  const nextExists = playoffMatches.some((m) => m.round === maxRound + 1);
  if (nextExists) return;
  await insertPairKnockoutRound(tournamentId, maxRound + 1, winners);
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
  const isPairKo = isPairKnockoutFormat(tournament.settings);
  const playoffSize = tournament.playoff_size === 8 ? 8 : 4;
  const { playoffMatches } = await getTournament(tournamentId);
  const maxRound = playoffMatches.length > 0 ? Math.max(...playoffMatches.map((m) => m.round)) : getPlayoffRoundCount(playoffSize);
  const isFinalMatch = matchType === "playoff" && (isPairKo ? match.round === maxRound : match.round === getPlayoffRoundCount(playoffSize));
  const { game } = await createGame({
    channelId,
    mode: tournament.mode,
    playerIds,
    createdBy,
    settings: gameSettingsForTournament(tournament.mode, tournamentSettings, {
      final: isFinalMatch || isPairKo
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
var init_tournaments = __esm({
  "lib/db/tournaments.ts"() {
    "use strict";
    init_server();
    init_bracket();
    init_pair_draw();
    init_tournament_tv_code();
    init_playoff_display();
    init_name();
    init_variant();
    init_games();
    init_settings();
  }
});

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
  const { data: players } = await db.from("game_players").select("*, users(first_name, username, photo_url)").eq("game_id", gameId).order("order_index");
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
    if (po.winner_id) return;
    await db.from("playoff_matches").update({ winner_id: winnerId }).eq("id", matchRef);
    const { data: tournament } = await db.from("tournaments").select("settings").eq("id", po.tournament_id).maybeSingle();
    if (isPairKnockoutFormat(tournament?.settings)) {
      const { maybeAdvancePairKnockout: maybeAdvancePairKnockout2 } = await Promise.resolve().then(() => (init_tournaments(), tournaments_exports));
      await maybeAdvancePairKnockout2(po.tournament_id);
      return;
    }
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
var init_games = __esm({
  "lib/db/games.ts"() {
    "use strict";
    init_server();
    init_rules();
    init_throws_from_db();
    init_visit_index();
    init_game_context();
    init_pair_draw();
    init_multiplayer();
    init_status();
  }
});

// server/app.ts
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";

// lib/api/auth.ts
var WEB_CLUB_CHAT_ID = -1000000000001;
function isWebAuthHeader(req) {
  const web = req.headers.get("x-web-auth");
  const legacy = req.headers.get("x-dev-auth");
  return web === "local" || legacy === "local";
}
function webAuthUser() {
  return {
    id: 1,
    first_name: "\u0418\u0433\u0440\u043E\u043A"
  };
}
function authenticateRequest(req) {
  if (!isWebAuthHeader(req)) {
    return { ok: false, error: "Missing auth", status: 401 };
  }
  return { ok: true, ctx: { user: webAuthUser(), initData: "web" } };
}
function isWebSession(initData) {
  return initData === "web" || initData === "dev";
}
function jsonError(message, status) {
  return Response.json({ error: message }, { status });
}

// lib/db/users.ts
init_server();

// lib/user-photo.ts
function avatarPath(userId) {
  return `/api/avatar/${userId}`;
}
function isCustomClubPhoto(photoUrl) {
  return Boolean(photoUrl?.startsWith("data:image/"));
}
function decodeDataImageUrl(dataUrl) {
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)$/.exec(
    dataUrl.trim()
  );
  if (!match) return null;
  const contentType = match[1];
  const b64 = match[2].replace(/\s+/g, "");
  try {
    const binary = atob(b64);
    const body = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      body[i] = binary.charCodeAt(i);
    }
    return { contentType, body };
  } catch {
    return null;
  }
}
function shouldPreserveClubDisplayName(existing, telegramFirstName) {
  if (!existing) return false;
  if (isCustomClubPhoto(existing.photo_url)) return true;
  if (existing.username == null && existing.first_name.trim().length > 0 && existing.first_name !== telegramFirstName) {
    return true;
  }
  return false;
}
function resolveStoredPhotoUrl(userId, photoUrl) {
  if (!photoUrl || photoUrl.length === 0) return null;
  if (isCustomClubPhoto(photoUrl)) {
    return avatarPath(userId);
  }
  if (photoUrl.startsWith("/api/avatar/") || photoUrl.startsWith("/api/telegram/avatar/")) {
    return avatarPath(userId);
  }
  return photoUrl;
}
function pickPhotoUrlToStore(userId, incomingPhotoUrl, existingPhotoUrl) {
  if (isCustomClubPhoto(existingPhotoUrl)) {
    return existingPhotoUrl;
  }
  if (isCustomClubPhoto(incomingPhotoUrl)) {
    return incomingPhotoUrl;
  }
  if (existingPhotoUrl?.startsWith("/api/avatar/")) {
    return existingPhotoUrl;
  }
  if (existingPhotoUrl?.startsWith("/api/telegram/avatar/")) {
    return avatarPath(userId);
  }
  if (existingPhotoUrl && existingPhotoUrl.length > 0) {
    return existingPhotoUrl;
  }
  return avatarPath(userId);
}
async function syncUserProfilePhoto(user, existingPhotoUrl) {
  if (isCustomClubPhoto(existingPhotoUrl)) {
    return existingPhotoUrl;
  }
  return pickPhotoUrlToStore(user.id, user.photo_url, existingPhotoUrl);
}

// lib/db/users.ts
async function getUserPhotoUrl(userId) {
  const profile = await getUserProfile(userId);
  return profile?.photo_url ?? null;
}
async function getUserProfile(userId) {
  const db = getSupabaseAdmin();
  const { data, error } = await db.from("users").select("telegram_id, first_name, username, photo_url").eq("telegram_id", userId).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    telegram_id: data.telegram_id,
    first_name: data.first_name ?? String(userId),
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
  const nameFields = {
    username: preserveName ? existing?.username ?? null : user.username ?? null,
    first_name: preserveName ? existing?.first_name ?? user.first_name : user.first_name,
    last_name: user.last_name ?? null
  };
  if (!existing) {
    const { error } = await db.from("users").insert({
      telegram_id: user.id,
      ...nameFields,
      photo_url
    });
    if (error) throw error;
  } else if (isCustomClubPhoto(existingPhotoUrl)) {
    const { error } = await db.from("users").update(nameFields).eq("telegram_id", user.id);
    if (error) throw error;
  } else {
    const freshPhoto = await getUserPhotoUrl(user.id);
    if (isCustomClubPhoto(freshPhoto)) {
      const { error } = await db.from("users").update(nameFields).eq("telegram_id", user.id);
      if (error) throw error;
    } else {
      const { error } = await db.from("users").update({ ...nameFields, photo_url }).eq("telegram_id", user.id);
      if (error) throw error;
    }
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
init_server();
var ADMIN_ROLES = /* @__PURE__ */ new Set(["creator", "administrator"]);
async function ensureChannel(telegramChatId, title) {
  const db = getSupabaseAdmin();
  const { data: existing } = await db.from("channels").select("*").eq("telegram_chat_id", telegramChatId).maybeSingle();
  if (existing) return existing;
  const { data, error } = await db.from("channels").insert({
    telegram_chat_id: telegramChatId,
    title: title ?? (telegramChatId === WEB_CLUB_CHAT_ID ? "\u041A\u043B\u0443\u0431" : `Club ${telegramChatId}`)
  }).select().single();
  if (error) throw error;
  return data;
}
async function registerChannelMember(channelId, telegramChatId, userId, role) {
  void telegramChatId;
  const resolvedRole = role ?? (userId === 1 ? "creator" : "member");
  const db = getSupabaseAdmin();
  const { error } = await db.from("channel_members").upsert(
    {
      channel_id: channelId,
      user_id: userId,
      role: resolvedRole,
      last_verified_at: (/* @__PURE__ */ new Date()).toISOString()
    },
    { onConflict: "channel_id,user_id" }
  );
  if (error) throw error;
  return resolvedRole;
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
init_server();
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
    await upsertUser(auth.ctx.user);
    const storedPhotoUrl = await getUserPhotoUrl(auth.ctx.user.id);
    const user = {
      ...auth.ctx.user,
      photo_url: pickPhotoUrlToStore(
        auth.ctx.user.id,
        auth.ctx.user.photo_url,
        storedPhotoUrl
      )
    };
    let channel = null;
    let isChannelAdmin2 = false;
    const web = isWebSession(auth.ctx.initData);
    const chatId = WEB_CLUB_CHAT_ID;
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
    if (message.includes("Invalid URL") || message.includes("SUPABASE") || message.includes("fetch failed")) {
      return jsonError(
        "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0438\u0442\u044C\u0441\u044F \u043A \u0431\u0430\u0437\u0435. \u041F\u0440\u043E\u0432\u0435\u0440\u044C\u0442\u0435 SUPABASE_URL \u043D\u0430 Vercel.",
        503
      );
    }
    return jsonError(message, 500);
  }
}

// app/api/games/route.ts
init_games();
init_server();
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
init_server();
init_rules();
init_games();
init_pair_draw();
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
    const { data: tournament } = await db.from("tournaments").select("settings").eq("id", po.tournament_id).maybeSingle();
    if (isPairKnockoutFormat(tournament?.settings)) {
      const { maybeAdvancePairKnockout: maybeAdvancePairKnockout2 } = await Promise.resolve().then(() => (init_tournaments(), tournaments_exports));
      await maybeAdvancePairKnockout2(po.tournament_id);
      return;
    }
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
init_games();
async function GET(req, { params }) {
  const auth = authenticateRequest(req);
  if (!auth.ok) return jsonError(auth.error, auth.status);
  const { gameId } = await params;
  const result = await getGame(gameId);
  return Response.json(result);
}

// app/api/games/[gameId]/throw/route.ts
init_games();
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
init_games();
async function POST5(req, { params }) {
  const auth = authenticateRequest(req);
  if (!auth.ok) return jsonError(auth.error, auth.status);
  const { gameId } = await params;
  const result = await undoLastThrow(gameId);
  return Response.json(result);
}

// app/api/games/[gameId]/end-visit/route.ts
init_games();
async function POST6(req, { params }) {
  const auth = authenticateRequest(req);
  if (!auth.ok) return jsonError(auth.error, auth.status);
  const { gameId } = await params;
  const result = await endVisit(gameId);
  return Response.json(result);
}

// app/api/games/[gameId]/restart/route.ts
init_games();
async function POST7(req, { params }) {
  const auth = authenticateRequest(req);
  if (!auth.ok) return jsonError(auth.error, auth.status);
  const { gameId } = await params;
  const result = await restartGame(gameId);
  return Response.json(result);
}

// app/api/games/[gameId]/leave/route.ts
init_games();
async function POST8(req, { params }) {
  const auth = authenticateRequest(req);
  if (!auth.ok) return jsonError(auth.error, auth.status);
  const { gameId } = await params;
  const result = await cancelGame(gameId);
  return Response.json(result);
}

// lib/db/stats.ts
init_server();
init_multiplayer();
init_throws_from_db();

// lib/stats/player-stats.ts
init_rules();

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
init_server();
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
    void syncUserProfilePhoto({
      id: userId,
      photo_url: userRow?.photo_url ?? void 0
    }).catch((e) => console.warn("[stats/player] sync photo", e));
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
init_server();
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

// app/api/tournaments/route.ts
init_tournaments();
init_variant();
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
    const { channelId, name, participantIds, variant } = body;
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
      createdBy: auth.ctx.user.id
    });
    return Response.json(tournament);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to create tournament";
    const status = message.includes("not found") ? 404 : 400;
    return jsonError(message, status);
  }
}

// app/api/tournaments/[tournamentId]/route.ts
init_tournaments();
async function GET5(req, { params }) {
  const auth = authenticateRequest(req);
  if (!auth.ok) return jsonError(auth.error, auth.status);
  const { tournamentId } = await params;
  try {
    const data = await getTournament(tournamentId);
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
init_tournaments();
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
init_tournaments();
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
init_tournaments();
async function POST12(req, { params }) {
  const auth = authenticateRequest(req);
  if (!auth.ok) return jsonError(auth.error, auth.status);
  const { tournamentId } = await params;
  const data = await startPlayoff(tournamentId);
  return Response.json(data);
}

// app/api/tournaments/[tournamentId]/finish/route.ts
init_tournaments();
init_server();
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

// lib/db/tournament-live.ts
init_server();
async function getTournamentTvLive(tournamentId) {
  const db = getSupabaseAdmin();
  const { data, error } = await db.from("tournaments").select("settings").eq("id", tournamentId).maybeSingle();
  if (error) throw error;
  const settings = data?.settings;
  if (!settings || typeof settings !== "object") return null;
  const live = settings.tvLive;
  if (!live || typeof live !== "object") return null;
  return live;
}
async function setTournamentTvLive(tournamentId, live) {
  const db = getSupabaseAdmin();
  const { error } = await db.rpc("set_tournament_tv_live", {
    p_tournament_id: tournamentId,
    p_live: live
  });
  if (error) {
    console.warn("[tv-live] rpc failed, fallback merge", error.message);
    return setTournamentTvLiveFallback(tournamentId, live);
  }
  return live;
}
async function setTournamentTvLiveFallback(tournamentId, live) {
  const db = getSupabaseAdmin();
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data: row, error: readErr } = await db.from("tournaments").select("settings").eq("id", tournamentId).single();
    if (readErr) throw readErr;
    const prev = row.settings && typeof row.settings === "object" ? { ...row.settings } : {};
    if (live == null) {
      delete prev.tvLive;
    } else {
      prev.tvLive = live;
    }
    const { error } = await db.from("tournaments").update({ settings: prev }).eq("id", tournamentId);
    if (!error) return live;
    if (attempt === 2) throw error;
  }
  return live;
}

// app/api/tournaments/[tournamentId]/live/route.ts
init_tournaments();
async function GET6(_req, { params }) {
  const auth = authenticateRequest(_req);
  if (!auth.ok) return jsonError(auth.error, auth.status);
  const { tournamentId } = await params;
  try {
    await getTournament(tournamentId);
    const live = await getTournamentTvLive(tournamentId);
    return Response.json({ live });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Not found";
    return jsonError(message, message.includes("not found") ? 404 : 400);
  }
}
async function POST14(req, { params }) {
  const auth = authenticateRequest(req);
  if (!auth.ok) return jsonError(auth.error, auth.status);
  const { tournamentId } = await params;
  try {
    await getTournament(tournamentId);
    const body = await req.json().catch(() => ({}));
    if (body.live === null) {
      await setTournamentTvLive(tournamentId, null);
      return Response.json({ live: null });
    }
    if (!body.live || typeof body.live !== "object") {
      return jsonError("live payload required", 400);
    }
    const live = {
      ...body.live,
      updatedAt: Date.now()
    };
    await setTournamentTvLive(tournamentId, live);
    return Response.json({ live });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to update live";
    return jsonError(message, 400);
  }
}

// app/api/tournaments/[tournamentId]/tv-code/route.ts
init_tournament_tv_code();
init_tournaments();

// lib/tournament/tv-live.ts
var TV_PUBLIC_ORIGIN = "https://artdart.vercel.app";
var TV_PUBLIC_HOST = "artdart.vercel.app";
function tvPublicUrl() {
  return `${TV_PUBLIC_ORIGIN}/tv`;
}
function tvPublicDisplay() {
  return `${TV_PUBLIC_HOST}/tv`;
}

// app/api/tournaments/[tournamentId]/tv-code/route.ts
async function GET7(req, { params }) {
  const auth = authenticateRequest(req);
  if (!auth.ok) return jsonError(auth.error, auth.status);
  const { tournamentId } = await params;
  try {
    await getTournament(tournamentId);
    const code = await ensureTournamentTvCode(tournamentId);
    return Response.json({
      code,
      url: tvPublicUrl(),
      display: tvPublicDisplay()
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed";
    return jsonError(message, message.includes("not found") ? 404 : 400);
  }
}

// lib/db/tv-boards.ts
init_server();
init_tv_code();
init_tournament_tv_code();

// lib/tournament/tv-board-key.ts
function tournamentBoardKey(tournamentId) {
  return `t:${tournamentId}`;
}
function channelBoardKey(channelId) {
  return `c:${channelId}`;
}
function parseTvBoardKey(raw) {
  const boardKey = decodeURIComponent(raw);
  if (boardKey.startsWith("t:") && boardKey.length > 2) {
    return { boardKey, kind: "tournament", refId: boardKey.slice(2) };
  }
  if (boardKey.startsWith("g:") && boardKey.length > 2) {
    return { boardKey, kind: "game", refId: boardKey.slice(2) };
  }
  if (boardKey.startsWith("c:") && boardKey.length > 2) {
    return { boardKey, kind: "channel", refId: boardKey.slice(2) };
  }
  return null;
}

// lib/db/tv-boards.ts
async function codeTakenOnBoards(code) {
  const db = getSupabaseAdmin();
  const { data, error } = await db.from("tv_boards").select("board_key").eq("code", code).limit(1);
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}
async function allocateCode() {
  for (let i = 0; i < 32; i++) {
    const code = generateTvCode();
    if (await codeTakenOnBoards(code)) continue;
    const legacy = await findTournamentIdByTvCode(code);
    if (legacy) continue;
    return code;
  }
  throw new Error("\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0432\u044B\u0434\u0435\u043B\u0438\u0442\u044C TV-\u043A\u043E\u0434");
}
async function ensureChannelTvBoard(params) {
  const channelId = params.channelId.trim();
  if (!channelId) throw new Error("channelId required");
  const boardKey = channelBoardKey(channelId);
  const db = getSupabaseAdmin();
  const { data: existing, error } = await db.from("tv_boards").select("code, title").eq("board_key", boardKey).maybeSingle();
  if (error) throw error;
  if (existing?.code) {
    if (params.title && params.title !== existing.title) {
      await db.from("tv_boards").update({ title: params.title, updated_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("board_key", boardKey);
    }
    return { code: existing.code, boardKey };
  }
  const { data: prior } = await db.from("tv_boards").select("code").eq("channel_id", channelId).eq("kind", "game").order("updated_at", { ascending: false }).limit(1).maybeSingle();
  return ensureTvBoard({
    boardKey,
    kind: "channel",
    refId: channelId,
    channelId,
    title: params.title,
    preferredCode: prior?.code ?? null
  });
}
async function ensureTvBoard(params) {
  const db = getSupabaseAdmin();
  const { data: existing, error } = await db.from("tv_boards").select("code, title").eq("board_key", params.boardKey).maybeSingle();
  if (error) throw error;
  if (existing?.code) {
    if (params.title && params.title !== existing.title) {
      await db.from("tv_boards").update({ title: params.title, updated_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("board_key", params.boardKey);
    }
    return { code: existing.code, boardKey: params.boardKey };
  }
  const preferred = params.preferredCode ? normalizeTvCode(params.preferredCode) : "";
  const code = preferred && isValidTvCode(preferred) && !await codeTakenOnBoards(preferred) ? preferred : await allocateCode();
  const { error: insertErr } = await db.from("tv_boards").insert({
    board_key: params.boardKey,
    code,
    kind: params.kind,
    ref_id: params.refId,
    channel_id: params.channelId || null,
    title: params.title ?? "",
    live: null,
    updated_at: (/* @__PURE__ */ new Date()).toISOString()
  });
  if (insertErr) {
    const { data: again } = await db.from("tv_boards").select("code").eq("board_key", params.boardKey).maybeSingle();
    if (again?.code) return { code: again.code, boardKey: params.boardKey };
    throw insertErr;
  }
  return { code, boardKey: params.boardKey };
}
async function setTvBoardLive(boardKey, live) {
  const db = getSupabaseAdmin();
  const { error } = await db.from("tv_boards").update({
    live,
    updated_at: (/* @__PURE__ */ new Date()).toISOString()
  }).eq("board_key", boardKey);
  if (error) throw error;
}
async function getTvBoardLive(boardKey) {
  const db = getSupabaseAdmin();
  const { data, error } = await db.from("tv_boards").select("live, kind, channel_id, ref_id").eq("board_key", boardKey).maybeSingle();
  if (error) throw error;
  const own = data?.live && typeof data.live === "object" ? data.live : null;
  if (data?.kind === "game" && data.channel_id) {
    const sessionKey = channelBoardKey(data.channel_id);
    if (sessionKey !== boardKey) {
      const { data: session } = await db.from("tv_boards").select("live").eq("board_key", sessionKey).maybeSingle();
      const sessionLive = session?.live && typeof session.live === "object" ? session.live : null;
      if (sessionLive && (sessionLive.updatedAt ?? 0) >= (own?.updatedAt ?? 0)) {
        return sessionLive;
      }
    }
  }
  return own;
}
async function findTvBoardByCode(rawCode) {
  const code = normalizeTvCode(rawCode);
  if (!isValidTvCode(code)) return null;
  const db = getSupabaseAdmin();
  const { data, error } = await db.from("tv_boards").select("*").eq("code", code).maybeSingle();
  if (error) throw error;
  if (data) return data;
  const tournamentId = await findTournamentIdByTvCode(code);
  if (!tournamentId) return null;
  await ensureTvBoard({
    boardKey: tournamentBoardKey(tournamentId),
    kind: "tournament",
    refId: tournamentId,
    preferredCode: code,
    title: ""
  });
  const { data: row } = await db.from("tv_boards").select("*").eq("board_key", tournamentBoardKey(tournamentId)).maybeSingle();
  return row ?? null;
}

// app/api/tv/[code]/route.ts
async function GET8(req, { params }) {
  const auth = authenticateRequest(req);
  if (!auth.ok) return jsonError(auth.error, auth.status);
  const { code } = await params;
  try {
    const board = await findTvBoardByCode(code);
    if (!board) return jsonError("\u041A\u043E\u0434 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D", 404);
    return Response.json({
      boardKey: board.board_key,
      kind: board.kind,
      refId: board.ref_id,
      title: board.title,
      tournamentId: board.kind === "tournament" ? board.ref_id : null,
      gameId: board.kind === "game" ? board.ref_id : null,
      channelId: board.kind === "channel" ? board.ref_id : board.channel_id
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Lookup failed";
    return jsonError(message, 400);
  }
}

// app/api/tv/boards/[boardKey]/route.ts
function parseBoardKey(raw) {
  return parseTvBoardKey(raw);
}
async function ensureParsedBoard(parsed, opts) {
  if (parsed.kind === "channel") {
    return ensureChannelTvBoard({
      channelId: parsed.refId,
      title: opts?.title
    });
  }
  return ensureTvBoard({
    boardKey: parsed.boardKey,
    kind: parsed.kind,
    refId: parsed.refId,
    channelId: opts?.channelId,
    title: opts?.title
  });
}
async function GET9(req, { params }) {
  const auth = authenticateRequest(req);
  if (!auth.ok) return jsonError(auth.error, auth.status);
  const { boardKey: raw } = await params;
  const parsed = parseBoardKey(raw);
  if (!parsed) return jsonError("Invalid board key", 400);
  const url = new URL(req.url);
  const want = url.searchParams.get("want");
  try {
    if (want === "code") {
      const channelId = url.searchParams.get("channelId");
      const title = url.searchParams.get("title") ?? "";
      const ensured = await ensureParsedBoard(parsed, { channelId, title });
      return Response.json({
        code: ensured.code,
        boardKey: ensured.boardKey,
        kind: parsed.kind,
        display: "artdart.vercel.app/tv",
        url: "https://artdart.vercel.app/tv"
      });
    }
    await ensureParsedBoard(parsed);
    const live = await getTvBoardLive(parsed.boardKey);
    return Response.json({ live });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed";
    return jsonError(message, 400);
  }
}
async function POST15(req, { params }) {
  const auth = authenticateRequest(req);
  if (!auth.ok) return jsonError(auth.error, auth.status);
  const { boardKey: raw } = await params;
  const parsed = parseBoardKey(raw);
  if (!parsed) return jsonError("Invalid board key", 400);
  try {
    const body = await req.json().catch(() => ({}));
    await ensureParsedBoard(parsed, {
      channelId: body.channelId,
      title: body.title
    });
    if (body.live === null) {
      await setTvBoardLive(parsed.boardKey, null);
      return Response.json({ live: null });
    }
    if (!body.live || typeof body.live !== "object") {
      return jsonError("live payload required", 400);
    }
    const live = {
      ...body.live,
      updatedAt: Date.now()
    };
    await setTvBoardLive(parsed.boardKey, live);
    return Response.json({ live });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to update live";
    return jsonError(message, 400);
  }
}

// app/api/avatar/[userId]/route.ts
async function GET10(_req, { params }) {
  const { userId: raw } = await params;
  const userId = Number(raw);
  if (!Number.isFinite(userId) || !Number.isInteger(userId)) {
    return new Response(null, { status: 404 });
  }
  const storedPhotoUrl = await getUserPhotoUrl(userId);
  if (storedPhotoUrl && isCustomClubPhoto(storedPhotoUrl)) {
    const decoded = decodeDataImageUrl(storedPhotoUrl);
    if (!decoded) {
      return new Response(null, { status: 404 });
    }
    return new Response(decoded.body, {
      headers: {
        "Content-Type": decoded.contentType,
        "Cache-Control": "public, max-age=300, stale-while-revalidate=3600"
      }
    });
  }
  return new Response(null, { status: 404 });
}

// app/api/channels/[channelId]/current/route.ts
init_games();
init_tournaments();
init_variant();
init_server();
async function GET11(req, { params }) {
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
init_games();
init_server();
async function GET12(req, { params }) {
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

// lib/channel/player-photo.ts
var MAX_PHOTO_DATA_URL_CHARS = 12e5;

// lib/channel/manual-players.ts
init_server();
function isManualPlayerId(userId) {
  return Number.isFinite(userId) && userId < 0;
}
function allocateManualPlayerId() {
  return -(Date.now() * 1e3 + Math.floor(Math.random() * 1e3));
}
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

// app/api/channels/[channelId]/players/route.ts
async function GET13(req, { params }) {
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
async function POST16(req, { params }) {
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
init_tournaments();
init_variant();
init_server();
async function GET14(req, { params }) {
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
init_server();
async function GET15(req, { params }) {
  const auth = authenticateRequest(req);
  if (!auth.ok) return jsonError(auth.error, auth.status);
  const { channelId } = await params;
  const db = getSupabaseAdmin();
  const { data: member } = await db.from("channel_members").select("user_id").eq("channel_id", channelId).eq("user_id", auth.ctx.user.id).maybeSingle();
  if (!member) return jsonError("Not a channel member", 403);
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

// server/app.ts
function withParams(params) {
  return { params: Promise.resolve(params) };
}
async function call(handler, req, params = {}) {
  if (!handler) {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" }
    });
  }
  return handler(req, withParams(params));
}
function createApp() {
  const app2 = new Hono();
  app2.use(
    "*",
    cors({
      origin: "*",
      allowHeaders: [
        "Content-Type",
        "x-web-auth",
        "x-dev-auth"
      ],
      allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"]
    })
  );
  app2.use(
    "/api/channels/*/players",
    bodyLimit({
      maxSize: 2 * 1024 * 1024,
      onError: (c) => c.json({ error: "\u0424\u043E\u0442\u043E \u0441\u043B\u0438\u0448\u043A\u043E\u043C \u0431\u043E\u043B\u044C\u0448\u043E\u0435 \u2014 \u0432\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0434\u0440\u0443\u0433\u043E\u0435" }, 413)
    })
  );
  app2.use(
    "/api/channels/*/players/*",
    bodyLimit({
      maxSize: 2 * 1024 * 1024,
      onError: (c) => c.json({ error: "\u0424\u043E\u0442\u043E \u0441\u043B\u0438\u0448\u043A\u043E\u043C \u0431\u043E\u043B\u044C\u0448\u043E\u0435 \u2014 \u0432\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0434\u0440\u0443\u0433\u043E\u0435" }, 413)
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
  app2.get(
    "/api/tournaments/:tournamentId/live",
    (c) => call(GET6, c.req.raw, {
      tournamentId: c.req.param("tournamentId")
    })
  );
  app2.post(
    "/api/tournaments/:tournamentId/live",
    (c) => call(POST14, c.req.raw, {
      tournamentId: c.req.param("tournamentId")
    })
  );
  app2.get(
    "/api/tournaments/:tournamentId/tv-code",
    (c) => call(GET7, c.req.raw, {
      tournamentId: c.req.param("tournamentId")
    })
  );
  app2.get(
    "/api/tv/boards/:boardKey",
    (c) => call(GET9, c.req.raw, {
      boardKey: c.req.param("boardKey")
    })
  );
  app2.post(
    "/api/tv/boards/:boardKey",
    (c) => call(POST15, c.req.raw, {
      boardKey: c.req.param("boardKey")
    })
  );
  app2.get(
    "/api/tv/:code",
    (c) => call(GET8, c.req.raw, {
      code: c.req.param("code")
    })
  );
  app2.get(
    "/api/avatar/:userId",
    (c) => call(GET10, c.req.raw, {
      userId: c.req.param("userId")
    })
  );
  app2.get(
    "/api/telegram/avatar/:userId",
    (c) => call(GET10, c.req.raw, {
      userId: c.req.param("userId")
    })
  );
  app2.get(
    "/api/channels/:channelId/current",
    (c) => call(GET11, c.req.raw, {
      channelId: c.req.param("channelId")
    })
  );
  app2.get(
    "/api/channels/:channelId/games",
    (c) => call(GET12, c.req.raw, { channelId: c.req.param("channelId") })
  );
  app2.get(
    "/api/channels/:channelId/players",
    (c) => call(GET13, c.req.raw, {
      channelId: c.req.param("channelId")
    })
  );
  app2.post(
    "/api/channels/:channelId/players",
    (c) => call(POST16, c.req.raw, {
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
    (c) => call(GET14, c.req.raw, {
      channelId: c.req.param("channelId")
    })
  );
  app2.get(
    "/api/channels/:channelId/members",
    (c) => call(GET15, c.req.raw, {
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
var GET16 = handle;
var POST17 = handle;
var PUT = handle;
var PATCH2 = handle;
var DELETE3 = handle;
var OPTIONS = handle;
var HEAD = handle;
export {
  DELETE3 as DELETE,
  GET16 as GET,
  HEAD,
  OPTIONS,
  PATCH2 as PATCH,
  POST17 as POST,
  PUT,
  config
};
