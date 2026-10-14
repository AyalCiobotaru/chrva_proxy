from __future__ import annotations

import logging
import re
from collections import Counter
from datetime import date, datetime, timedelta
from typing import Any, Callable, Dict, Iterable, List, Mapping, Sequence, Tuple


TOURNAMENTS_TAB = "Tournaments"
REGISTRATIONS_TAB = "Registrations"

TOURNAMENT_HEADERS = (
    "tournament_id",
    "tournament_name",
    "tournament_date",
    "division",
    "published",
)
REGISTRATION_HEADERS = (
    "team_name",
    "tournament_id",
    "roster",
    "status",
    "published",
    "updated_at",
)

TOURNAMENT_ID_PATTERN = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
PUBLIC_STATUSES = {"registered", "waitlisted"}
ALL_STATUSES = PUBLIC_STATUSES | {"withdrawn"}
GOOGLE_SHEETS_EPOCH = date(1899, 12, 30)

LogWarning = Callable[[str], None]


def _clean(value: Any) -> str:
    return str(value or "").strip()


def _warn_default(message: str) -> None:
    logging.warning(message)


def _validate_headers(
    values: Sequence[Sequence[Any]],
    required_headers: Sequence[str],
    tab_name: str,
) -> Tuple[List[str], List[Sequence[Any]]]:
    if not values:
        raise ValueError(f"{tab_name} tab is empty")

    headers = [_clean(value) for value in values[0]]
    missing = [header for header in required_headers if header not in headers]
    if missing:
        raise ValueError(f"{tab_name} tab is missing required columns: {', '.join(missing)}")

    if len(headers) != len(set(headers)):
        raise ValueError(f"{tab_name} tab contains duplicate column headers")

    return headers, list(values[1:])


def _records(
    values: Sequence[Sequence[Any]],
    required_headers: Sequence[str],
    tab_name: str,
) -> Iterable[Tuple[int, Dict[str, Any]]]:
    headers, rows = _validate_headers(values, required_headers, tab_name)
    for row_number, row in enumerate(rows, start=2):
        padded = list(row) + [""] * max(0, len(headers) - len(row))
        record = dict(zip(headers, padded[: len(headers)]))
        if any(value not in (None, "") for value in record.values()):
            yield row_number, record


def _parse_sheet_date(value: Any) -> date:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return GOOGLE_SHEETS_EPOCH + timedelta(days=int(value))

    raw = _clean(value)
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", raw):
        raise ValueError("date must be a Google Sheets date cell or an ISO YYYY-MM-DD value")
    return date.fromisoformat(raw)


def _published(value: Any) -> bool:
    return value is True


def _normalize_team_name(value: Any) -> str:
    return " ".join(_clean(value).split()).casefold()


def _parse_roster(value: Any) -> List[str]:
    return [line.strip() for line in str(value or "").splitlines() if line.strip()]


def build_public_payload(
    tournament_values: Sequence[Sequence[Any]],
    registration_values: Sequence[Sequence[Any]],
    *,
    today: date,
    warn: LogWarning = _warn_default,
) -> Dict[str, List[Dict[str, Any]]]:
    """Validate raw sheet values and return the fixed public response contract."""

    valid_tournaments: Dict[str, Dict[str, Any]] = {}
    tournament_rows = list(
        _records(tournament_values, TOURNAMENT_HEADERS, TOURNAMENTS_TAB)
    )
    duplicate_tournament_ids = {
        tournament_id
        for tournament_id, count in Counter(
            _clean(row.get("tournament_id"))
            for _, row in tournament_rows
            if _clean(row.get("tournament_id"))
        ).items()
        if count > 1
    }
    known_tournament_ids = {
        _clean(row.get("tournament_id"))
        for _, row in tournament_rows
        if TOURNAMENT_ID_PATTERN.fullmatch(_clean(row.get("tournament_id")))
        and _clean(row.get("tournament_id")) not in duplicate_tournament_ids
    }

    for row_number, row in tournament_rows:
        tournament_id = _clean(row.get("tournament_id"))
        tournament_name = _clean(row.get("tournament_name"))
        division = _clean(row.get("division"))

        if tournament_id in duplicate_tournament_ids:
            warn(f"{TOURNAMENTS_TAB} row {row_number}: duplicate tournament_id omitted")
            continue
        if not TOURNAMENT_ID_PATTERN.fullmatch(tournament_id):
            warn(f"{TOURNAMENTS_TAB} row {row_number}: invalid tournament_id omitted")
            continue
        if not tournament_name or not division:
            warn(f"{TOURNAMENTS_TAB} row {row_number}: missing public display value omitted")
            continue
        if not _published(row.get("published")):
            continue

        try:
            tournament_date = _parse_sheet_date(row.get("tournament_date"))
        except (TypeError, ValueError, OverflowError):
            warn(f"{TOURNAMENTS_TAB} row {row_number}: invalid tournament_date omitted")
            continue

        if tournament_date < today:
            continue

        valid_tournaments[tournament_id] = {
            "id": tournament_id,
            "name": tournament_name,
            "date": tournament_date.isoformat(),
            "division": division,
            "registrations": [],
        }

    registration_rows = list(
        _records(registration_values, REGISTRATION_HEADERS, REGISTRATIONS_TAB)
    )
    registration_keys = Counter(
        (
            _clean(row.get("tournament_id")),
            _normalize_team_name(row.get("team_name")),
        )
        for _, row in registration_rows
        if _clean(row.get("tournament_id")) and _normalize_team_name(row.get("team_name"))
    )

    for row_number, row in registration_rows:
        tournament_id = _clean(row.get("tournament_id"))
        team_name = " ".join(_clean(row.get("team_name")).split())
        team_key = _normalize_team_name(team_name)
        status = _clean(row.get("status")).casefold()

        if not tournament_id or not team_name:
            warn(f"{REGISTRATIONS_TAB} row {row_number}: missing required value omitted")
            continue
        if registration_keys[(tournament_id, team_key)] > 1:
            warn(f"{REGISTRATIONS_TAB} row {row_number}: duplicate team registration omitted")
            continue
        if tournament_id not in known_tournament_ids:
            warn(f"{REGISTRATIONS_TAB} row {row_number}: unknown tournament reference omitted")
            continue
        if tournament_id not in valid_tournaments:
            continue
        if status not in ALL_STATUSES:
            warn(f"{REGISTRATIONS_TAB} row {row_number}: invalid status omitted")
            continue
        if not _published(row.get("published")) or status not in PUBLIC_STATUSES:
            continue

        valid_tournaments[tournament_id]["registrations"].append(
            {
                "teamName": team_name,
                "status": status,
                "roster": _parse_roster(row.get("roster")),
            }
        )

    return {"tournaments": list(valid_tournaments.values())}
