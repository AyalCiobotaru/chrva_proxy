import unittest
from datetime import date

from lib.current_registrations_core import build_public_payload


TOURNAMENT_HEADERS = [
    "tournament_id",
    "tournament_name",
    "tournament_date",
    "format",
    "published",
]
REGISTRATION_HEADERS = [
    "team_name",
    "tournament_id",
    "division",
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
                ["fall-classic", "Fall Classic", "2026-10-14", "Womens", True],
                ["private-event", "Private", "2026-10-20", "Mens", False],
                ["past-event", "Past", "2026-10-13", "Mens", True],
                ["empty-event", "Empty Event", "2026-11-01", "Womens", True],
            ],
            [
                [" Beta  Team ", "fall-classic", "A/AA", "Alex\n\n Jordan ", "REGISTERED ", True, "ignored"],
                ["Alpha Team", "fall-classic", "B/BB", "", "waitlisted", True, "ignored"],
                ["Withdrawn Team", "fall-classic", "A/AA", "Private Player", "withdrawn", True, "ignored"],
                ["Hidden Team", "fall-classic", "A/AA", "Private Player", "registered", False, "ignored"],
                ["Private Event Team", "private-event", "B/BB", "Private Player", "registered", True, "ignored"],
                ["Past Team", "past-event", "A/AA", "Past Player", "registered", True, "ignored"],
            ],
        )

        self.assertEqual([tournament["id"] for tournament in payload["tournaments"]], ["fall-classic", "empty-event"])
        self.assertEqual(
            payload["tournaments"][0]["registrations"],
            [
                {
                    "teamName": "Beta Team",
                    "division": "A/AA",
                    "status": "registered",
                    "roster": ["Alex", "Jordan"],
                },
                {
                    "teamName": "Alpha Team",
                    "division": "B/BB",
                    "status": "waitlisted",
                    "roster": [],
                },
            ],
        )
        self.assertEqual(self.warnings, [])

    def test_omits_every_duplicate_team_registration(self):
        payload = self.build(
            [["fall-classic", "Fall Classic", "2026-10-14", "Womens", True]],
            [
                ["Team One", "fall-classic", "A/AA", "Alex", "registered", True, ""],
                [" team   one ", "fall-classic", "A/AA", "Jordan", "registered", True, ""],
            ],
        )

        self.assertEqual(payload["tournaments"][0]["registrations"], [])
        self.assertEqual(len(self.warnings), 2)
        self.assertTrue(all("duplicate team registration" in warning for warning in self.warnings))

    def test_omits_duplicate_tournament_ids_and_unknown_references(self):
        payload = self.build(
            [
                ["same-id", "First", "2026-10-14", "Womens", True],
                ["same-id", "Second", "2026-10-15", "Womens", True],
            ],
            [["Team One", "missing-id", "A/AA", "Alex", "registered", True, ""]],
        )

        self.assertEqual(payload, {"tournaments": []})
        self.assertEqual(len(self.warnings), 3)
        self.assertIn("unknown tournament reference", self.warnings[-1])

    def test_accepts_unformatted_google_sheet_date_serial(self):
        payload = self.build(
            [["serial-date", "Serial Date", 46309, "Mens", True]],
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
                ["text-true", "Text True", "2026-10-14", "Womens", "TRUE"],
                ["boolean-true", "Boolean True", "2026-10-14", "Womens", True],
            ],
            [],
        )

        self.assertEqual([item["id"] for item in payload["tournaments"]], ["boolean-true"])


if __name__ == "__main__":
    unittest.main()
