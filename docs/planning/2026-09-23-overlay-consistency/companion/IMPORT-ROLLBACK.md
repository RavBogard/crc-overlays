# Importing the fresh preset, and rolling back

For Michael and Daniel. Written 2026-09-23. It covers these files:
- The preset: `CRC-FRESH-PRESET-2026-09-23.companionconfig`, in `crc-coordination/releases/2026-09-23-michael/fresh-preset/`.
- The module: `crc-overlays-1.7.0.tgz`, in the same folder.
- The rollback: `ROLLBACK-ORIGINAL-ProductionDSKTP-2026-09-16.companionconfig`, one folder up. It is byte-identical
  to Michael's 16 September export (sha256 `89acf766…`).

## What the preset is
The preset is a Companion 5.0.3 full-config file of the same format and version as the 16 September export: a
gzip JSON file, version 12. It holds:
- 56 pages (1–30 and 31–56; 27–28 are empty), with 1,452 keys
- the 6 camera-loop triggers
- the 6 custom variables they use

It holds **no connection settings and no passwords**. Each connection appears only as a short mapping entry
(id, module and label) so that Companion can match it to the connection that already exists on the machine.
The preset needs the vMix, BirdDog, X32, Reaper, VLC and obs connections that are already set up there, plus
the Overlays connection.

## Before you start
1. **Export a fresh backup** from Michael's Companion (Import / Export → Export → full config). Keep it next to the
   rollback file. It is the true current state, which the 16 September file may not be.
2. **Check the Companion version**: it must be 5.0.3. If it is another version, stop and tell Daniel.
3. **If there is no connection labelled "Overlays" yet**, create it before importing:
   - Modules → Import module package → `crc-overlays-1.7.0.tgz`.
   - Connections → Add → CRC Overlays (1.7.0), labelled exactly **`Overlays`**.
   - Enter its device token (or pairing code) on Michael's machine.

   The token never goes in the preset file. Confirm the connection shows OK before you continue. Importing
   without it would create an empty, disabled Overlays connection, and none of the graphics keys would work.
4. **Check the Overlays module version** in Connections → Overlays. The preset needs **1.7.0** for the logo keys.
   If it shows 1.6.0 or older, install the module first:
   Modules → Import module package → `crc-overlays-1.7.0.tgz` → then set the Overlays connection to use 1.7.0.
   Its settings (base URL and device token) are kept. If the module does not show 1.7.0 afterwards, stop.
5. **Check the connection labels.** On a full import Companion matches connections by **label and module type**.
   The labels on Michael's machine must read exactly:

| Label in Companion | Module | Id in the 16 September export |
|---|---|---|
| vmix | studiocoast-vmix | `qBJmIOnrZHsaDwHs8ckmF` |
| Center | birddog-ptz | `EypENOqsd92mtQEXs2zfB` |
| Left | birddog-ptz | `RBdCC5Mwi8ovsxmzrog6b` |
| Door_Cam__steve_ | birddog-ptz | `CQkYIJKgrSCfs5IOU3--O` |
| Black_Cam__bima_ | birddog-ptz | `dHN73UBd9n1Jktd9YW1kX` |
| Free_Cam__dorothy_ | birddog-ptz | `fUDzSLu1sj7ObzAJKFfMw` |
| x32 | behringer-x32 | `MLFHxifnRUOY3uoK3cS6K` |
| reaper | cockos-reaper | `39shNWpgn8d5JQurgNTl5` |
| vlc | videolan-vlc | `X8O9WIqmru2HFSyx0xoaR` |
| obs | obs-studio | `FD8e2yY6FIld8m93xVIZY` |
| Overlays | crc-overlays | `JKUO3gbCLf6mwwpsZCYae` |

   If a label differs, rename the connection in Companion to match before importing. Where a label and module
   match, the existing connection is reused as it is, with its settings and passwords untouched. Where one does
   not match, Companion creates a new, empty connection. The preset marks every mapping entry as disabled, so a
   stray new connection stays switched off instead of failing noisily. That is the sign to stop and roll back.
   The ids are listed so you can confirm this is the same machine. Companion itself matches by label.

## Importing (Companion 5.0.3)
1. Go to Import / Export → Import, and choose `CRC-FRESH-PRESET-2026-09-23.companionconfig`.
2. In the import options choose:
   - **Buttons: Reset and import.** This replaces all pages. The old 99 pages are removed, and the rollback file
     restores them.
   - **Triggers: Reset and import.** This installs the 6 camera loops.
   - **Custom variables: Reset and import.** These are Center, Left, Right, Bima and Dorothy, which the loops use.
   - **Connections: leave unchanged.** Do not reset connections.
   - Leave **Surfaces**, **Expression variables** and the **Image library** unchanged. The file does not
     contain them.
3. Run the import.
4. Go to Connections and check that the list has the same number of connections as before, all enabled as
   before, and with **no new, disabled connection**. If a new connection appeared, roll back.
5. On the Overlays connection press **Refresh catalog** (Home, row 2, column 4), then check that a graphics key on
   Fri 1 is not dark red.
6. Both Stream Decks keep their own startup page. Set both to page 1 if they are not already.
7. Work through [REHEARSAL-CHECKLIST.md](REHEARSAL-CHECKLIST.md) before the first live service.

## Rollback
1. Go to Import / Export → Import, and choose `ROLLBACK-ORIGINAL-ProductionDSKTP-2026-09-16.companionconfig`,
   or better, the fresh backup made in "Before you start".
2. Choose **Buttons: Reset and import**, **Triggers: Reset and import**, **Custom variables: Reset and import**,
   and **Connections: leave unchanged**.
3. This restores the 99 original pages and their Singular buttons. The three Singular connections must still exist
   on the machine for those buttons to work. This preset does not remove them. It only stops using them.

## What not to do
- Do **not** import with "Connections: reset". That wipes the passwords and settings on Michael's machine. This file
  cannot restore them, because it contains none.
- Do **not** import onto any Companion other than 5.0.3 without checking with Daniel first.
- Do **not** delete the three Singular connections, BirdDog_NDI or Spotify_WIP. The preset leaves them alone,
  and the rollback needs the Singular ones.
- Do **not** import the earlier candidate files in `releases/2026-09-23-michael/`, for example
  `MICHAEL-FINAL-…`. This preset is only the files in `fresh-preset/`.
- Do **not** edit the preset by hand. Regenerate it with `node scripts/build-companion-preset.mjs`, check it with
  `node scripts/audit-companion-preset.mjs`, and copy it again.

## How the file was checked
`node scripts/audit-companion-preset.mjs` must pass. It checks:
- navigation, the chains and the fixed columns
- every cue against the manifest and a fresh catalog read
- the camera gestures and Bimah Mute
- capability coverage against the export
- that the file contains no passwords or connection settings
- that Companion 5.0.3's own import-upgrade chain leaves every key unchanged

These are file checks. Hardware is proven only by the rehearsal checklist.
