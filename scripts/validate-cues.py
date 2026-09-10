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
PRESENTATION_BOUNDS = {
    "hebrewFontSize": (24, 52),
    "transliterationFontSize": (20, 48),
    "titleFontSize": (20, 42),
}
BIRCHOT_UNIT = "awakening.birchot-hashachar@legacy-shabbat-morning"
BIRCHOT_TRANSLATIONS = {
    2: [0, 1],
    5: [3, 4],
    8: [6, 7],
    12: [10, 11],
    15: [13, 14],
    18: [16, 17],
    21: [19, 20],
    24: [22, 23],
}
BIRCHOT_VISIBLE_ROWS = {
    "0135de3c-9a47-4fdc-91b9-99bacdf64970": [2, 5, 8, 12],
    "b60c1abc-2257-4316-9ae4-2a03f72133d6": [15, 18, 21, 24],
}
BIRCHOT_ALIASES = {
    "ceb24b8c-d9a7-4607-99bf-c0962e2a88ff": "b60c1abc-2257-4316-9ae4-2a03f72133d6",
    "2b3da7a3-dc18-46f1-a792-13a4771b343c": "b60c1abc-2257-4316-9ae4-2a03f72133d6",
}
BIRCHOT_FINAL_SUPPLEMENT = "birchot-hashachar-final-clause"
SEQUENCE_ALIAS_TARGETS = {
    "f792daee-3663-4350-a3cb-783897e1f463": "65743cb0-95c9-4d26-b8eb-74c86f1f1b36",
    "7c087a0d-23cb-458e-af6a-3210982ff0d6": "0a4b12eb-1463-44d7-be91-329049e5ec82",
    "847f0ed9-cd05-44ed-b2a2-c7947cbb72d6": "aa4a2b0c-23d2-45d3-8268-735331466a60",
    "5bad62c7-3005-4977-8349-230520c70211": "a5c90765-48c0-4384-a3e2-65b43cc2adf1",
    "dbf354df-e399-4d8b-bcfc-c067cc3cf2fc": "f15c1944-da76-4d61-95c8-05c032d47c4d",
}
SEQUENCE_VISIBLE_COVERAGE = {
    "65743cb0-95c9-4d26-b8eb-74c86f1f1b36": [
        ("psukei.psalm-91@legacy-shabbat-morning", 0),
        ("psukei.psalm-91@legacy-shabbat-morning", 1),
        *(("psukei.psalm-92@legacy-shabbat-morning", index) for index in range(4)),
        ("psukei.ashrei-opening@legacy-shabbat-morning", 0),
        ("psukei.ashrei-opening@legacy-shabbat-morning", 1),
        ("psukei.kol-hanshamah@legacy-shabbat-morning", 0),
        ("psukei.kol-hanshamah@legacy-shabbat-morning", 1),
    ],
    "c2d2c129-7d7d-4bbc-a296-46cc1fb9f48e": [
        *(("concluding.mourners-kaddish@legacy-shabbat-morning", index) for index in range(2, 13))
    ],
    "f15c1944-da76-4d61-95c8-05c032d47c4d": [
        *(("concluding.mourners-kaddish@legacy-shabbat-morning", index) for index in range(13, 24))
    ],
    "0a4b12eb-1463-44d7-be91-329049e5ec82": [
        *(("psukei.chatzi-kaddish@legacy-shabbat-morning", index) for index in range(15))
    ],
    "aa4a2b0c-23d2-45d3-8268-735331466a60": [
        *(("shma.yotzer-or@legacy-shabbat-morning", index) for index in range(16))
    ],
    "a5c90765-48c0-4384-a3e2-65b43cc2adf1": [
        *(("shma.mi-chamocha@legacy-shabbat-morning", index) for index in range(13))
    ],
}


class ValidationError(RuntimeError):
    pass


