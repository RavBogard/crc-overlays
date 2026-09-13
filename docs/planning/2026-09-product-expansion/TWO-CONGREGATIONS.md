# Two-congregation product plan

Status: proposed product boundary; no implementation is authorized by this document.

## Decision

For the first outside congregation, run one maintained product as **two isolated congregation workspaces**, implemented as two deployments with separate data, live relays, credentials, domains, branding, and source packages.

This is the right boundary while the intended scale is exactly two congregations. It keeps the useful parts shared—the application, renderer, Companion module, layouts, motion system, validation, and release process—without making CRC's content or live output part of a multi-tenant system prematurely.

The outside congregation should experience this as its own product, not as a guest area inside “CRC Overlays.” Product language should use the congregation's name and call the bounded environment a **workspace**. Internally, both deployments should come from the same versioned codebase and release.

Confidence that the user would want this approach: **94%**. It optimizes for the stated two-congregation horizon, content permission safety, and operational clarity. It also leaves a clean path to managed multi-tenancy if a third or fourth congregation becomes a real need.

## Why the current system cannot be safely shared as-is

The current implementation is a single CRC realm:

- `lib/server.ts` accepts one global `CONTROL_KEY` and `OUTPUT_KEY`.
- `lib/relay.ts` issues all live tickets for the literal room `crc`; the relay protocol also accepts only that room.
- `lib/branding.ts`, the console, authoring UI, metadata, Companion help, and renderer logo are CRC-specific.
- `db/authoring.sql` stores drafts, previews, and revisions without a congregation key.
- `db/oauth.sql` stores OAuth clients and tokens without a congregation or user membership boundary.
- The authoring source pack is the pinned CRC corpus; `docs/AUTHORING-RELEASE.md` explicitly says the release is CRC-only until content permissions and account isolation are established.

A branding selector or a second set of keys would therefore be cosmetic isolation. It would not prevent the wrong catalog, source result, draft, published cue, relay state, or output URL from crossing congregations.

## Product boundaries

### Shared product assets

These can be maintained once and released to both workspaces:

- renderer and animation engine;
- generic layout definitions and fit rules;
- authoring workflow: draft, isolated preview, review, publish, revision history, rollback;
- Companion module code and generic presets;
- connection wizard and operator status model;
- source-package schema and provenance rules;
- accessibility and broadcast-readability checks;
- deployment automation, monitoring patterns, and release checklist.

Shared code must use neutral product terminology. Congregation-specific words, colors, domains, logos, and content should enter through a workspace configuration or source package rather than conditionals scattered through the code.

### Workspace-owned assets

Each workspace owns and isolates:

- organization name, short name, logo, colors, imagery, fonts, and support contact;
- prayer and reading source packages, permissions evidence, selections, and provenance;
- drafts, previews, review receipts, publications, and revision history;
- cue IDs, grouping, labels, service collections, and Companion button arrangements;
- control, output, authoring, OAuth, and relay credentials;
- current live state, output renderer presence, command receipts, and catalog version;
- usage, operational logs, backups, and recovery procedures.

### Content that may cross workspaces

Default rule: **nothing crosses merely because it exists in the other workspace**.

The user intends to give the friend's congregation a **selected CRC starter collection** and then let that congregation customize it. Treat the user's selection as the authorization for CRC-owned material; do not add another approval ceremony. It is a bounded grant, not access to the CRC repositories or complete source corpus. The user chooses the exact prayers, readings, layouts, and CRC-owned assets in the starter collection. Only text or artwork whose rights belong to a third party or carry outside restrictions needs separate rights resolution.

Import the selected starter collection as a versioned snapshot into the friend's isolated workspace. It retains source and grant provenance, but receives destination-owned cue IDs, drafts, publications, and history. After import, the friend congregation owns its local customization and revision path. Later CRC edits do not flow automatically into it, and its edits do not modify CRC. A selective-sharing screen should let the user add or remove exact starter items and issue a new collection version. When a shared upstream item changes later, offer the friend a comparison and explicit import choice; never force or silently merge the change.

Materials outside the selected starter collection remain available only to CRC unless the user explicitly adds them to a later grant. The outside congregation supplies its own permitted additions, including the precise Hebrew, transliteration, translations, readings, logos, and artwork it expects to use, plus enough provenance to record origin and permission.

