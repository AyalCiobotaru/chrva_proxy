import os
from pathlib import Path
import tempfile
from datetime import date
from typing import Optional, List, Dict, Any

import gspread
from google.oauth2.service_account import Credentials
from pdfrw import PdfReader, PdfWriter, PdfDict

# ====== CONFIG ======
SCOPES = ["https://www.googleapis.com/auth/spreadsheets.readonly"]

SHEET_ID = os.getenv("SHEET_ID", "1AjUNsy-AT0MSL4FoH7S6dDS4nLx6GGOKlmUkXCLXEqw")
PLAYERS_TAB = "Players"
TEAMS_TAB = "Teams"
STAFF_TAB = "Staff"

DATE_FIELD_NAME = "date"
MAX_MAIN_PLAYERS = 12


def get_gspread_client() -> gspread.Client:
    sa_json = os.getenv("GOOGLE_SERVICE_ACCOUNT_JSON")
    if not sa_json:
        raise RuntimeError("Missing env var GOOGLE_SERVICE_ACCOUNT_JSON")

    info = __import__("json").loads(sa_json)
    creds = Credentials.from_service_account_info(info, scopes=SCOPES)
    return gspread.authorize(creds)


def normalize_name(raw: str) -> str:
    if not raw:
        return ""
    s = raw.replace(",", " ").lower()
    parts = [p for p in s.split() if p]
    return " ".join(sorted(parts))


# --- Your existing helpers unchanged (get_team_players/get_team_staff/etc) ---
# NOTE: Keep your fuzzy-name resolution code from #2 in here as well.
# I'm only including the "build/fill" parts you need for web generation.

def get_team_meta(ws_teams, team_name: str, prompt_enabled: bool = False) -> Dict[str, Any]:
    # Use your updated fuzzy version here (prompt_enabled=False for web)
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
    # If not found, raise (or return suggestions to UI later if you want)
    raise ValueError(f"Team '{team_name}' not found in Teams tab")


def get_team_players(ws_players, team_name: str) -> List[Dict[str, Any]]:
    records = ws_players.get_all_records()
    players: List[Dict[str, Any]] = []
    for row in records:
        if str(row.get("Team", "")).strip() != team_name:
            continue
        players.append({"name": row.get("Full Name", ""), "id": row.get("Id", ""), "jersey": row.get("Jersey", "")})
    return players


def get_team_staff(ws_staff, team_name: str) -> List[Dict[str, Any]]:
    records = ws_staff.get_all_records()
    staff: List[Dict[str, Any]] = []
    for row in records:
        if str(row.get("Team", "")).strip() != team_name:
            continue
        staff.append({"name": row.get("Full Name", ""), "id": row.get("Id", ""), "title": row.get("Title", "")})
    return staff


def _add_borrowed_entries(field_values: Dict[str, Any], borrowed_entries: List[Dict[str, Any]], start_index: int = 1) -> None:
    idx = start_index
    for entry in borrowed_entries:
        field_values[f"borrowed_{idx}_name"] = entry.get("name", "")
        field_values[f"borrowed_{idx}_id"] = str(entry.get("id", "") or "")
        field_values[f"borrowed_{idx}_jersey"] = str(entry.get("jersey", "") or "")
        idx += 1


def build_field_values_for_team(team_name: str, borrowed_csv: Optional[str] = None) -> Dict[str, Any]:
    client = get_gspread_client()
    sh = client.open_by_key(SHEET_ID)
    ws_players = sh.worksheet(PLAYERS_TAB)
    ws_staff = sh.worksheet(STAFF_TAB)
    ws_teams = sh.worksheet(TEAMS_TAB)

    meta = get_team_meta(ws_teams, team_name, prompt_enabled=False)
    field_values: Dict[str, Any] = dict(meta)

    resolved_team_name = str(meta.get("team_name", team_name)).strip()

    field_values[DATE_FIELD_NAME] = date.today().strftime("%m/%d/%Y")

    players = get_team_players(ws_players, resolved_team_name)
    staff = get_team_staff(ws_staff, resolved_team_name)

    main_players = players[:MAX_MAIN_PLAYERS]
    overflow_players = players[MAX_MAIN_PLAYERS:]

    for i, p in enumerate(main_players, start=1):
        field_values[f"player_{i}_name"] = p["name"]
        field_values[f"player_{i}_id"] = str(p["id"] or "")
        field_values[f"player_{i}_jersey"] = str(p["jersey"] or "")

    if overflow_players:
        _add_borrowed_entries(field_values, overflow_players, start_index=1)

    for i, s in enumerate(staff, start=1):
        field_values[f"staff_{i}_name"] = s["name"]
        field_values[f"staff_{i}_title"] = s.get("title", "")
        field_values[f"staff_{i}_id"] = str(s["id"] or "")

    # If you want borrowed_csv, plug in your borrowed lookup here too (same as your script)
    return field_values


def fill_pdf_to_bytes(template_pdf_bytes: bytes, field_values: Dict[str, Any]) -> bytes:
    # pdfrw is easiest with a temp file in serverless
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

def get_template_pdf_bytes() -> bytes:
    # lib/roster_core.py  -> ../assets/Blank_Roster_Fillable_V2.pdf
    path = Path(__file__).resolve().parent.parent / "assets" / "Blank_Roster_Fillable_V2.pdf"
    return path.read_bytes()


