import unittest
from datetime import date

from lib.current_registrations_core import build_public_payload


TOURNAMENT_HEADERS = [
    "tournament_id",
    "tournament_name",
    "tournament_date",
    "division",
    "published",
]
REGISTRATION_HEADERS = [
    "team_name",
    "tournament_id",
    "roster",
    "status",
    "published",
    "updated_at",
]


class CurrentRegistrationsCoreTests(unittest.TestCase):
    def setUp(self):
        self.warnings = []
        self.today = date(2026, 10, 14)

    def build(self, tournaments, registrations):
        return build_public_payload(
            [TOURNAMENT_HEADERS, *tournaments],
            [REGISTRATION_HEADERS, *registrations],
            today=self.today,
            warn=self.warnings.append,
        )

    def test_builds_public_payload_and_filters_private_records(self):
        payload = self.build(
            [
                ["fall-classic", "Fall Classic", "2026-10-14", "Women's A/AA", True],
                ["private-event", "Private", "2026-10-20", "Men's B/BB", False],
                ["past-event", "Past", "2026-10-13", "Men's B/BB", True],
                ["empty-event", "Empty Event", "2026-11-01", "Women's B/BB", True],
            ],
            [
                [" Beta  Team ", "fall-classic", "Alex\n\n Jordan ", "REGISTERED ", True, "ignored"],
                ["Alpha Team", "fall-classic", "", "waitlisted", True, "ignored"],
                ["Withdrawn Team", "fall-classic", "Private Player", "withdrawn", True, "ignored"],
                ["Hidden Team", "fall-classic", "Private Player", "registered", False, "ignored"],
                ["Private Event Team", "private-event", "Private Player", "registered", True, "ignored"],
                ["Past Team", "past-event", "Past Player", "registered", True, "ignored"],
            ],
        )

        self.assertEqual([tournament["id"] for tournament in payload["tournaments"]], ["fall-classic", "empty-event"])
        self.assertEqual(
            payload["tournaments"][0]["registrations"],
            [
                {
                    "teamName": "Beta Team",
                    "status": "registered",
                    "roster": ["Alex", "Jordan"],
                },
                {
                    "teamName": "Alpha Team",
                    "status": "waitlisted",
                    "roster": [],
                },
            ],
        )
        self.assertEqual(self.warnings, [])

    def test_omits_every_duplicate_team_registration(self):
        payload = self.build(
            [["fall-classic", "Fall Classic", "2026-10-14", "Women's A/AA", True]],
            [
                ["Team One", "fall-classic", "Alex", "registered", True, ""],
                [" team   one ", "fall-classic", "Jordan", "registered", True, ""],
            ],
        )

        self.assertEqual(payload["tournaments"][0]["registrations"], [])
        self.assertEqual(len(self.warnings), 2)
        self.assertTrue(all("duplicate team registration" in warning for warning in self.warnings))

    def test_omits_duplicate_tournament_ids_and_unknown_references(self):
        payload = self.build(
            [
                ["same-id", "First", "2026-10-14", "Women's A/AA", True],
                ["same-id", "Second", "2026-10-15", "Women's B/BB", True],
            ],
            [["Team One", "missing-id", "Alex", "registered", True, ""]],
        )

        self.assertEqual(payload, {"tournaments": []})
        self.assertEqual(len(self.warnings), 3)
        self.assertIn("unknown tournament reference", self.warnings[-1])

    def test_accepts_unformatted_google_sheet_date_serial(self):
        payload = self.build(
            [["serial-date", "Serial Date", 46309, "Men's A/AA", True]],
            [],
        )

        self.assertEqual(payload["tournaments"][0]["date"], "2026-10-14")

    def test_requires_exact_headers(self):
        with self.assertRaisesRegex(ValueError, "missing required columns"):
            build_public_payload(
                [["wrong_header"]],
                [REGISTRATION_HEADERS],
                today=self.today,
                warn=self.warnings.append,
            )

    def test_only_boolean_true_publishes_rows(self):
        payload = self.build(
            [
                ["text-true", "Text True", "2026-10-14", "Women's A/AA", "TRUE"],
                ["boolean-true", "Boolean True", "2026-10-14", "Women's A/AA", True],
            ],
            [],
        )

        self.assertEqual([item["id"] for item in payload["tournaments"]], ["boolean-true"])


if __name__ == "__main__":
    unittest.main()