def load(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def object_sha256(value: Any) -> str:
    payload = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def validate_presentation(value: Any, cue_id: str) -> dict[str, int] | None:
    if value is None:
        return None
    if not isinstance(value, dict) or not value:
        raise ValidationError(f"presentation for {cue_id} must be a non-empty object")
    extra = set(value) - set(PRESENTATION_BOUNDS)
    if extra:
        raise ValidationError(f"unsupported presentation fields for {cue_id}: {sorted(extra)!r}")
    for key, raw in value.items():
        minimum, maximum = PRESENTATION_BOUNDS[key]
        if isinstance(raw, bool) or not isinstance(raw, int) or not minimum <= raw <= maximum:
            raise ValidationError(
                f"presentation.{key} for {cue_id} must be an integer from {minimum} to {maximum}"
            )
    return value


def validate_content_rows(
    cue_map: dict[str, Any], cue: dict[str, Any], supplements: dict[str, Any]
) -> None:
    cue_id = cue_map["id"]
    rows = cue_map.get("contentRows")
    expected_en_blocks = BIRCHOT_VISIBLE_ROWS.get(cue_id)
    if cue_id in BIRCHOT_ALIASES:
        expected_en_blocks = BIRCHOT_VISIBLE_ROWS[BIRCHOT_ALIASES[cue_id]]
        if cue_map.get("aliasOf") != BIRCHOT_ALIASES[cue_id] or cue_map.get("hidden") is not True:
            raise ValidationError("retired Birchot panels must remain hidden aliases of panel 2")
    elif cue_map.get("aliasOf") is not None or cue_map.get("hidden") is not None:
        if (
            cue_map.get("aliasOf") != SEQUENCE_ALIAS_TARGETS.get(cue_id)
            or cue_map.get("hidden") is not True
        ):
            raise ValidationError(f"unexpected cue alias metadata: {cue_id}")
    if cue.get("aliasOf") != cue_map.get("aliasOf") or cue.get("hidden") != cue_map.get(
        "hidden"
    ):
        raise ValidationError(f"compiled cue alias metadata mismatch: {cue_id}")
    if expected_en_blocks is None:
        if rows is not None or cue.get("contentRows") is not None:
            raise ValidationError(f"translations are not authorized for cue {cue_id}")
        return
    if not isinstance(rows, list) or len(rows) != len(expected_en_blocks):
        raise ValidationError(f"invalid Birchot content row count: {cue_id}")
    actual_en_blocks = []
    for row in rows:
        if not isinstance(row, dict) or set(row) != {"rowId", "he", "tr", "en"}:
            raise ValidationError(f"invalid Birchot content row shape: {cue_id}")
        he_spec, tr_spec, en_spec = row["he"], row["tr"], row["en"]
        if (
            not isinstance(row["rowId"], str)
            or not SLICE_ID.fullmatch(row["rowId"])
            or he_spec.get("unit") != BIRCHOT_UNIT
            or tr_spec.get("unit") != BIRCHOT_UNIT
            or en_spec.get("unit") != BIRCHOT_UNIT
            or he_spec.get("channel") != "he"
            or tr_spec.get("channel") != "tr"
            or en_spec.get("channel") != "en"
            or he_spec.get("blocks") != tr_spec.get("blocks")
            or len(en_spec.get("blocks", [])) != 1
        ):
            raise ValidationError(f"invalid Birchot content row selectors: {cue_id}")
        en_block = en_spec["blocks"][0]
        if BIRCHOT_TRANSLATIONS.get(en_block) != he_spec.get("blocks"):
            raise ValidationError(f"Birchot translation pairing changed: {cue_id}")
        supplement = en_spec.get("supplement")
        if supplement != (BIRCHOT_FINAL_SUPPLEMENT if en_block == 24 else None):
            raise ValidationError(f"Birchot translation supplement changed: {cue_id}")
        actual_en_blocks.append(en_block)
    if actual_en_blocks != expected_en_blocks:
        raise ValidationError(f"Birchot blessing coverage/order changed: {cue_id}")
    content_rows = cue.get("contentRows")
    if object_sha256(content_rows) != cue_map.get("expectedContentRowsSha256"):
        raise ValidationError(f"generated content row hash mismatch: {cue_id}")
    liturgy = cue.get("provenance", {}).get("liturgy", {})
    if liturgy.get("contentRows") != rows:
        raise ValidationError(f"content row provenance mismatch: {cue_id}")
    supplement_ids = {
        row["en"]["supplement"] for row in rows if row["en"].get("supplement")
    }
    expected_supplements = {
        supplement_id: supplements[supplement_id] for supplement_id in supplement_ids
    }
    if liturgy.get("supplements", {}) != expected_supplements:
        raise ValidationError(f"content row supplement provenance mismatch: {cue_id}")


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
        expected_presentation = validate_presentation(cue_map.get("presentation"), cue_id)
        if cue.get("presentation") != expected_presentation:
            raise ValidationError(f"compiled presentation metadata mismatch for {cue_id}")
        validate_content_rows(cue_map, cue, mapping.get("supplements", {}))
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
            expected_sequence_coverage = SEQUENCE_VISIBLE_COVERAGE.get(cue_id)
            if expected_sequence_coverage is not None and bilingual_coverage["he"] != expected_sequence_coverage:
                raise ValidationError(f"consolidated sequence coverage/order changed: {cue_id}")
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

    mapped_by_id = {cue["id"]: cue for cue in mapped}
    catalog_by_id = {cue["id"]: cue for cue in catalog}
    for alias_id, target_id in SEQUENCE_ALIAS_TARGETS.items():
        alias_map = mapped_by_id[alias_id]
        if alias_map.get("aliasOf") != target_id or alias_map.get("hidden") is not True:
            raise ValidationError(f"required sequence alias changed: {alias_id}")
    def source_identity(specs: Any) -> list[tuple[Any, ...]] | None:
        if specs is None:
            return None
        return [
            (spec.get("unit"), spec.get("channel"), spec.get("blocks"), spec.get("separator"))
            for spec in specs
        ]

    for alias_map in mapped:
        target_id = alias_map.get("aliasOf")
        if target_id is None:
            continue
        if target_id == alias_map["id"] or target_id not in mapped_by_id:
            raise ValidationError(f"invalid cue alias target: {alias_map['id']}")
        target_map = mapped_by_id[target_id]
        alias_cue = catalog_by_id[alias_map["id"]]
        target_cue = catalog_by_id[target_id]
        for field in ("textMain", "textMainheb", "textMainEng"):
            if source_identity(alias_map.get("fields", {}).get(field)) != source_identity(
                target_map.get("fields", {}).get(field)
            ):
                raise ValidationError(f"cue alias source selectors differ: {alias_map['id']}")
            if alias_cue.get("texts", {}).get(field) != target_cue.get("texts", {}).get(field):
                raise ValidationError(f"compiled cue alias text differs: {alias_map['id']}")
        if alias_map.get("contentRows") != target_map.get("contentRows"):
            raise ValidationError(f"cue alias content rows differ: {alias_map['id']}")


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
