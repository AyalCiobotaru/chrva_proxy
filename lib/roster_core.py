# lib/roster_core.py
from __future__ import annotations

import json
import os
import re
import tempfile
from datetime import date
from pathlib import Path
from typing import Any, Dict, List, Optional

import gspread
from google.oauth2.service_account import Credentials
from pdfrw import PdfDict, PdfReader, PdfWriter

# ====== CONFIG ======
SCOPES = ["https://www.googleapis.com/auth/spreadsheets.readonly"]

# Prefer env var, fallback to your known sheet id
SHEET_ID = os.getenv("SHEET_ID", "1AjUNsy-AT0MSL4FoH7S6dDS4nLx6GGOKlmUkXCLXEqw")

PLAYERS_TAB = "Players"
TEAMS_TAB = "Teams"
STAFF_TAB = "Staff"

DATE_FIELD_NAME = "date"  # PDF field name for date
MAX_MAIN_PLAYERS = 12     # template capacity for main player section


# ====== GOOGLE SHEETS SETUP ======
def get_gspread_client() -> gspread.Client:
    """
    Uses env var GOOGLE_SERVICE_ACCOUNT_JSON (stringified JSON).
    """
    sa_json = os.getenv("GOOGLE_SERVICE_ACCOUNT_JSON")
    if not sa_json:
        raise RuntimeError("Missing env var GOOGLE_SERVICE_ACCOUNT_JSON")

    info = json.loads(sa_json)
    creds = Credentials.from_service_account_info(info, scopes=SCOPES)
    return gspread.authorize(creds)


# ====== NORMALIZATION / LOOKUP HELPERS ======
def normalize_name(raw: str) -> str:
    """
    Make names comparable even if order is 'Last, First' vs 'First Last'.
      'Ciobotaru, Ayal' -> 'ayal ciobotaru'
      'Ayal Ciobotaru'  -> 'ayal ciobotaru'
    """
    if not raw:
        return ""
    s = raw.replace(",", " ").lower()
    parts = [p for p in s.split() if p]
    return " ".join(sorted(parts))


