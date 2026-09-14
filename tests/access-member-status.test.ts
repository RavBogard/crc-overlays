import assert from "node:assert/strict";
import test from "node:test";
import {
  STANDING_LABEL,
  invitationExpiryText,
  memberStanding,
  requestAgeText,
  standingText,
} from "../app/access/member-status.ts";

const now = 1_000_000_000;

test("standing: active, invited, invitation expired, removed", () => {
  const invitations = [
    { memberId: "invited", expiresAt: now + 3 * 3600_000 },
    { memberId: "lapsed", expiresAt: now - 1 },
  ];
  assert.equal(memberStanding({ id: "a", enabled: true }, invitations, now), "active");
  assert.equal(memberStanding({ id: "invited", enabled: false }, invitations, now), "invited");
  assert.equal(memberStanding({ id: "lapsed", enabled: false }, invitations, now), "invitation_expired");
  assert.equal(memberStanding({ id: "gone", enabled: false }, invitations, now), "removed");
  assert.equal(
    memberStanding({ id: "invited", enabled: true }, invitations, now),
    "active",
    "an enabled member with a stray link is still active",
  );
  assert.deepEqual(STANDING_LABEL, {
    active: "Active",
    invited: "Invited",
    invitation_expired: "Invitation expired",
    removed: "Removed",
  });
  assert.equal(standingText({ id: "invited", enabled: false }, invitations, now), "Invited · link expires in 3 h");
  assert.equal(standingText({ id: "lapsed", enabled: false }, invitations, now), "Invitation expired");
  assert.equal(standingText({ id: "gone", enabled: false }, invitations, now), "Removed");
  assert.equal(standingText({ id: "a", enabled: true }, invitations, now), "Active");
});

test("relative times read naturally", () => {
  assert.equal(invitationExpiryText(now + 20 * 60_000, now), "link expires in 20 min");
  assert.equal(invitationExpiryText(now + 30 * 3600_000, now), "link expires in 30 h");
  assert.equal(invitationExpiryText(now + 72 * 3600_000, now), "link expires in 3 days");
  assert.equal(invitationExpiryText(now - 5, now), "link expires now");
  assert.equal(requestAgeText(now, now), "just now");
  assert.equal(requestAgeText(now - 12 * 60_000, now), "12 min ago");
  assert.equal(requestAgeText(now - 5 * 3600_000, now), "5 h ago");
  assert.equal(requestAgeText(now - 3 * 86400_000, now), "3 days ago");
});
