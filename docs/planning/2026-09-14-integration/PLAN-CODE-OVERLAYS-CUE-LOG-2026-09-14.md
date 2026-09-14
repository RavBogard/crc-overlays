# PLAN — Overlays: the bounded per-service cue log (+ moments consumer, siddur refresh)

**Repo:** `C:\Users\dsbog\crc-overlays-vercel` · **base:** `codex/product-expansion` · **branch to create:** `code/cue-log`
**Order of record for:** `HANDOFF-CODE-CUE-LOG-2026-09-14.md` (part A) and `RULINGS-INTEGRATION-2026-09-14.md` #1 consumer side + "Declined: pinning" (part B). Copy both files, plus this plan, into `docs/planning/2026-09-14-integration/` in the first commit (the rulings file says copies live there; the folder does not exist yet).

**Governance (ruled by Daniel 2026-09-14).** The repo banners saying "Codex is Producer; Code lanes stop and return" are **superseded for this work**: this Claude Code session is the executor and its own producer. It writes RETURN files itself and never waits for a Codex that is not there. Content/edition/licensing safeguards stay fully in force (chart PDFs never enter shireishabbat or fork-facing surfaces; liturgical text never enters centralreform.live). Autonomy: branch per plan, merge to `main` when green, deploy to production without asking when it looks ready. No `STOP — Daniel confirms` point applies to this plan. Overlays changes are proven in rehearsal mode before any relay release; a relay release follows `docs/RELAY-RELEASE.md`; Michael's live relay must not be disturbed. No dates or schedules here — Daniel alone worries about dates.

**Standing constraints (Daniel):** `/api/now` stays DARK (`OVERLAYS_PUBLIC_NOW` unset, route untouched). No public history endpoint. A failure to append history never fails a command. No names, titles, text, operator identity or renderer presence in any history row.

**Read first (≤6):** `relay/src/index.ts`, `relay/src/protocol.ts`, `lib/liturgy-index.ts`, `app/api/command/route.ts`, `lib/live-setlists.ts` (lines 1–21, 75–85: how a read credential is held), `docs/RELAY-RELEASE.md`.
**Do NOT read whole:** `CLAUDE-HANDOFF.md` (101 KB — grep only), `lib/access.ts` (41 KB — grep only, commands below), `content/siddur-library.json`, anything under `work/`.

---

## 1. Ground truth, measured

**Relay (`relay/src/index.ts`).** One Durable Object `LiveRoom`, SQLite tables created in the constructor (lines 65–73): `live_state`, `approved_catalog`, `command_receipts(command_id,action,cue,created_at)`, `controller_sequences`, `ticket_receipts`. `fetch()` whitelists `/state /initialize /command /catalog /ack` behind `RELAY_SECRET` (line 53–55). `command()` (194–202) runs `applyCommand` inside `transactionSync`, then `snapshot()`, `ensureSnapshotSize`, and broadcasts only when `outcome.accepted`. `applyCommand` (209–237) commits state, receipts (keyed `(action,cue)` for idempotency only), trims receipts to `MAX_RECEIPTS=2048`. Receipts are **not** a history: no order across controllers, no liturgy, dropped by count only. Controller sockets carry `attachment.client` = `companion|browser|unknown` from `hello` (protocol.ts 85–90, index.ts 282). `Command` (protocol.ts 48) has `clientId` but no source or service field; `parseCommand` (92–115) refuses `cuePayload`/`catalogVersion` and otherwise ignores unknown keys.

**Vercel command path (`app/api/command/route.ts`).** `authorizeRequest(r,'control')` then, when `relayConfigured()`, forwards `{action,cue,bug,commandId,clientId,sequence}` to the relay (line 31) — nothing else. `lib/relay.ts` `relayRequest` whitelists paths `['/state','/command','/initialize','/ack','/catalog']` (line 27) — any new relay path must be added there.

