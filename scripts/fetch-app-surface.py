#!/usr/bin/env python3
"""Fetch shireishabbat's published app surface (`dist-app/`) instead of building it here.

Until 2026-09-20 the Siddur library workflow checked out the whole source repository with
full history and ran `build/setup.sh && build/build-app.sh` on the runner. That worked while
the producer's build needed nothing but python and bash. It no longer does: the build now
produces braille editions through liblouis, which this runner does not install, so the script
exits 1 after writing a perfectly good `dist-app/` -- and the regeneration this repo depends
on stops. Building someone else's repository means adopting every dependency they add.

shireishabbat now publishes the surface itself, as a `dist-app` artifact with a
`PROVENANCE.json` naming the commit it came from (R-0919-audit master plan, Wave 2 item 2).
This takes that artifact.

Which artifact, precisely: the newest run of the producer's build workflow on its default
branch whose `publish-app-surface` JOB succeeded -- not whose run succeeded. Those are
different, and the difference is the point. On 2026-09-20 run 35518946924 concluded `failure`
because one volume's typesetting failed, while `publish-app-surface` inside it succeeded and
published a complete 13-book surface. Waiting for a wholly green run would mean waiting for
work that has nothing to do with the surface.

What it refuses: an artifact with no provenance, a provenance naming a different repository or
no commit, a book manifest whose feeds are not all present, and a provenance whose `bookCount`
disagrees with the manifest. A half-published surface must not quietly become a library.

Modes:
  --into <dir>     fetch and unpack, then verify. Needs `gh` authenticated for the source repo.
  --verify <dir>   verify a surface already on disk. No network. This is what the tests drive.
  --self-test      the verifier's own cases.

Exit 0 usable, 1 refused, 2 could not look.
"""

from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path
from typing import Any

SOURCE_REPO = "RavBogard/ShireiShabbat"
SOURCE_WORKFLOW = "build-siddur.yml"
SOURCE_BRANCH = "main"
PUBLISHING_JOB = "publish-app-surface"
ARTIFACT_NAME = "dist-app"
RUNS_TO_CONSIDER = 20


class SurfaceError(Exception):
    """The surface cannot be used, and the message says why."""


def gh_json(path: str) -> Any:
    """Read one GitHub API path through the `gh` CLI, which already holds the token."""
    try:
        finished = subprocess.run(
            ["gh", "api", path],
            check=True,
            capture_output=True,
            text=True,
        )
    except FileNotFoundError as exc:  # pragma: no cover - environment, not logic
        raise SurfaceError("the gh CLI is not on PATH, so the artifact cannot be fetched") from exc
    except subprocess.CalledProcessError as exc:
        raise SurfaceError("GitHub refused %s: %s" % (path, exc.stderr.strip()[:400])) from exc
    return json.loads(finished.stdout)


def publishing_job_succeeded(jobs: Any) -> bool:
    """True when the run's own publishing job succeeded, whatever the run concluded."""
    if not isinstance(jobs, dict):
        return False
    for job in jobs.get("jobs", []):
        if isinstance(job, dict) and job.get("name") == PUBLISHING_JOB:
            return job.get("conclusion") == "success"
    return False


def live_surface_artifact(artifacts: Any) -> dict[str, Any] | None:
    """The run's unexpired `dist-app` artifact, or None."""
    if not isinstance(artifacts, dict):
        return None
    for artifact in artifacts.get("artifacts", []):
        if (
            isinstance(artifact, dict)
            and artifact.get("name") == ARTIFACT_NAME
            and not artifact.get("expired")
        ):
            return artifact
    return None


