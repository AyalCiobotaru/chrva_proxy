const REVCO_IMPORT_CONFIG = Object.freeze({
  destinationSpreadsheetId:
    '1gAzoECDFywDmxSo_JXdBbdZRdPp4WY-kjxSyLjqyPGQ',

  // Change this for each completed tournament tracker.
  sourceFileId:
    '1MLvFXTe2qLTFGYxy1enmzwFtrHWsJylM5GK02ceqpMw',

  tournament: Object.freeze({
    tournamentId: 'Fall-Brawl-Fours',
    season: 2026,
    date: new Date('2026-09-26T12:00:00-04:00'),
    name: 'Fall Brawl Fours',
    status: 'Executed',
    totalTeams: 8,
  }),

  // Exact name of the selected tracker tab.
  template: '8 Teams',
});

const REVCO_HEADERS = Object.freeze({
  Tournaments: [
    'tournament_id',
    'season',
    'date',
    'name',
    'status',
    'total_teams',
  ],
  Results: [
    'tournament_id',
    'season',
    'team_id',
    'bracket',
    'finish',
    'Notes',
  ],
  Teams: [
    'tournament_id',
    'season',
    'team_id',
    'team_name',
    'player1_id',
    'player2_id',
    'player3_id',
    'player4_id',
  ],
});

const REVCO_TEMPLATES = Object.freeze({
  '3 Teams': {
    totalTeams: 3,
    brackets: [
      threeTeamBracket_(
        'gold',
        'C17', 'E17',
        'C22', 'E22',
        'G15', 'K15',
        'G20', 'K20'
      ),
    ],
  },

  '4 Teams': {
    totalTeams: 4,
    brackets: [
      threeTeamBracket_(
        'gold',
        'C18', 'E18',
        'C23', 'E23',
        'G16', 'K16',
        'G21', 'K21'
      ),
    ],
  },

  '5 Teams': {
    totalTeams: 5,
    brackets: [
      threeTeamBracket_(
        'gold',
        'C21', 'E21',
        'C26', 'E26',
        'G19', 'K19',
        'G24', 'K24'
      ),
    ],
  },

  '6 Teams': {
    totalTeams: 6,
    brackets: [
      threeTeamBracket_(
        'gold',
        'C26', 'E26',
        'C31', 'E31',
        'G24', 'K24',
        'G29', 'K29'
      ),
      threeTeamBracket_(
        'silver',
        'C39', 'E39',
        'C44', 'E44',
        'G37', 'K37',
        'G42', 'K42'
      ),
    ],
  },

  '7 Teams': {
    totalTeams: 7,
    brackets: [
      threeTeamBracket_(
        'gold',
        'C32', 'E32',
        'C37', 'E37',
        'G30', 'K30',
        'G35', 'K35'
      ),
      threeTeamBracket_(
        'silver',
        'C45', 'E45',
        'C50', 'E50',
        'G43', 'K43',
        'G48', 'K48'
      ),
    ],
  },

  '8 Teams': {
    totalTeams: 8,
    brackets: [
      fourTeamBracket_(
        'gold',
        matchCells_('C23', 'E23', 'C28', 'E28'),
        matchCells_('C31', 'E31', 'C36', 'E36'),
        matchCells_('G26', 'K26', 'G34', 'K34')
      ),
      twoTeamBracket_(
        'silver',
        'C42', 'E42',
        'C47', 'E47'
      ),
    ],
  },

  '10 Teams': {
    totalTeams: 10,
    brackets: [
      fourTeamBracket_(
        'gold',
        matchCells_('C31', 'E31', 'C36', 'E36'),
        matchCells_('C39', 'E39', 'C44', 'E44'),
        matchCells_('G34', 'K34', 'G42', 'K42')
      ),
      twoTeamBracket_(
        'silver',
        'C50', 'E50',
        'C55', 'E55'
      ),
    ],
  },

  '12 Teams': {
    totalTeams: 12,
    brackets: [
      sixTeamBracket_(
        'gold',
        matchCells_('C36', 'E36', 'C41', 'E41'),
        matchCells_('G33', 'L33', 'G39', 'L39'),
        matchCells_('C44', 'E44', 'C49', 'E49'),
        matchCells_('G47', 'L47', 'G53', 'L53'),
        matchCells_('M36', 'O36', 'M50', 'O50')
      ),
      threeTeamBracket_(
        'silver',
        'C62', 'E62',
        'C67', 'E67',
        'G60', 'K60',
        'G65', 'K65'
      ),
    ],
  },
});

