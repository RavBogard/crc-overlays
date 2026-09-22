#!/usr/bin/env python3
"""Build the server-only overlay authoring source pack from the pinned CRC feed."""

from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
BIRCHOT_UNIT = "awakening.birchot-hashachar@legacy-shabbat-morning"
BIRCHOT_TRANSLATIONS = {
    2: (0, 1),
    5: (3, 4),
    8: (6, 7),
    12: (10, 11),
    15: (13, 14),
    18: (16, 17),
    21: (19, 20),
    24: (22, 23),
}
BIRCHOT_FINAL_SUPPLEMENT = "birchot-hashachar-final-clause"


def object_sha256(value: Any) -> str:
    payload = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def text_sha256(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def load_supplements(mapping: dict[str, Any], source_root: Path) -> dict[str, str]:
    result = {}
    for supplement_id, evidence in mapping.get("supplements", {}).items():
        path = source_root / evidence["file"]
        raw = path.read_bytes()
        if hashlib.sha256(raw).hexdigest() != evidence["fileSha256"]:
            raise SystemExit(f"supplement file changed: {evidence['file']}")
        source_line = evidence["sourceLine"]
        if path.read_text(encoding="utf-8").splitlines().count(source_line) != 1:
            raise SystemExit(f"supplement source line changed: {supplement_id}")
        text = evidence["text"]
        if text_sha256(text) != evidence["textSha256"]:
            raise SystemExit(f"supplement text hash changed: {supplement_id}")
        result[supplement_id] = text
    return result


def private_original_english_sources(mapping: dict[str, Any]) -> list[dict[str, Any]]:
    """Build reviewed CRC-original readings that are deliberately outside the print feed.

    These records preserve an archive address and hashes in the generated private pack.
    They are not a permission grant and cannot change the pinned printed source.
    """
    sources = []
    seen_ids = set()
    for record in mapping.get("privateOriginalEnglish", []):
        source_id = record.get("id")
        text = record.get("text")
        provenance = record.get("provenance")
        if not isinstance(source_id, str) or not source_id or source_id in seen_ids:
            raise SystemExit("private original-English source ID is absent or duplicated")
        if not isinstance(text, str) or not text:
            raise SystemExit(f"private original-English source text is absent: {source_id}")
        if text_sha256(text) != record.get("textSha256"):
            raise SystemExit(f"private original-English source text hash changed: {source_id}")
        if not isinstance(provenance, dict) or not isinstance(provenance.get("archive"), dict):
            raise SystemExit(f"private original-English provenance is absent: {source_id}")
        archive = provenance["archive"]
        if not all(isinstance(archive.get(key), str) and archive[key] for key in ("file", "sha256", "compositionId", "textProperty")):
            raise SystemExit(f"private original-English archive provenance is incomplete: {source_id}")
        if len(archive["sha256"]) != 64:
            raise SystemExit(f"private original-English archive hash is invalid: {source_id}")
        block = {
            "id": f"{source_id}#block-0",
            "index": 0,
            "kind": "original-en",
            "en": text,
            "role": "original",
            "sourceBlockSha256": object_sha256({"text": text, "provenance": provenance}),
        }
        unit = {
            "id": source_id,
            "name": record.get("name") or source_id,
            "section": record.get("section"),
            "blocks": [block],
            "provenance": provenance,
        }
        unit["unitSha256"] = object_sha256(unit)
        sources.append(unit)
        seen_ids.add(source_id)
    return sources


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-root", type=Path, default=ROOT.parent / "shireishabbat")
    parser.add_argument(
        "--mapping", type=Path, default=ROOT / "content" / "legacy-crc-shabbat-morning.sources.json"
    )
    parser.add_argument(
        "--output", type=Path, default=ROOT / "content" / "authoring-sources.json"
    )
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()

    mapping = json.loads(args.mapping.read_text(encoding="utf-8"))
    authority = mapping["authority"]
    supplements = load_supplements(mapping, args.source_root)
    if (args.source_root / ".git").exists():
        source_commit = subprocess.run(
            ["git", "rev-parse", "HEAD"], cwd=args.source_root, check=True, capture_output=True, text=True
        ).stdout.strip()
        if source_commit != authority["repositoryCommit"]:
            raise SystemExit(f"source repository commit changed: {source_commit}")
    feed_path = args.source_root / authority["feed"]
    feed_bytes = feed_path.read_bytes()
    actual_feed_hash = hashlib.sha256(feed_bytes).hexdigest()
    if actual_feed_hash != authority["feedSha256"]:
        raise SystemExit(f"feed hash changed: {actual_feed_hash}")
    feed = json.loads(feed_bytes)

    sources = []
    for unit in feed.get("units", []):
        blocks = []
        for index, block in enumerate(unit.get("blocks", [])):
            if (
                block.get("type") == "stanza"
                and isinstance(block.get("he"), str)
                and block["he"]
                and isinstance(block.get("tr"), str)
                and block["tr"]
            ):
                blocks.append(
                    {
                        "id": f"{unit['id']}#block-{index}",
                        "index": index,
                        "kind": "bilingual",
                        "he": block["he"],
                        "tr": block["tr"],
                        "sourceBlockSha256": object_sha256(block),
                    }
                )
            elif unit["id"] == BIRCHOT_UNIT and index in BIRCHOT_TRANSLATIONS:
                if (
                    block.get("type") != "english"
                    or block.get("role") is not None
                    or not isinstance(block.get("en"), str)
                    or not block["en"]
                ):
                    raise SystemExit(f"Birchot translation block changed: {index}")
                supplement_ids = [BIRCHOT_FINAL_SUPPLEMENT] if index == 24 else []
                translated = block["en"] + "".join(
                    "\n" + supplements[supplement_id] for supplement_id in supplement_ids
                )
                feed_block_hash = object_sha256(block)
                blocks.append(
                    {
                        "id": f"{unit['id']}#block-{index}",
                        "index": index,
                        "kind": "translation-en",
                        "en": translated,
                        "pairedBlockIds": [
                            f"{unit['id']}#block-{paired_index}"
                            for paired_index in BIRCHOT_TRANSLATIONS[index]
                        ],
                        "feedBlockSha256": feed_block_hash,
                        "supplementIds": supplement_ids,
                        "sourceTextSha256": text_sha256(translated),
                        "sourceBlockSha256": object_sha256(
                            {
                                "feedBlockSha256": feed_block_hash,
                                "supplements": [
                                    {
                                        "id": supplement_id,
                                        "textSha256": mapping["supplements"][supplement_id][
                                            "textSha256"
                                        ],
                                    }
                                    for supplement_id in supplement_ids
                                ],
                            }
                        ),
                    }
                )
            elif (
                block.get("type") == "english"
                and block.get("role") == "original"
                and isinstance(block.get("en"), str)
                and block["en"]
            ):
                blocks.append(
                    {
                        "id": f"{unit['id']}#block-{index}",
                        "index": index,
                        "kind": "original-en",
                        "en": block["en"],
                        "role": "original",
                        "sourceBlockSha256": object_sha256(block),
                    }
                )
        sources.append(
            {
                "id": unit["id"],
                "name": unit.get("name") or unit["id"],
                "section": unit.get("section"),
                "unitSha256": object_sha256(unit),
                "blocks": blocks,
                **({"sourceBoundaries": unit["sourceBoundaries"]} if unit.get("sourceBoundaries") else {}),
            }
        )
    sources.extend(private_original_english_sources(mapping))

    artifact = {
        "schemaVersion": 1,
        "authority": {
            "repository": authority["repository"],
            "repositoryCommit": authority["repositoryCommit"],
            "feed": authority["feed"],
            "feedSha256": authority["feedSha256"],
            "feedSchemaVersion": authority["feedSchemaVersion"],
            "printing": authority["printing"],
            "license": authority["license"],
            "supplements": {
                supplement_id: {
                    key: evidence[key]
                    for key in ("file", "fileSha256", "symbol", "textSha256")
                }
                for supplement_id, evidence in mapping.get("supplements", {}).items()
            },
        },
        "sources": sources,
    }
    rendered = json.dumps(artifact, ensure_ascii=False, indent=2) + "\n"
    if args.check:
        if args.output.read_text(encoding="utf-8") != rendered:
            raise SystemExit("authoring source pack is stale")
        print(f"verified {len(sources)} authoring source units")
    else:
        args.output.write_text(rendered, encoding="utf-8")
        print(f"generated {len(sources)} authoring source units")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
