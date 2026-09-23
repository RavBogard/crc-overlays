# Open questions for the fresh Companion preset

These need Daniel (D) or Michael (M). Everything else in PRESET-DESIGN is decided. Until an answer
arrives, the design uses the default marked **Default**.

1. **Kiddush defaults (D).**
   - Friday: **Default** is CRC Kiddush 1–2 (e1a495c8, 19661732). The Shirei "Kiddush with Vay'chulu" 1–2
     is the alternate, and Kiddush (short) bb2d1b64 and the one-block Wine Blessing 503cbb1f are the short
     options.
   - Saturday: **Default** is Kiddush (short). Saturday Daytime Kiddush (Supplement) 1–3 is the alternate.
   - HHD: Festival Kiddush 1–2.
   - Confirm, or name other defaults.
2. **HHD page structure (M).** **Default:** seven pages by liturgical section (HHD 1–7), modelled on
   Michael's own newer pages 45–50 (HHD Beginning, Shema, Amidah, Torah, Closing). The alternative is one
   page set per service, like the original pages 25–41 (Slichot, Erev RH 1–3, RH 1–3, Kol Nidre 1–2,
   YK 1–3, Yizkor, Neilah 1–2). Per-service pages repeat many cues but match a single service run
   exactly.
3. **Module version on Michael's machine (M).** The preset needs **1.7.0** for `logo_toggle`,
   `logo_on`, `logo_off` and the `logo_enabled` feedback. Everything else it uses is in 1.3.0 and later:
   `toggle_cue`, `show_cue`, `animate_out`, `animate_clear`, `clear_now`, `refresh_catalog`, and the
   feedbacks `requested`, `rendered` and `disconnected`. It uses no `next_panel`, `previous_panel` or
   `set_page` (1.5.0+) and no `slot_empty` (1.6.0+). If he runs 1.6.0 (the import sheet says 1.6.0), install
   the packaged 1.7.0 first; otherwise the logo keys must be removed.
4. **Import mode (D/M).** **Default:** import pages and triggers into Michael's existing Companion 5.0.3
   and map the connection IDs onto his existing vMix, PTZ, X32, Reaper, VLC and obs connections. The file
   then carries no connection configs and no passwords. A full-config import would need the obs and vlc
   passwords re-entered on his machine. Confirm he is still on Companion 5.0.3 with the same connection
   set. The original export is the rollback.
5. **Universal Next/Prev panel keys (D).** The module's `next_panel` only recognises cues named
   `<title> — NN of MM`. Today only Shiru, the Friday Shirei Kiddush and the Saturday Kiddush are named
   that way, so the design uses ordered buttons. Renaming the other sequences (L'cha Dodi, Aleinu, Kaddish,
   K'dushah and so on) would allow one "Next panel ▸" key per page. That is an operator-visible catalog
   rename, so it is your call.
6. **Or Zarua (D).** The original Friday page had an "Or Zarua" button: a legacy Singular composition
   with no published cue. **Default:** left out, and Fri 2 c2r3 stays free. Which text is it, and should a
   graphic be made?
7. **Olam Chesed Yibaneh (D).** It is bound at its published revision 1, which is English-only. The
   maintained Hebrew is missing and draft v2 is held. Keep it bound as is, or unbind it until the Hebrew
   source is settled?
8. **Graphics that existed only as Singular compositions (D/M).** Examples: HHD honours and names
   (22), Benediction, Good Year, If It Be Your Will, Ki Anu Amecha, May the Doors, This Year, Tefilati,
   Who By Fire 1–3, Malchuyot (Shofar Call 1), the Second Seder set, and Chanukah 1–2 (full list in
   CAPABILITY-COVERAGE). Should any be rebuilt before the next HHD, Pesach or Chanukah, or are they
   retired? Per-year names probably belong in names lists rather than the preset.
9. **Camera gesture outside Friday (M).** **Default:** it stays only where Michael had it, on the
   Friday pieces from pages 76–78. Extending it to Shabbat morning or the HHD needs his camera and preset
   choice for each piece.
10. **Two decks (M).** Both Stream Deck XLs start on page 1, and the F-keys flip the *second* deck to a
    camera page. **Default:** both decks start on Home, as they do now. Should one deck start on the
    service and the other on Cameras (30)?

Minor, no answer needed to build (flagged in CUE-MANIFEST `note`):
- Zochreinu ba8fa5be carries the title "Mi Chamocha". This may be an inherited heading (gap F).
- The HHD-evening Mi Chamocha pairs a lower third (Friday 1) with a left panel, as Michael did.
- Take This Soul (Hashkiveinu / U2) is published but was never on a page, so it is left unbound.
