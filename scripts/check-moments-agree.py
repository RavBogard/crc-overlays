#!/usr/bin/env python3
"""Does content/moments.json still say what the producer's table says?

    check-moments-agree.py --canonical <path-or-url> [--ours content/moments.json]
    check-moments-agree.py --self-test

WHY THIS EXISTS (R-0919-audit-1 item d, Wave 2). `content/moments.json` pairs a shireishabbat
unit id with the moment of the service it belongs to. It is the producer's table and this repo
only consumes it: `scripts/adopt-moments.py` copies `dist-app/moments-pairs.json` verbatim in the
Monday workflow, and `liturgyForCue` reads the result. Nothing asserted that the copy still
agreed with the original.

It did not. Measured 2026-09-20 against the producer's table, four pairs had drifted -- the
`shofar.service` -> `shofar.shofar-service` rename (R9-b) and three `amidah` renames (R6-h). A
cue pinned to any of those four resolved to no moment at all, quietly, exactly the way the
Barechu cue did. Three copies of one table disagreed and nothing noticed, which is the failure
this instrument exists to break.

HOW THIS DIFFERS FROM THE CANONICAL TOOL. shireishabbat's `build/tools/moments_agree.py` compares
an INTERSECTION scoped by the unit id's service suffix, because `.live` carries 9 of 13 books on
purpose and the reader carries a different 13. Neither of those is this repo. This repo's copy is
a VERBATIM copy of the whole table, so the right comparison is the whole table, exactly: a pair
present on one side and not the other is a difference, never a legitimate subset. A subset rule
here would pass a table that lost half its rows.

(The canonical tool cannot read this repo's copy at all today: `moments_index` expects `.live`'s
`{id, occurrences:[{book, unitId}]}` shape, and this repo's copy is the flat `moments-pairs`
shape the producer publishes. Run against it, it reports "no service in common ... nothing could
be compared", which is honest and useless. Adding a `pairs`-shaped consumer to that tool is
shireishabbat's to do; until then this is the check, and it is the stricter one.)

EXIT: 0 = the two tables agree exactly. 1 = they differ. 2 = the producer's table could not be
read, so nothing was measured -- which is not a pass.
"""

import argparse
import io
import json
import os
import sys
import urllib.request

TIMEOUT = 30

# Reachable from a Windows shell, whose default stdout encoding is cp1252 and which raises on
# the first arrow character. Say utf-8 once, out loud, rather than crash inside the report.
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")


# ---------------------------------------------------------------- loading

def _is_url(s):
    return s.startswith("http://") or s.startswith("https://")


def _read_json(loc):
    if _is_url(loc):
        with urllib.request.urlopen(loc, timeout=TIMEOUT) as response:
            return json.loads(response.read().decode("utf-8"))
    with io.open(loc, encoding="utf-8") as handle:
        return json.load(handle)


def resolve_canonical(loc):
    """Accept the table itself, or a dist-app directory (or URL base) that holds it."""
    if _is_url(loc):
        return loc if loc.endswith(".json") else loc.rstrip("/") + "/moments-pairs.json"
    if os.path.isdir(loc):
        return os.path.join(loc, "moments-pairs.json")
    return loc


def pairs_of(document, where):
    """The (momentId, unitId) set out of a moments-pairs document, shape-checked.

    The same shape check `adopt-moments.py` applies, for the same reason: a malformed table
    read as an empty one would report every pair as missing, or -- worse, if both sides were
    empty -- as agreement.
    """
    if not isinstance(document, dict) or document.get("schemaVersion") != 1:
        raise ValueError("%s is not a schemaVersion 1 moments document" % where)
    moments = document.get("moments")
    if not isinstance(moments, list):
        raise ValueError("%s has no moments list" % where)
    pairs = set()
    for entry in moments:
        if not isinstance(entry, dict):
            raise ValueError("%s contains an entry that is not an object" % where)
        moment_id, unit_id = entry.get("momentId"), entry.get("unitId")
        for name, value in (("momentId", moment_id), ("unitId", unit_id)):
            if not isinstance(value, str) or not value:
                raise ValueError("%s has an entry with an unusable %s" % (where, name))
        pairs.add((moment_id, unit_id))
    return pairs


# ---------------------------------------------------------------- comparison

def _sample(items, limit=12):
    spelled = sorted("%s -> %s" % pair for pair in items)
    if len(spelled) <= limit:
        return spelled
    return spelled[:limit] + ["...and %d more" % (len(spelled) - limit)]