**Liturgy identity (`lib/liturgy-index.ts`).** `liturgyForCue(cue)` (110–121) takes the first `cue.authoring.sourceIds` entry that starts `library:` **and exists in the committed siddur library**, then reports `{unitId, momentId, book, folio}`; `momentId` comes from `content/moments.json`, committed as `{"schemaVersion":1,"moments":[]}` (verified). The relay's approved catalog holds full cue payloads including `authoring.sourceIds` (`/api/catalog?include=liturgy` computes the index from `relayCatalog()` — `app/api/catalog/route.ts` 13–15), but the relay has **no** siddur library and no moments table, so it cannot resolve a unit itself.

**Forbidden-key posture.** `lib/server.ts` 66–98 (`PublicNow`) and `docs/planning/2026-09-13-product-review/HANDOFF-WEBAPP-FOLLOW-SERVICE.md` §"What the endpoint will never tell you": `tests/now-route.test.ts` walks the response for forbidden keys `(unverified — not staged; read it in W2)`.

**Credentials.** Members: `authorizeRequest(request, permission)` returns an actor with `.id`/`.role`; permissions seen in routes: `'read'`, `'control'`, `'author'` (`app/api/services/route.ts` 18, 28–30). Paired devices (CLAUDE-HANDOFF line 109): `db/devices.sql` tables `device_credentials`, `device_pairing_codes`; token `cd_<id>.<secret>`, only sha256 stored; kinds `companion → read+control`, `output → read`; actor `device:<id>`; owner ops `pair_code`, `create_output`, `revoke` on `/api/devices`. `CONTROL_KEY` refuses `author` (`docs/ACCESS.md` 23–30). The .live `setlist_reader` (CLAUDE-HANDOFF line 80): prefixed token, allow-list enforced before dispatch, no TTL, revocable, minted host-side and piped into `vercel env add … --sensitive`; `lib/live-setlists.ts` 75–85 is the consumer discipline.

**Rehearsal.** `npm run rehearsal` (`scripts/rehearsal.mjs`) runs the Node stub `scripts/rehearsal-relay.ts`, which imports `relay/src/protocol.ts` verbatim (`docs/REHEARSAL-MODE.md` 30–32); `tests/rehearsal-relay.test.ts` covers it; `npm run rehearsal:check` = `scripts/check-rehearsal.mjs`. `scripts/check-live-relay.mjs` named in the handoff is **not staged** `(unverified — if absent, extend check-rehearsal.mjs instead)`.

**Relay release.** Per `docs/RELAY-RELEASE.md` (commands in §4); relay tests `cd relay && npm test && npm run check` (44 at last release).

**Siddur workflow (`.github/workflows/siddur-library.yml`).** `workflow_dispatch` **already exists** (with `dry_run`), plus Monday cron. Builds `source/dist-app/` from `RavBogard/ShireiShabbat`, runs `scripts/build-siddur-library.py --output content/siddur-library.json`, diffs, and opens a PR via `peter-evans/create-pull-request@v8` with `add-paths: content/siddur-library.json`.

**MCP (`lib/mcp.ts`).** Tools registered via `register(name, description, zodSchema, annotations)` → `authoringOperation(name, parsed, actor)`; no live-control tool exists (so a `source:"mcp"` row cannot occur today — reserved).

---

## 2. Design decisions (so the waves are mechanical)

1. **The relay records identity it can prove; Vercel joins the library.** A history row stores `source_ids`: the `library:`-prefixed entries of the selected cue payload's `authoring.sourceIds` (≤8, each ≤160 chars), captured at command time — the published revision is pinned in the relay catalog, so this is "identity at publish time". `GET /api/history` resolves them through a new `liturgyForSourceIds(ids)` (same first-present-in-library rule as `liturgyForCue`), so `momentId` starts flowing the moment `content/moments.json` gains rows (part B). `source_ids` is internal and **never emitted**.
2. **`source`** is derived in the relay with no protocol change: `command.clientId` matched against connected `control` attachments → `client==='companion'` → `"companion"`, else `"control"`. `"mcp"` is reserved. W1 has a discovery step to confirm Companion posts the same id it says hello with; fallback is an optional command field.
3. **`serviceRef`** is an optional, additive `serviceRef` (UUID|null) on the command body, exactly as `bug` was added: `parseCommand` accepts/validates it, `nextState` and receipts ignore it, only history stores it. Fallback when absent: a `names:<collectionId>:<NN>` cue id yields its collectionId.
4. **Append after commit, before broadcast, in its own try/catch** in `command()` — outside `transactionSync`, so it cannot roll back or fail a command.
5. **Bound** enforced on every append: keep the newest 2,000 rows AND drop rows older than 14 days. `clear` writes the deletion, then appends one row `{action:"history_cleared"}`.
6. **`history_reader`** is a third `device_credentials` kind (token prefix `hr_`), granted exactly one new permission `history`; members with `author` also hold `history`. `CONTROL_KEY`, `companion`, `output` do not.

