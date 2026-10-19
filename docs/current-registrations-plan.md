# Current Registrations: Implementation Specification

Status: **Implemented locally — production configuration and deployment pending**  
Last updated: **October 14, 2026**

## Goal

Display current tournament registrations on the CHRVA website from a private Google Sheet.

- A URL containing an exact `event` filter shows one tournament and its current signups.
- A URL without an `event` filter shows collapsed tournament chips that visitors can expand independently.
- Registration data, including player names, is intentionally public.
- The feature follows the embedding pattern used by `html/Free_Agent.html`, while using a card interface built with plain HTML, CSS, and JavaScript.

## Deliverables

1. A Google spreadsheet with `Tournaments` and `Registrations` tabs. **Created.**
2. A Vercel endpoint at `/api/current-registrations` backed by `api/current-registrations.py`. **Implemented locally.**
3. An embeddable frontend fragment at `html/Current_Registrations.html`. **Implemented locally.**
4. A Google Apps Script that maintains `updated_at` on edited registration rows. **Implemented; installation pending.**
5. Setup documentation for sharing the sheet with the existing Google service account and configuring Vercel. **Added to `README.md`.**

## Spreadsheet schema

Column headers and tab names are exact and case-sensitive in the implementation.

### `Tournaments`

| Column | Required | Format and behavior |
| --- | --- | --- |
| `tournament_id` | Yes | Permanent public identifier containing lowercase letters, digits, and hyphens only |
| `tournament_name` | Yes | Public display name |
| `tournament_date` | Yes | Real Google Sheets date cell; emitted as `YYYY-MM-DD` |
| `format` | Yes | Dropdown restricted to `Mens`, `Womens`, or `RevCo 4s` |
| `published` | Yes | Google Sheets checkbox; only boolean `TRUE` publishes the tournament |

Tournament IDs must be unique. Changing a published ID breaks links that use the old ID.

### `Registrations`

| Column | Required | Format and behavior |
| --- | --- | --- |
| `team_name` | Yes | Public team name |
| `tournament_id` | Yes | Exact reference to an existing tournament ID |
| `division` | Yes | Dropdown restricted to `A/AA` or `B/BB` |
| `roster` | No | Public player names separated by line breaks |
| `status` | Yes | Dropdown restricted to `registered`, `waitlisted`, or `withdrawn` |
| `published` | Yes | Google Sheets checkbox; only boolean `TRUE` publishes the registration |
| `updated_at` | Generated | Administrative timestamp maintained by a later Apps Script; never returned publicly |

One row represents one team registered for one tournament. Editors enter data manually.

For duplicate detection, the endpoint combines `tournament_id` with a normalized team name. Normalization trims outer whitespace, collapses repeated internal whitespace, and compares case-insensitively. The original trimmed capitalization is used for display. If multiple rows have the same normalized key, all conflicting rows are omitted and logged.

The endpoint splits `roster` on line breaks, trims each name, and omits blank lines. It preserves capitalization, punctuation, order, and repeated names. A registration with no roster still appears, without a roster section.

## Configuration

- Read the spreadsheet ID from `REGISTRATIONS_SHEET_ID`.
- Reuse the existing `GOOGLE_SERVICE_ACCOUNT_JSON` credential.
- Share the spreadsheet as a viewer with the service account's `client_email`.
- Keep `Tournaments` and `Registrations` as endpoint constants.
- Do not reuse the roster workflow's `SHEET_ID` variable.
- Allow `https://www.chrva.org` as the production browser origin.
- Permit a configurable development origin for local work.

The endpoint must never send Google credentials or the spreadsheet ID to the browser.

## Endpoint behavior

The endpoint reads both tabs and constructs a fixed public response schema. It does not pass arbitrary sheet columns through to the client.

### Public filtering

Before building the response, the endpoint removes:

- unpublished tournaments;
- tournaments before the current `America/New_York` calendar date;
- unpublished registrations;
- withdrawn registrations;
- registrations with invalid or missing tournament references;
- invalid and conflicting records.

