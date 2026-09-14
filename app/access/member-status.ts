/**
 * Pure helpers for the "People with access" list and the "Waiting for approval" panel on
 * `/access`. Kept out of the page so the labels can be unit-tested without React.
 *
 * A member row has one `enabled` flag, but administrators need to tell three off states
 * apart: an invitation that has not been opened yet, an invitation that lapsed, and a member
 * whose access was removed. The unredeemed invitation rows are what distinguish them.
 */

export type MemberStanding = "active" | "invited" | "invitation_expired" | "removed";

export type PendingInvitation = { memberId: string; expiresAt: number };

export const STANDING_LABEL: Record<MemberStanding, string> = {
  active: "Active",
  invited: "Invited",
  invitation_expired: "Invitation expired",
  removed: "Removed",
};

export function memberStanding(
  member: { id: string; enabled: boolean },
  invitations: readonly PendingInvitation[],
  now: number,
): MemberStanding {
  if (member.enabled) return "active";
  const invitation = invitations.find((row) => row.memberId === member.id);
  if (!invitation) return "removed";
  return invitation.expiresAt > now ? "invited" : "invitation_expired";
}

/** "Invited · link expires in 3 h" — the second half, for an unopened invitation. */
export function invitationExpiryText(expiresAt: number, now: number): string {
  const minutes = Math.max(0, Math.round((expiresAt - now) / 60_000));
  if (minutes < 1) return "link expires now";
  if (minutes < 60) return `link expires in ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `link expires in ${hours} h`;
  return `link expires in ${Math.round(hours / 24)} days`;
}

/** "Asked 12 min ago" — the second half, for a request row. */
export function requestAgeText(requestedAt: number, now: number): string {
  const minutes = Math.max(0, Math.round((now - requestedAt) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.round(hours / 24)} days ago`;
}

/** The full standing text for a member row, after the role. */
export function standingText(
  member: { id: string; enabled: boolean },
  invitations: readonly PendingInvitation[],
  now: number,
): string {
  const standing = memberStanding(member, invitations, now);
  if (standing !== "invited") return STANDING_LABEL[standing];
  const invitation = invitations.find((row) => row.memberId === member.id)!;
  return `${STANDING_LABEL.invited} · ${invitationExpiryText(invitation.expiresAt, now)}`;
}
