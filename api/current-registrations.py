import json
import logging
import os
from datetime import datetime
from http.server import BaseHTTPRequestHandler
from zoneinfo import ZoneInfo

from gspread.utils import ValueRenderOption

from lib.current_registrations_core import (
    REGISTRATIONS_TAB,
    TOURNAMENTS_TAB,
    build_public_payload,
)
from lib.roster_core import get_gspread_client


PRODUCTION_ORIGIN = "https://www.chrva.org"
CACHE_CONTROL = "public, max-age=0, s-maxage=300"


def _allowed_origins():
    origins = {PRODUCTION_ORIGIN}
    development_origin = os.getenv("REGISTRATIONS_DEV_ORIGIN", "").strip().rstrip("/")
    if development_origin:
        origins.add(development_origin)
    return origins


def _cors_origin(request_origin):
    normalized = (request_origin or "").strip().rstrip("/")
    return normalized if normalized in _allowed_origins() else None


def _sheet_values(worksheet):
    return worksheet.get_all_values(value_render_option=ValueRenderOption.unformatted)


class handler(BaseHTTPRequestHandler):
    def _send_cors_headers(self):
        origin = _cors_origin(self.headers.get("Origin"))
        if origin:
            self.send_header("Access-Control-Allow-Origin", origin)
        self.send_header("Vary", "Origin")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def _send_json(self, status, body, cache_control="no-store"):
        payload = json.dumps(body, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", cache_control)
        self._send_cors_headers()
        self.end_headers()
        self.wfile.write(payload)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Cache-Control", "no-store")
        self._send_cors_headers()
        self.end_headers()

    def do_GET(self):
        try:
            sheet_id = os.getenv("REGISTRATIONS_SHEET_ID", "").strip()
            if not sheet_id:
                raise RuntimeError("Missing REGISTRATIONS_SHEET_ID")

            client = get_gspread_client()
            spreadsheet = client.open_by_key(sheet_id)
            tournament_values = _sheet_values(spreadsheet.worksheet(TOURNAMENTS_TAB))
            registration_values = _sheet_values(spreadsheet.worksheet(REGISTRATIONS_TAB))
            today = datetime.now(ZoneInfo("America/New_York")).date()

            body = build_public_payload(
                tournament_values,
                registration_values,
                today=today,
                warn=logging.warning,
            )
            self._send_json(200, body, CACHE_CONTROL)
        except Exception:
            logging.exception("Current registrations request failed")
            self._send_json(500, {"error": "Unable to load current registrations."})