function onOpen() {
  addRevCoMenu();
}

function matchCells_(team1, score1, team2, score2) {
  return { team1, score1, team2, score2 };
}

function twoTeamBracket_(bracket, team1, score1, team2, score2) {
  return {
    bracket,
    format: 'two',
    final: matchCells_(team1, score1, team2, score2),
  };
}

function threeTeamBracket_(
  bracket,
  team1,
  score1,
  team2,
  score2,
  finalTeam1,
  finalScore1,
  finalTeam2,
  finalScore2
) {
  return {
    bracket,
    format: 'three',
    opening: matchCells_(team1, score1, team2, score2),
    final: matchCells_(
      finalTeam1,
      finalScore1,
      finalTeam2,
      finalScore2
    ),
  };
}

function fourTeamBracket_(
  bracket,
  semifinal1,
  semifinal2,
  final
) {
  return {
    bracket,
    format: 'four',
    semifinal1,
    semifinal2,
    final,
  };
}

function sixTeamBracket_(
  bracket,
  quarterfinal1,
  semifinal1,
  quarterfinal2,
  semifinal2,
  final
) {
  return {
    bracket,
    format: 'six',
    quarterfinal1,
    semifinal1,
    quarterfinal2,
    semifinal2,
    final,
  };
}

function addRevCoMenu() {
  SpreadsheetApp.getUi()
    .createMenu('CHRVA')
    .addItem('Import tournament...', 'showTournamentImportDialog')
    .addSeparator()
    .addItem(
      'Sync players for configured tournament',
      'syncPlayersForCurrentTournament'
    )
    .addToUi();
}

function previewTournamentImport() {
  const plan = prepareImport_(REVCO_IMPORT_CONFIG);
  SpreadsheetApp.getUi().alert(
    formatImportSummary_(plan, true)
  );
  return plan;
}

function importTournament() {
  const plan = prepareImport_(REVCO_IMPORT_CONFIG);
  applyImport_(plan, false);
  SpreadsheetApp.getUi().alert(
    formatImportSummary_(plan, false)
  );
}

function replaceTournamentImport() {
  const config = REVCO_IMPORT_CONFIG;
  const ui = SpreadsheetApp.getUi();

  const response = ui.alert(
    'Replace tournament import?',
    'Existing Teams and Results rows for ' +
      config.tournament.tournamentId +
      ' / ' +
      config.tournament.season +
      ' will be replaced.',
    ui.ButtonSet.YES_NO
  );

  if (response !== ui.Button.YES) return;

  const plan = prepareImport_(config);
  applyImport_(plan, true);
  ui.alert(formatImportSummary_(plan, false));
}

// Compatibility with the earlier menu names.
function previewFallBrawlImport() {
  return previewTournamentImport();
}

function importFallBrawl() {
  return importTournament();
}

function replaceFallBrawlImport() {
  return replaceTournamentImport();
}

function prepareImport_(config) {
  const destination = SpreadsheetApp.openById(
    config.destinationSpreadsheetId
  );
  validateDestination_(destination);

  const source = SpreadsheetApp.openById(config.sourceFileId);
  const template = getTemplate_(config.template);

  if (
    Number(config.tournament.totalTeams) !==
    template.totalTeams
  ) {
    throw new Error(
      `Template ${config.template} requires ` +
      `${template.totalTeams} teams.`
    );
  }

  const roster = resolveRosterPlayerReferences_(
    destination,
    readRoster_(source, 'Teams'),
    source
  );
  const outcomes = readTemplateOutcomes_(
    source,
    config.template,
    template,
    roster
  );

  const plan = buildImportPlan_(
    config.tournament,
    roster,
    outcomes
  );

  validateImportPlan_(plan);
  validateTournamentMetadata_(
    destination,
    plan.tournament
  );

  plan.playersToAdd = playerImportRows_(
    destination,
    plan.teams
  );

  return plan;
}

