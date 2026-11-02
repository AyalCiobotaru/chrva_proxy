function showTournamentImportDialog() {
  const template =
    HtmlService.createTemplateFromFile(
      'Import-Dialog'
    );

  template.defaults = {
    trackerUrl: '',
    tournamentId: '',
    season: new Date().getFullYear(),
    date: Utilities.formatDate(
      new Date(),
      'America/New_York',
      'yyyy-MM-dd'
    ),
    name: '',
    status: 'Executed',
    template: '8 Teams',
  };

  SpreadsheetApp.getUi().showModalDialog(
    template
      .evaluate()
      .setWidth(520)
      .setHeight(680),
    'Import tournament'
  );
}

function previewTournamentFromDialog(form) {
  const config =
    buildImportConfigFromForm_(form);

  try {
    const plan = prepareImport_(config);

    return dialogResult_(plan, true);
  } catch (error) {
    const missing =
      parseMissingRosterPlayers_(error);

    if (missing) {
      return {
        needsRosterPlayers: true,
        missingPlayers: missing,
      };
    }

    throw error;
  }
}

function importTournamentFromDialog(
  form,
  replaceExisting
) {
  const config =
    buildImportConfigFromForm_(form);

  const plan = prepareImport_(config);

  applyImport_(
    plan,
    Boolean(replaceExisting)
  );

  return dialogResult_(plan, false);
}

function buildImportConfigFromForm_(form) {
  form = form || {};

  const templateName = String(
    form.template || ''
  ).trim();

  const template =
    getTemplate_(templateName);

  const tournamentId = String(
    form.tournamentId || ''
  ).trim();

  const name = String(
    form.name || ''
  ).trim();

  const status = String(
    form.status || ''
  ).trim();

  const season = Number(form.season);

  const dateText = String(
    form.date || ''
  ).trim();

  if (
    !tournamentId ||
    !/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(
      tournamentId
    )
  ) {
    throw new Error(
      'Tournament ID may contain letters, numbers, hyphens, and underscores only.'
    );
  }

  if (
    !Number.isInteger(season) ||
    season < 2000 ||
    season > 2100
  ) {
    throw new Error(
      'Enter a valid four-digit season.'
    );
  }

  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(
      dateText
    )
  ) {
    throw new Error(
      'Enter the tournament date.'
    );
  }

  const date = new Date(
    dateText + 'T12:00:00-04:00'
  );

  if (isNaN(date.getTime())) {
    throw new Error(
      'Enter a valid tournament date.'
    );
  }

  if (!name) {
    throw new Error(
      'Enter the tournament name.'
    );
  }

  if (!status) {
    throw new Error(
      'Enter the tournament status.'
    );
  }

  return {
    destinationSpreadsheetId:
      REVCO_IMPORT_CONFIG
        .destinationSpreadsheetId,

    sourceFileId:
      parseSpreadsheetId_(
        form.trackerUrl
      ),

    tournament: {
      tournamentId: tournamentId,
      season: season,
      date: date,
      name: name,
      status: status,
      totalTeams: template.totalTeams,
    },

    template: templateName,
  };
}

function parseSpreadsheetId_(value) {
  const text = String(
    value || ''
  ).trim();

  const urlMatch = text.match(
    /\/spreadsheets\/d\/([A-Za-z0-9_-]+)/
  );

  const id = urlMatch
    ? urlMatch[1]
    : text;

  if (
    !/^[A-Za-z0-9_-]{20,}$/.test(id)
  ) {
    throw new Error(
      'Paste a valid Google Sheets tracker URL or spreadsheet ID.'
    );
  }

  return id;
}

function dialogResult_(plan, preview) {
  return {
    summary:
      formatImportSummary_(
        plan,
        preview
      ),

    tournamentId:
      plan.tournament.tournamentId,

    season:
      plan.tournament.season,

    teamCount:
      plan.teams.length,

    resultCount:
      plan.results.length,

    playerCount:
      (plan.playersToAdd || []).length,
  };
}

function parseMissingRosterPlayers_(
  error
) {
  const message =
    error && error.message
      ? String(error.message)
      : String(error || '');

  const marker =
    'MISSING_ROSTER_PLAYERS:';

  const index =
    message.indexOf(marker);

  if (index < 0) {
    return null;
  }

  try {
    return JSON.parse(
      message.slice(
        index + marker.length
      )
    );
  } catch (parseError) {
    throw new Error(
      'Could not read the missing-player details.'
    );
  }
}