---

## 3. Waves

### W1 — Relay: history table, append, read, clear; stub parity

**Goal:** the Durable Object keeps a bounded history and serves it; the rehearsal stub does the identical thing.

**Discovery first (record results in the return file):**
```
rg -n "clientId|hello|id:" companion/src/client.ts | head -40        # same UUID for hello and commands?
rg -n "CHECK|kind" db/devices.sql
rg -n "'read'|'control'|'author'|'owner'|type Permission|kind" lib/access.ts | head -60
ls relay; rg -n "\"test\"|\"check\"" relay/package.json
ls scripts | rg "check-live-relay|check-rehearsal|rehearsal-relay"
rg -n "forbidden|walk" tests/now-route.test.ts
```

**Files:** `relay/src/protocol.ts`, `relay/src/index.ts`, `scripts/rehearsal-relay.ts`, relay tests (dir per `ls relay`), `tests/rehearsal-relay.test.ts`.

**protocol.ts additions:**
```ts
export const MAX_HISTORY_ROWS=2000;
export const MAX_HISTORY_AGE_MS=14*24*60*60*1000;
export const MAX_HISTORY_PAGE=500;              // ≤ ~110 KB, inside MAX_SNAPSHOT_BYTES
export const MAX_HISTORY_SOURCE_IDS=8;
export type HistorySource='control'|'companion'|'mcp';
export type HistoryRow={seq:number;at:number;action:Command['action']|'history_cleared';cueId:string|null;source:HistorySource;serviceRef:string|null;sourceIds:string[]};
export const librarySourceIds=(payload:CuePayload|null):string[]=> …   // authoring.sourceIds filtered to /^library:/, ≤8, each ≤160
export const collectionFromNamesCue=(cueId:string|null):string|null=> …// 'names:<uuid>:<NN>' → uuid
```
`Command` gains `serviceRef:string|null`; `parseCommand`: `serviceRef` absent or `null` → null; a string must be `validUuid`, else return null (400). `nextState` untouched (assert in test).

**index.ts:**
- Table: `CREATE TABLE IF NOT EXISTS command_history(seq INTEGER PRIMARY KEY AUTOINCREMENT,at INTEGER NOT NULL,action TEXT NOT NULL,cue TEXT,source TEXT NOT NULL,service_ref TEXT,source_ids TEXT NOT NULL)` + index on `at`. Additive: an existing DO survives a deploy (RELAY-RELEASE "Durable Object state survives").
- `applyCommand` returns `{accepted, selected}`; `command()` becomes: transaction → snapshot/size check → `if(outcome.accepted){this.recordHistory(command,outcome.selected);this.broadcast(…)}` where `recordHistory` is wrapped `try{…}catch(error){console.error('history append failed',(error as Error).name)}`. It inserts `{at:Date.now(), action, cue, source:this.sourceFor(command.clientId), service_ref: command.serviceRef ?? collectionFromNamesCue(command.cue), source_ids: JSON.stringify(librarySourceIds(selected))}` then trims: `DELETE FROM command_history WHERE at<? OR seq<=(SELECT COALESCE(MAX(seq),0)-? FROM command_history)`.
- `bug` commands are recorded too (`cueId:null`, all-null identity) — they are accepted commands; the scan-card page string is **not** stored.
- `GET /history?after=<seq>&since=<ms>&until=<ms>&limit=<n>` (worker `fetch` whitelist + DO): rows `WHERE seq>? AND at>=? AND at<=? ORDER BY seq LIMIT min(limit,500)`; response `{rows:HistoryRow[],nextAfter:number|null,window:{rows:2000,days:14}}`. `POST /history/clear` body `{}` → transaction: delete all, insert `history_cleared` row (source `control`) → `{ok:true,seq}`.
- `sourceFor(clientId)`: scan `ctx.getWebSockets()` control attachments for `id===clientId`; `client==='companion'`→`'companion'`; otherwise `'control'`.

