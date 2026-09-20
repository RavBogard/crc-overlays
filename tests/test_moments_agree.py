"""The moments agreement check must fail on a table that has drifted.

`scripts/check-moments-agree.py` is the instrument that would have seen the four renames this
repo's `content/moments.json` carried for days (R-0919-audit-1 item d). These cases run it as CI
runs it — as a process, on real files — so what is asserted is the exit code a workflow reads,
not an internal return value.
"""

import json
import os
import subprocess
import sys
import tempfile
import unittest

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CHECKER = os.path.join(REPO, "scripts", "check-moments-agree.py")

REAL_PAIR = ("shofar-service", "shofar.shofar-service@crc-rh-morning")
RENAMED = ("service", "shofar.service@crc-rh-morning")
OTHER = ("adon-olam", "concluding.adon-olam@bm-shacharit")


def table(pairs):
    return {"schemaVersion": 1,
            "moments": [{"momentId": m, "unitId": u} for m, u in pairs]}


def run(*args):
    return subprocess.run([sys.executable, CHECKER] + list(args),
                          cwd=REPO, capture_output=True, text=True)


class MomentsAgreeTests(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.dir.cleanup)

    def write(self, name, document):
        path = os.path.join(self.dir.name, name)
        with open(path, "w", encoding="utf-8") as handle:
            json.dump(document, handle)
        return path

    def test_self_test_passes(self):
        """The checker's own nine cases, including its failing one, behave as declared."""
        result = run("--self-test")
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("all cases behaved as declared", result.stdout)

    def test_identical_tables_agree(self):
        canonical = self.write("moments-pairs.json", table([REAL_PAIR, OTHER]))
        ours = self.write("ours.json", table([OTHER, REAL_PAIR]))
        result = run("--canonical", canonical, "--ours", ours)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_a_deliberately_mismatched_fixture_fails(self):
        """The done-when of the Wave 2 item: a renamed unit id must fail, and say which."""
        canonical = self.write("moments-pairs.json", table([REAL_PAIR, OTHER]))
        ours = self.write("ours.json", table([RENAMED, OTHER]))
        result = run("--canonical", canonical, "--ours", ours)
        self.assertEqual(result.returncode, 1, result.stdout + result.stderr)
        self.assertIn("shofar.service@crc-rh-morning", result.stdout)
        self.assertIn("shofar.shofar-service@crc-rh-morning", result.stdout)

    def test_a_dist_app_directory_resolves_to_its_table(self):
        self.write("moments-pairs.json", table([REAL_PAIR]))
        ours = self.write("ours.json", table([REAL_PAIR]))
        result = run("--canonical", self.dir.name, "--ours", ours)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_an_unreachable_producer_is_not_a_pass(self):
        """Exit 2, never 0. A quiet skip is the shape of the failure this check exists to break."""
        ours = self.write("ours.json", table([REAL_PAIR]))
        result = run("--canonical", os.path.join(self.dir.name, "absent"), "--ours", ours)
        self.assertEqual(result.returncode, 2, result.stdout + result.stderr)

    def test_a_malformed_table_is_not_read_as_empty(self):
        """Two empty-looking tables must not agree by accident."""
        canonical = self.write("moments-pairs.json", {"moments": []})
        ours = self.write("ours.json", table([]))
        result = run("--canonical", canonical, "--ours", ours)
        self.assertEqual(result.returncode, 2, result.stdout + result.stderr)

    def test_the_committed_table_is_shaped_the_way_the_checker_expects(self):
        """Guards against the checker passing vacuously on this repo's own copy."""
        with open(os.path.join(REPO, "content", "moments.json"), encoding="utf-8") as handle:
            document = json.load(handle)
        self.assertEqual(document.get("schemaVersion"), 1)
        self.assertGreater(len(document.get("moments", [])), 100)
        for entry in document["moments"]:
            self.assertIsInstance(entry.get("momentId"), str)
            self.assertIsInstance(entry.get("unitId"), str)


if __name__ == "__main__":
    unittest.main()
