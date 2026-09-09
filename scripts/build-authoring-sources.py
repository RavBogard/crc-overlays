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


def object_sha256(value: Any) -> str:
    payload = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


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
            }
        )

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