function getTemplate_(name) {
  if (name === '9 Teams (Beta)') {
    throw new Error(
      '9 Teams (Beta) is not supported.'
    );
  }

  if (REVCO_TEMPLATES[name]) {
    return REVCO_TEMPLATES[name];
  }

  throw new Error(
    `Unsupported tracker template: ${name}`
  );
}

function readRoster_(source, rosterSheetName) {
  const sheet = requireSheet_(source, rosterSheetName);
  const lastColumn = sheet.getLastColumn();

  if (!lastColumn) {
    throw new Error(
      `No teams found on ${rosterSheetName}.`
    );
  }

  if (sheet.getLastRow() > 5) {
    throw new Error(
      'Expected exactly four roster rows below the team names.'
    );
  }

  const values = sheet
    .getRange(1, 1, 5, lastColumn)
    .getDisplayValues();

  const teams = [];

  for (
    let column = 0;
    column < lastColumn;
    column += 1
  ) {
    const teamName = cleanTeamName_(
      values[0][column]
    );

    const playerIds = values
      .slice(1, 5)
      .map(row => String(row[column]).trim());

    if (!teamName) {
      if (playerIds.some(Boolean)) {
        throw new Error(
          'Member IDs found below an empty team name.'
        );
      }
      continue;
    }

    teams.push({
      teamName,
      normalizedName: normalizeTeamName_(teamName),
      playerIds,
      playerCells: playerIds.map(
        (value, index) =>
          sheet
            .getRange(index + 2, column + 1)
            .getA1Notation()
      ),
    });
  }

  return teams;
}

function readTemplateOutcomes_(
  source,
  sheetName,
  template,
  roster
) {
  const sheet = requireSheet_(source, sheetName);
  const rosterByName = indexRosterByName_(roster);

  if (roster.length !== template.totalTeams) {
    throw new Error(
      `${sheetName} requires ` +
      `${template.totalTeams} roster teams.`
    );
  }

  return {
    placements: template.brackets.flatMap(config =>
      readBracketPlacements_(
        sheet,
        config,
        rosterByName
      )
    ),
  };
}

function readBracketPlacements_(
  sheet,
  config,
  rosterByName
) {
  if (config.format === 'two') {
    const final = readMatch_(
      sheet,
      config.final,
      rosterByName
    );

    return placementsForFinal_(
      config.bracket,
      final
    );
  }

  if (config.format === 'three') {
    const opening = readMatch_(
      sheet,
      config.opening,
      rosterByName
    );

    const final = readMatch_(
      sheet,
      config.final,
      rosterByName
    );

    requireAdvancers_(
      `${config.bracket} final`,
      final,
      [opening.winner],
      1
    );

    return placementsForFinal_(
      config.bracket,
      final
    ).concat([
      {
        team: opening.loser,
        bracket: config.bracket,
        finish: 3,
      },
    ]);
  }

  if (config.format === 'four') {
    const semifinal1 = readMatch_(
      sheet,
      config.semifinal1,
      rosterByName
    );

    const semifinal2 = readMatch_(
      sheet,
      config.semifinal2,
      rosterByName
    );

    const final = readMatch_(
      sheet,
      config.final,
      rosterByName
    );

    requireAdvancers_(
      `${config.bracket} final`,
      final,
      [semifinal1.winner, semifinal2.winner],
      2
    );

    return placementsForFinal_(
      config.bracket,
      final
    ).concat([
      {
        team: semifinal1.loser,
        bracket: config.bracket,
        finish: 3,
      },
      {
        team: semifinal2.loser,
        bracket: config.bracket,
        finish: 3,
      },
    ]);
  }

  if (config.format === 'six') {
    const quarterfinal1 = readMatch_(
      sheet,
      config.quarterfinal1,
      rosterByName
    );

    const semifinal1 = readMatch_(
      sheet,
      config.semifinal1,
      rosterByName
    );

    requireAdvancers_(
      `${config.bracket} semifinal 1`,
      semifinal1,
      [quarterfinal1.winner],
      1
    );

    const quarterfinal2 = readMatch_(
      sheet,
      config.quarterfinal2,
      rosterByName
    );

    const semifinal2 = readMatch_(
      sheet,
      config.semifinal2,
      rosterByName
    );

    requireAdvancers_(
      `${config.bracket} semifinal 2`,
      semifinal2,
      [quarterfinal2.winner],
      1
    );

    const final = readMatch_(
      sheet,
      config.final,
      rosterByName
    );

    requireAdvancers_(
      `${config.bracket} final`,
      final,
      [semifinal1.winner, semifinal2.winner],
      2
    );

    return placementsForFinal_(
      config.bracket,
      final
    ).concat([
      {
        team: semifinal1.loser,
        bracket: config.bracket,
        finish: 3,
      },
      {
        team: semifinal2.loser,
        bracket: config.bracket,
        finish: 3,
      },
      {
        team: quarterfinal1.loser,
        bracket: config.bracket,
        finish: 5,
      },
      {
        team: quarterfinal2.loser,
        bracket: config.bracket,
        finish: 5,
      },
    ]);
  }

  throw new Error(
    `Unknown bracket format: ${config.format}`
  );
}

