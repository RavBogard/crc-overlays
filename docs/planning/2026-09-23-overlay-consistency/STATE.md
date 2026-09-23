# Overlay consistency and fresh Companion preset: current state

Handoff: `C:/Users/dsbog/crc-coordination/handoff-2026-09-23/START-HERE.md`, `WORKER-RETURNS.md`.
Gap log: [GAP-LOG.md](GAP-LOG.md). Per-graphic receipts: [receipts/](receipts/). Worker rules:
[WORKER-PROTOCOL.md](WORKER-PROTOCOL.md). Companion evidence digest: [COMPANION-INPUT.md](COMPANION-INPUT.md).

## Goal
Every overlay consistent and readable using shared defaults, then a brand-new Companion preset
built from Michael's operating logic, bound only to final published cue IDs.

## Decisions (main thread)
- Layout rule (Daniel, 2026-09-23): anything needing more than two readable lower thirds is a
  readable LEFT panel sequence; the rule applies to the piece, and one piece uses one layout.
- Blocks compiler: contiguous same-source groups are one paragraph; blank line only where the
  source changes or blocks are skipped. Phrase display: edge newlines are never separators.
- Archive semantics unchanged (gap E): supersede by reusing cue IDs where possible, archive the rest,
  bind the new preset only to final IDs.
- Shiru: complete LEFT sequence 1-3 of 3 (blocks 0-1 / 2-3 / 4) on the old Shiru cue IDs plus a
  short opening selection (block 0, one lower third); 5-part bottom set archived.
- Hatzi Kaddish (Readers Kaddish 1+2), V'ahavta 1, Kedusha 1-3 and Haftarah After 1-3 converted to
  left. Haftarah After 2 trimmed to blocks 5-9 so block 10 is shown once (After 3).
- Mourner's Kaddish: plain 2-panel family (MK1, MK2) is the preset default; T/TT 3-panel family stays
  published, unbound, documented alternate. MK3 (third copy of the closing lines) archived.
- Vahavta trans (byte-identical to Vahavta 1) archived.
- Birchot Hashachar: one 4-panel left sequence B1-B4, two blessing pairs per panel, English kept;
  B3/B4 pins refreshed only if selected he/tr/en hashes are identical (in progress).
- GATE: Saturday Daytime Kiddush (Supplement) a0bbdb60 becomes a 3-panel left sequence
  {0,1} | {2 Zachor} | {3,4} ("— 1/2/3 of 3") — proceeded because both 2-way splits overflow at
  comfortable typography (receipt saturday-daytime-kiddush-supplement-split.json), the layout rule
  already calls for readable left panels, and each of {0,1} and {3,4} alone passes.
- Packet 11 answers: Miryam Han'viah accent title corrected to the source's own spelling
  (revision 3); Sacred Assembly mid-line capitals accepted (exact source text, shared paragraphs
  default kept); Kol Nidre 2/3 skip blocks 14/23 intentionally (English-only translation blocks).
- Packet 12 answers: Sim Shalom 5b76564f (Shabbat Morning) is its own graphic, not part of the
  RH Sim Shalom 1-4 series; 1-4 take the shared left-panel defaults only if all four fit at
  comfortable size (else keep their arrangement). The generic accent "תְּפִלָּה" on Sim Shalom 1-4 and
  Remember Us is accepted. English-only Un'taneh Tokef graphics stay without a Hebrew accent (no
  label is added where none existed). Source oddities (bracketed "[v'al]", repeated refrains, Vidui
  "Avinu" for עָוִינוּ, which is a correct transliteration) stay exact source text.
- Packets 13-14 answers: aleinu bot 1-2 (Slichot) moved to left is confirmed (each was too tall
  as a lower third; one layout per piece); no accent added. Havd 1-4 stay one left sequence
  despite sparse single-blessing panels (>2 parts rule). Eliyahu Hanavi "(3x)" placement is
  source text, unchanged.
- Authorization basis for every review: Daniel's blanket approval of graphic publication and paired
  deployment (handoff 2026-09-23); never a claim that Daniel inspected each graphic.

## Progress (2026-09-23)
1. Renderer fixes A/B: released `8f36dd8`; live proof Psukei 1, How Awesome/Shema. DONE.
2. Gap G compact MCP results: released `4673402`. Round 2 (publish cue dedupe, set manifest
   summary) + gap F accent flag: released `e0e80ea`; stale-pin refresh (gap D): released `5f149da`.
3. Graphics published today: Psukei 1; Shiru x4; Readers Kaddish 1-2; Mourners Kaddish 1, 2, 1 TT,
   2 T, 3 T; Vahavta 1-2; Haftarah Before, After 1-3; Mi Chamocha Sat 1; How Awesome/Shema;
   Kedusha 1-3; Am I Awake; We Are Loved 1. Birchot 1-4 in progress.
4. Catalog: 17 packets in WORK-QUEUE.md. Packets 1-9 done with receipts (Packet 9: 14 drafts +
   Festival Kiddush 1-2 accent -> "קִדּוּשׁ", name typo "Kiddsuh" fixed; no holds). Friday Kiddush
   split 1-2 of 2; Saturday Daytime Kiddush (Supplement) split the same way (packet 10). Releases
   through `5f149da` (gap log). Held: Olam Chesed (missing Hebrew, no invented provenance).
5. Next: packets 10-17, verification receipts for already-fine families, then the Companion preset.

## Open questions
- None blocking. Still-open content items from the brief (not decided here): Kiddush Fri/Sat
  variants, Or Zarua identity, Olam Chesed missing Hebrew.
