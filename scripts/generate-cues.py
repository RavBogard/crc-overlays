#!/usr/bin/env python3
"""Generate the bounded CRC overlay catalog from pinned legacy source evidence."""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_MAP = ROOT / "content" / "legacy-crc-shabbat-morning.sources.json"


class SourceError(RuntimeError):
    pass


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
BIRCHOT_FINAL_SUPPLEMENT = "birchot-hashachar-final-clause"


def file_sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def object_sha256(value: Any) -> str:
    payload = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def load_json(path: Path) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise SourceError(f"required source is absent: {path}") from exc
    except json.JSONDecodeError as exc:
        raise SourceError(f"invalid JSON in {path}: {exc}") from exc


def require_equal(label: str, actual: Any, expected: Any) -> None:
    if actual != expected:
        raise SourceError(f"{label} changed: expected {expected!r}, found {actual!r}")


def presentation(value: Any, cue_id: str) -> dict[str, int] | None:
    if value is None:
        return None
    if not isinstance(value, dict) or not value:
        raise SourceError(f"presentation for {cue_id} must be a non-empty object")
    extra = set(value) - set(PRESENTATION_BOUNDS)
    if extra:
        raise SourceError(f"unsupported presentation fields for {cue_id}: {sorted(extra)!r}")
    result: dict[str, int] = {}
    for key, raw in value.items():
        minimum, maximum = PRESENTATION_BOUNDS[key]
        if isinstance(raw, bool) or not isinstance(raw, int) or not minimum <= raw <= maximum:
            raise SourceError(
                f"presentation.{key} for {cue_id} must be an integer from {minimum} to {maximum}"
            )
        result[key] = raw
    return result


def load_supplements(mapping: dict[str, Any], source_root: Path) -> dict[str, str]:
    result = {}
    for supplement_id, evidence in mapping.get("supplements", {}).items():
        path = source_root / evidence["file"]
        raw = path.read_bytes()
        require_equal(
            f"supplement file {supplement_id} SHA-256",
            hashlib.sha256(raw).hexdigest(),
            evidence["fileSha256"],
        )
        require_equal(
            f"supplement source line {supplement_id} occurrence count",
            path.read_text(encoding="utf-8").splitlines().count(evidence["sourceLine"]),
            1,
        )
        text = evidence["text"]
        require_equal(
            f"supplement text {supplement_id} SHA-256",
            hashlib.sha256(text.encode("utf-8")).hexdigest(),
            evidence["textSha256"],
        )
        result[supplement_id] = text
    return result


def archive_text(composition: dict[str, Any], field: str) -> str:
    for data_id, links in composition.get("dataLinks", {}).items():
        link = links.get("text")
        if link and link.get("key") == field:
            value = composition.get("data", {}).get(data_id, {}).get("text")
            if isinstance(value, str):
                return value
    payload = (
        composition.get("dataSources", {})
        .get("composition", {})
        .get("controlNode", {})
        .get("payload", {})
    )
    value = payload.get(field)
    if not isinstance(value, str):
        raise SourceError(f"archive field {field!r} is absent")
    return value


def animations(composition: dict[str, Any]) -> list[dict[str, Any]]:
    result = []
    for element in [*composition.get("tiles", {}).values(), *composition.get("groups", {}).values()]:
        for direction, effect in element.get("effects", {}).items():
            if effect.get("effect") in (None, "none"):
                continue
            result.append(
                {
                    "element": element.get("name"),
                    "direction": direction,
                    "effect": effect,
                    "keyframes": element.get("keyframes", {}).get(direction),
                }
            )
    return result


def render_line(spec: dict[str, Any], units: dict[str, dict[str, Any]], composition: dict[str, Any]) -> str:
    if "archiveField" in spec:
        return archive_text(composition, spec["archiveField"])
    unit_id = spec["unit"]
    channel = spec["channel"]
    try:
        blocks = units[unit_id]["blocks"]
    except KeyError as exc:
        raise SourceError(f"mapped unit is absent: {unit_id}") from exc
    values = []
    for index in spec["blocks"]:
        try:
            block = blocks[index]
        except IndexError as exc:
            raise SourceError(f"block {index} is absent from {unit_id}") from exc
        channel = spec["channel"]
        expected_type = "english" if channel == "en" else "stanza"
        require_equal(f"{unit_id} block {index} type", block.get("type"), expected_type)
        if channel == "en" and "role" in spec:
            require_equal(
                f"{unit_id} block {index} English role",
                block.get("role"),
                spec["role"],
            )
        value = block.get(channel)
        if not isinstance(value, str) or not value:
            raise SourceError(f"channel {channel!r} is absent from {unit_id} block {index}")
        values.append(value)
    return spec.get("separator", " ").join(values)