function placementsForFinal_(bracket, final) {
  return [
    {
      team: final.winner,
      bracket,
      finish: 1,
    },
    {
      team: final.loser,
      bracket,
      finish: 2,
    },
  ];
}

function requireAdvancers_(
  label,
  match,
  requiredTeams,
  exactMatches
) {
  const participants = new Set([
    match.winner.normalizedName,
    match.loser.normalizedName,
  ]);

  const count = requiredTeams.filter(team =>
    participants.has(team.normalizedName)
  ).length;

  if (count !== exactMatches) {
    throw new Error(
      `${label} participants disagree with ` +
      'earlier match scores.'
    );
  }
}

function readMatch_(sheet, match, rosterByName) {
  const team1 = resolveRosterTeam_(
    sheet.getRange(match.team1).getDisplayValue(),
    rosterByName
  );

  const team2 = resolveRosterTeam_(
    sheet.getRange(match.team2).getDisplayValue(),
    rosterByName
  );

  return decideMatch_(
    team1,
    readScore_(sheet, match.score1),
    team2,
    readScore_(sheet, match.score2),
    `${match.team1}/${match.team2}`
  );
}

function decideMatch_(
  team1,
  score1,
  team2,
  score2,
  label
) {
  if (
    team1.normalizedName ===
    team2.normalizedName
  ) {
    throw new Error(
      `${label}: repeated team.`
    );
  }

  const validScores = [score1, score2].every(
    score =>
      Number.isInteger(score) &&
      score >= 0
  );

  if (
    !validScores ||
    Math.max(score1, score2) !== 2 ||
    Math.min(score1, score2) >= 2
  ) {
    throw new Error(
      `${label} needs a completed ` +
      'best-of-three score (2-0 or 2-1).'
    );
  }

  return score1 > score2
    ? { winner: team1, loser: team2 }
    : { winner: team2, loser: team1 };
}

function readScore_(sheet, address) {
  const value = sheet.getRange(address).getValue();
  const score = Number(value);

  if (
    value === '' ||
    typeof value === 'boolean' ||
    !Number.isInteger(score) ||
    score < 0
  ) {
    throw new Error(
      `Missing or invalid score at ` +
      `${sheet.getName()}!${address}.`
    );
  }

  return score;
}

