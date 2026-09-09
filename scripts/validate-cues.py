#!/usr/bin/env python3
"""Validate the committed cue catalog and its source mapping without private inputs."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
UUID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")
SLICE_ID = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")


class ValidationError(RuntimeError):
    pass


def load(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def object_sha256(value: Any) -> str:
    payload = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def validate(mapping: dict[str, Any], catalog: list[dict[str, Any]]) -> None:
    if mapping.get("schemaVersion") != 1:
        raise ValidationError("unsupported source-map schemaVersion")
    authority = mapping.get("authority", {})
    for key in ("repositoryCommit", "feed", "feedSha256", "printing", "license"):
        if not authority.get(key):
            raise ValidationError(f"authority.{key} is required")
    if authority.get("repository") != "shireishabbat":
        raise ValidationError("liturgy authority must remain shireishabbat")
    if authority.get("feed") != "dist-app/legacy-shabbat-morning-feed.json":
        raise ValidationError("first-service feed must remain legacy CRC Shabbat morning")

    mapped = mapping.get("cues", [])
    if len(mapped) != 29 or len(catalog) != 29:
        raise ValidationError("the bounded catalog must contain exactly twenty-nine source-mapped cues")
    mapped_ids = [cue.get("id") for cue in mapped]
    catalog_ids = [cue.get("id") for cue in catalog]
    if len(set(mapped_ids)) != len(mapped_ids) or mapped_ids != catalog_ids:
        raise ValidationError("cue UUIDs must be unique and catalog order must match the source map")

    for cue_map, cue in zip(mapped, catalog, strict=True):
        cue_id = cue_map["id"]
        if not UUID.fullmatch(cue_id):
            raise ValidationError(f"invalid archived cue UUID: {cue_id}")
        if cue.get("id") != cue_id or cue.get("name") != cue_map.get("operatorName"):
            raise ValidationError(f"operator identity changed for {cue_id}")
        if cue.get("layout") != cue_map.get("layout") or cue.get("layout") not in {"bottom", "left", "right"}:
            raise ValidationError(f"invalid layout for {cue_id}")
        if not cue.get("texts", {}).get("textTitle"):
            raise ValidationError(f"title missing for {cue_id}")
        if not isinstance(cue.get("animations"), list) or not cue.get("duration"):
            raise ValidationError(f"archive presentation metadata missing for {cue_id}")
        provenance = cue.get("provenance", {})
        archive = provenance.get("archive", {})
        if archive.get("compositionUuid") != cue_id:
            raise ValidationError(f"archive UUID provenance mismatch for {cue_id}")
        if archive.get("compositionSha256") != cue_map.get("archiveRecordSha256"):
            raise ValidationError(f"archive record hash provenance mismatch for {cue_id}")
        if object_sha256(cue.get("texts")) != cue_map.get("expectedTextsSha256"):
            raise ValidationError(f"generated text hash mismatch for {cue_id}")
        if archive.get("textsSha256") != cue_map.get("expectedTextsSha256"):
            raise ValidationError(f"generated text provenance mismatch for {cue_id}")

        source_specs = [
            spec
            for lines in cue_map.get("fields", {}).values()
            for spec in lines
            if "unit" in spec
        ]
        if cue_map.get("nonLiturgical"):
            if source_specs or "liturgy" in provenance or not provenance.get("copy"):
                raise ValidationError(f"non-liturgical cue incorrectly claims prayer provenance: {cue_id}")
            continue
        if not source_specs:
            raise ValidationError(f"prayer cue has no explicit source slices: {cue_id}")
        channels = {spec.get("channel") for spec in source_specs}
        if cue_map.get("originalReading"):
            if channels != {"en"} or any(spec.get("role") != "original" for spec in source_specs):
                raise ValidationError(
                    f"original English reading must select only role=original English: {cue_id}"
                )
        elif channels != {"he", "tr"}:
            raise ValidationError(f"prayer cue must explicitly select Hebrew and transliteration: {cue_id}")
        if not cue_map.get("originalReading"):
            bilingual_coverage = {
                channel: [
                    (spec.get("unit"), index)
                    for spec in source_specs
                    if spec.get("channel") == channel
                    for index in spec.get("blocks", [])
                ]
                for channel in ("he", "tr")
            }
            if bilingual_coverage["he"] != bilingual_coverage["tr"]:
                raise ValidationError(f"Hebrew/transliteration source coverage differs: {cue_id}")
        named_slices = [spec.get("sliceId") for spec in source_specs]
        if any(named_slices):
            if any(not isinstance(value, str) or not SLICE_ID.fullmatch(value) for value in named_slices):
                raise ValidationError(f"every source selector must have a valid named slice: {cue_id}")
            if len(named_slices) != len(set(named_slices)):
                raise ValidationError(f"named source slices must be unique within cue: {cue_id}")
        for spec in source_specs:
            if spec["unit"] not in mapping.get("units", {}):
                raise ValidationError(f"unhashed unit in {cue_id}: {spec['unit']}")
            blocks = spec.get("blocks")
            if not blocks or any(not isinstance(index, int) or index < 0 for index in blocks):
                raise ValidationError(f"invalid explicit block slice in {cue_id}")
        liturgy = provenance.get("liturgy", {})
        for key in ("repositoryCommit", "feed", "feedSha256", "printing", "license"):
            if liturgy.get(key) != authority.get(key):
                raise ValidationError(f"liturgy provenance {key} mismatch for {cue_id}")
        if set(liturgy.get("unitIds", [])) != {spec["unit"] for spec in source_specs}:
            raise ValidationError(f"unit provenance mismatch for {cue_id}")
        if liturgy.get("slices") != cue_map.get("fields"):
            raise ValidationError(f"slice provenance mismatch for {cue_id}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--mapping",
        type=Path,
        default=ROOT / "content" / "legacy-crc-shabbat-morning.sources.json",
    )
    parser.add_argument("--catalog", type=Path, default=ROOT / "lib" / "cues.json")
    args = parser.parse_args()
    try:
        validate(load(args.mapping), load(args.catalog))
        print("validated 29 source-mapped cues")
        return 0
    except (KeyError, OSError, json.JSONDecodeError, ValidationError) as exc:
        print(f"cue validation failed: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
