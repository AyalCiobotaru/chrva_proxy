import fetch from "node-fetch";

const ALLOWED_ORIGIN = "https://www.chrva.org";
const RESULTS_URL = process.env.GS_PLAYER_POINTS_URL || process.env.GS_PLAYER_RESULTS_URL;
const DEFAULT_SEASON = "2026";
const ALLOWED_SEASONS = new Set(["2026", "2027"]);
const SHEET_CACHE_TTL_MS = Number(process.env.PLAYER_POINTS_CACHE_TTL_MS || 5 * 60 * 1000);
const TEAM_PLAYER_ID_COLUMNS = ["player1_id", "player2_id", "player3_id", "player4_id"];

let cachedSheetPayload = null;
let cachedSheetPayloadAt = 0;
let pendingSheetPayload = null;

function setCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

function firstQueryValue(value) {
  return Array.isArray(value) ? value[0] : value;
}

function requestedSeason(req) {
  const season = String(firstQueryValue(req.query.season) || DEFAULT_SEASON).trim();
  if (!ALLOWED_SEASONS.has(season)) {
    throw new Error("season must be 2026 or 2027");
  }
  return season;
}

function numberFor(value) {
  const parsed = Number(String(value ?? "").replace(/,/g, "").trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

const BASE_POINTS = {
  GOLD: {
    1: 200,
    2: 170,
    3: 145,
    5: 120
  },
  SILVER: {
    1: 100,
    2: 85,
    3: 70
  },
  DNMP: 40
};

function teamMultiplier(totalTeams) {
  const teams = numberFor(totalTeams);
  if (teams >= 4 && teams <= 5) return 0.6;
  if (teams >= 6 && teams <= 7) return 0.7;
  if (teams >= 8 && teams <= 9) return 0.8;
  if (teams >= 10 && teams <= 12) return 0.9;
  if (teams >= 13) return 1;
  return 1;
}

function finishNumber(finish) {
  const match = String(finish || "").match(/\d+/);
  return match ? Number(match[0]) : 0;
}

function calculatePoints(result, tournament) {
  const finish = String(result.finish || "").trim().toUpperCase();
  if (finish === "DNMP") {
    return {
      points: BASE_POINTS.DNMP,
      basePoints: BASE_POINTS.DNMP,
      formula: `${BASE_POINTS.DNMP} x 100%`
    };
  }

  const bracket = String(result.bracket || "").trim().toUpperCase();
  const basePoints = BASE_POINTS[bracket]?.[finishNumber(finish)] || 0;
  const multiplier = teamMultiplier(tournament?.total_teams);
  return {
    points: Math.round(basePoints * multiplier),
    formula: `${basePoints} x ${Math.round(multiplier * 100)}%`
  };
}

function normalizeDate(value) {
  if (!value) return "";
  const raw = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw;
  return parsed.toISOString().slice(0, 10);
}

function unwrapSheet(payload, key) {
  if (Array.isArray(payload?.[key])) return payload[key];
  return [];
}

function tournamentKey(row) {
  return `${String(row.season || "").trim()}::${String(row.tournament_id || "").trim()}`;
}

function indexTournaments(rows) {
  return new Map(rows.map((row) => [tournamentKey(row), row]).filter(([key]) => !key.endsWith("::")));
}

function indexPlayers(rows) {
  return new Map(
    rows
      .map((row) => [String(row.usav_member_id || "").trim(), row])
      .filter(([usavMemberId]) => usavMemberId)
  );
}

function groupTeamsByTournament(rows) {
  const grouped = new Map();

  for (const row of rows) {
    const key = tournamentKey(row);
    if (key.endsWith("::")) continue;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(row);
  }

  return grouped;
}

function normalizePayload(payload) {
  if (Array.isArray(payload)) {
    throw new Error("Expected player points feed to include Players, Tournaments, Results, and Teams arrays.");
  }

  return {
    players: unwrapSheet(payload, "Players"),
    tournaments: unwrapSheet(payload, "Tournaments"),
    results: unwrapSheet(payload, "Results"),
    teams: unwrapSheet(payload, "Teams")
  };
}

function teamPlayerIds(team) {
  return TEAM_PLAYER_ID_COLUMNS.map((key) => String(team?.[key] || "").trim()).filter(Boolean);
}

function findTeamForResult(result, usavMemberId, teamsByTournament) {
  const teams = teamsByTournament.get(tournamentKey(result)) || [];
  return teams.find((team) => teamPlayerIds(team).includes(usavMemberId)) || null;
}

function buildTeam(team, playerIndex) {
  if (!team) {
    return {
      name: "",
      players: []
    };
  }

  return {
    name: String(team.team_name || "").trim(),
    players: teamPlayerIds(team).map((usavMemberId) => {
      const player = playerIndex.get(usavMemberId);
      return {
        usavMemberId,
        name: String(player?.display_name || "").trim()
      };
    })
  };
}

function buildTournamentResult(result, tournament, team, playerIndex) {
  const pointCalculation = calculatePoints(result, tournament);

  return {
    season: String(result.season || "").trim(),
    tournamentId: String(result.tournament_id || "").trim(),
    name: String(tournament?.name || result.tournament_id || "").trim(),
    date: normalizeDate(tournament?.date),
    bracket: String(result.bracket || "").trim(),
    points: pointCalculation.points,
    pointsFormula: pointCalculation.formula,
    total_teams: numberFor(tournament?.total_teams),
    finish: String(result.finish || "").trim(),
    notes: String(result.Notes || "").trim(),
    team: buildTeam(team, playerIndex)
  };
}

function buildPlayerSummary(player, results, tournamentIndex, teamsByTournament, playerIndex) {
  const usavMemberId = String(player.usav_member_id || "").trim();
  const playerResults = results
    .filter((result) => String(result.usav_member_id || "").trim() === usavMemberId)
    .map((result) => buildTournamentResult(
      result,
      tournamentIndex.get(tournamentKey(result)),
      findTeamForResult(result, usavMemberId, teamsByTournament),
      playerIndex
    ))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.name).localeCompare(String(b.name)));

  const totalPoints = playerResults.reduce((sum, result) => sum + result.points, 0);

  return {
    usavMemberId,
    name: String(player.display_name || "").trim(),
    gender: String(player.gender || "").trim(),
    active: String(player.active || "").trim(),
    totalPoints,
    tournamentsPlayed: playerResults.length,
    results: playerResults
  };
}