function buildImportPlan_(
  tournament,
  roster,
  outcomes
) {
  const orderedPlacements =
    outcomes.placements.slice();

  const playoffNames = new Set(
    orderedPlacements.map(
      entry => entry.team.normalizedName
    )
  );

  const dnmpFinish = playoffNames.size + 1;

  const dnmpPlacements = roster
    .filter(
      team =>
        !playoffNames.has(team.normalizedName)
    )
    .map(team => ({
      team,
      bracket: 'DNMP',
      finish: dnmpFinish,
    }));

  const placements =
    orderedPlacements.concat(dnmpPlacements);

  const teams = roster.map(team => ({
    tournamentId: tournament.tournamentId,
    season: tournament.season,
    teamId: makeTeamId_(
      tournament.tournamentId,
      team.teamName
    ),
    teamName: team.teamName,
    playerIds: team.playerIds.slice(),
  }));

  const teamsByName = new Map(
    teams.map(team => [
      normalizeTeamName_(team.teamName),
      team,
    ])
  );

  const results = placements.map(placement => ({
    tournamentId: tournament.tournamentId,
    season: tournament.season,
    teamId: teamsByName.get(
      placement.team.normalizedName
    ).teamId,
    bracket: placement.bracket,
    finish: placement.finish,
    notes: '',
  }));

  return {
    tournament: Object.assign({}, tournament),
    teams,
    results,
  };
}

function validateImportPlan_(plan) {
  if (
    plan.teams.length !==
    Number(plan.tournament.totalTeams)
  ) {
    throw new Error(
      `Tournament says ` +
      `${plan.tournament.totalTeams} teams, ` +
      `but the roster contains ` +
      `${plan.teams.length}.`
    );
  }

  if (plan.results.length !== plan.teams.length) {
    throw new Error(
      'Every team must have exactly one result row.'
    );
  }

  const teamIds = new Set();
  const playerIds = new Set();

  plan.teams.forEach(team => {
    if (teamIds.has(team.teamId)) {
      throw new Error(
        `Duplicate team_id: ${team.teamId}`
      );
    }

    teamIds.add(team.teamId);

    if (
      team.playerIds.length !== 4 ||
      team.playerIds.some(
        id => !/^\d+$/.test(id)
      )
    ) {
      throw new Error(
        `${team.teamName} must have ` +
        'four numeric USAV member IDs.'
      );
    }

    team.playerIds.forEach(id => {
      if (playerIds.has(id)) {
        throw new Error(
          `USAV member ${id} appears on ` +
          'more than one team.'
        );
      }
      playerIds.add(id);
    });
  });

  const resultTeamIds = new Set();

  plan.results.forEach(result => {
    if (!teamIds.has(result.teamId)) {
      throw new Error(
        `Unknown result team_id: ${result.teamId}`
      );
    }

    if (resultTeamIds.has(result.teamId)) {
      throw new Error(
        `Duplicate result for ${result.teamId}.`
      );
    }

    if (
      !['gold', 'silver', 'DNMP'].includes(
        result.bracket
      )
    ) {
      throw new Error(
        `Invalid bracket for ${result.teamId}: ` +
        result.bracket
      );
    }

    if (
      !Number.isInteger(result.finish) ||
      result.finish < 1 ||
      result.finish > plan.teams.length
    ) {
      throw new Error(
        `Invalid finish for ${result.teamId}: ` +
        result.finish
      );
    }

    resultTeamIds.add(result.teamId);
  });

  const playoffCount = plan.results.filter(
    result => result.bracket !== 'DNMP'
  ).length;

  const expectedDnmpFinish = playoffCount + 1;

  plan.results
    .filter(result => result.bracket === 'DNMP')
    .forEach(result => {
      if (result.finish !== expectedDnmpFinish) {
        throw new Error(
          `DNMP finish must be ` +
          `${expectedDnmpFinish}, ` +
          `not ${result.finish}.`
        );
      }
    });
}

