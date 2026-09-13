# Google sign-in — configuration record and setup order

Companion to `HANDOFF-CODE-2026-09-13.md` (ruling I2/S1, approved 2026-09-13) and to the
"Approved addition: Google sign-in" section of `CODEX-PARTNER-REVIEW-2026-09-13.md`.
No secret values appear in this file and none may be added to it.

## Contract — build to these exact strings

| Item | Value |
| --- | --- |
| Google Cloud project | `Congregation Overlays` (one project serves both workspaces) |
| OAuth app name (consent screen) | `Congregation Overlays` |
| Audience | External, published. Not Internal — TBI is outside CRC's Google organization. |
| Scopes | `openid`, `.../auth/userinfo.email`, `.../auth/userinfo.profile` — nothing else, ever |
| Client type | Web application, name `Overlays web sign-in` |
| Callback path | `/api/auth/google/callback`, relative to each workspace's canonical host |
| Registered redirect URIs | `https://crc-overlays.vercel.app/api/auth/google/callback`<br>`https://tbi-overlays.vercel.app/api/auth/google/callback`<br>`http://localhost:3000/api/auth/google/callback`<br>`http://localhost:5175/api/auth/google/callback` |
| Authorized JavaScript origins | none — the code exchange is server-side |
| Environment variables | `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` |
| Where they live | Vercel project `crc-overlays` and Vercel project `tbi-overlays`, Production + Preview, marked Sensitive. Locally: the existing ignored `.env*.local` paths. Never committed, never printed. |
| Owner / recovery | Daniel (daniel@centralreform.org) owns the Google project. Recovery: rotate the secret on the Clients page, update both Vercel projects, redeploy both. Rotation invalidates in-flight sign-ins only; paired devices are unaffected. |

The callback path was chosen here because no sign-in code existed when Daniel ran the Google
setup. It is now fixed: the build matches this file, not the other way round. If the build needs
a different path, the redirect URIs must be edited in the Google console first and this table
updated in the same change.

## Consequences the build must respect

- Vercel **preview deployments** get generated hostnames that cannot be registered with Google.
  Google sign-in is therefore available on the two production hosts and on localhost only; the
  password + recovery path must keep working everywhere, including previews.
- Publishing the app to production (rather than leaving it in Testing) is deliberate: Testing caps
  the user list at hand-added test accounts and expires sessions on a 7-day clock. With only the
  three basic scopes the published app requires no Google verification and shows no unverified-app
  warning.
- Google establishes identity only. Congregation access comes from the existing invitation,
  membership and role system. A successful Google sign-in by an uninvited account grants nothing;
  a disabled membership stays disabled.
- Device pairing never uses a human Google token. Google sign-out, session expiry and Google
  outages must leave paired outputs and controllers running.
- The existing Overlays MCP OAuth provider is untouched by all of this.

## Open item for Daniel

The Branding page may require an application privacy-policy URL before it will let the app publish.
Neither workspace serves one. If Google demands it, the build order gains a `/privacy` page on both
workspaces — one paragraph: the app receives a name and email address from Google to identify an
invited user, requests no other Google data, and stores no Google content — and the Branding entry
points at `https://crc-overlays.vercel.app/privacy` and `https://tbi-overlays.vercel.app/privacy`
respectively.

## Status

- Setup performed by Daniel on: _____ (fill in)
- Client ID recorded in Vercel (both projects): _____
- First real Google callback evidence (record separately from mocked local tests): _____
