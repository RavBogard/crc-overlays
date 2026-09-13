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
passwords use a new one-time invitation from an owner; automatic email delivery,
passkeys, and OAuth-based human sign-in remain future choices. The current OAuth
implementation serves MCP authoring clients and is not the human account system.
