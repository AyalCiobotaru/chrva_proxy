const REVCO_ROSTER_DB_ID =
  '163KRvuAwLEnsrAMUmMGL0uBrfiDXzBNBwvv7MgWLbTs';

function resolveRosterPlayerReferences_(
  destination,
  teams,
  sourceSpreadsheet
) {
  if (Array.isArray(destination) && teams == null) {
    teams = destination;
    destination = SpreadsheetApp.openById(
      REVCO_IMPORT_CONFIG.destinationSpreadsheetId
    );
  }

  if (!Array.isArray(teams)) {
    throw new Error(
      'Roster resolution requires a teams array. ' +
        'Run Preview or Import from the CHRVA menu.'
    );
  }

  const standingsRows =
    readStandingsPlayerRows_(destination);
  const standingsByName =
    indexPlayerIdsByName_(standingsRows, 1, 0);

  const db = SpreadsheetApp.openById(
    REVCO_ROSTER_DB_ID
  );
  const source = requireSheet_(db, 'Players');
  const sourceRows = readRosterDbPlayerRows_(source);
  const rosterDbByName =
    indexPlayerIdsByName_(sourceRows, 0, 2);
  const missingByName = new Map();

  const resolvedTeams = teams.map(function(team) {
    return Object.assign({}, team, {
      playerIds: team.playerIds.map(function(value, index) {
        const reference = rosterPlayerText_(value);

        if (/^\d+$/.test(reference) || !reference) {
          return reference;
        }

        const rosterDbName =
          toRosterDbPlayerName_(reference);
        const standingsMatches =
          mergePlayerIdMatches_(
            standingsByName.get(
              normalizeRosterPlayerName_(reference)
            ),
            standingsByName.get(
              normalizeRosterPlayerName_(rosterDbName)
            )
          );

        if (standingsMatches.size) {
          return requireSinglePlayerId_(
            standingsMatches,
            reference,
            team.teamName,
            'standings Players'
          );
        }

        const rosterDbMatches =
          rosterDbByName.get(
            normalizeRosterPlayerName_(rosterDbName)
          ) || new Set();

        if (!rosterDbMatches.size) {
          const key =
            normalizeRosterPlayerName_(rosterDbName);

          if (!missingByName.has(key)) {
            missingByName.set(key, {
              id: '',
              name: rosterDbName,
              originalName: reference,
              teamNames: new Set(),
              sourceSpreadsheetId: sourceSpreadsheet
                ? sourceSpreadsheet.getId()
                : '',
              sourceSheetName: 'Teams',
              sourceCells: new Set(),
              needsId: true,
            });
          }

          const missing = missingByName.get(key);
          missing.teamNames.add(team.teamName);

          if (
            team.playerCells &&
            team.playerCells[index]
          ) {
            missing.sourceCells.add(
              team.playerCells[index]
            );
          }

          return reference;
        }

        return requireSinglePlayerId_(
          rosterDbMatches,
          reference,
          team.teamName,
          'Roster DB'
        );
      }),
    });
  });

  if (missingByName.size) {
    const details = Array.from(
      missingByName.values()
    ).map(function(player) {
      return {
        id: player.id,
        name: player.name,
        originalName: player.originalName,
        teamName: Array.from(
          player.teamNames
        ).join(', '),
        sourceSpreadsheetId:
          player.sourceSpreadsheetId,
        sourceSheetName:
          player.sourceSheetName,
        sourceCells: Array.from(
          player.sourceCells
        ),
        needsId: player.needsId,
      };
    });

    throw new Error(
      'MISSING_ROSTER_PLAYERS:' +
        JSON.stringify(details)
    );
  }

  return resolvedTeams;
}

function playerImportRows_(destination, teams) {
  const target = requireSheet_(destination, 'Players');
  const expected = [
    'usav_member_id',
    'display_name',
    'gender',
    'active',
  ];

  const headers = target
    .getRange(1, 1, 1, 4)
    .getDisplayValues()[0];

  if (headers.join('|') !== expected.join('|')) {
    throw new Error(
      'Players headers must be: ' + expected.join(', ')
    );
  }

  const db = SpreadsheetApp.openById(REVCO_ROSTER_DB_ID);
  const source = requireSheet_(db, 'Players');

  const sourceRows = readRosterDbPlayerRows_(source);

  const existingRows =
    target.getLastRow() < 2
      ? []
      : target
          .getRange(
            2,
            1,
            target.getLastRow() - 1,
            4
          )
          .getValues();

  return resolvePlayerImportRows_(
    teams,
    sourceRows,
    existingRows
  );
}

