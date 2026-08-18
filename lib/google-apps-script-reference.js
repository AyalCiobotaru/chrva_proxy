/*
 * Google Apps Script reference for CHRVA points feeds.
 *
 * This file is not used by the Node/Vercel runtime. It is kept in source
 * control so the Apps Script web app code can be copied into each Google Sheet
 * that backs the points endpoints.
 *
 * Deploy in Google Apps Script as a web app that executes as the owner and is
 * accessible to anyone with the URL. Put the deployed web app URL into the
 * matching Vercel environment variable:
 *
 * - Player points: GS_PLAYER_POINTS_URL
 * - Men's teams: GS_MENS_TEAM_POINTS_URL
 * - Women's teams: GS_WOMENS_TEAM_POINTS_URL
 */

const PLAYER_POINTS_TABS = ["Players", "Tournaments", "Results", "Teams"];
const TEAM_POINTS_TABS = ["Teams", "Tournaments", "Results"];

/*
 * Use this for the existing player points sheet.
 */
function doGetPlayerPoints() {
  return jsonResponse(readTabs(PLAYER_POINTS_TABS));
}

/*
 * Use this for the men's and women's team points sheets.
 *
 * Expected tabs:
 * - Teams: team_id, name, club, division
 * - Tournaments: season, tournament_id, name, date, total_teams
 * - Results: season, tournament_id, team_id, bracket, finish, Notes
 */
function doGetTeamPoints() {
  return jsonResponse(readTabs(TEAM_POINTS_TABS));
}

/*
 * Apps Script web apps must export a function named doGet. Copy one of these
 * wrappers into the sheet script and keep only the one that matches the sheet.
 */
function doGet() {
  return doGetTeamPoints();
  // return doGetPlayerPoints();
}

function readTabs(tabNames) {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  return tabNames.reduce((payload, tabName) => {
    payload[tabName] = readSheetRows(spreadsheet, tabName);
    return payload;
  }, {});
}

function readSheetRows(spreadsheet, tabName) {
  const sheet = spreadsheet.getSheetByName(tabName);
  if (!sheet) return [];

  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];

  const headers = values[0].map((header) => String(header || "").trim());
  return values.slice(1)
    .filter((row) => row.some((cell) => String(cell || "").trim()))
    .map((row) => rowToObject(headers, row));
}

function rowToObject(headers, row) {
  return headers.reduce((record, header, index) => {
    if (!header) return record;
    record[header] = normalizeCell(row[index]);
    return record;
  }, {});
}

function normalizeCell(value) {
  if (value instanceof Date) {
    return Utilities.formatDate(value, "UTC", "yyyy-MM-dd");
  }
  return value;
}

function jsonResponse(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

