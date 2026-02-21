# api/rosters.py
import io
import json
import zipfile
from http.server import BaseHTTPRequestHandler

from lib.roster_core import (
    build_field_values_for_team,
    fill_pdf_to_bytes,
    get_template_pdf_bytes,
    safe_filename,
)


def _parse_teams(value):
    """
    Accept either:
      - "Team A, Team B"
      - ["Team A", "Team B"]
      - single string "Team A"
    """
    if value is None:
        return []

    if isinstance(value, list):
        teams = [str(x).strip() for x in value if str(x).strip()]
    else:
        s = str(value).strip()
        if not s:
            return []
        teams = [t.strip() for t in s.split(",") if t.strip()]

    # de-dupe preserving order (case-insensitive)
    seen = set()
    out = []
    for t in teams:
        k = t.lower()
        if k not in seen:
            seen.add(k)
            out.append(t)
    return out


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
            if mode != "team":
                raise ValueError("ZIP endpoint supports mode='team' only")

            # Accept team_names (preferred) or team_name (fallback)
            teams = _parse_teams(data.get("team_names") or data.get("team_name"))
            if not teams:
                raise ValueError("team_names is required (comma-separated or list)")

            borrowed = data.get("borrowed")

            template_bytes = get_template_pdf_bytes()

            buf = io.BytesIO()
            with zipfile.ZipFile(buf, mode="w", compression=zipfile.ZIP_DEFLATED) as z:
                for team in teams:
                    values = build_field_values_for_team(
                        team,
                        borrowed_csv=borrowed,
                    )
                    pdf_bytes = fill_pdf_to_bytes(template_bytes, values)

                    resolved = str(values.get("team_name", team)).strip()
                    pdf_name = f"{safe_filename(resolved)}_Roster.pdf"
                    z.writestr(pdf_name, pdf_bytes)

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