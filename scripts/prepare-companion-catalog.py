#!/usr/bin/env python3
"""Prepare reviewed page-only Companion imports from a full offline export."""

from __future__ import annotations

import argparse
import copy
import gzip
import json
from pathlib import Path
from typing import Any, Iterator


TARGET_PAGES = {
    "2": "CRC Morning Rehearsal",
    "3": "CRC Morning Continued",
}
DROP_GLOBAL_SECTIONS = (
    "pages",
    "triggers",
    "surfaces",
    "surfaceGroups",
    "surfacesRemote",
    "surfaceInstances",
)


class PreparationError(RuntimeError):
    pass


def read_json(path: Path) -> Any:
    raw = path.read_bytes()
    if raw.startswith(b"\x1f\x8b"):
        raw = gzip.decompress(raw)
    return json.loads(raw.decode("utf-8"))


def unwrap(value: Any) -> Any:
    if isinstance(value, dict) and "value" in value:
        return value["value"]
    return value


def iter_actions(control: dict[str, Any]) -> Iterator[dict[str, Any]]:
    def visit(value: Any) -> Iterator[dict[str, Any]]:
        if isinstance(value, dict):
            if value.get("type") == "action" and (
                "definitionId" in value or "actionId" in value
            ):
                yield value
            for nested in value.values():
                yield from visit(nested)
        elif isinstance(value, list):
            for nested in value:
                yield from visit(nested)

    yield from visit(control.get("steps", {}))


def action_name(action: dict[str, Any]) -> str:
    return str(action.get("definitionId", action.get("actionId", "")))


def action_cue(action: dict[str, Any]) -> str:
    options = action.get("options")
    if not isinstance(options, dict):
        return ""
    return str(unwrap(options.get("cue", "")))


def set_button_label(control: dict[str, Any], label: str) -> bool:
    style = control.get("style")
    if not isinstance(style, dict):
        return False
    changed = False
    text = style.get("text")
    if isinstance(text, str):
        if text != label:
            style["text"] = label
            changed = True
    elif isinstance(text, dict) and "value" in text and text["value"] != label:
        text["value"] = label
        changed = True
    layers = style.get("layers", [])
    if isinstance(layers, list):
        for layer in layers:
            if not isinstance(layer, dict) or layer.get("type") != "text":
                continue
            layer_text = layer.get("text")
            if isinstance(layer_text, str) and layer_text != label:
                layer["text"] = label
                changed = True
            elif (
                isinstance(layer_text, dict)
                and "value" in layer_text
                and layer_text["value"] != label
            ):
                layer_text["value"] = label
                changed = True
    return changed


def transform_page(
    page: dict[str, Any], cue_names: dict[str, str], hidden_ids: set[str]
) -> tuple[int, int, int]:
    controls = page.get("controls")
    if not isinstance(controls, dict):
        raise PreparationError("target page has no controls map")
    removed = refreshed = native_buttons = 0
    for row_name, row in list(controls.items()):
        if not isinstance(row, dict):
            raise PreparationError(f"row {row_name!r} is not a control map")
        for column_name, control in list(row.items()):
            if not isinstance(control, dict):
                raise PreparationError(f"control {row_name}/{column_name} is invalid")
            actions = list(iter_actions(control))
            show_actions = [a for a in actions if action_name(a) == "show_cue"]
            if not show_actions:
                continue
            native_buttons += 1
            cue_ids = {action_cue(a) for a in show_actions}
            if "" in cue_ids:
                raise PreparationError(f"show_cue at {row_name}/{column_name} has no cue ID")
            hidden = cue_ids & hidden_ids
            if hidden:
                other_actions = [a for a in actions if action_name(a) != "show_cue"]
                if other_actions or cue_ids - hidden_ids:
                    names = sorted({action_name(a) for a in other_actions})
                    raise PreparationError(
                        f"refusing to remove mixed-action button {row_name}/{column_name}; "
                        f"other actions: {names or ['visible show_cue']}"
                    )
                del row[column_name]
                removed += 1
                continue
            unknown = cue_ids - cue_names.keys()
            if unknown:
                raise PreparationError(
                    f"unknown cue ID at {row_name}/{column_name}: {sorted(unknown)}"
                )
            if len(cue_ids) != 1:
                raise PreparationError(
                    f"multiple visible cues on button {row_name}/{column_name}"
                )
            if set_button_label(control, cue_names[next(iter(cue_ids))]):
                refreshed += 1
    return removed, refreshed, native_buttons


def page_only_export(full: dict[str, Any], page_number: str, page: dict[str, Any]) -> dict[str, Any]:
    candidate = copy.deepcopy(full)
    for key in DROP_GLOBAL_SECTIONS:
        candidate.pop(key, None)
    candidate["type"] = "page"
    candidate["page"] = page
    candidate["oldPageNumber"] = int(page_number)
    return candidate


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("export", type=Path, help="full Companion .companionconfig or JSON export")
    parser.add_argument("catalog", type=Path, help="generated CRC cues JSON")
    parser.add_argument("output_dir", type=Path, help="directory for page-only candidates and report")
    args = parser.parse_args()

    try:
        full = read_json(args.export)
        catalog = read_json(args.catalog)
        if not isinstance(full, dict) or not isinstance(full.get("pages"), dict):
            raise PreparationError("input must be a full Companion export with pages")
        if not isinstance(catalog, list):
            raise PreparationError("catalog must be a JSON array")
        cue_names: dict[str, str] = {}
        hidden_ids: set[str] = set()
        for cue in catalog:
            if not isinstance(cue, dict) or not isinstance(cue.get("id"), str) or not isinstance(cue.get("name"), str):
                raise PreparationError("catalog contains a cue without string id and name")
            cue_names[cue["id"]] = cue["name"]
            if cue.get("hidden") is True:
                hidden_ids.add(cue["id"])

        prepared: list[tuple[str, bytes]] = []
        reports: list[dict[str, Any]] = []
        for page_number, expected_name in TARGET_PAGES.items():
            source_page = full["pages"].get(page_number)
            if not isinstance(source_page, dict):
                raise PreparationError(f"page {page_number} is missing")
            if source_page.get("name") != expected_name:
                raise PreparationError(
                    f"page {page_number} must be named {expected_name!r}; found {source_page.get('name')!r}"
                )
            page = copy.deepcopy(source_page)
            removed, refreshed, native_buttons = transform_page(page, cue_names, hidden_ids)
            candidate = page_only_export(full, page_number, page)
            filename = f"page-{page_number}-crc-morning-catalog.companionconfig"
            payload = json.dumps(candidate, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
            prepared.append((filename, gzip.compress(payload, mtime=0)))
            reports.append(
                {
                    "page": int(page_number),
                    "name": expected_name,
                    "nativeCueButtons": native_buttons,
                    "hiddenButtonsRemoved": removed,
                    "visibleLabelsRefreshed": refreshed,
                    "output": filename,
                }
            )

        args.output_dir.mkdir(parents=True, exist_ok=True)
        for filename, payload in prepared:
            (args.output_dir / filename).write_bytes(payload)
        report = {"hiddenCatalogCues": len(hidden_ids), "pages": reports}
        (args.output_dir / "companion-catalog-report.json").write_text(
            json.dumps(report, indent=2) + "\n", encoding="utf-8"
        )
        print(json.dumps(report, indent=2))
        return 0
    except (OSError, json.JSONDecodeError, PreparationError) as error:
        parser.exit(2, f"error: {error}\n")


if __name__ == "__main__":
    raise SystemExit(main())
