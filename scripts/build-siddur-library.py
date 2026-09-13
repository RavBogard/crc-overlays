#!/usr/bin/env python3
"""Build the server-only overlay authoring library from maintained siddur feeds.

Only blocks which carry both Hebrew and transliteration in the same canonical feed
record are admitted as bilingual blocks. English is admitted only when the feed
explicitly marks the block ``role: original``. The builder never aligns adjacent
blocks or infers a relationship between language channels.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT = ROOT / "content" / "siddur-library.json"
DEFAULT_SOURCE_ROOT = ROOT.parent / "shireishabbat"


class LibraryError(RuntimeError):
    pass


def load_json(path: Path) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise LibraryError(f"required source is absent: {path}") from exc
    except json.JSONDecodeError as exc:
        raise LibraryError(f"invalid JSON in {path}: {exc}") from exc


def file_sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def object_sha256(value: Any) -> str:
    payload = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def repository_commit(source_root: Path) -> str:
    try:
        return subprocess.run(
            ["git", "-C", str(source_root), "rev-parse", "HEAD"],
            check=True,
            capture_output=True,
            text=True,
        ).stdout.strip()
    except (OSError, subprocess.CalledProcessError) as exc:
        raise LibraryError(f"cannot resolve source repository commit: {source_root}") from exc


def nonempty(value: Any) -> str | None:
    return value if isinstance(value, str) and value else None


def opening_words(value: str, limit: int = 12) -> str:
    return " ".join(value.split()[:limit])


def distinct(values: list[str | None]) -> list[str]:
    result: list[str] = []
    for value in values:
        if value and value not in result:
            result.append(value)
    return result


def section_for(feed: dict[str, Any], index: Any) -> dict[str, Any] | None:
    if not isinstance(index, int):
        return None
    matches = [item for item in feed.get("sections", []) if item.get("idx") == index]
    if len(matches) > 1:
        raise LibraryError(f"feed has duplicate section index {index}")
    return matches[0] if matches else None


def validate_book(book: Any, manifest_path: Path) -> dict[str, Any]:
    if not isinstance(book, dict):
        raise LibraryError(f"{manifest_path} contains a non-object book")
    for key in ("slug", "title", "feed", "family", "familyLabel", "attribution"):
        if not nonempty(book.get(key)):
            raise LibraryError(f"book is missing {key}: {book!r}")
    return book


def validate_feed(feed: Any, book: dict[str, Any], path: Path) -> dict[str, Any]:
    if not isinstance(feed, dict) or feed.get("schemaVersion") != 1:
        raise LibraryError(f"unsupported feed schema: {path}")
    if feed.get("volume") != book["slug"]:
        raise LibraryError(
            f"feed volume mismatch for {book['slug']}: found {feed.get('volume')!r}"
        )
    printing = feed.get("printing")
    license_record = feed.get("license")
    if not isinstance(printing, dict) or not all(
        key in printing for key in ("gitSha", "pages", "builtAt")
    ):
        raise LibraryError(f"feed printing provenance is incomplete: {path}")
    if not isinstance(license_record, dict) or not nonempty(license_record.get("spdx")):
        raise LibraryError(f"feed license provenance is incomplete: {path}")
    units = feed.get("units")
    if not isinstance(units, list):
        raise LibraryError(f"feed units are absent: {path}")
    unit_ids: set[str] = set()
    for unit in units:
        if not isinstance(unit, dict) or not nonempty(unit.get("id")):
            raise LibraryError(f"feed has an invalid unit: {path}")
        if unit["id"] in unit_ids:
            raise LibraryError(f"feed has duplicate unit {unit['id']}: {path}")
        unit_ids.add(unit["id"])
        if not isinstance(unit.get("blocks"), list):
            raise LibraryError(f"unit has no block list: {unit['id']}")
    return feed


def build_library(source_root: Path) -> dict[str, Any]:
    dist = source_root / "dist-app"
    manifest_path = dist / "books.json"
    books = load_json(manifest_path)
    if not isinstance(books, list) or not books:
        raise LibraryError(f"book manifest is empty: {manifest_path}")

    commit = repository_commit(source_root)
    sources: list[dict[str, Any]] = []
    authorities: list[dict[str, Any]] = []
    coverage_books: list[dict[str, Any]] = []
    all_source_ids: set[str] = set()
    total_units = total_blocks = total_paired = total_original = 0
    total_unpaired_hebrew = total_unmarked_english = total_other = 0

    for raw_book in books:
        book = validate_book(raw_book, manifest_path)
        feed_path = dist / book["feed"]
        feed = validate_feed(load_json(feed_path), book, feed_path)
        feed_hash = file_sha256(feed_path)
        authority_id = f"shireishabbat:{book['slug']}:{feed_hash[:16]}"
        authority = {
            "id": authority_id,
            "repository": "shireishabbat",
            "repositoryCommit": commit,
            "feed": f"dist-app/{book['feed']}",
            "feedSha256": feed_hash,
            "feedSchemaVersion": feed["schemaVersion"],
            "printing": feed["printing"],
            "license": feed["license"],
        }
        authorities.append(authority)

        usable_units = 0
        unsupported_units: list[dict[str, Any]] = []
        book_blocks = book_paired = book_original = 0
        book_unpaired_hebrew = book_unmarked_english = book_other = 0

        for unit in feed["units"]:
            unit_id = unit["id"]
            source_id = f"library:{book['slug']}:{unit_id}"
            if source_id in all_source_ids:
                raise LibraryError(f"duplicate generated source ID: {source_id}")
            all_source_ids.add(source_id)
            blocks: list[dict[str, Any]] = []
            skipped = {
                "unpairedHebrew": 0,
                "englishWithoutOriginalRole": 0,
                "unsupportedOther": 0,
            }
            openings: list[str | None] = []

            for index, block in enumerate(unit["blocks"]):
                if not isinstance(block, dict):
                    raise LibraryError(f"non-object block in {unit_id} at index {index}")
                book_blocks += 1
                he, tr, en = nonempty(block.get("he")), nonempty(block.get("tr")), nonempty(block.get("en"))
                block_id = f"{source_id}#block-{index}"
                if he and tr:
                    blocks.append(
                        {
                            "id": block_id,
                            "index": index,
                            "kind": "bilingual",
                            "he": he,
                            "tr": tr,
                            "sourceBlockSha256": object_sha256(block),
                        }
                    )
                    book_paired += 1
                    openings.extend([opening_words(he), opening_words(tr)])
                elif block.get("role") == "original" and en:
                    blocks.append(
                        {
                            "id": block_id,
                            "index": index,
                            "kind": "original-en",
                            "en": en,
                            "role": "original",
                            "sourceBlockSha256": object_sha256(block),
                        }
                    )
                    book_original += 1
                    openings.append(opening_words(en))
                elif he and not tr:
                    skipped["unpairedHebrew"] += 1
                    book_unpaired_hebrew += 1
                elif en:
                    skipped["englishWithoutOriginalRole"] += 1
                    book_unmarked_english += 1
                else:
                    skipped["unsupportedOther"] += 1
                    book_other += 1

            if not blocks:
                unsupported_units.append(
                    {
                        "id": unit_id,
                        "name": unit.get("name", unit_id),
                        "reason": "no exact he+tr block or role:original English block",
                        "skipped": skipped,
                    }
                )
                continue

            usable_units += 1
            section = section_for(feed, unit.get("section"))
            section_name = nonempty(section.get("en")) if section else None
            section_he = nonempty(section.get("he")) if section else None
            aliases = distinct(
                [
                    nonempty(unit.get("caption")),
                    section_name,
                    section_he,
                    nonempty(book.get("title_he")),
                ]
            )
            unit_hash = object_sha256(unit)
            sources.append(
                {
                    "id": source_id,
                    "name": unit.get("name", unit_id),
                    "section": section_name or unit.get("section"),
                    "unitSha256": unit_hash,
                    "origin": authority_id,
                    "sourceSha256": unit_hash,
                    "book": book["slug"],
                    "service": book["title"],
                    "aliases": aliases,
                    "openingWords": distinct(openings)[:8],
                    "metadata": {
                        "bookTitle": book["title"],
                        "bookTitleHebrew": book.get("title_he", ""),
                        "family": book["family"],
                        "familyLabel": book["familyLabel"],
                        "sectionIndex": unit.get("section"),
                        "sectionTitle": section_name,
                        "sectionTitleHebrew": section_he,
                        "folios": unit.get("folios", []),
                    },
                    "authority": {
                        "id": authority_id,
                        "repository": "shireishabbat",
                        "repositoryCommit": commit,
                        "feed": f"dist-app/{book['feed']}",
                        "feedSha256": feed_hash,
                        "unitId": unit_id,
                        "unitSha256": unit_hash,
                    },
                    "blocks": blocks,
                }
            )

        book_coverage = {
            "book": book["slug"],
            "service": book["title"],
            "feed": f"dist-app/{book['feed']}",
            "feedSha256": feed_hash,
            "units": len(feed["units"]),
            "usableUnits": usable_units,
            "unsupportedUnits": unsupported_units,
            "blocks": book_blocks,
            "pairedBilingualBlocks": book_paired,
            "originalEnglishBlocks": book_original,
            "skipped": {
                "unpairedHebrew": book_unpaired_hebrew,
                "englishWithoutOriginalRole": book_unmarked_english,
                "unsupportedOther": book_other,
            },
        }
        coverage_books.append(book_coverage)
        total_units += len(feed["units"])
        total_blocks += book_blocks
        total_paired += book_paired
        total_original += book_original
        total_unpaired_hebrew += book_unpaired_hebrew
        total_unmarked_english += book_unmarked_english
        total_other += book_other

    return {
        "schemaVersion": 1,
        "generatedFrom": {
            "repository": "shireishabbat",
            "repositoryCommit": commit,
            "manifest": "dist-app/books.json",
            "manifestSha256": file_sha256(manifest_path),
        },
        "authorities": authorities,
        "sources": sources,
        "coverage": {
            "books": coverage_books,
            "totals": {
                "books": len(books),
                "units": total_units,
                "usableUnits": len(sources),
                "blocks": total_blocks,
                "pairedBilingualBlocks": total_paired,
                "originalEnglishBlocks": total_original,
                "skipped": {
                    "unpairedHebrew": total_unpaired_hebrew,
                    "englishWithoutOriginalRole": total_unmarked_english,
                    "unsupportedOther": total_other,
                },
            },
            "rules": [
                "Bilingual blocks require non-empty he and tr fields on the same feed block.",
                "Original English requires a non-empty en field and role:original on the same feed block.",
                "Translations, rubrics, trope without transliteration, and all other unmatched channels are excluded.",
                "No adjacency, verse label, page position, or render segment is used to infer language alignment.",
            ],
        },
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-root", type=Path, default=DEFAULT_SOURCE_ROOT)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    try:
        rendered = json.dumps(
            build_library(args.source_root.resolve()), ensure_ascii=False, indent=2
        ) + "\n"
        output = args.output.resolve()
        if args.check:
            if not output.exists():
                raise LibraryError(f"generated library is absent: {output}")
            if output.read_text(encoding="utf-8") != rendered:
                raise LibraryError(
                    "siddur library is stale; review source changes and rebuild explicitly"
                )
            print(f"siddur library verified: {output}")
        else:
            output.parent.mkdir(parents=True, exist_ok=True)
            output.write_text(rendered, encoding="utf-8", newline="\n")
            print(f"wrote siddur library: {output}")
        return 0
    except LibraryError as exc:
        print(f"source library error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