def _build_player_index(records: List[Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
    """
    normalized Full Name -> row (first occurrence)
    """
    index: Dict[str, Dict[str, Any]] = {}
    for row in records:
        full_name = row.get("Full Name", "")
        key = normalize_name(full_name)
        if key and key not in index:
            index[key] = row
    return index


# ====== DATA HELPERS ======
def get_team_meta(ws_teams: gspread.Worksheet, team_name: str) -> Dict[str, Any]:
    """
    From Teams tab:
      Team Name | Division | Season | Club | Team Contact

    NOTE: This version does strict exact-match only.
    If you added fuzzy resolution in your CLI version, you can port it here later.
    """
    records = ws_teams.get_all_records()
    for row in records:
        if str(row.get("Team Name", "")).strip() == team_name:
            return {
                "team_name": team_name,
                "division": row.get("Division", ""),
                "season": row.get("Season", ""),
                "club": row.get("Club", ""),
                "team_contact": row.get("Team Contact", ""),
            }
    raise ValueError(f"Team '{team_name}' not found in Teams tab")


def get_team_players(ws_players: gspread.Worksheet, team_name: str) -> List[Dict[str, Any]]:
    """
    From Players tab:
      Type | Full Name | Id | Jersey | Team
    """
    records = ws_players.get_all_records()
    players: List[Dict[str, Any]] = []
    for row in records:
        if str(row.get("Team", "")).strip() != team_name:
            continue
        players.append(
            {
                "name": row.get("Full Name", ""),
                "id": row.get("Id", ""),
                "jersey": row.get("Jersey", ""),
            }
        )
    return players


def get_team_staff(ws_staff: gspread.Worksheet, team_name: str) -> List[Dict[str, Any]]:
    """
    From Staff tab:
      Full Name | Id | Title | Team
    """
    records = ws_staff.get_all_records()
    staff: List[Dict[str, Any]] = []
    for row in records:
        if str(row.get("Team", "")).strip() != team_name:
            continue
        staff.append(
            {
                "name": row.get("Full Name", ""),
                "id": row.get("Id", ""),
                "title": row.get("Title", ""),
            }
        )
    return staff


def get_players_by_names(ws_players: gspread.Worksheet, requested_names: List[str]) -> List[Dict[str, Any]]:
    """
    Look up players by name list (for one-day players).
    If a player isn't found, include provided name with blank id/jersey.
    """
    records = ws_players.get_all_records()
    index = _build_player_index(records)

    players: List[Dict[str, Any]] = []
    for raw in requested_names:
        key = normalize_name(raw)
        row = index.get(key)
        if not row:
            players.append({"name": raw, "id": "", "jersey": ""})
            continue

        players.append(
            {
                "name": row.get("Full Name", raw),
                "id": row.get("Id", ""),
                "jersey": row.get("Jersey", ""),
            }
        )
    return players


def _next_borrowed_slot(field_values: Dict[str, Any]) -> int:
    """
    Find next available borrowed slot by checking borrowed_{i}_name.
    """
    i = 1
    while True:
        key = f"borrowed_{i}_name"
        if key not in field_values or not str(field_values.get(key, "")).strip():
            return i
        i += 1


def _add_borrowed_entries(
    field_values: Dict[str, Any],
    borrowed_entries: List[Dict[str, Any]],
    start_index: Optional[int] = None,
) -> None:
    """
    Write borrowed entries into borrowed_{i}_name/id/jersey.
    """
    idx = start_index if start_index is not None else _next_borrowed_slot(field_values)
    for entry in borrowed_entries:
        field_values[f"borrowed_{idx}_name"] = entry.get("name", "")
        field_values[f"borrowed_{idx}_id"] = str(entry.get("id", "") or "")
        field_values[f"borrowed_{idx}_jersey"] = str(entry.get("jersey", "") or "")
        idx += 1


def add_borrowed_players(field_values: Dict[str, Any], ws_players: gspread.Worksheet, borrowed_csv: str) -> None:
    """
    Append borrowed players to borrowed_x_ fields.
    If not found, include name with blank id/jersey.
    """
    names = [n.strip() for n in (borrowed_csv or "").split(",") if n.strip()]
    if not names:
        return

    records = ws_players.get_all_records()
    index = _build_player_index(records)

    borrowed_entries: List[Dict[str, Any]] = []
    for raw in names:
        key = normalize_name(raw)
        row = index.get(key)
        if not row:
            borrowed_entries.append({"name": raw, "id": "", "jersey": ""})
            continue
        borrowed_entries.append(
            {
                "name": row.get("Full Name", raw),
                "id": str(row.get("Id", "") or ""),
                "jersey": str(row.get("Jersey", "") or ""),
            }
        )

    _add_borrowed_entries(field_values, borrowed_entries)


# ====== FIELD BUILDERS ======
def build_field_values_for_team(team_name: str, borrowed_csv: Optional[str] = None) -> Dict[str, Any]:
    """
    Standard team-mode:
      - meta from Teams tab
      - players from Players tab
      - staff from Staff tab

    RULE: Template supports MAX_MAIN_PLAYERS main players.
          If team has > MAX_MAIN_PLAYERS, overflow goes into borrowed section.
    """
    client = get_gspread_client()
    sh = client.open_by_key(SHEET_ID)

    ws_players = sh.worksheet(PLAYERS_TAB)
    ws_staff = sh.worksheet(STAFF_TAB)
    ws_teams = sh.worksheet(TEAMS_TAB)

    meta = get_team_meta(ws_teams, team_name)
    field_values: Dict[str, Any] = dict(meta)

    # Date
    field_values[DATE_FIELD_NAME] = date.today().strftime("%m/%d/%Y")

    # Players & staff
    players = get_team_players(ws_players, team_name)
    staff = get_team_staff(ws_staff, team_name)

    main_players = players[:MAX_MAIN_PLAYERS]
    overflow_players = players[MAX_MAIN_PLAYERS:]

    # Main players -> player_1...player_12
    for i, p in enumerate(main_players, start=1):
        field_values[f"player_{i}_name"] = p["name"]
        field_values[f"player_{i}_id"] = str(p["id"] or "")
        field_values[f"player_{i}_jersey"] = str(p["jersey"] or "")

    # Overflow -> borrowed section first (starting at 1)
    if overflow_players:
        _add_borrowed_entries(field_values, overflow_players, start_index=1)

    # Staff -> staff_1_name/title/id ...
    for i, s in enumerate(staff, start=1):
        field_values[f"staff_{i}_name"] = s["name"]
        field_values[f"staff_{i}_title"] = s.get("title", "")
        field_values[f"staff_{i}_id"] = str(s["id"] or "")

    # Optional borrowed players appended after overflow
    if borrowed_csv:
        add_borrowed_players(field_values, ws_players, borrowed_csv)

    return field_values


def build_field_values_for_one_day(
    roster_label: str,
    names_csv: str,
    borrowed_csv: Optional[str] = None,
) -> Dict[str, Any]:
    """
    One-day mode:
      - roster_label becomes team_name in the PDF (and filename upstream)
      - names_csv is a comma-separated list of player names (looked up in Players tab)
      - optional borrowed_csv appended to borrowed_x_ fields

    NOTE: If > MAX_MAIN_PLAYERS are provided, overflow goes into borrowed section (same rule as team mode).
    """
    client = get_gspread_client()
    sh = client.open_by_key(SHEET_ID)
    ws_players = sh.worksheet(PLAYERS_TAB)

    names = [n.strip() for n in (names_csv or "").split(",") if n.strip()]
    players = get_players_by_names(ws_players, names)

    field_values: Dict[str, Any] = {
        "team_name": roster_label or "One-Day Team",
        "division": "",
        "season": "",
        "club": "",
        "team_contact": "",
    }

    # Date
    field_values[DATE_FIELD_NAME] = date.today().strftime("%m/%d/%Y")

    main_players = players[:MAX_MAIN_PLAYERS]
    overflow_players = players[MAX_MAIN_PLAYERS:]

    # Main players section
    for i, p in enumerate(main_players, start=1):
        field_values[f"player_{i}_name"] = p["name"]
        field_values[f"player_{i}_id"] = str(p["id"] or "")
        field_values[f"player_{i}_jersey"] = str(p["jersey"] or "")

    # Overflow into borrowed section starting at 1
    if overflow_players:
        _add_borrowed_entries(field_values, overflow_players, start_index=1)

    # Optional borrowed players appended after overflow
    if borrowed_csv:
        add_borrowed_players(field_values, ws_players, borrowed_csv)

    return field_values


# ====== PDF TEMPLATE LOADING ======
def get_template_pdf_bytes() -> bytes:
    """
    Your repo layout:
      chrva-proxy/lib/roster_core.py
      chrva-proxy/assets/Blank_Roster_Fillable_V2.pdf
    """
    path = Path(__file__).resolve().parent.parent / "assets" / "Blank_Roster_Fillable_V2.pdf"
    return path.read_bytes()


# ====== PDF FILLING ======
def fill_pdf_to_bytes(template_pdf_bytes: bytes, field_values: Dict[str, Any]) -> bytes:
    """
    Fill a PDF form and return bytes (serverless-friendly).
    pdfrw reads/writes files, so we use a temp dir.
    """
    with tempfile.TemporaryDirectory() as d:
        in_path = os.path.join(d, "template.pdf")
        out_path = os.path.join(d, "output.pdf")

        with open(in_path, "wb") as f:
            f.write(template_pdf_bytes)

        pdf = PdfReader(in_path)

        for page in pdf.pages:
            if "/Annots" not in page:
                continue
            for annot in page["/Annots"]:
                if annot.get("/Subtype") != "/Widget":
                    continue
                raw_name = annot.get("/T")
                if not raw_name:
                    continue

                name = raw_name.to_unicode().strip("()")
                if name in field_values:
                    value = str(field_values[name])
                    annot.update(PdfDict(V=value, AS=value))

        PdfWriter().write(out_path, pdf)

        with open(out_path, "rb") as f:
            return f.read()


# ====== OPTIONAL: filename helper (useful upstream if needed) ======
def safe_filename(name: str) -> str:
    name = (name or "").strip()
    name = re.sub(r"[^\w\s-]", "", name)
    name = re.sub(r"\s+", "_", name)
    return name or "Roster"