A tournament remains visible through its entire `tournament_date` in `America/New_York` and expires the following day. Published tournaments remain in the response when they have zero visible registrations.

The endpoint returns only `registered` and `waitlisted` statuses. It canonicalizes status values to lowercase after trimming and case-insensitive validation.

### Validation and failures

The endpoint omits an invalid record and logs a warning containing its tab and row number. Logs must not contain roster names.

Examples of invalid records include:

- missing required values;
- invalid or duplicate tournament IDs;
- invalid dates;
- unsupported statuses;
- duplicate team registrations;
- registrations referencing an unknown tournament.

A missing or malformed required tab, invalid server configuration, or Google Sheets failure causes a generic HTTP `500` response. When there are no current tournaments, the endpoint returns HTTP `200` with an empty `tournaments` array.

### Caching

Successful responses use HTTP cache headers for a five-minute cache. After cached data expires, an upstream failure produces an error rather than relying on persistent stale storage.

The response contains no generated or freshness timestamp.

### Response contract

```json
{
  "tournaments": [
    {
      "id": "2027-11-28-volley-banquet-bash-womens",
      "name": "Volley Banquet Bash",
      "date": "2027-11-28",
      "format": "Womens",
      "registrations": [
        {
          "teamName": "Example Team",
          "division": "A/AA",
          "status": "registered",
          "roster": [
            "Alex Example",
            "Jordan Example"
          ]
        }
      ]
    }
  ]
}
```

The endpoint does not accept an event filter. It returns the complete public current dataset. The browser applies the exact event match and display sorting.

## Frontend behavior

Use plain HTML, CSS, and JavaScript without jQuery, DataTables, or another external JavaScript library. Escape all sheet-provided values before inserting them into HTML.

### Unfiltered view

- Read the dataset from `/api/current-registrations`.
- Sort tournaments chronologically by date.
- Start with every tournament collapsed.
- Allow several tournaments to remain expanded at once.
- Show each chip's tournament name, formatted date, format, and counts.
- Use count text such as `8 teams · 2 waitlisted`.
- Omit the waitlist phrase when its count is zero.
- Use `1 team` and `1 waitlisted` for singular counts.
- Count only `registered` entries in the primary team count.
- Show published tournaments with no visible registrations as `0 teams`.
- When expanded, show an empty message for a tournament with no registrations.

### Filtered view

- Read the exact tournament ID from the `event` query parameter.
- Match it exactly against the returned public tournaments.
- Show the matching tournament heading, date, format, counts, and registrations.
- Do not show the tournament picker.
- Provide a clear-filter link built from the current URL by removing only `event`; preserve the current path and other query parameters.
- For an unknown, unpublished, or expired ID, show `This tournament is not available` and a link back to the unfiltered view.
- Do not reveal whether an unavailable tournament exists in the private sheet.

### Registration cards

- Sort teams alphabetically using a case-insensitive comparison.
- Render teams as compact cards in a responsive grid.
- Show the team name as the card heading.
- Show each team's division and a visible badge for waitlisted teams.
- Render roster names as a simple list in their manually entered order.
- Omit the roster area when the roster is empty.
- Allow the page to grow naturally without search or pagination in the first version.

### Page states

- Show a loading state while fetching.
- Show `No current tournament registrations are available` for a successful empty response.
- Show a clear generic failure message when the endpoint cannot be loaded.
- Keep unavailable-event messaging distinct from empty data and failures.

Date formatting uses `en-US` and preserves the `America/New_York` calendar date without UTC conversion shifting the displayed day.

## Accepted limitations

- Multi-day tournaments store only their first date. Because expiration uses that date, a multi-day tournament will disappear after its first day. Proper `start_date` and `end_date` support is deferred.
- Published tournament IDs have no aliases or redirects.
- Player entries contain names only.
- The public page has no authentication, editing, search, or pagination.
- Five-minute HTTP caching does not guarantee stale data during an extended Google Sheets outage.

## Verification plan

### Endpoint

