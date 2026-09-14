#!/usr/bin/env python3
"""Adopt the producer's moments table into content/moments.json.

`content/moments.json` pairs a shireishabbat unit id with the moment of the service it belongs
to. The table is the producer's, curated by Daniel in stage-then-confirm batches; this repository
only consumes it, so the adoption is a verbatim copy guarded by a shape check.

A malformed file is a hard failure: the Monday workflow stops and opens no pull request, rather
than committing something `liturgyForCue` would silently read as "no moments". Nothing here
touches the siddur library or any deployment target.

    python scripts/adopt-moments.py <source> <destination>
"""

import json
import sys


def read_pairs(path):
    with open(path, encoding="utf-8") as handle:
        document = json.load(handle)
    if not isinstance(document, dict) or document.get("schemaVersion") != 1:
        raise SystemExit(f"moments: {path} is not a schemaVersion 1 document")
    moments = document.get("moments")
    if not isinstance(moments, list):
        raise SystemExit(f"moments: {path} has no moments list")
    seen = set()
    for entry in moments:
        if not isinstance(entry, dict):
            raise SystemExit(f"moments: {path} contains an entry that is not an object")
        moment_id, unit_id = entry.get("momentId"), entry.get("unitId")
        for name, value in (("momentId", moment_id), ("unitId", unit_id)):
            if not isinstance(value, str) or not value or len(value) > 200:
                raise SystemExit(f"moments: {path} has an entry with an unusable {name}")
        if unit_id in seen:
            raise SystemExit(f"moments: {path} names the unit {unit_id} twice")
        seen.add(unit_id)
    return document


def main(argv):
    if len(argv) != 3:
        raise SystemExit("usage: adopt-moments.py <source> <destination>")
    source, destination = argv[1], argv[2]
    document = read_pairs(source)
    with open(destination, "w", encoding="utf-8", newline="\n") as handle:
        json.dump(document, handle, ensure_ascii=False, indent=1)
        handle.write("\n")
    print(f"moments: adopted {len(document['moments'])} pair(s) from the producer")


if __name__ == "__main__":
    main(sys.argv)
