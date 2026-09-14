# Synthetic siddur source root

A minimal, entirely **invented** stand-in for a `shireishabbat` checkout, used to
exercise `scripts/build-siddur-library.py` end to end without the private liturgy
repository being present.

    SIDDUR_SOURCE_ROOT=tests/fixtures/siddur-source \
      python scripts/build-siddur-library.py --output /tmp/siddur-library.json

## What is here

    dist-app/books.json                one book manifest entry (`fixture-volume`)
    dist-app/fixture-volume-feed.json  one schemaVersion-1 feed, three units

The three units cover the three code paths the builder distinguishes: a paired
`he`+`tr` bilingual unit (one block also carrying labelled English), a
`role: "original"` English unit, and a rubric/unclassified-English unit. Building
against this fixture yields **3 sources**.

## No real text lives here

Every Hebrew string is an invented run of Hebrew letters ("אבג דהו זחט"), every
Latin string is a placeholder ("placeholder transliteration one"). No liturgical
text, caption, translation, section title, folio number or page map was copied
from `shireishabbat`. Only the *shapes* of the records were reproduced. If this
fixture ever needs extending, invent new placeholders — do not paste source text.

## `repositoryCommit` is this repo's commit

`repository_commit()` runs `git -C <source_root> rev-parse HEAD`. Because this
fixture lives inside the overlays checkout, that resolves to the **overlays**
HEAD rather than a shireishabbat commit. That is expected and acceptable for a
dry run: the fixture proves the builder runs and emits a well-formed library, not
that the provenance is meaningful. Output built from this fixture must never be
committed to `content/siddur-library.json`.
