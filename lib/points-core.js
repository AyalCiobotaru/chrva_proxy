import fetch from "node-fetch";

export const ALLOWED_ORIGIN = "https://www.chrva.org";
export const DEFAULT_SEASON = "2026";
export const ALLOWED_SEASONS = new Set(["2026", "2027"]);

const TEAM_PLAYER_ID_COLUMNS = ["player1_id", "player2_id", "player3_id", "player4_id"];

export function setCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

export function firstQueryValue(value) {
  return Array.isArray(value) ? value[0] : value;
}

export function requestedSeason(req) {
  const season = String(firstQueryValue(req.query.season) || DEFAULT_SEASON).trim();
  if (!ALLOWED_SEASONS.has(season)) {
    throw new Error("season must be 2026 or 2027");
  }
  return season;
}

export function numberFor(value) {
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

export function calculatePoints(result, tournament) {
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

export function normalizeDate(value) {
  if (!value) return "";
  const raw = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw;
  return parsed.toISOString().slice(0, 10);
}

export function unwrapSheet(payload, key) {
  if (!payload || Array.isArray(payload)) return [];
  if (Array.isArray(payload[key])) return payload[key];

  const normalizedKey = key.toLowerCase();
  const matchingKey = Object.keys(payload).find((payloadKey) => payloadKey.toLowerCase() === normalizedKey);
  return matchingKey && Array.isArray(payload[matchingKey]) ? payload[matchingKey] : [];
}

export function tournamentKey(row) {
  return `${String(row.season || "").trim()}::${String(row.tournament_id || "").trim()}`;
}

export function indexTournaments(rows) {
  return new Map(rows.map((row) => [tournamentKey(row), row]).filter(([key]) => !key.endsWith("::")));
}

export function indexPlayers(rows) {
  return new Map(
    rows
      .map((row) => [String(row.usav_member_id || "").trim(), row])
      .filter(([usavMemberId]) => usavMemberId)
  );
}

export function groupTeamsByTournament(rows) {
  const grouped = new Map();

  for (const row of rows) {
    const key = tournamentKey(row);
    if (key.endsWith("::")) continue;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(row);
  }

  return grouped;
}

export function teamPlayerIds(team) {
  return TEAM_PLAYER_ID_COLUMNS.map((key) => String(team?.[key] || "").trim()).filter(Boolean);
}

export function createCachedSheetFetcher({ url, cacheTtlMs, errorLabel }) {
  let cachedSheetPayload = null;
  let cachedSheetPayloadAt = 0;
  let pendingSheetPayload = null;

  return async function fetchSheetPayload() {
    const now = Date.now();
    if (cachedSheetPayload && now - cachedSheetPayloadAt < cacheTtlMs) {
      return cachedSheetPayload;
    }

    if (pendingSheetPayload) {
      return pendingSheetPayload;
    }

    pendingSheetPayload = fetch(url)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Failed to fetch ${errorLabel}: ${response.status}`);
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
  };
}
