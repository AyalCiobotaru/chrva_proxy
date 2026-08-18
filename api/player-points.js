import {
  calculatePoints,
  createCachedSheetFetcher,
  firstQueryValue,
  groupTeamsByTournament,
  indexPlayers,
  indexTournaments,
  normalizeDate,
  numberFor,
  requestedSeason,
  setCorsHeaders,
  teamPlayerIds,
  tournamentKey,
  unwrapSheet
} from "../lib/points-core.js";

const RESULTS_URL = process.env.GS_PLAYER_POINTS_URL || process.env.GS_PLAYER_RESULTS_URL;
const SHEET_CACHE_TTL_MS = Number(process.env.PLAYER_POINTS_CACHE_TTL_MS || 5 * 60 * 1000);

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
    notes: String(result.Notes || result.notes || "").trim(),
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

const fetchSheetPayload = createCachedSheetFetcher({
  url: RESULTS_URL,
  cacheTtlMs: SHEET_CACHE_TTL_MS,
  errorLabel: "player results"
});

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
