# Side-panel density review

Browser QA accepted three canonical sequence consolidations:

| Sequence | Before | Accepted | Visible Hebrew / transliteration characters |
| --- | ---: | ---: | --- |
| Psukei D'Zimrah | 2 panels | 1 panel | 297 / 265 |
| Mourner's Kaddish | 3 panels | 2 panels | 379 / 316 and 369 / 304 |
| Mi Chamocha | 2 panels | 1 panel | 452 / 403 |

The retired composition UUIDs remain hidden command aliases of the selected visible
panel. Their main text uses the same ordered canonical selectors, so the density change
does not omit or rewrite source content.

Readers Kaddish remains two visible panels. Its one-panel candidate reached 524 Hebrew
and 435 transliteration characters and measured 1127 px at the bottom in browser QA.
Yotzer Or also remains two visible panels; its 470 / 421-character candidate measured
1053 px with no remaining gap. Vahavta remains two panels because its existing second
panel is already the densest of that sequence at 342 / 316 characters.

The two-panel Birchot Hashachar candidate remains pending renderer spacing QA. It uses
four blessing rows per panel and preserves all eight exact Hebrew, transliteration, and
approved English rows. Its longest single row is 79 Hebrew, 74 transliteration, and 76
English characters. No acceptance is recorded until the revised row spacing passes the
browser fit check.
