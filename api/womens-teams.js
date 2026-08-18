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

const RESULTS_URL = process.env.GS_WOMENS_TEAM_POINTS_URL || process.env.GS_WOMENS_TEAMS_URL;
const SHEET_CACHE_TTL_MS = Number(process.env.TEAM_POINTS_CACHE_TTL_MS || 5 * 60 * 1000);
const GENDER_LABEL = "Women";

const fetchSheetPayload = createCachedSheetFetcher({
  url: RESULTS_URL,
  cacheTtlMs: SHEET_CACHE_TTL_MS,
  errorLabel: "women's team results"
});

function normalizePayload(payload) {
  if (Array.isArray(payload)) {
    throw new Error("Expected women's team points feed to include Teams, Tournaments, and Results arrays.");
  }

  return {
    teams: unwrapSheet(payload, "Teams"),
    tournaments: unwrapSheet(payload, "Tournaments"),
    results: unwrapSheet(payload, "Results")
  };
}

function teamIdFor(row) {
  return String(row.team_id || "").trim();
}

function teamRecordName(team) {
  return String(team.name || "").trim();
}

function teamRecordClub(team) {
  return String(team.club || "").trim();
}

function teamRecordDivision(team) {
  return String(team.division || "").trim();
}

function resultMatchesTeam(result, team) {
  const resultTeamId = teamIdFor(result);
  return resultTeamId && resultTeamId === teamIdFor(team);
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
  const teamName = teamRecordName(team);
  const teamResults = results
    .filter((result) => resultMatchesTeam(result, team))
    .map((result) => buildTournamentResult(result, tournamentIndex.get(tournamentKey(result))))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.name).localeCompare(String(b.name)));

  const totalPoints = teamResults.reduce((sum, result) => sum + result.points, 0);

  return {
    teamId: teamIdFor(team),
    teamName,
    name: teamName,
    club: teamRecordClub(team),
    division: teamRecordDivision(team),
    gender: GENDER_LABEL,
    totalPoints,
    tournamentsPlayed: teamResults.length,
    results: teamResults
  };
}

function buildTeamSummaries(payload, season) {
  const { teams, tournaments, results } = normalizePayload(payload);
  const seasonResults = results.filter((result) => String(result.season || "").trim() === season && teamIdFor(result));
  const tournamentIndex = indexTournaments(tournaments);
  const teamRecords = teams;
  const summaries = teamRecords
    .filter((team) => teamRecordName(team))
    .map((team) => buildTeamSummary(team, seasonResults, tournamentIndex))
    .filter((team) => team.tournamentsPlayed > 0)
    .sort((a, b) => b.totalPoints - a.totalPoints || a.name.localeCompare(b.name));

  console.log("Team points rows:", {
    season,
    teams: teams.length,
    tournaments: tournaments.length,
    results: results.length,
    seasonResults: seasonResults.length,
    returnedTeams: summaries.length
  });

  return summaries;
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
    res.status(500).json({ error: "Missing env var GS_WOMENS_TEAM_POINTS_URL or GS_WOMENS_TEAMS_URL." });
    return;
  }

  try {
    const startedAt = Date.now();
    console.log("Env Script URL: " + RESULTS_URL);
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
    console.error("Women's team points error:", error);
    res.status(500).json({ error: error.message });
  }
}