The general safe reuse operation outside the starter collection is **copy presentation only**. It copies layout, motion, spacing, and style settings while removing text, congregation assets, source selectors, provenance, cue IDs, and publication history. Complete starter cues cross through the selective-sharing export/import flow. That flow shows which items the user chose, flags only actual third-party rights constraints, records the grant, and creates independent destination records.

Content source states should be visible and enforced:

1. `workspace-private`: supplied for one congregation only;
2. `licensed-shared`: explicitly permitted for both named congregations;
3. `public-source`: supported by recorded public-domain or compatible-license evidence;
4. `owner-shared`: selected by its owner for the other named congregation, including the approved CRC starter collection;
5. `original`: created by the owning congregation, with a recorded sharing decision.

Every imported source package needs an owner, source identity, revision/hash, and permitted workspace list. CRC-owned starter material records the user's selected sharing grant. Third-party material also records the applicable license, permission, or restriction; the system should not demand third-party-style paperwork for material the user owns and has already authorized.

Confidence that the user would want isolated source packages plus a deliberately selected, independently versioned CRC starter collection: **99%**.

## Branding and adaptability

Introduce a versioned workspace manifest consumed by the console, authoring UI, renderer, output metadata, OAuth consent page, Companion labels, and operational docs. It should cover:

- stable workspace ID and organization display names;
- logo and image assets with alt text;
- palette tokens and type choices;
- product title, output label, and support/contact text;
- allowed templates and layout defaults;
- source-package IDs allowed for the workspace;
- public base URL and live relay identity;
- feature flags limited to genuine congregation differences.

The manifest should be validated during build and startup. Missing branding, duplicate workspace identity, invalid source grants, or a relay identity that does not match the deployment should fail closed before publication or live connection.

Keep templates structurally generic. A workspace can set defaults and approved visual variants, but it should not fork renderer behavior. If the friend's congregation needs a different graphic family, represent it as another tested template or theme in the common product rather than a private code branch.

Acceptance of adaptability is not “the logo changed.” The outside congregation must be able to build, review, publish, operate, and recover its own service. It may see the exact CRC starter material selected for it, but no unselected CRC sources, graphics, credentials, drafts, or live state.

## Permissions and people

For the two-congregation pilot, use a small role model:

| Role | Capabilities |
| --- | --- |
| Workspace owner | Invite/revoke people, manage branding and source permissions, publish/rollback, view recovery information |
| Editor | Search that workspace's sources; create, preview, review, and publish cues |
| Operator | Use live controls, retrieve the private output connection through onboarding, refresh the catalog |
| Output | Render and acknowledge one workspace's live output; cannot control or author |

One person may hold several roles. Permissions always bind to one workspace. There is no “all congregations” operator or editor role in the pilot. The user may be owner of both workspaces for support, but must deliberately switch workspace and see persistent congregation identification before changing content or live output.

The current shared control-key model is acceptable only as a temporary, single-workstation bootstrap during a supervised pilot. Before the outside congregation operates independently, people should sign in with individual identities and revocable workspace memberships. OAuth is appropriate for granting an outside client such as ChatGPT access to authoring APIs, but OAuth alone is not the human account system and does not simplify installing the broadcast output. Interactive web sign-in should use a low-friction mechanism such as passkeys or emailed sign-in links; playback devices should receive purpose-bound setup credentials through the onboarding flow.

Audit records should identify the person and workspace for invites, source-package changes, reviews, publications, rollbacks, credential issuance/revocation, and live-library synchronization. Routine live button presses need bounded operational history, not permanent personal surveillance.

Confidence that the user would want individual, revocable workspace membership before the friend operates without supervision: **91%**.

## Separate live output and controls

Each workspace needs its own complete live realm:

- dedicated relay/Durable Object namespace or separate relay deployment;
- independent catalog, selected cue, revision counter, presence, receipts, and controller sequences;
- separately scoped controller, output, and preview tickets;
- unique output URL and connection/setup code;
- workspace-specific Companion connection and button pages;
- independent clear, reconnect, restart, and rollback behavior.

No request should select a workspace from an untrusted query parameter and then reuse a global credential. The deployment itself supplies the workspace identity, and issued tickets assert that identity. A CRC controller must receive an authorization failure if used against the friend's deployment, and vice versa.

Each control and authoring surface should show the congregation name, logo, and a short stable workspace mark near every action that can affect live state or publication. The friend's output failure must not change CRC's relay state, and CRC publishing must not notify the friend's renderer.

For Companion, keep one generic module and let each connection instance receive its workspace label and catalog from the configured endpoint. Presets can be generated from that catalog. Avoid congregation-specific module forks.