function readStandingsPlayerRows_(destination) {
  const sheet = requireSheet_(destination, 'Players');
  const expected = [
    'usav_member_id',
    'display_name',
    'gender',
    'active',
  ];
  const headers = sheet
    .getRange(1, 1, 1, expected.length)
    .getDisplayValues()[0];

  if (headers.join('|') !== expected.join('|')) {
    throw new Error(
      'Players headers must be: ' + expected.join(', ')
    );
  }

  return sheet.getLastRow() < 2
    ? []
    : sheet
        .getRange(
          2,
          1,
          sheet.getLastRow() - 1,
          expected.length
        )
        .getDisplayValues();
}

function readRosterDbPlayerRows_(source) {
  const sourceHeaders = source
    .getRange(1, 2, 1, 3)
    .getDisplayValues()[0];

  if (
    sourceHeaders.join('|') !==
    'Full Name|Gender|Id'
  ) {
    throw new Error(
      'Roster DB Players columns B:D must be Full Name, Gender, Id.'
    );
  }

  return source.getLastRow() < 2
    ? []
    : source
        .getRange(
          2,
          2,
          source.getLastRow() - 1,
          3
        )
        .getDisplayValues();
}

function indexPlayerIdsByName_(
  rows,
  nameIndex,
  idIndex
) {
  const index = new Map();

  rows.forEach(function(row) {
    const name = rosterPlayerText_(row[nameIndex]);
    const id = rosterPlayerText_(row[idIndex]);

    if (!name || !/^\d+$/.test(id)) return;

    const key = normalizeRosterPlayerName_(name);

    if (!index.has(key)) {
      index.set(key, new Set());
    }

    index.get(key).add(id);
  });

  return index;
}

function mergePlayerIdMatches_() {
  const matches = new Set();

  Array.prototype.forEach.call(
    arguments,
    function(ids) {
      if (!ids) return;
      ids.forEach(function(id) {
        matches.add(id);
      });
    }
  );

  return matches;
}

function requireSinglePlayerId_(
  matches,
  reference,
  teamName,
  sourceName
) {
  if (matches.size > 1) {
    throw new Error(
      'Player name on ' + teamName +
        ' matches multiple IDs in ' + sourceName +
        ': ' + reference + ' (' +
        Array.from(matches).join(', ') + ')'
    );
  }

  return Array.from(matches)[0];
}

function rosterPlayerText_(value) {
  return String(value == null ? '' : value).trim();
}