- Valid published tournament with registered and waitlisted teams
- Published tournament with no registrations
- Unpublished, expired, and future tournaments
- Published, unpublished, withdrawn, and invalid registrations
- Missing roster and roster whitespace handling
- Duplicate tournament IDs and duplicate team registrations
- Invalid dates, statuses, identifiers, and tournament references
- Missing configuration, missing tabs, and Google Sheets failure
- Empty successful response
- CORS preflight and allowed production origin
- Five-minute cache headers
- No private columns, credentials, IDs, withdrawn rows, or administrative timestamps in responses

### Frontend

- Unfiltered collapsed list and independent expansion
- Exact valid event filter
- Unknown, unpublished, and expired event IDs
- Clear-filter URL behavior with other query parameters present
- Registered and waitlisted counts, including singular and zero states
- Alphabetical team sorting and preserved roster order
- Empty roster, empty tournament, empty dataset, and endpoint failure
- Mobile and desktop card layouts
- Keyboard operation, visible focus, and expanded-state accessibility
- Escaping of tournament, format, division, team, and player text
- Date display around UTC offsets and daylight-saving boundaries

## Implementation sequence

1. Create the spreadsheet and both tabs with headers, checkboxes, status validation, and date formatting.
2. Share it with the service account and configure `REGISTRATIONS_SHEET_ID`.
3. Implement endpoint parsing, validation, public filtering, CORS, and caching.
4. Add the Vercel rewrite for `/api/current-registrations`.
5. Implement the embeddable HTML fragment and all page states.
6. Run endpoint and browser verification with representative fixture data.
7. Deploy and verify the endpoint from `https://www.chrva.org`.
8. Embed the fragment on the CHRVA page and verify filtered links.
9. Create the follow-up Apps Script for `updated_at` and document how to install its edit trigger.

## Inputs needed during implementation or deployment

These do not block the completed local implementation:

- Configure `REGISTRATIONS_SHEET_ID` as `15nRU2qDZMgeMG2BIKUNk2KKi1AN5XSM_QqdSNsRRdwM`
- Share the new spreadsheet with the service account's `client_email`
- Install `lib/current-registrations-apps-script.js` in the spreadsheet's Apps Script project
- The development origin, if browser testing runs outside `www.chrva.org`
- The final SportsEngine page URL for production verification
- Access to the Vercel environment when production variables are configured

## Decision log

| Date | Decision | Reason |
| --- | --- | --- |
| 2026-10-14 | Use one registration row per team per tournament | Supports direct filtering and status changes |
| 2026-10-14 | Publish line-separated player names | Public player-name display is intentional and remains easy to edit |
| 2026-10-14 | Separate tournaments and registrations into two tabs | Prevents repeated tournament metadata from becoming inconsistent |
| 2026-10-14 | Use exact permanent IDs in the `event` parameter | Avoids ambiguous matching |
| 2026-10-14 | Filter private and unavailable data at the endpoint | Hidden browser content would still be publicly downloadable |
| 2026-10-14 | Use the existing service account with a separate sheet ID | Keeps the new sheet private without another Apps Script deployment |
| 2026-10-14 | Keep events visible through their stored tournament date | Matches the definition of current registrations |
| 2026-10-14 | Show registered and waitlisted teams | Waitlisted teams remain visible but do not count as registered teams |
| 2026-10-14 | Use dependency-free tournament chips and team cards | Fits nested roster data without a table library |
| 2026-10-14 | Defer proper multi-day date support | First version stores and expires by the first tournament date |
| 2026-10-14 | Store tournament format separately from registration division | One Mens, Womens, or RevCo 4s tournament can contain both A/AA and B/BB registrations |
| 2026-10-14 | Split combined and All schedule entries into Mens and Womens records | Keeps every tournament format within the three-value schema |

## Out of scope

- Editing registrations from the public page
- Authentication or role-based access
- Automated synchronization from an external registration provider
- Payment status
- Capacity management
- Registration notifications
- Multi-day date ranges
- Tournament ID aliases or redirects
- Roster fields beyond player names
