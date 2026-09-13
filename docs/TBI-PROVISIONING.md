# Temple B'nai Israel provisioning record

Status: infrastructure prepared; application deployment and congregation acceptance pending.

Prepared September 12, 2026 for owner-authorized private access to CRC's complete current overlay and source library, with future CRC additions shared into TBI without overwriting TBI-owned edits. No CRC deployment, credential, database, relay, state, or catalog was changed.

## Isolated resources

- Vercel project: `tbi-overlays` under the existing RavBogard scope. The repository's existing `.vercel` link was not changed; the TBI link exists only under ignored deployment staging.
- Neon resource: `tbi-overlays-db`, attached only to `tbi-overlays`, on the approved Launch plan in `iad1` with Neon Auth disabled. The authoring, playback, OAuth, and member-access schemas have been initialized. No members were created.
- Cloudflare Worker: `tbi-overlays-live-relay`, with its own Durable Object storage and relay secret. Its allowed production origin is `https://tbi-overlays.vercel.app`.
- TBI production and development environments have separately generated control, output, authoring, and relay credentials. No CRC credential was read into or reused by the TBI deployment.
- Both TBI Vercel environments authenticate successfully to the isolated relay. The check read relay state only and returned HTTP 200; it did not send a show command or alter live state.
- The shared CRC library uses its own read-only server credential. CRC stores it as `SHARED_LIBRARY_EXPORT_KEY`; TBI stores the same value as `SHARED_LIBRARY_IMPORT_KEY` and reads `CRC_SHARED_LIBRARY_URL`. It is separate from control, output, authoring, member-access, and relay credentials and is never exposed to browser code.
- Workspace identity: `temple-bnai-israel-kalamazoo`, loaded by the single `WORKSPACE_ID` setting. `WORKSPACE_ISOLATION_VERIFIED` remains `false` until deployment and negative isolation tests pass.

Credential values are stored only in the Cloudflare and Vercel secret stores. Deployment staging contains empty placeholders and public configuration only.

## Content staging

`node scripts/prepare-workspace.mjs --workspace temple-bnai-israel-kalamazoo` created the ignored starter package. It contains the initial 24 Companion-button cues with destination-owned UUIDs, the original source cue reference, and complete source provenance/license metadata. The tracked catalog map lets the TBI deployment serve these independent IDs without including the ignored staging directory in its build upload.

The deploy-source builder includes the complete legacy authoring pack and all 647 browsable expanded-library sources. The 24-cue starter describes the initial hardware buttons only; it is not an access boundary. Future CRC additions will be made available to TBI while TBI drafts, publications, history, and local edits remain independently owned.

## Budget boundary

The database uses the already approved Neon Launch plan. Keep expected combined TBI infrastructure usage under $25 per month when practical and do not exceed $50 per month without a new user decision. No new account or plan upgrade was created for Vercel or Cloudflare. Monitor the first full rehearsal and ordinary-service traffic before changing capacity.

## Remaining release gates

1. Freeze and validate the converged application code.
2. Build from an allowlisted source copy that excludes `.git`, `.vercel`, `.env*`, `work`, `outputs`, backups, keys, and private connection sheets.
3. Deploy TBI without changing the CRC project or production deployment.
4. Initialize the TBI relay with its independent 24-cue catalog.
5. Prove CRC credentials fail against TBI endpoints and TBI credentials fail against CRC endpoints without displaying either credential.
6. Verify TBI metadata, setup, editor, preview, renderer, catalog, and output show TBI identity with no CRC artwork fallback.
7. Rehearse the actual OBS, Companion, and Stream Deck setup before setting `WORKSPACE_ISOLATION_VERIFIED=true`.
8. Invite exact congregation members only after the owner supplies their email addresses. No invitation or message has been sent to Rabbi Schicker.