Confidence that the user would want totally separate live realms and one generic Companion module: **99%**.

## Deployment choice

| Option | Advantages | Costs and risks | Decision |
| --- | --- | --- | --- |
| Two isolated deployments from one release | Strong content/state/credential boundary; simplest incident model; easy congregation-specific domain and branding; a workspace-specific database or relay failure need not change the other's state | Two sets of runtime configuration, data migrations, monitoring, backup checks, and relay initialization; releases must prove both configurations; a shared cloud provider/account can still create a common outage or quota failure | **Use for the two-congregation pilot** |
| One multi-tenant deployment | One runtime and migration target; easier eventual self-service onboarding at larger scale | Requires tenant-aware tables, queries, caches, OAuth tokens, rate limits, catalogs, live rooms, logs, storage, and tests; a single missing predicate can expose content or control another output; larger failure radius | Defer until demand beyond two is demonstrated |
| Two code forks | Quick initial branding | Fixes drift, inconsistent safety behavior, and releases diverge | Reject |

“Two deployments” does not mean two products. Build the same tested source revision separately against each validated workspace manifest and its permitted source/assets, or load those private materials from deployment-scoped storage. Do not create one client/server bundle containing both private source packs and rely on runtime hiding. Use an automated release matrix that proves both builds, migrations, catalogs, and relay handshakes before promotion. Pin both deployments to the same product release unless a documented emergency rollback requires temporary divergence.

Data isolation should be real rather than a schema convention: separate databases or database branches/projects with distinct credentials, and separate durable relay storage. Separate Vercel projects and relay deployments/namespaces are the clearest initial implementation. Each has its own least-privilege secrets, backup, and restoration target. This protects against cross-workspace mistakes and permits independent recovery; it does not guarantee availability if both deployments share a cloud account, quota, region, DNS provider, or vendor incident. Track those common dependencies explicitly and avoid claiming failure independence that the hosting topology does not provide.

## Outside-congregation onboarding

The friend-congregation pilot should begin with a bounded discovery packet and a user-selected CRC starter collection rather than access to CRC's full authoring library.

Collect:

1. congregation and operator contacts;
2. desired service and the smallest complete cue set for that service, including which CRC starter cues the user elects to share;
3. exact source files and provenance for the congregation's own additions, plus rights resolution for any genuinely third-party items in the starter set;
4. logo, colors, preferred fonts, and examples of existing broadcast graphics;
5. its known production stack—OBS, Companion, and Stream Deck—plus versions, operating system, output dimensions, and Stream Deck model;
6. control style, cue naming, grouping, fallback, and current operator habits;
7. who may author, review, publish, operate, and request support.

Then create the workspace manifest, import the selected starter snapshot, add the congregation's source package, and rebrand/customize a representative five-to-eight-cue visual pilot. Review it with the rabbi and operator, complete one service's required library, and run a parallel OBS/Companion/Stream Deck rehearsal before using it as the primary graphics source.

The product should provide a branded guided-setup link with supported Companion import/pairing and clear OBS browser-source steps, binding the result to the correct workspace without displaying reusable secrets. Whether every local step can be automated has not yet been verified against the actual OBS, Companion, and Stream Deck versions. This is addressed in the separate installability plan; the two-congregation requirement is that the link and resulting local connection are workspace-scoped and revocable.

## Bounded delivery plan

### Phase 1 — make congregation assumptions explicit

- Replace hard-coded CRC identity with a validated workspace manifest across UI, renderer, OAuth labels, Companion metadata, and docs.
- Define source grants, a selective-sharing screen, versioned starter-collection export/import, optional reviewed upstream updates, and presentation-only copying.
- Add a two-workspace build/test matrix using synthetic content for the second workspace.
- Keep production behavior CRC-only until isolation tests pass.

Exit: the same commit can build two visually distinct synthetic workspaces, and neither artifact contains the other's source package or private branding assets.

### Phase 2 — create isolated workspace infrastructure

- Provision the second database, relay storage/deployment, domains, secrets, monitoring, and backups.
- Bind deployment identity into API authorization and relay tickets.
- Make catalog synchronization, output URLs, OAuth clients/tokens, and operational logs workspace-specific by deployment.
- Add cross-workspace negative tests.

Exit: commands, credentials, catalogs, output acknowledgments, and authoring data cannot cross between the two live realms. Workspace-specific failures do not corrupt the other workspace, and any remaining shared-provider failure domain is documented and tested where feasible.