function normalizeRosterPlayerName_(value) {
  return rosterPlayerText_(value)
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function toRosterDbPlayerName_(value) {
  const name = rosterPlayerText_(value)
    .replace(/\s+/g, ' ');

  if (name.indexOf(',') >= 0) return name;

  const parts = name.split(' ');

  if (parts.length < 2) return name;

  const lastName = parts.pop();
  return lastName + ', ' + parts.join(' ');
}

function resolvePlayerImportRows_(
  teams,
  sourceRows,
  existingRows
) {
  const text = function(value) {
    return String(
      value == null ? '' : value
    ).trim();
  };

  const wanted = new Map();

  teams.forEach(function(team) {
    team.playerIds.forEach(function(value) {
      const id = text(value);

      if (!/^\d+$/.test(id)) {
        throw new Error(
          'Invalid USAV ID on ' + team.teamName
        );
      }

      wanted.set(id, team.teamName);
    });
  });

  const existing = new Set();

  existingRows.forEach(function(row) {
    const id = text(row[0]);

    if (!id) {
      return;
    }

    if (existing.has(id)) {
      throw new Error(
        'Duplicate ID in standings Players: ' + id
      );
    }

    existing.add(id);
  });

  const found = new Map();

  sourceRows.forEach(function(row) {
    const id = text(row[2]);

    if (!wanted.has(id)) {
      return;
    }

    if (found.has(id)) {
      throw new Error(
        'Duplicate ID in Roster DB: ' + id
      );
    }

    const name = text(row[0]);
    const rawGender = text(row[1]).toUpperCase();

    const gender =
      {
        MALE: 'M',
        FEMALE: 'F',
      }[rawGender] || rawGender;

    if (
      !name ||
      !['M', 'F'].includes(gender)
    ) {
      throw new Error(
        'Missing name or unsupported gender in Roster DB for ID ' +
          id
      );
    }

    found.set(id, [
      id,
      name,
      gender,
      'Y',
    ]);
  });

  const missing = Array.from(
    wanted.keys()
  ).filter(function(id) {
    return !found.has(id);
  });

  if (missing.length) {
    const details = missing.map(function(id) {
      return {
        id: id,
        teamName: wanted.get(id),
      };
    });

    throw new Error(
      'MISSING_ROSTER_PLAYERS:' +
        JSON.stringify(details)
    );
  }

  return Array.from(wanted.keys())
    .filter(function(id) {
      return !existing.has(id);
    })
    .map(function(id) {
      return found.get(id);
    });
}

function addMissingRosterPlayers(players) {
  if (
    !Array.isArray(players) ||
    !players.length
  ) {
    throw new Error(
      'No missing players were submitted.'
    );
  }

  const cleaned = players.map(function(player) {
    const id = String(
      player.id || ''
    ).trim();

    const name = toRosterDbPlayerName_(
      player.name || ''
    );

    const gender = String(
      player.gender || ''
    )
      .trim()
      .toUpperCase();

    if (!/^\d+$/.test(id)) {
      throw new Error(
        'Invalid CHRVA Member ID: ' + id
      );
    }

    if (!name) {
      throw new Error(
        'Enter a full name for ID ' + id + '.'
      );
    }

    if (!['M', 'F'].includes(gender)) {
      throw new Error(
        'Select a gender for ID ' + id + '.'
      );
    }

    const originalName = rosterPlayerText_(
      player.originalName || ''
    );
    const sourceSpreadsheetId = String(
      player.sourceSpreadsheetId || ''
    ).trim();
    const sourceSheetName = String(
      player.sourceSheetName || ''
    ).trim();
    const sourceCells = Array.isArray(
      player.sourceCells
    )
      ? player.sourceCells.map(function(cell) {
          return String(cell || '').trim();
        })
      : [];

    if (
      sourceSpreadsheetId &&
      !/^[A-Za-z0-9_-]{20,}$/.test(
        sourceSpreadsheetId
      )
    ) {
      throw new Error(
        'Invalid source spreadsheet for ' + name + '.'
      );
    }

    if (
      sourceCells.some(function(cell) {
        return !/^[A-Z]+[2-5]$/.test(cell);
      })
    ) {
      throw new Error(
        'Invalid source cell for ' + name + '.'
      );
    }

    return {
      id: id,
      name: name,
      gender: gender,
      originalName: originalName,
      sourceSpreadsheetId: sourceSpreadsheetId,
      sourceSheetName: sourceSheetName,
      sourceCells: sourceCells,
    };
  });

  const submittedIds = new Set();

  cleaned.forEach(function(player) {
    if (submittedIds.has(player.id)) {
      throw new Error(
        'Duplicate submitted ID: ' + player.id
      );
    }

    submittedIds.add(player.id);
  });

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    const db = SpreadsheetApp.openById(
      REVCO_ROSTER_DB_ID
    );

    const sheet = requireSheet_(
      db,
      'Players'
    );

    const headers = sheet
      .getRange(1, 2, 1, 3)
      .getDisplayValues()[0];

    if (
      headers.join('|') !==
      'Full Name|Gender|Id'
    ) {
      throw new Error(
        'Roster DB Players columns B:D must be Full Name, Gender, Id.'
      );
    }

    const existingIds = new Set();
    const existingByName = new Map();

    if (sheet.getLastRow() >= 2) {
      sheet
        .getRange(
          2,
          2,
          sheet.getLastRow() - 1,
          3
        )
        .getDisplayValues()
        .forEach(function(row) {
          const name = rosterPlayerText_(row[0]);
          const id = rosterPlayerText_(row[2]);

          if (id) {
            existingIds.add(id);
          }

          if (!name || !/^\d+$/.test(id)) {
            return;
          }

          const key =
            normalizeRosterPlayerName_(name);

          if (!existingByName.has(key)) {
            existingByName.set(key, new Map());
          }

          existingByName.get(key).set(id, name);
        });
    }

    cleaned.forEach(function(player) {
      const matches = existingByName.get(
        normalizeRosterPlayerName_(player.name)
      );

      if (!matches || !matches.size) return;

      if (matches.size > 1) {
        throw new Error(
          'The corrected name matches multiple Roster DB IDs: ' +
            player.name + ' (' +
            Array.from(matches.keys()).join(', ') + ')'
        );
      }

      player.existingRosterId =
        Array.from(matches.keys())[0];
      player.name =
        matches.get(player.existingRosterId);
    });

    const conflicts = cleaned.filter(
      function(player) {
        return (
          !player.existingRosterId &&
          existingIds.has(player.id)
        );
      }
    );

    if (conflicts.length) {
      throw new Error(
        'These IDs were added to the roster while the form was open: ' +
          conflicts
            .map(function(player) {
              return player.id;
            })
            .join(', ') +
          '. Close the player popup and preview again.'
      );
    }

    cleaned.forEach(function(player) {
      if (
        !player.sourceSpreadsheetId ||
        !player.sourceCells.length ||
        normalizeRosterPlayerName_(
          player.originalName
        ) === normalizeRosterPlayerName_(
          player.name
        )
      ) {
        return;
      }

      if (player.sourceSheetName !== 'Teams') {
        throw new Error(
          'Invalid source sheet for ' +
            player.name + '.'
        );
      }

      const sourceFile = SpreadsheetApp.openById(
        player.sourceSpreadsheetId
      );
      const sourceSheet = requireSheet_(
        sourceFile,
        player.sourceSheetName
      );

      player.sourceCells.forEach(function(cell) {
        sourceSheet.getRange(cell).setValue(
          player.name
        );
      });
    });

    const rows = cleaned
      .filter(function(player) {
        return !player.existingRosterId;
      })
      .map(function(player) {
        return [
          player.name,
          player.gender === 'M'
            ? 'Male'
            : 'Female',
          player.id,
        ];
      });

    if (rows.length) {
      sheet
        .getRange(
          sheet.getLastRow() + 1,
          2,
          rows.length,
          3
        )
        .setValues(rows);
    }

    return {
      added: rows.length,
      matchedExisting:
        cleaned.length - rows.length,
    };
  } finally {
    lock.releaseLock();
  }
}