**Stub:** mirror table (in-memory array), append point, `/history`, `/history/clear` in `scripts/rehearsal-relay.ts` using the same protocol helpers so they cannot drift.

**Tests (relay runner + `tests/rehearsal-relay.test.ts`):** in/out/clear/cut/bug each append one row in seq order; a replayed `commandId` appends nothing; a stale controller sequence (rejected) appends nothing; custom-graphic row has `sourceIds:[]`; row for a library-backed cue carries its `library:` ids only; a forced append failure (stub: inject a throwing store) still returns the command 200 and broadcasts; 2,001 appends → 2,000 rows, oldest gone; a row aged >14 d is dropped on next append; `serviceRef` non-UUID → 400 `Invalid command`, `serviceRef` omitted → null; `nextState` output identical with/without `serviceRef`; `/history` paging by `after`; `/history/clear` leaves exactly one `history_cleared` row; unauthenticated `/history` → 401.

**Done when:** `cd relay && npm test && npm run check` green; `npm test` green; `npm run rehearsal` boots and `curl -H "Authorization: Bearer <relaySecret from work/rehearsal/current.json>" http://127.0.0.1:8788/history` returns `{rows:[]…}`.
**Commit:** `relay: bounded command history (2000 rows / 14 days), /history read and clear, optional serviceRef on commands`

### W2 — Vercel: `/api/history`, `history_reader`, liturgy join, MCP tool, console serviceRef

**Files:** `lib/relay.ts` (whitelist `'/history'`, `'/history/clear'`), new `lib/history.ts`, new `app/api/history/route.ts`, `lib/liturgy-index.ts`, `lib/access.ts`, `db/devices.sql` or new `db/history-reader.sql`, `app/api/devices/route.ts` `(path unverified — rg -n "create_output" app lib)`, the memory access store used by rehearsal `(rg -n "MemoryAccessStore" lib)`, `lib/mcp.ts`, the authoring operation dispatcher `(rg -n "prepare_service_from_setlist" lib --glob '!lib/mcp.ts')`, `app/api/command/route.ts`, `app/console.tsx` `(unverified path)`, tests.

**`lib/liturgy-index.ts`:** extract `liturgyForSourceIds(ids:readonly string[],lookups)` from `liturgyForCue` (which then calls it). Same rule: first id that starts `library:` and is in the index.

**`lib/history.ts`:**
```ts
export type ServiceHistoryRow={seq:number;at:number;action:'in'|'out'|'clear'|'cut'|'bug'|'history_cleared';cueId:string|null;unitId:string|null;momentId:string|null;book:string|null;folio:number|null;source:'control'|'companion'|'mcp';serviceRef:string|null};
export type ServiceHistory={workspace:string;rows:ServiceHistoryRow[];nextAfter:number|null;window:{rows:number;days:number}};
export const HISTORY_ALLOWED_KEYS=new Set([...]);   // exactly the keys above
export async function readServiceHistory({since,until,after,limit}):Promise<ServiceHistory>
```
Reads `relayRequest('/history?…')`, maps each row with `liturgyForSourceIds(row.sourceIds)`, **drops `sourceIds`**, and runs `assertOnlyAllowedKeys(rows)` before returning — a defensive walk in production code, not only in tests. `workspace` = `getPublicWorkspace().id`. Body cap 256 KiB (reuse `boundedText` pattern from `lib/live-setlists.ts` 91–103). `relayConfigured()===false` → 409 `{error:'Live relay is not configured'}` (the legacy Postgres path keeps no history; say so, do not build one).