function applyImport_(plan, replaceExisting) {
  validateImportPlan_(plan);

  const lock = LockService.getDocumentLock();

  if (!lock) {
    throw new Error(
      'Install this script inside RevCo Standings.'
    );
  }

  lock.waitLock(30000);

  try {
    const spreadsheet = SpreadsheetApp.openById(
      REVCO_IMPORT_CONFIG.destinationSpreadsheetId
    );

    validateDestination_(spreadsheet);

    validateTournamentMetadata_(
      spreadsheet,
      plan.tournament
    );

    const teamsSheet =
      spreadsheet.getSheetByName('Teams');

    const resultsSheet =
      spreadsheet.getSheetByName('Results');

    const existingTeams = findTournamentRows_(
      teamsSheet,
      plan.tournament
    );

    const existingResults = findTournamentRows_(
      resultsSheet,
      plan.tournament
    );

    if (
      !replaceExisting &&
      (
        existingTeams.length ||
        existingResults.length
      )
    ) {
      throw new Error(
        `Import already exists (` +
        `${existingTeams.length} Teams rows, ` +
        `${existingResults.length} Results rows).`
      );
    }

    const playersToAdd = playerImportRows_(
      spreadsheet,
      plan.teams
    );

    const requests = [];

    if (playersToAdd.length) {
      requests.push(
        appendRequest_(
          spreadsheet.getSheetByName('Players'),
          playersToAdd
        )
      );
    }

    if (replaceExisting) {
      [
        [teamsSheet, existingTeams],
        [resultsSheet, existingResults],
      ].forEach(([sheet, rows]) => {
        rows
          .slice()
          .sort((a, b) => b - a)
          .forEach(row => {
            requests.push({
              deleteDimension: {
                range: {
                  sheetId: sheet.getSheetId(),
                  dimension: 'ROWS',
                  startIndex: row - 1,
                  endIndex: row,
                },
              },
            });
          });
      });
    }

    const tournamentsSheet =
      spreadsheet.getSheetByName('Tournaments');

    if (
      !findTournamentRows_(
        tournamentsSheet,
        plan.tournament
      ).length
    ) {
      const tournament = plan.tournament;

      requests.push(
        appendRequest_(tournamentsSheet, [[
          tournament.tournamentId,
          tournament.season,
          tournament.date,
          tournament.name,
          tournament.status,
          tournament.totalTeams,
        ]])
      );
    }

    requests.push(
      appendRequest_(
        teamsSheet,
        plan.teams.map(teamToRow_)
      )
    );

    requests.push(
      appendRequest_(
        resultsSheet,
        plan.results.map(resultToRow_)
      )
    );

    Sheets.Spreadsheets.batchUpdate(
      { requests },
      spreadsheet.getId()
    );
  } finally {
    lock.releaseLock();
  }
}

function validateDestination_(spreadsheet) {
  Object.keys(REVCO_HEADERS).forEach(
    sheetName => {
      const sheet = requireSheet_(
        spreadsheet,
        sheetName
      );

      const expected =
        REVCO_HEADERS[sheetName];

      const actual = sheet
        .getRange(
          1,
          1,
          1,
          expected.length
        )
        .getDisplayValues()[0];

      if (
        actual.join('|') !==
        expected.join('|')
      ) {
        throw new Error(
          `${sheetName} headers must be: ` +
          expected.join(', ')
        );
      }
    }
  );
}

function validateTournamentMetadata_(
  spreadsheet,
  tournament
) {
  const sheet =
    spreadsheet.getSheetByName('Tournaments');

  const rows = sheet
    .getDataRange()
    .getValues()
    .slice(1);

  const matches = rows.filter(row =>
    String(row[0]) ===
      tournament.tournamentId &&
    Number(row[1]) ===
      Number(tournament.season)
  );

  if (matches.length > 1) {
    throw new Error(
      'Duplicate Tournaments rows for ' +
      'this tournament and season.'
    );
  }

  if (!matches.length) return;

  const match = matches[0];

  const existingDate =
    match[2] instanceof Date
      ? Utilities.formatDate(
          match[2],
          spreadsheet.getSpreadsheetTimeZone(),
          'yyyy-MM-dd'
        )
      : '';

  const configuredDate =
    Utilities.formatDate(
      tournament.date,
      'America/New_York',
      'yyyy-MM-dd'
    );

  if (
    existingDate !== configuredDate ||
    String(match[3]) !== tournament.name ||
    String(match[4]).toLowerCase() !==
      String(tournament.status).toLowerCase() ||
    Number(match[5]) !==
      Number(tournament.totalTeams)
  ) {
    throw new Error(
      'The existing Tournaments row conflicts ' +
      'with the import configuration.'
    );
  }
}

