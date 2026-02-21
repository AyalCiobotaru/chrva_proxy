# api/teams.py
import json
from http.server import BaseHTTPRequestHandler

from lib.roster_core import get_gspread_client, SHEET_ID, TEAMS_TAB


def _clean(s: str) -> str:
    return str(s or "").strip()


class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        try:
            client = get_gspread_client()
            sh = client.open_by_key(SHEET_ID)
            ws_teams = sh.worksheet(TEAMS_TAB)

            # Expect a "Team Name" column (as used by get_team_meta)
            records = ws_teams.get_all_records()
            teams = []
            seen = set()

            for row in records:
                name = _clean(row.get("Team Name", ""))
                if not name:
                    continue
                key = name.lower()
                if key in seen:
                    continue
                seen.add(key)
                teams.append(name)

            teams.sort(key=lambda x: x.lower())

            payload = json.dumps({"teams": teams}).encode("utf-8")

            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(payload)

        except Exception as e:
            msg = json.dumps({"error": str(e)}).encode("utf-8")
            self.send_response(400)
            self.send_header("Content-Type", "application/json")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(msg)