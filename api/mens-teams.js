import {
  calculatePoints,
  createCachedSheetFetcher,
  firstQueryValue,
  indexTournaments,
  normalizeDate,
  numberFor,
  requestedSeason,
  setCorsHeaders,
  tournamentKey,
  unwrapSheet
} from "../lib/points-core.js";

const RESULTS_URL = process.env.GS_MENS_TEAM_POINTS_URL || process.env.GS_MENS_TEAMS_URL;
const SHEET_CACHE_TTL_MS = Number(process.env.TEAM_POINTS_CACHE_TTL_MS || 5 * 60 * 1000);
const GENDER_LABEL = "Men";

const fetchSheetPayload = createCachedSheetFetcher({
  url: RESULTS_URL,
  cacheTtlMs: SHEET_CACHE_TTL_MS,
  errorLabel: "men's team results"
});

function normalizePayload(payload) {
  if (Array.isArray(payload)) {
    throw new Error("Expected men's team points feed to include Teams, Tournaments, and Results arrays.");
  }

  return {
    teams: unwrapSheet(payload, "Teams"),
    tournaments: unwrapSheet(payload, "Tournaments"),
    results: unwrapSheet(payload, "Results")
  };
}

function teamNameFor(result) {
  return String(result.Team_name || result.team_name || result.teamName || "").trim();
}

function teamIdFor(row) {
  return String(row.team_id || row.teamId || "").trim();
}

function resultMatchesTeam(result, team) {
  const resultTeamId = teamIdFor(result);
  if (resultTeamId && resultTeamId === teamIdFor(team)) return true;
  return teamNameFor(result) === String(team.team_name || "").trim();
}

function teamRecordForName(teamName) {
  return {
    team_id: "",
    team_name: teamName,
    club: ""
  };
}

function buildTournamentResult(result, tournament) {
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
    notes: String(result.Notes || result.notes || "").trim()
  };
}

function buildTeamSummary(team, results, tournamentIndex) {
  const teamName = String(team.team_name || "").trim();
  const teamResults = results
    .filter((result) => resultMatchesTeam(result, team))
    .map((result) => buildTournamentResult(result, tournamentIndex.get(tournamentKey(result))))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.name).localeCompare(String(b.name)));

  const totalPoints = teamResults.reduce((sum, result) => sum + result.points, 0);

  return {
    teamId: teamIdFor(team),
    teamName,
    name: teamName,
    club: String(team.club || "").trim(),
    gender: GENDER_LABEL,
    totalPoints,
    tournamentsPlayed: teamResults.length,
    results: teamResults
  };
}

function buildTeamSummaries(payload, season) {
  const { teams, tournaments, results } = normalizePayload(payload);
  const seasonResults = results.filter((result) => String(result.season || "").trim() === season && teamNameFor(result));
  const tournamentIndex = indexTournaments(tournaments);
  const teamRecords = teams.length ? teams : [...new Set(seasonResults.map(teamNameFor))].map(teamRecordForName);

  return teamRecords
    .filter((team) => String(team.team_name || "").trim())
    .map((team) => buildTeamSummary(team, seasonResults, tournamentIndex))
    .filter((team) => team.tournamentsPlayed > 0)
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
    res.status(500).json({ error: "Missing env var GS_MENS_TEAM_POINTS_URL or GS_MENS_TEAMS_URL." });
    return;
  }

  try {
    const startedAt = Date.now();
    const payload = await fetchSheetPayload();
    const fetchedAt = Date.now();
    const season = requestedSeason(req);
    const teams = buildTeamSummaries(payload, season);
    const builtAt = Date.now();
    const requestedTeam = String(firstQueryValue(req.query.teamId || req.query.teamName || req.query.name || req.query.id) || "").trim();

    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Server-Timing", `sheet;dur=${fetchedAt - startedAt}, build;dur=${builtAt - fetchedAt}`);

    if (!requestedTeam) {
      res.status(200).json({ season, gender: GENDER_LABEL, teams });
      return;
    }

    const team = teams.find((item) => item.teamId === requestedTeam || item.teamName === requestedTeam);
    if (!team) {
      res.status(404).json({ error: "Team results not found.", team: requestedTeam });
      return;
    }

    res.status(200).json(team);
  } catch (error) {
    console.error("Men's team points error:", error);
    res.status(500).json({ error: error.message });
  }
}