**`app/api/history/route.ts`:** `GET` — `authorizeRequest(r,'history')` else 401; query `since|until` (ms ints), `after` (seq), `limit` (≤500); default window = last 14 days; headers as `json()` in `lib/server.ts` (no-store, nosniff, **no CORS header**). `POST {action:'clear'}` — `authorizeRequest(r,'owner')`; forwards to relay `/history/clear`; returns `{ok:true,seq}`. No other action.

**`lib/access.ts`:** add permission `'history'`; `canAccess(role,'history')` true for roles that hold `author`; device branch: kind `history_reader` → `['history']` only; token prefix `hr_` (mirror `cd_` format, sha256 only). Owner op `create_history_reader {label}` beside `create_output` — returns the raw token once, never stored, never logged; `revoke` already generic `(verify)`. If `db/devices.sql` has a `CHECK(kind IN …)`, write `db/history-reader.sql` (ALTER/recreate the constraint) and register it in `scripts/migrate-authoring.mjs` after `devices.sql`; a pre-migration deploy must degrade (`create_history_reader` → 503, everything else unchanged). Mirror in the rehearsal memory store.

**`app/api/command/route.ts`:** accept optional `serviceRef` (UUID or null; else 400 `Invalid service reference`); forward it in the relay body. Non-relay path ignores it. **`app/console.tsx`:** the prepared-collection selector's current id rides along on every command the console issues; "No prepared service" → omitted.

**`lib/mcp.ts`:** `register('get_service_history','Bounded operational history of accepted live commands for this workspace — liturgical units and pages only, never names, titles or text.', z.object({since:z.number().int().nonnegative().optional(),until:…,after:…,limit:z.number().int().min(1).max(500).optional()}).strict(),{readOnlyHint:true})`; dispatcher case calls `readServiceHistory` (actor already an authoring member per MCP consent).

**Tests (`tests/*.test.ts`, tsx runner):** `tests/history-route.test.ts`, modelled on `now-route.test.ts`: injected relay fixture (rows for a library cue, a custom cue, a `names:` cue, a `bug`, a `history_cleared`); walks **every** row and the envelope for forbidden keys (`name,title,text,hebrew,transliteration,english,label,cuePayload,renderers,controllers,operator,actor,email,member,page,sourceIds,revision,catalogVersion`); custom/names/bug rows all-null identity; names row `serviceRef` = its collectionId; 401 anonymous; `history_reader` passes GET but fails `POST clear`, `/api/command`, `/api/catalog`, `/api/authoring`; author passes, operator and `CONTROL_KEY` fail; no `Access-Control-Allow-Origin`. `tests/liturgy-index.test.ts`: `liturgyForSourceIds` equals `liturgyForCue`; unknown-only ids → `NO_LITURGY`. `tests/mcp*.test.ts`: tool listed, read-only, strict schema. Command route: `serviceRef` validation and forwarding.

**Done when:** `tsc --noEmit` 0, `npm run lint` 0, `npm test` green (dot reporter), `npm run test:mcp` green; in rehearsal, after signing in as the seeded owner, `GET /api/history` shows the rows fired in W1's smoke.
**Commit:** `history: authenticated GET /api/history with liturgy join, history_reader credential, get_service_history MCP tool, serviceRef from the console`

### W3 — Verification script, docs

**Files:** `scripts/check-live-relay.mjs` if present, else `scripts/check-rehearsal.mjs`; `docs/LIVE-ARCHITECTURE.md`, `docs/ACCESS.md`, `docs/MCP.md`, `docs/WORKSPACE-DEPLOYMENT.md`, `docs/RELAY-RELEASE.md` (fourth-use line after release), `README.md` one sentence.

**Check steps to add (print `ok <step>` / `FAIL <step>`):** publish a throwaway custom graphic (existing flow); mint a `history_reader` as the seeded owner; fire `in` (library-backed baseline cue), `in` (custom), `out`, `clear`, `cut`, `bug on`, `bug off`; read `/api/history` with the reader token; assert 7 rows in seq order, the custom/bug rows all-null, the library row non-null `book`/`folio`, `momentId` null (moments.json empty); forbidden-key walk; assert `after` paging; assert `clear` refused for the reader and accepted for the owner, leaving one `history_cleared`; hammer 2,050 `bug` toggles and assert `rows.length===2000` with the smallest `seq` advanced. Save the captured history JSON under `work/handoffs/cue-log/history-rehearsal.json` (ignored) and quote ≤10 rows in the return.

