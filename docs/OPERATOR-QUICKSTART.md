# CRC overlay operator quick start

## Before rehearsal

1. On the control page, expand **Connect vMix, OBS, or Companion** and press **Copy output URL**. The private renderer URL is also in `work/CONNECTIONS.md`.
2. Open Companion at `http://localhost:8000`. Confirm the **CRC Overlays** connection is enabled and healthy.
3. Open the renderer as a 1920 × 1080 browser input in OBS or vMix. Keep transparency enabled.
4. After cues are published, use the CRC module's **Refresh cue catalog** action before expecting new cue choices or presets.
5. Verify the program monitor before rehearsal begins. Companion feedback reports renderer acknowledgement, not what is on air.

## During the service

- Press a cue button once and verify the program monitor.
- Use **Animate out** for the normal exit.
- Use **Clear now** when the graphic must disappear immediately.
- If feedback becomes unavailable, stop issuing cues until the renderer connection is understood. Hide the browser source if a safe recovery is not immediate.
- Do not edit or publish cues from the live operating surface during a service.

## Author or correct a cue

1. Open `/author` and connect with the CRC authoring key.
2. Import an existing cue to keep its ID, or create a draft from a supported template.
3. Select authoritative source blocks. Bilingual drafts require matching Hebrew and transliteration block pairs in the same order. Original-English drafts accept only source blocks marked for that role.
4. Set the title, layout, and font sizes, then save. Saves use the draft version to prevent one editor from overwriting another.
5. Generate the preview. Review the actual 1920 × 1080 rendering and resolve every overflow or collision warning.
6. Approve that exact saved preview. Any later edit invalidates the approval.
7. Publish the approved saved version. The published revision is available to renderers, but publishing does not put it on air.
8. Refresh the Companion cue catalog, then add or update the rehearsal button. Published revisions remain visible in the editor and can be selected explicitly for rollback.

The preview contains no live command or acknowledgement state. Use the rehearsal renderer and program monitor for operational validation.

## MCP authoring workflow

An MCP client connects to the hosted `/api/mcp` endpoint through OAuth discovery with the `crc.authoring` scope. Available tools cover source search, templates, draft import/create/update, preview generation, publishing, revision listing, and rollback.

MCP preview generation does not replace browser review. Open the returned preview in the web editor, approve the exact saved version there, and publish only while that review receipt is current.

Current connection blockers: the inspected ChatGPT and Claude clients were signed out, and OAuth compatibility for clients that request `offline_access` is being corrected. Do not store the authoring key in an MCP configuration file or this guide.

## Companion rehearsal pages

Page 2, **CRC Morning Rehearsal**, and page 3, **CRC Morning Continued**, contain the morning library. The density refresh removes five redundant compatibility buttons, leaving 16 cue buttons on page 2 and eight on page 3. Existing clear and navigation controls retain their locations. The original page 3 sequence was:

1. Yotzer Or (short)
2. Yotzer Or 1
3. Yotzer Or 2
4. Ahava Rabbah Ahavtanu (ncomplete)
5. Vahavta 1
6. Vahavta 2
7. Mi Chamocha (Sat 1)
8. Mi Chamocha (Sat 2)
9. Siyahamba

The fourth Birchot Hashachar cue is a compatibility alias and should not receive a new visible preset once its catalog entry is marked hidden. The three consolidated Birchot panels remain visible.

Create the new page only after verifying it is empty or unused. Use native **Show cue** actions, add Clear and Animate out controls if the page will be operated directly, and test it only in a staffed rehearsal.

After the catalog changes, prepare page-only import candidates from a fresh full Companion backup:

```powershell
python scripts/prepare-companion-catalog.py `
  work/companion-backup.companionconfig `
  lib/cues.json `
  work/catalog-sync
```

The script reads gzip or plain JSON, accepts only page 2 named **CRC Morning Rehearsal** and page 3 named **CRC Morning Continued**, and never contacts Companion. It removes a hidden cue button only when every action on that button is the native `show_cue` action; mixed actions cause the preparation to fail. Visible cue labels are refreshed while button settings and feedbacks remain intact. Review the two page-only candidates and the count-only report before importing them in Companion. Empty cells left by removed aliases remain empty.

## Recovery

- Wrong graphic: press **Clear now**, verify program is clean, then select the correct cue.
- Renderer disconnected: hide the browser source, restore the renderer connection, and verify a rehearsal cue before returning it to program.
- Companion catalog stale: refresh the native cue catalog; do not rebuild the connection during a live service.
- Published cue is wrong: choose the intended published revision in the editor and perform an explicit rollback, then refresh Companion.