function findTournamentRows_(
  sheet,
  tournament
) {
  if (sheet.getLastRow() < 2) return [];

  const rows = sheet
    .getRange(
      2,
      1,
      sheet.getLastRow() - 1,
      2
    )
    .getValues();

  const matches = [];

  rows.forEach((row, index) => {
    if (
      String(row[0]) ===
        tournament.tournamentId &&
      Number(row[1]) ===
        Number(tournament.season)
    ) {
      matches.push(index + 2);
    }
  });

  return matches;
}

function appendRequest_(sheet, rows) {
  return {
    appendCells: {
      sheetId: sheet.getSheetId(),
      fields:
        'userEnteredValue,' +
        'userEnteredFormat.numberFormat',

      rows: rows.map(row => ({
        values: row.map(value => {
          if (value instanceof Date) {
            const day = Utilities.formatDate(
              value,
              'America/New_York',
              'yyyy-MM-dd'
            );

            return {
              userEnteredValue: {
                numberValue:
                  Date.parse(
                    day + 'T00:00:00Z'
                  ) /
                    86400000 +
                  25569,
              },
              userEnteredFormat: {
                numberFormat: {
                  type: 'DATE',
                  pattern: 'm/d/yyyy',
                },
              },
            };
          }

          return {
            userEnteredValue:
              typeof value === 'number'
                ? { numberValue: value }
                : {
                    stringValue:
                      String(value),
                  },
          };
        }),
      })),
    },
  };
}

function teamToRow_(team) {
  return [
    team.tournamentId,
    team.season,
    team.teamId,
    team.teamName,
  ].concat(team.playerIds);
}

function resultToRow_(result) {
  return [
    result.tournamentId,
    result.season,
    result.teamId,
    result.bracket,
    result.finish,
    result.notes,
  ];
}

function indexRosterByName_(roster) {
  const index = new Map();

  roster.forEach(team => {
    if (!team.normalizedName) {
      throw new Error(
        'A roster team has no name.'
      );
    }

    if (index.has(team.normalizedName)) {
      throw new Error(
        `Duplicate roster team: ${team.teamName}`
      );
    }

    index.set(team.normalizedName, team);
  });

  return index;
}

function resolveRosterTeam_(
  displayName,
  rosterByName
) {
  const normalized =
    normalizeTeamName_(displayName);

  const team = rosterByName.get(normalized);

  if (!team) {
    throw new Error(
      `Playoff team does not match ` +
      `the roster: ${displayName}`
    );
  }

  return team;
}

function cleanTeamName_(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ');
}

function normalizeTeamName_(value) {
  return cleanTeamName_(value)
    .replace(/\s*\([^)]*\)\s*$/, '')
    .replace(/[\u2018\u2019]/g, "'")
    .toLowerCase();
}

function makeTeamId_(
  tournamentId,
  teamName
) {
  const slug = normalizeTeamName_(teamName)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  return `${tournamentId}__${slug}`;
}

function requireSheet_(
  spreadsheet,
  sheetName
) {
  const sheet =
    spreadsheet.getSheetByName(sheetName);

  if (!sheet) {
    throw new Error(
      `Missing sheet: ${sheetName}`
    );
  }

  return sheet;
}

function formatImportSummary_(plan, preview) {
  const rows = plan.results
    .slice()
    .sort((a, b) => {
      if (a.bracket !== b.bracket) {
        return a.bracket.localeCompare(b.bracket);
      }
      return a.finish - b.finish;
    })
    .map(result => {
      const team = plan.teams.find(
        candidate =>
          candidate.teamId === result.teamId
      );

      return (
        `${result.bracket} ${result.finish}: ` +
        team.teamName
      );
    });

  return [
    preview
      ? 'Validation passed. Nothing was written.'
      : 'Tournament import completed.',
    `${plan.teams.length} team rows`,
    `${plan.results.length} result rows`,
    `${(plan.playersToAdd || []).length} new player rows`,
    '',
  ].concat(rows).join('\n');
}