async function fetchSheetPayload() {
  const now = Date.now();
  if (cachedSheetPayload && now - cachedSheetPayloadAt < SHEET_CACHE_TTL_MS) {
    return cachedSheetPayload;
  }

  if (pendingSheetPayload) {
    return pendingSheetPayload;
  }

  pendingSheetPayload = fetch(RESULTS_URL)
    .then((response) => {
      if (!response.ok) {
        throw new Error(`Failed to fetch player results: ${response.status}`);
      }
      return response.json();
    })
    .then((payload) => {
      cachedSheetPayload = payload;
      cachedSheetPayloadAt = Date.now();
      return payload;
    })
    .finally(() => {
      pendingSheetPayload = null;
    });

  return pendingSheetPayload;
}
function buildPlayerSummaries(payload, season) {
  const { players, tournaments, results, teams } = normalizePayload(payload);
  const seasonResults = results.filter((result) => String(result.season || "").trim() === season);
  const tournamentIndex = indexTournaments(tournaments);
  const teamsByTournament = groupTeamsByTournament(teams);
  const playerIndex = indexPlayers(players);

  return players
    .filter((player) => String(player.usav_member_id || "").trim())
    .map((player) => buildPlayerSummary(player, seasonResults, tournamentIndex, teamsByTournament, playerIndex))
    .filter((player) => player.tournamentsPlayed > 0)
    .sort((a, b) => b.totalPoints - a.totalPoints || a.name.localeCompare(b.name));
}

export default async function handler(req, res) {
  setCorsHeaders(res);

  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET,OPTIONS");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  if (!RESULTS_URL) {
    res.status(500).json({ error: "Missing env var GS_PLAYER_RESULTS_URL or GS_PLAYER_POINTS_URL." });
    return;
  }

  try {
    const startedAt = Date.now();
    const payload = await fetchSheetPayload();
    const fetchedAt = Date.now();
    const season = requestedSeason(req);
    const players = buildPlayerSummaries(payload, season);
    const builtAt = Date.now();
    const usavMemberId = String(firstQueryValue(req.query.usavMemberId || req.query.id) || "").trim();

    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Server-Timing", `sheet;dur=${fetchedAt - startedAt}, build;dur=${builtAt - fetchedAt}`);

    if (!usavMemberId) {
      res.status(200).json({ season, players });
      return;
    }

    const player = players.find((item) => item.usavMemberId === usavMemberId);
    if (!player) {
      res.status(404).json({ error: "Player results not found.", usavMemberId });
      return;
    }

    res.status(200).json(player);
  } catch (error) {
    console.error("Player points error:", error);
    res.status(500).json({ error: error.message });
  }
}