def choose_run() -> tuple[dict[str, Any], dict[str, Any]]:
    """The newest run that both published the surface and still holds it."""
    listing = gh_json(
        "repos/%s/actions/workflows/%s/runs?branch=%s&per_page=%d"
        % (SOURCE_REPO, SOURCE_WORKFLOW, SOURCE_BRANCH, RUNS_TO_CONSIDER)
    )
    runs = listing.get("workflow_runs", []) if isinstance(listing, dict) else []
    if not runs:
        raise SurfaceError(
            "%s has no runs of %s on %s to take a surface from"
            % (SOURCE_REPO, SOURCE_WORKFLOW, SOURCE_BRANCH)
        )
    skipped: list[str] = []
    for run in runs:
        run_id = run.get("id")
        if run.get("status") != "completed":
            skipped.append("%s: still running" % run_id)
            continue
        jobs = gh_json("repos/%s/actions/runs/%s/jobs" % (SOURCE_REPO, run_id))
        if not publishing_job_succeeded(jobs):
            skipped.append("%s: %s did not succeed" % (run_id, PUBLISHING_JOB))
            continue
        artifacts = gh_json("repos/%s/actions/runs/%s/artifacts" % (SOURCE_REPO, run_id))
        artifact = live_surface_artifact(artifacts)
        if artifact is None:
            skipped.append("%s: no unexpired %s artifact" % (run_id, ARTIFACT_NAME))
            continue
        return run, artifact
    raise SurfaceError(
        "no run in the last %d published a surface that is still downloadable:\n  %s"
        % (len(runs), "\n  ".join(skipped))
    )


def download(artifact: dict[str, Any], into: Path) -> None:
    """Unpack the artifact zip into `into`, replacing whatever was there."""
    artifact_id = artifact["id"]
    with tempfile.TemporaryDirectory() as scratch:
        archive = Path(scratch) / "dist-app.zip"
        with open(archive, "wb") as handle:
            finished = subprocess.run(
                ["gh", "api", "repos/%s/actions/artifacts/%s/zip" % (SOURCE_REPO, artifact_id)],
                stdout=handle,
                stderr=subprocess.PIPE,
            )
        if finished.returncode != 0:
            raise SurfaceError(
                "downloading artifact %s failed: %s"
                % (artifact_id, finished.stderr.decode("utf-8", "replace").strip()[:400])
            )
        if into.exists():
            shutil.rmtree(into)
        into.mkdir(parents=True)
        try:
            with zipfile.ZipFile(archive) as bundle:
                bundle.extractall(into)
        except zipfile.BadZipFile as exc:
            raise SurfaceError("artifact %s is not a readable zip" % artifact_id) from exc


def read_json(path: Path) -> Any:
    try:
        with open(path, encoding="utf-8") as handle:
            return json.load(handle)
    except FileNotFoundError as exc:
        raise SurfaceError("the surface is missing %s" % path.name) from exc
    except (OSError, ValueError) as exc:
        raise SurfaceError("%s cannot be read as JSON: %s" % (path, exc)) from exc


def verify(surface: Path) -> dict[str, Any]:
    """Refuse anything that is not a whole, attributable app surface. Returns the provenance."""
    provenance = read_json(surface / "PROVENANCE.json")
    if not isinstance(provenance, dict) or provenance.get("schemaVersion") != 1:
        raise SurfaceError("PROVENANCE.json is not a schemaVersion 1 document")
    if provenance.get("sourceRepo") != SOURCE_REPO:
        raise SurfaceError(
            "PROVENANCE.json names %r, not %s" % (provenance.get("sourceRepo"), SOURCE_REPO)
        )
    commit = provenance.get("sourceSha")
    if not isinstance(commit, str) or not re.fullmatch(r"[0-9a-f]{40}", commit):
        raise SurfaceError("PROVENANCE.json names no source commit")

    books = read_json(surface / "books.json")
    if not isinstance(books, list) or not books:
        raise SurfaceError("books.json is not a non-empty list of volumes")
    declared = provenance.get("bookCount")
    if declared is not None and declared != len(books):
        raise SurfaceError(
            "PROVENANCE.json claims %r book(s); books.json carries %d" % (declared, len(books))
        )
    for book in books:
        if not isinstance(book, dict) or not isinstance(book.get("feed"), str):
            raise SurfaceError("a volume in books.json declares no feed")
        if not (surface / book["feed"]).is_file():
            raise SurfaceError("the surface declares %s but does not carry it" % book["feed"])
    return provenance