**Docs:** LIVE-ARCHITECTURE — a "History" paragraph (bounded, what a row is and is not, the sentence from TWO-CONGREGATIONS line 113). ACCESS — `history_reader` beside Output: read-only, one endpoint, owner mints/revokes via `/api/devices`, copied once and never through chat. MCP — `get_service_history`. WORKSPACE-DEPLOYMENT — no new Overlays variable; the .live side holds the token as its own sensitive variable (`HANDOFF-CODE-LIVE-AS-PERFORMED-2026-09-14.md` W1).

**Commit:** `docs+check: cue log verified in rehearsal; history_reader documented`

### W4 — Part B: moments consumer + manual siddur refresh

**Files:** `.github/workflows/siddur-library.yml`, `docs/WORKSPACE-DEPLOYMENT.md` or the System → Setup page `(rg -n "Siddur library|siddur-library" app docs)`, `tests/liturgy-index.test.ts` if it pins `moments.json` empty.

**Workflow:** after "Rebuild the library from source", add
```yaml
- name: Adopt the producer's moments table when it exists
  if: env.HAS_SOURCE_TOKEN == 'true' && inputs.dry_run != true
  run: |
    if [ -f source/dist-app/moments-pairs.json ]; then
      python - <<'PY'
      import json,sys
      d=json.load(open("source/dist-app/moments-pairs.json",encoding="utf-8"))
      ok=isinstance(d,dict) and d.get("schemaVersion")==1 and isinstance(d.get("moments"),list) and all(isinstance(m,dict) and isinstance(m.get("momentId"),str) and isinstance(m.get("unitId"),str) for m in d["moments"])
      sys.exit(0 if ok else 1)
      PY
      cp source/dist-app/moments-pairs.json content/moments.json
      echo "moments: adopted $(python -c 'import json;print(len(json.load(open("content/moments.json"))["moments"]))') pairs" >> "$GITHUB_STEP_SUMMARY"
    else
      echo "moments: producer has not published dist-app/moments-pairs.json yet; content/moments.json unchanged" >> "$GITHUB_STEP_SUMMARY"
    fi
```
A malformed file fails the step loudly (no PR) rather than committing junk. Extend "Detect a change" to `git diff --quiet -- content/siddur-library.json content/moments.json`, the PR `add-paths` to both files, and the summary with the moments line. Nothing else changes: `liturgyForCue` already reads the file (`lib/liturgy-index.ts` 55–76), so `momentId` appears in `/api/catalog?include=liturgy`, `/api/history` and the dark `/api/now` payload with no code change once the PR merges.

**Manual refresh:** `workflow_dispatch` exists, so the "one button" is GitHub's **Run workflow** button. Do **not** add a GitHub token to Vercel or a dispatching route (Daniel: "no further lift"). Add to the System → Setup page (administrator-only) a short "Siddur library" card: last regeneration is the Monday PR; "Refresh now" is an external link to `https://github.com/RavBogard/crc-overlays/actions/workflows/siddur-library.yml` with the sentence "Run workflow → leave Dry run off. A pull request appears only when the library or the moments table changed." Document the same in `docs/WORKSPACE-DEPLOYMENT.md`.

**Tests:** if `tests/liturgy-index.test.ts` asserts the committed file is empty, change it to assert shape only (a later data PR must not fail tests). `npm test` green.
**Commit:** `siddur-library: adopt shireishabbat moments-pairs.json; document manual refresh`

---

## 4. Deploy

Order: **relay first, then migration (if any), then web** — the additive field pattern used for `controllers` and `bug` (RELAY-RELEASE second and third use).