function syncPlayersForCurrentTournament() {
  const lock =
    LockService.getDocumentLock();

  if (!lock) {
    throw new Error(
      'Run this inside RevCo Standings.'
    );
  }

  lock.waitLock(30000);

  let added = 0;

  try {
    const config = REVCO_IMPORT_CONFIG;

    const destination =
      SpreadsheetApp.openById(
        config.destinationSpreadsheetId
      );

    validateDestination_(destination);

    const sheet =
      destination.getSheetByName('Teams');

    const rows =
      sheet.getLastRow() < 2
        ? []
        : sheet
            .getRange(
              2,
              1,
              sheet.getLastRow() - 1,
              8
            )
            .getValues();

    const teams = rows
      .filter(function(row) {
        return (
          String(row[0]) ===
            config.tournament.tournamentId &&
          Number(row[1]) ===
            Number(
              config.tournament.season
            )
        );
      })
      .map(function(row) {
        return {
          teamName: String(row[3]),
          playerIds: row.slice(4, 8),
        };
      });

    if (!teams.length) {
      throw new Error(
        'No imported teams found for this tournament.'
      );
    }

    const players =
      playerImportRows_(
        destination,
        teams
      );

    if (players.length) {
      Sheets.Spreadsheets.batchUpdate(
        {
          requests: [
            appendRequest_(
              destination.getSheetByName(
                'Players'
              ),
              players
            ),
          ],
        },
        destination.getId()
      );
    }

    added = players.length;
  } finally {
    lock.releaseLock();
  }

  SpreadsheetApp.getUi().alert(
    'Added ' +
      added +
      ' players. Existing player records were preserved.'
  );
}