def compare(ours, theirs):
    """Returns (agreed, lines). `ours` and `theirs` are (momentId, unitId) sets."""
    only_ours = ours - theirs
    only_theirs = theirs - ours
    if not only_ours and not only_theirs:
        return True, ["   OK   moments/agree - %d pair(s), identical to the producer's table"
                      % len(ours)]

    lines = []
    if only_ours:
        lines.append("   FAIL moments/agree - %d pair(s) here that the producer's table does "
                     "not have" % len(only_ours))
        lines.extend("        - %s" % line for line in _sample(only_ours))
    if only_theirs:
        lines.append("   FAIL moments/agree - %d pair(s) in the producer's table that are not "
                     "here" % len(only_theirs))
        lines.extend("        + %s" % line for line in _sample(only_theirs))

    # A rename shows up as one pair on each side. Name the unit ids that moved, because that
    # is the sentence a reader can act on; the raw sets above are the evidence for it.
    moved = sorted({unit for _, unit in only_ours} ^ {unit for _, unit in only_theirs})
    if moved:
        lines.append("        The unit ids involved: %s" % ", ".join(moved[:12]))
    lines.append("        Fix by regenerating: the Siddur library workflow adopts the "
                 "producer's table verbatim. Never hand-edit content/moments.json.")
    return False, lines


# ---------------------------------------------------------------- self-test

def _doc(pairs):
    return {"schemaVersion": 1,
            "moments": [{"momentId": m, "unitId": u} for m, u in pairs]}


def self_test():
    """Six cases, each asserting its own verdict. Exits 0 only if all six behave as declared.

    The case that matters is the fourth: a renamed unit id must FAIL. A check whose failing
    path has never been seen to fire is a check nobody should trust, and this repo has just
    been shown four real renames that went unnoticed for days.
    """
    base = [("shofar-service", "shofar.shofar-service@crc-rh-morning"),
            ("adon-olam", "concluding.adon-olam@bm-shacharit")]
    cases = [
        ("identical tables agree", base, base, True),
        ("order does not matter", base, list(reversed(base)), True),
        ("an empty pair of tables agrees", [], [], True),
        ("a renamed unit id fails",
         [("shofar-service", "shofar.service@crc-rh-morning")] + base[1:], base, False),
        ("a pair the producer dropped fails", base, base[:1], False),
        ("a pair only the producer has fails", base[:1], base, False),
    ]
    ok = True
    for name, ours, theirs, expected in cases:
        agreed, _ = compare(pairs_of(_doc(ours), "ours"), pairs_of(_doc(theirs), "theirs"))
        verdict = "ok" if agreed == expected else "WRONG"
        if agreed != expected:
            ok = False
        print("   %-5s self-test - %s" % (verdict, name))

    # A malformed table must raise rather than read as empty.
    for name, document in (("a table with no schemaVersion", {"moments": []}),
                           ("a table with no moments list", {"schemaVersion": 1}),
                           ("an entry with no unitId",
                            {"schemaVersion": 1, "moments": [{"momentId": "x"}]})):
        try:
            pairs_of(document, "fixture")
        except ValueError:
            print("   ok    self-test - %s is refused" % name)
        else:
            print("   WRONG self-test - %s was read as usable" % name)
            ok = False

    print("self-test: %s" % ("all cases behaved as declared" if ok else "A CASE MISBEHAVED"))
    return 0 if ok else 1


# ---------------------------------------------------------------- entry point

def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--canonical",
                        help="the producer's moments-pairs.json, or a dist-app directory or "
                             "URL base holding one")
    parser.add_argument("--ours", default="content/moments.json",
                        help="this repo's copy (default: content/moments.json)")
    parser.add_argument("--self-test", action="store_true",
                        help="assert this checker's own verdicts, including the failing one")
    args = parser.parse_args(argv)

    if args.self_test:
        return self_test()
    if not args.canonical:
        parser.error("--canonical is required unless --self-test is given")

    canonical = resolve_canonical(args.canonical)
    try:
        theirs = pairs_of(_read_json(canonical), canonical)
    except Exception as error:
        # Exit 2, never 0: an unreachable producer means nothing was measured. A quiet skip is
        # the exact shape of the failure this check exists to break.
        print("   FAIL moments/agree - the producer's table at %s could not be read: %s"
              % (canonical, error))
        return 2
    try:
        ours = pairs_of(_read_json(args.ours), args.ours)
    except Exception as error:
        print("   FAIL moments/agree - %s could not be read: %s" % (args.ours, error))
        return 2

    agreed, lines = compare(ours, theirs)
    for line in lines:
        print(line)
    return 0 if agreed else 1


if __name__ == "__main__":
    sys.exit(main())
