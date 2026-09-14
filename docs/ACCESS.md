# Workspace access

People use individual, revocable workspace memberships. A one-time invitation link
creates a fixed 30-day browser session. The session does not slide forward with use:
it ends after 30 days, on sign-out, or as soon as an administrator removes the
membership. Every authenticated request checks that the session is unexpired and the
member is still enabled.

Roles are intentionally small:

- **Owner** manages people and can author, publish, and operate graphics.
- **Editor** can author, publish, and operate graphics.
- **Operator** can operate approved graphics.
- **Output** remains a purpose-specific device credential and cannot control or author.

`ACCESS_BOOTSTRAP_KEY` creates the first named owner only. The owner chooses a password
as part of that same transaction, so an interrupted browser response cannot leave the
workspace without a usable sign-in. The database serializes the operation and
permanently refuses bootstrap after any owner has existed. `CONTROL_KEY` is never an
owner recovery credential. Configure a separate bootstrap key for a new workspace and
remove it after the initial account is established.

`CONTROL_KEY` remains a transitional compatibility credential for existing Companion
and authoring clients. It permits read, live control, and authoring, but cannot manage
members or perform owner operations. Treat it as an authoring secret while this bridge
exists. Move human authors to memberships, remove the key from operator-facing
configuration, and rotate or retire it when legacy clients no longer require it.

Invitations are capability links: the application does not send email or verify the
recipient's mailbox. An owner copies the link directly to the intended person. Each
link expires in 24 hours and works once; issuing a replacement invalidates older links
for that member. Removing a member deletes all of that member's sessions and pending
links in the same transaction.

Members may set a password after accepting an invitation and then return with their
email and password. A password change rotates the current session and revokes every
other session and outstanding invitation for that member. A current password or a
freshly redeemed invitation is required to replace an existing password. Forgotten
passwords use a new one-time invitation from an owner; automatic email delivery and
passkeys remain future choices. Members may also link a Google account and sign in with
it, described below. The separate OAuth implementation serves MCP authoring clients and
is not the human account system.

## Google sign-in

A member may sign in with a Google account instead of typing a password. The password
keeps working either way; nothing about Google replaces the password, the invitation, or
the recovery path.

What a member sees. The sign-in card offers **Continue with Google** above the email and
password form, separated by a divider. An unopened invitation offers the same button
beside the existing **Open workspace**, so a new member can accept the invitation with a
Google account rather than by typing a password. Once signed in, the **Google sign-in**
panel shows either **Link Google account** — which asks for the current password when the
member has one — or **Linked as** the linked address, with **Unlink** beside it. If the
Google address is not the address on the membership, nothing is linked silently: a
confirmation card names both addresses and asks before anything is written, and **Cancel**
leaves the membership untouched.

What administrators need to know. Google establishes identity; it never grants access. No
membership is ever created from a Google account, and linking or unlinking never changes a
role or re-enables a removed member. A Google account that nobody has invited is told that
it isn't connected to anyone in this workspace and is asked to seek an invitation — it
receives no session. A removed member's Google sign-in reports that their access has been
removed. Unlink is refused when the member has no password, so no one can remove their own
last way in. One member holds at most one Google account and one Google account maps to at
most one member, per workspace; the two congregations have separate databases, so the same
Google account can be linked in both, independently, with whatever role each congregation
gave it.

Where it works. Google sign-in is available on the two production addresses and on
localhost during development. Vercel preview deployments get generated hostnames that
cannot be registered with Google, so on a preview the button is shown but disabled with a
plain explanation; email and password sign-in works everywhere, previews included.

Configuration. Both `GOOGLE_OAUTH_CLIENT_ID` and `GOOGLE_OAUTH_CLIENT_SECRET` must be set
on a workspace before the button appears at all; without them the workspace shows nothing
about Google. Each workspace must also have `PUBLIC_BASE_URL` set to its own address, or
its Google sign-in stays disabled rather than sending anyone to the other congregation's
site. Values are never read, printed, or committed; only the names appear here and in the
configuration record. The callback address is the workspace's own address followed by
`/api/auth/google/callback`, and the four addresses registered with Google are
`https://crc-overlays.vercel.app`, `https://tbi-overlays.vercel.app`,
`http://localhost:3000`, and `http://localhost:5175`. The application asks Google only for
a name, an email address, and confirmation that the address is verified; it stores no
Google token and never asks for offline access.

Migration. The link records live in tables added by `db/access-identities.sql`, which
`scripts/migrate-authoring.mjs` applies after `db/access.sql`. Run the migration against a
workspace's database before deploying Google sign-in to it. If a deployment arrives first,
nothing that was already working breaks: the sign-in page still renders, the Google routes
answer that sign-in is unavailable, and password, invitation and bootstrap sign-in are
unaffected.