def self_test() -> int:
    """Nine cases. Each states the verdict it expects, and a disagreement is a failure."""
    good_provenance = {
        "schemaVersion": 1,
        "sourceRepo": SOURCE_REPO,
        "sourceSha": "0" * 40,
        "bookCount": 1,
    }
    good_books = [{"slug": "fixture", "feed": "fixture-feed.json"}]
    without_commit = {k: v for k, v in good_provenance.items() if k != "sourceSha"}

    cases: list[tuple[str, Any, Any, list[str], bool]] = [
        ("a whole surface is accepted", good_provenance, good_books, ["fixture-feed.json"], True),
        ("no provenance file", None, good_books, ["fixture-feed.json"], False),
        ("wrong schema version", dict(good_provenance, schemaVersion=2), good_books, ["fixture-feed.json"], False),
        ("another repository", dict(good_provenance, sourceRepo="someone/else"), good_books, ["fixture-feed.json"], False),
        ("no source commit", without_commit, good_books, ["fixture-feed.json"], False),
        ("an abbreviated commit", dict(good_provenance, sourceSha="80de868"), good_books, ["fixture-feed.json"], False),
        ("no book manifest", good_provenance, None, ["fixture-feed.json"], False),
        ("a declared feed that is not there", good_provenance, good_books, [], False),
        ("a book count that disagrees with the manifest", dict(good_provenance, bookCount=13), good_books, ["fixture-feed.json"], False),
    ]

    failures = 0
    with tempfile.TemporaryDirectory() as scratch:
        for index, (name, provenance, books, feeds, expected) in enumerate(cases):
            root = Path(scratch) / str(index)
            root.mkdir(parents=True)
            if provenance is not None:
                (root / "PROVENANCE.json").write_text(json.dumps(provenance), encoding="utf-8")
            if books is not None:
                (root / "books.json").write_text(json.dumps(books), encoding="utf-8")
            for feed in feeds:
                (root / feed).write_text("{}", encoding="utf-8")
            try:
                verify(root)
                accepted, why = True, ""
            except SurfaceError as exc:
                accepted, why = False, str(exc)
            if accepted != expected:
                failures += 1
                print("   FAIL surface/%s - expected %s, got %s %s"
                      % (name, "accept" if expected else "refuse",
                         "accept" if accepted else "refuse", why))
            else:
                print("   ok   surface/%s" % name)
    if failures:
        print("   FAIL surface/self-test - %d case(s) did not behave as declared" % failures)
        return 1
    print("   ok   surface/self-test - all cases behaved as declared")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--into", type=Path, help="fetch and unpack the surface here")
    parser.add_argument("--verify", type=Path, help="verify a surface already on disk")
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()

    if args.self_test:
        return self_test()
    if args.verify is not None:
        try:
            provenance = verify(args.verify)
        except SurfaceError as error:
            print("   FAIL surface - %s" % error)
            return 1
        print("   ok   surface - %s from shireishabbat %s" % (args.verify, provenance["sourceSha"][:7]))
        return 0
    if args.into is None:
        parser.error("one of --into, --verify or --self-test")

    try:
        run, artifact = choose_run()
    except SurfaceError as error:
        print("   FAIL surface - %s" % error)
        return 2
    print("   surface  -> run %s (concluded %s), artifact %s, %.1f MB"
          % (run["id"], run.get("conclusion"), artifact["id"],
             artifact.get("size_in_bytes", 0) / 1_000_000))
    try:
        download(artifact, args.into)
        provenance = verify(args.into)
    except SurfaceError as error:
        print("   FAIL surface - %s" % error)
        return 1
    if provenance.get("runId") is not None and str(provenance["runId"]) != str(run["id"]):
        print("   FAIL surface - the artifact says it came from run %s, not %s"
              % (provenance["runId"], run["id"]))
        return 1
    print("   ok   surface - %s book(s) from shireishabbat %s, built %s"
          % (provenance.get("bookCount"), provenance["sourceSha"], provenance.get("builtAt")))
    return 0


if __name__ == "__main__":
    sys.exit(main())
