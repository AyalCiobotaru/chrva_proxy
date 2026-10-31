# api/rosters.py
import io
import json
import re
import zipfile
from http.server import BaseHTTPRequestHandler

from lib.roster_core import (
    build_field_values_for_one_day,
    build_field_values_for_team,
    fill_pdf_to_bytes,
    get_template_pdf_bytes,
    safe_filename,
)


def _parse_teams(value):
    """Accept a list or a comma-/line-break-separated team-name string."""
    if value is None:
        return []

    if isinstance(value, list):
        teams = [str(item).strip() for item in value if str(item).strip()]
    else:
        teams = [
            team.strip()
            for team in re.split(r"[,\r\n]+", str(value).strip())
            if team.strip()
        ]

    seen = set()
    unique_teams = []
    for team in teams:
        key = team.lower()
        if key not in seen:
            seen.add(key)
            unique_teams.append(team)
    return unique_teams


def _manual_teams(value):
    if not isinstance(value, list) or not value:
        raise ValueError("teams must be a non-empty list for mode='one-day'")

    teams = []
    for index, item in enumerate(value, start=1):
        if not isinstance(item, dict):
            raise ValueError(f"Team {index} must be an object")

        team_name = str(item.get("team_name") or "").strip()
        players = str(item.get("players") or "").strip()
        division = str(item.get("division") or "").strip()
        season = str(item.get("season") or "").strip()
        team_contact = str(item.get("team_contact") or "").strip()
        if not team_name:
            raise ValueError(f"Team {index}: team_name is required")
        if not players:
            raise ValueError(f"Team {index}: players is required")
        if not division:
            raise ValueError(f"Team {index}: division is required")
        if not season:
            raise ValueError(f"Team {index}: season is required")
        if not team_contact:
            raise ValueError(f"Team {index}: team_contact is required")

        teams.append(
            {
                "team_name": team_name,
                "players": players,
                "borrowed": item.get("borrowed"),
                "division": division,
                "season": season,
                "team_contact": team_contact,
                "club": item.get("club"),
            }
        )
    return teams


class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_POST(self):
        try:
            length = int(self.headers.get("Content-Length", "0"))
            body = self.rfile.read(length) if length else b"{}"
            data = json.loads(body.decode("utf-8") or "{}")

            mode = str(data.get("mode") or "team").strip().lower()
            if mode == "team":
                team_names = _parse_teams(data.get("team_names") or data.get("team_name"))
                if not team_names:
                    raise ValueError("team_names is required (comma-separated, line-separated, or list)")
                roster_requests = [{"team_name": name} for name in team_names]
            elif mode == "one-day":
                roster_requests = _manual_teams(data.get("teams"))
            else:
                raise ValueError("mode must be 'team' or 'one-day'")

            template_bytes = get_template_pdf_bytes()
            buf = io.BytesIO()
            used_names = set()

            with zipfile.ZipFile(buf, mode="w", compression=zipfile.ZIP_DEFLATED) as archive:
                for request in roster_requests:
                    team_name = request["team_name"]
                    if mode == "team":
                        values = build_field_values_for_team(
                            team_name,
                            borrowed_csv=data.get("borrowed"),
                        )
                    else:
                        values = build_field_values_for_one_day(
                            roster_label=team_name,
                            names_csv=request["players"],
                            borrowed_csv=request.get("borrowed"),
                            division=request.get("division"),
                            season=request.get("season"),
                            team_contact=request.get("team_contact"),
                            club=request.get("club"),
                        )

                    pdf_bytes = fill_pdf_to_bytes(template_bytes, values)
                    resolved = str(values.get("team_name", team_name)).strip()
                    base_name = safe_filename(resolved)
                    pdf_name = f"{base_name}_Roster.pdf"
                    suffix = 2
                    while pdf_name.lower() in used_names:
                        pdf_name = f"{base_name}_Roster_{suffix}.pdf"
                        suffix += 1
                    used_names.add(pdf_name.lower())
                    archive.writestr(pdf_name, pdf_bytes)

            zip_bytes = buf.getvalue()
            self.send_response(200)
            self.send_header("Content-Type", "application/zip")
            self.send_header("Content-Disposition", 'attachment; filename="Rosters.zip"')
            self.send_header("Cache-Control", "no-store")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(zip_bytes)

        except Exception as e:
            msg = json.dumps({"error": str(e)}).encode("utf-8")
            self.send_response(400)
            self.send_header("Content-Type", "application/json")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(msg)
