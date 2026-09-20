"""The app-surface fetcher must take the right artifact and refuse a partial one.

`scripts/fetch-app-surface.py` replaced a source checkout and a full producer build with one
download (R-0919-audit master plan, Wave 2 item 2). Two things can go wrong that nobody would
see until a bad library was already committed: taking the wrong run's artifact, and unpacking
an incomplete surface. Both are tested here, the run choice against canned API shapes and the
verification against real directories.
"""

import importlib.util
import json
import os
import subprocess
import sys
import tempfile
import unittest

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FETCHER = os.path.join(REPO, "scripts", "fetch-app-surface.py")

_spec = importlib.util.spec_from_file_location("fetch_app_surface", FETCHER)
fetch = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(fetch)


def jobs(*pairs):
    return {"jobs": [{"name": name, "conclusion": conclusion} for name, conclusion in pairs]}


class RunChoiceTests(unittest.TestCase):
    def test_the_publishing_job_is_what_counts_not_the_run(self):
        """The case this repo actually hit: a failed run holding a good surface."""
        self.assertTrue(fetch.publishing_job_succeeded(
            jobs(("gate", "success"),
                 ("build (shabbat-maariv)", "failure"),
                 ("publish-app-surface", "success"))))

    def test_a_run_whose_publishing_job_failed_is_refused(self):
        self.assertFalse(fetch.publishing_job_succeeded(
            jobs(("gate", "success"), ("publish-app-surface", "failure"))))

    def test_a_run_that_never_ran_the_publishing_job_is_refused(self):
        self.assertFalse(fetch.publishing_job_succeeded(jobs(("gate", "success"))))
        self.assertFalse(fetch.publishing_job_succeeded(None))

    def test_an_expired_artifact_is_not_a_candidate(self):
        """Artifacts age out; an expired one is a 410 waiting to happen, not a surface."""
        listing = {"artifacts": [{"id": 1, "name": "dist-app", "expired": True}]}
        self.assertIsNone(fetch.live_surface_artifact(listing))

    def test_only_the_named_artifact_is_taken(self):
        listing = {"artifacts": [
            {"id": 1, "name": "shabbat-shacharit-80de868", "expired": False},
            {"id": 2, "name": "dist-app", "expired": False},
        ]}
        self.assertEqual(fetch.live_surface_artifact(listing)["id"], 2)


class VerificationTests(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.dir.cleanup)

    def surface(self, provenance=None, books=None, feeds=("fixture-feed.json",)):
        import pathlib
        root = pathlib.Path(self.dir.name)
        if provenance is not None:
            (root / "PROVENANCE.json").write_text(json.dumps(provenance), encoding="utf-8")
        if books is not None:
            (root / "books.json").write_text(json.dumps(books), encoding="utf-8")
        for feed in feeds:
            (root / feed).write_text("{}", encoding="utf-8")
        return root

    def test_a_whole_surface_returns_its_provenance(self):
        root = self.surface(
            {"schemaVersion": 1, "sourceRepo": fetch.SOURCE_REPO,
             "sourceSha": "a" * 40, "bookCount": 1},
            [{"slug": "fixture", "feed": "fixture-feed.json"}])
        self.assertEqual(fetch.verify(root)["sourceSha"], "a" * 40)

    def test_a_surface_missing_a_declared_feed_is_refused(self):
        """A half-published surface must not become a library."""
        root = self.surface(
            {"schemaVersion": 1, "sourceRepo": fetch.SOURCE_REPO,
             "sourceSha": "a" * 40, "bookCount": 2},
            [{"slug": "fixture", "feed": "fixture-feed.json"},
             {"slug": "absent", "feed": "absent-feed.json"}])
        with self.assertRaises(fetch.SurfaceError):
            fetch.verify(root)

    def test_an_unattributed_surface_is_refused(self):
        """No commit means the library it builds could not say where it came from."""
        root = self.surface(
            {"schemaVersion": 1, "sourceRepo": fetch.SOURCE_REPO, "bookCount": 1},
            [{"slug": "fixture", "feed": "fixture-feed.json"}])
        with self.assertRaises(fetch.SurfaceError):
            fetch.verify(root)


class ProcessTests(unittest.TestCase):
    def test_self_test_passes(self):
        """The nine cases the script declares for itself, run the way CI runs them."""
        result = subprocess.run([sys.executable, FETCHER, "--self-test"],
                                cwd=REPO, capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("all cases behaved as declared", result.stdout)

    def test_verifying_a_directory_that_is_not_a_surface_exits_one(self):
        with tempfile.TemporaryDirectory() as empty:
            result = subprocess.run([sys.executable, FETCHER, "--verify", empty],
                                    cwd=REPO, capture_output=True, text=True)
        self.assertEqual(result.returncode, 1, result.stdout + result.stderr)


if __name__ == "__main__":
    unittest.main()
