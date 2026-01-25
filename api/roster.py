# api/roster.py
import json
from http.server import BaseHTTPRequestHandler

from lib.roster_core import (
    build_field_values_for_team,
    build_field_values_for_one_day,
    fill_pdf_to_bytes,
    get_template_pdf_bytes,
)


class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        # CORS preflight
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

            mode = (data.get("mode") or "team").strip().lower()
            template_bytes = get_template_pdf_bytes()

            if mode == "team":
                team_name = (data.get("team_name") or "").strip()
                if not team_name:
                    raise ValueError("team_name is required for mode='team'")

                values = build_field_values_for_team(
                    team_name,
                    borrowed_csv=data.get("borrowed"),
                )

            elif mode == "one-day":
                team_name = (data.get("team_name") or "").strip() or "One-Day Team"
                players_csv = (data.get("players") or "").strip()
                if not players_csv:
                    raise ValueError("players is required for mode='one-day'")

                values = build_field_values_for_one_day(
                    roster_label=team_name,
                    names_csv=players_csv,
                    borrowed_csv=data.get("borrowed"),
                )

            else:
                raise ValueError("mode must be 'team' or 'one-day'")

            pdf_bytes = fill_pdf_to_bytes(template_bytes, values)

            resolved = str(values.get("team_name", team_name)).strip()
            filename = f"{resolved}_Roster.pdf"

            self.send_response(200)
            self.send_header("Content-Type", "application/pdf")
            self.send_header("Content-Disposition", f'attachment; filename="{filename}"')
            self.send_header("Cache-Control", "no-store")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(pdf_bytes)

        except Exception as e:
            msg = json.dumps({"error": str(e)}).encode("utf-8")
            self.send_response(400)
            self.send_header("Content-Type", "application/json")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(msg)