def render_content_rows(
    rows: list[dict[str, Any]],
    units: dict[str, dict[str, Any]],
    composition: dict[str, Any],
    supplements: dict[str, str],
) -> list[dict[str, str]]:
    rendered = []
    for row in rows:
        he_spec, tr_spec, en_spec = row["he"], row["tr"], row["en"]
        if (
            he_spec.get("unit") != BIRCHOT_UNIT
            or tr_spec.get("unit") != BIRCHOT_UNIT
            or en_spec.get("unit") != BIRCHOT_UNIT
            or he_spec.get("channel") != "he"
            or tr_spec.get("channel") != "tr"
            or en_spec.get("channel") != "en"
            or he_spec.get("blocks") != tr_spec.get("blocks")
            or len(en_spec.get("blocks", [])) != 1
            or BIRCHOT_TRANSLATIONS.get(en_spec["blocks"][0]) != he_spec.get("blocks")
        ):
            raise SourceError(f"invalid Birchot translation row: {row.get('rowId')!r}")
        expected_supplement = (
            BIRCHOT_FINAL_SUPPLEMENT if en_spec["blocks"][0] == 24 else None
        )
        if en_spec.get("supplement") != expected_supplement:
            raise SourceError(f"invalid Birchot translation supplement: {row.get('rowId')!r}")
        values = {
            channel: render_line(row[channel], units, composition)
            for channel in ("he", "tr", "en")
        }
        supplement_id = row["en"].get("supplement")
        if supplement_id:
            try:
                values["en"] += row["en"].get("supplementSeparator", "\n") + supplements[
                    supplement_id
                ]
            except KeyError as exc:
                raise SourceError(f"unknown translation supplement: {supplement_id}") from exc
        rendered.append(values)
    return rendered