1. Rehearsal proof: `npm run rehearsal` in one shell; W3 check in another; both PASSED; capture saved.
2. Gate: `tsc --noEmit`, `npm run lint`, `rm -rf .next && npm run build`, `npm test` (dot reporter), `cd relay && npm test && npm run check`. Merge `code/cue-log` → `codex/product-expansion` → `main` (fast-forward); note `<full-sha>`.
3. Relay dry run: `node scripts/deploy-relays.mjs --commit <full-sha> --dry-run`.
4. Gate file: `GET /api/state` per workspace with that workspace's control key from Daniel's store (never pasted anywhere); both `renderers` counts `0` and no live cue that is not Daniel's own test; write the JSON outside the repo (or ignored `work/`) with `checkedAt` stamps; the script refuses stamps older than 10 minutes.
5. Release: `node scripts/deploy-relays.mjs --commit <full-sha> --confirm-production --gate-file <path>`. Record: `work/deploy-staging/releases/<sha>/relay.json` must read `complete`. Between relay and web the deployed web (no `serviceRef`) posts commands the new relay accepts unchanged — `parseCommand` treats an absent field as null.
6. Migration only if W2 produced `db/history-reader.sql`: `scripts/migrate-authoring.mjs` once per workspace with only that workspace's `DATABASE_URL`; verify table count read-only.
7. Web: `node scripts/deploy-workspaces.mjs --commit <full-sha> --confirm-production`; record under `work/deploy-staging/releases/<sha>/release.json`.
8. Verify read-only on both hosts: `/api/history` anonymous → 401 with no `Access-Control-Allow-Origin`; `/api/now` → 404 (still dark); `/api/state` and `/api/catalog?include=liturgy` unchanged. Do **not** mint a production `history_reader` unprompted — that belongs to the .live plan's W1; write the minting sentence in the return.
9. Add the fourth-use line to `docs/RELAY-RELEASE.md` and the deploy record to `CLAUDE-HANDOFF.md` (append, do not read the whole file); fast-forward branches.

**Rollback.** Relay: `cd relay && npx wrangler rollback [--env tbi]`, note the version id; the `command_history` table is inert to an older worker. Web: promote the previous Vercel build per project; `/api/history` then 404s and nothing else changes. Migration (if any) is additive.

---

## 5. Return file

`work/handoffs/RETURN-CODE-CUE-LOG-2026-09-14.md` (also copy to `docs/planning/2026-09-14-integration/`), containing: W1 discovery answers (Companion id parity, `kind` CHECK, permission union, relay test dir, which check script was extended); commit list; test counts per wave (pass/fail/skip); the captured rehearsal history (≤10 rows verbatim, showing a library row, a custom all-null row, a `history_cleared` row) and the forbidden-key walk result; the relay release record path, both worker version ids, gate readings (counts and stamps only); the web release record path; post-deploy verification lines; the exact minting sentence for the .live team ("an Overlays owner opens System → People/Devices → Create history reader, copies the `hr_…` token once into `vercel env add OVERLAYS_HISTORY_TOKEN production --sensitive` on the .live project"); anything deferred with the reason. Never `cat` this file back into context.

---

## 6. Launch prompt

```
Read docs/planning/2026-09-14-integration/PLAN-CODE-OVERLAYS-CUE-LOG-2026-09-14.md
(copy it there first from wherever Daniel put it) and follow it as the order of record.

Governance ruled by Daniel 2026-09-14: the "Codex is Producer / Code lanes stop and return"
banners are superseded — you are executor and producer, you write the RETURN file yourself,
you merge to main when green and deploy to production when it looks ready. Content and
licensing safeguards stay in force. /api/now stays dark. No public history endpoint. A failed
history append must never fail a command. Michael's live relay is not disturbed: prove in
rehearsal (npm run rehearsal), release the relay per docs/RELAY-RELEASE.md, then deploy web.

Create branch code/cue-log from codex/product-expansion. Start with W1: run the discovery
commands in the plan and write their answers to work/handoffs/RETURN-CODE-CUE-LOG-2026-09-14.md,
then add the bounded command_history table, the post-commit append, GET /history and
POST /history/clear to relay/src, mirror them in scripts/rehearsal-relay.ts, add the optional
serviceRef to parseCommand, and make cd relay && npm test && npm run check and npm test green.
Use a dot reporter. Do not read CLAUDE-HANDOFF.md or lib/access.ts whole — grep them.
Stop after each wave's commit only long enough to append to the return file; then continue.
```
