/**
 * Google Apps Script for the Current Registrations spreadsheet.
 *
 * Add this code to Extensions > Apps Script in the spreadsheet. The simple
 * onEdit trigger runs automatically for manual spreadsheet edits.
 */
function onEdit(event) {
  if (!event || !event.range) return;

  const sheet = event.range.getSheet();
  if (sheet.getName() !== "Registrations" || event.range.getRow() < 2) return;

  const lastColumn = sheet.getLastColumn();
  const headers = sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0];
  const updatedAtColumn = headers.indexOf("updated_at") + 1;
  if (!updatedAtColumn) return;

  const editStartColumn = event.range.getColumn();
  const editEndColumn = event.range.getLastColumn();
  if (updatedAtColumn >= editStartColumn && updatedAtColumn <= editEndColumn) return;

  const trackedHeaders = ["team_name", "tournament_id", "division", "roster", "status", "published"];
  const trackedColumns = trackedHeaders
    .map((header) => headers.indexOf(header) + 1)
    .filter((column) => column > 0);
  const touchesTrackedColumn = trackedColumns.some(
    (column) => column >= editStartColumn && column <= editEndColumn
  );
  if (!touchesTrackedColumn) return;

  const firstRow = event.range.getRow();
  const rowCount = event.range.getNumRows();
  const timestampValues = [];

  for (let offset = 0; offset < rowCount; offset += 1) {
    const row = firstRow + offset;
    const trackedValues = trackedColumns.map(
      (column) => sheet.getRange(row, column).getValue()
    );
    const rowIsEmpty = trackedValues.every((value) => value === "" || value === null);
    timestampValues.push([rowIsEmpty ? "" : new Date()]);
  }

  const timestampRange = sheet.getRange(firstRow, updatedAtColumn, rowCount, 1);
  timestampRange.setValues(timestampValues);
  timestampRange.setNumberFormat("yyyy-mm-dd hh:mm:ss");
}