def build_catalog(
    mapping: dict[str, Any],
    feed: dict[str, Any],
    archive: dict[str, Any],
    supplements: dict[str, str] | None = None,
) -> list[dict[str, Any]]:
    supplements = supplements or {}
    authority = mapping["authority"]
    require_equal("feed schemaVersion", feed.get("schemaVersion"), authority["feedSchemaVersion"])
    require_equal("feed printing", feed.get("printing"), authority["printing"])
    require_equal("feed license", feed.get("license"), authority["license"])
    units = {unit["id"]: unit for unit in feed.get("units", [])}
    for unit_id, expected_hash in mapping["units"].items():
        if unit_id not in units:
            raise SourceError(f"mapped unit is absent: {unit_id}")
        require_equal(f"unit {unit_id} SHA-256", object_sha256(units[unit_id]), expected_hash)

    catalog = []
    seen = set()
    for cue_map in mapping["cues"]:
        cue_id = cue_map["id"]
        if cue_id in seen:
            raise SourceError(f"duplicate cue UUID: {cue_id}")
        seen.add(cue_id)
        try:
            composition = archive["compositions"][cue_id]
        except KeyError as exc:
            raise SourceError(f"archive composition is absent: {cue_id}") from exc
        require_equal(
            f"archive composition {cue_id} SHA-256",
            object_sha256(composition),
            cue_map["archiveRecordSha256"],
        )
        text_fields = {
            name: "\n".join(render_line(line, units, composition) for line in lines)
            for name, lines in cue_map["fields"].items()
        }
        text_fields["textTitle"] = archive_text(composition, cue_map["title"]["archiveField"])
        if "accentTitle" in cue_map:
            text_fields["accentTextTitle"] = archive_text(
                composition, cue_map["accentTitle"]["archiveField"]
            )
        require_equal(
            f"generated text fields for {cue_id} SHA-256",
            object_sha256(text_fields),
            cue_map["expectedTextsSha256"],
        )
        source_units = sorted(
            {
                line["unit"]
                for lines in cue_map["fields"].values()
                for line in lines
                if "unit" in line
            }
        )
        provenance: dict[str, Any] = {
            "kind": "generated legacy CRC source adapter",
            "mappingSchemaVersion": mapping["schemaVersion"],
            "archive": {
                "file": mapping["archive"]["file"],
                "sha256": mapping["archive"]["sha256"],
                "compositionUuid": cue_id,
                "compositionSha256": cue_map["archiveRecordSha256"],
                "operatorName": cue_map["operatorName"],
                "textsSha256": cue_map["expectedTextsSha256"],
                "role": mapping["archive"]["role"],
            },
        }
        if source_units:
            provenance["liturgy"] = {
                "repository": authority["repository"],
                "repositoryCommit": authority["repositoryCommit"],
                "feed": authority["feed"],
                "feedSha256": authority["feedSha256"],
                "printing": authority["printing"],
                "license": authority["license"],
                "unitIds": source_units,
                "slices": cue_map["fields"],
            }
        else:
            provenance["copy"] = "authorized non-liturgical archive resource reuse"
        generated_cue = {
            "id": cue_id,
            "name": cue_map["operatorName"],
            "layout": cue_map["layout"],
            "texts": text_fields,
            "animations": animations(composition),
            "duration": archive["compositionProps"]["durations"][cue_id],
            "provenance": provenance,
        }
        cue_presentation = presentation(cue_map.get("presentation"), cue_id)
        if cue_presentation is not None:
            generated_cue["presentation"] = cue_presentation
        if "contentRows" in cue_map:
            content_rows = render_content_rows(
                cue_map["contentRows"], units, composition, supplements
            )
            require_equal(
                f"generated content rows for {cue_id} SHA-256",
                object_sha256(content_rows),
                cue_map["expectedContentRowsSha256"],
            )
            generated_cue["contentRows"] = content_rows
            provenance["liturgy"]["contentRows"] = cue_map["contentRows"]
            supplement_ids = sorted(
                {
                    row["en"]["supplement"]
                    for row in cue_map["contentRows"]
                    if row["en"].get("supplement")
                }
            )
            if supplement_ids:
                provenance["liturgy"]["supplements"] = {
                    supplement_id: mapping["supplements"][supplement_id]
                    for supplement_id in supplement_ids
                }
        if "aliasOf" in cue_map:
            generated_cue["aliasOf"] = cue_map["aliasOf"]
            generated_cue["hidden"] = cue_map.get("hidden", False)
        catalog.append(generated_cue)
    return catalog


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--mapping", type=Path, default=DEFAULT_MAP)
    parser.add_argument("--source-root", type=Path, default=ROOT.parent / "shireishabbat")
    parser.add_argument(
        "--archive-root",
        type=Path,
        default=ROOT.parent / "Singular-CRC-Archive" / "2026-09-09-master",
    )
    parser.add_argument("--output", type=Path, default=ROOT / "lib" / "cues.json")
    parser.add_argument("--check", action="store_true", help="verify output without writing it")
    args = parser.parse_args()
    try:
        mapping = load_json(args.mapping)
        feed_path = args.source_root / mapping["authority"]["feed"]
        archive_path = args.archive_root / mapping["archive"]["file"]
        require_equal("feed SHA-256", file_sha256(feed_path), mapping["authority"]["feedSha256"])
        require_equal("archive SHA-256", file_sha256(archive_path), mapping["archive"]["sha256"])
        catalog = build_catalog(
            mapping,
            load_json(feed_path),
            load_json(archive_path),
            load_supplements(mapping, args.source_root),
        )
        rendered = json.dumps(catalog, ensure_ascii=False, indent=2) + "\n"
        if args.check:
            require_equal("generated catalog", args.output.read_text(encoding="utf-8"), rendered)
            print(f"verified {len(catalog)} generated cues")
        else:
            args.output.write_text(rendered, encoding="utf-8")
            print(f"generated {len(catalog)} cues in {args.output}")
        return 0
    except (KeyError, SourceError, FileNotFoundError) as exc:
        print(f"cue generation failed closed: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