### Phase 3 — onboard the friend's content and design

- Record the user's exact CRC starter selection; accept that as authorization for user-owned materials and resolve only externally encumbered inclusions before export.
- Import the starter as independent destination drafts, then receive and document the friend's additional content and assets.
- Create the friend's source package and branded visual system.
- Build and human-review a representative set before completing one service.
- Give the outside congregation's owner individual access and a visible audit trail.

Exit: the congregation accepts the visual direction, source provenance, naming, and smallest complete service library.

### Phase 4 — operational trial

- Complete the guided local setup on the actual broadcast computer.
- Exercise the friend's actual OBS, Companion, and Stream Deck setup: browser-source visibility, rapid cue replacement, clear, reconnect, restart, and fallback.
- Run in parallel with the existing graphics system for an agreed trial.
- Record every fallback to the old system and resolve material causes.

Exit: both the rabbi/content owner and production operator sign off on one complete service and its recovery workflow.

### Explicitly deferred

- self-service creation of arbitrary new congregation workspaces;
- billing and subscription management;
- an administrator dashboard spanning many congregations;
- shared cross-congregation content marketplace;
- tenant-keyed shared databases and relay rooms;
- automatic congregation-to-congregation publishing or synchronization (reviewed starter updates remain allowed);
- mobile-native control applications.

## Acceptance criteria

The two-congregation pilot is ready only when all of the following are demonstrated:

### Isolation

- Each deployment contains only its allowed source packages and congregation assets, including only the explicitly selected CRC starter subset in the friend's workspace.
- A credential, OAuth token, output URL, Companion connection, catalog request, or live command from workspace A fails against workspace B.
- Draft search, lists, previews, history, publications, logs, backups, and restores expose only the selected deployment's workspace.
- Concurrent cues in both congregations change only their own outputs.
- Stopping or exhausting the friend workspace's database/relay does not corrupt or select CRC live state, and the converse is true.

### Content integrity

- Every published cue records workspace, source package, source revision/hash, selectors, role, and permission category.
- CRC material outside the selected starter grant cannot be found or imported in the outside workspace.
- Starter cues in the friend's workspace retain their grant/source provenance but have independent IDs, drafts, publications, and revision history; later edits in either workspace do not silently change the other.
- A later CRC starter update appears as an optional comparison; declining or delaying it leaves the friend's active cue unchanged.
- Presentation-only copy strips all text, source references, private art, cue IDs, and publication history.
- The outside congregation's authorized reviewer approves exact rendered frames for its complete pilot service.

### Branding and product quality

- Console, authoring, output, consent/setup, Companion connection, errors, and documentation consistently show the correct congregation identity.
- No CRC name, logo, palette, source label, URL, or support instruction appears in the outside workspace unless deliberately shared and approved.
- Both themes pass the same 1920×1080 fit, font readiness, transparency, contrast, animation, and replacement checks.

### People and permissions

- Owners can invite and revoke an editor or operator without rotating every workspace credential.
- An operator cannot author or publish; an output connection cannot control; an editor cannot access the other workspace.
- Publications and rollbacks record the acting person and workspace.
- Revoking a person or setup credential ends new access within a documented short interval without interrupting unrelated workspace devices.

### Operations

- Each congregation can independently retrieve/setup its output, connect Companion, refresh its own catalog, show/animate/clear cues, and see truthful renderer status.
- Backup and restore are exercised independently for both authoring data and approved live catalog/state.
- One product source release can produce separate workspace-scoped builds, promote them with workspace-specific preflight checks, and independently roll either deployment back if necessary.
- Shared cloud accounts, quotas, DNS, and providers are listed as common failure domains; isolation claims distinguish cross-workspace data/state safety from provider-level availability.
- A named support owner can identify which workspace, deployment version, database, relay, catalog version, and connected renderer is involved without handling raw secrets.

## Revisit trigger

Reconsider a true shared multi-tenant architecture only when at least one of these becomes real: a third congregation is committed; onboarding two deployments repeatedly becomes the dominant maintenance cost; self-service signup is desired; or shared collaboration/content distribution is a product requirement. At that point, tenant identity must become part of every primary key or row-level security policy, OAuth grant, cache key, storage path, relay ticket and room, log event, rate-limit key, backup/restore operation, and test fixture. Until then, two isolated deployments give the desired adaptability with substantially less cross-congregation risk.
