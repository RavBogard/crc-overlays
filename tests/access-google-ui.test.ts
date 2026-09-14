import assert from "node:assert/strict";
import test from "node:test";
import {
  GOOGLE_NOTICE_CODES,
  GOOGLE_PREVIEW_TEXT,
  GOOGLE_UNAVAILABLE_TEXT,
  GOOGLE_UNLINKED_TEXT,
  googleBlockState,
  googleConfirmPrompt,
  googleNotice,
  isGoogleNoticeCode,
  readGoogleCode,
} from "../app/access/google-copy.ts";

const text = (code: string, email?: string | null) => googleNotice(code, { email })?.text;

test("each returned code renders its agreed sentence", () => {
  assert.equal(
    text("no_access"),
    "This Google account isn't connected to anyone in this workspace. Ask your congregation's administrator for an invitation, or sign in with your password and choose Link Google account.",
  );
  assert.equal(
    text("removed"),
    "Your access to this workspace has been removed. Ask your administrator if it should be restored.",
  );
  assert.equal(text("already_linked"), "That Google account is already linked to a different member here.");
  assert.equal(text("mismatch"), "That sign-in attempt expired or didn't match this browser. Try again.");
  assert.equal(text("cancelled"), "Google sign-in was cancelled. Nothing changed.");
  assert.equal(text("unavailable"), "Google sign-in isn't available right now. Use your email and password.");
  assert.equal(
    text("invite_invalid"),
    "This link has expired or was already used. Ask your administrator for a new link.",
  );
  assert.equal(text("linked", "rabbi@example.org"), "Google account linked as rabbi@example.org.");
  assert.equal(GOOGLE_UNLINKED_TEXT, "Google account unlinked. Your password still works.");
});

test("only cancelled and linked read as good news", () => {
  const kinds = Object.fromEntries(
    GOOGLE_NOTICE_CODES.map((code) => [code, googleNotice(code, { email: "a@b.org" })?.kind ?? null]),
  );
  assert.deepEqual(kinds, {
    signed_in: null,
    confirm: null,
    linked: "success",
    cancelled: "success",
    removed: "error",
    no_access: "error",
    already_linked: "error",
    mismatch: "error",
    unavailable: "error",
    invite_invalid: "error",
  });
});

test("signed_in and confirm show no notice; the page navigates or draws a card instead", () => {
  assert.equal(googleNotice("signed_in"), null);
  assert.equal(googleNotice("confirm"), null);
});

test("a code nobody recognizes is ignored rather than guessed at", () => {
  for (const code of ["", "  ", "oidc", "subject", "SIGNED_IN", "signed_in ", null, undefined, 7, {}]) {
    assert.equal(googleNotice(code), null, `unexpected notice for ${String(code)}`);
    assert.equal(isGoogleNoticeCode(code), false);
  }
});

test("no copy leaks the words members should never see", () => {
  const all = GOOGLE_NOTICE_CODES.map((code) => text(code, "a@b.org") ?? "")
    .concat(GOOGLE_PREVIEW_TEXT, GOOGLE_UNAVAILABLE_TEXT, GOOGLE_UNLINKED_TEXT)
    .join(" ")
    .toLowerCase();
  for (const word of ["oidc", "subject", "issuer", "cue"]) assert.ok(!all.includes(word), `copy mentions "${word}"`);
});

test("the confirmation card names both addresses", () => {
  assert.equal(
    googleConfirmPrompt({ kind: "link", accountEmail: "rabbi@example.org", googleEmail: "personal@gmail.com" }),
    "You're signed in as rabbi@example.org. Google signed you in as personal@gmail.com. Link this Google account to your rabbi@example.org membership?",
  );
  assert.equal(
    googleConfirmPrompt({ kind: "redeem", invitedEmail: "cantor@example.org", googleEmail: "personal@gmail.com" }),
    "This invitation was created for cantor@example.org. Google signed you in as personal@gmail.com. Continue with this Google account?",
  );
});

test("the return code is read from the query string and nothing else is", () => {
  assert.equal(readGoogleCode("?google=linked"), "linked");
  assert.equal(readGoogleCode("google=linked"), "linked");
  assert.equal(readGoogleCode("?manage=1&google=no_access&next=/author"), "no_access");
  assert.equal(readGoogleCode("?google=made_up"), null);
  assert.equal(readGoogleCode("?invite=abc"), null);
  assert.equal(readGoogleCode(""), null);
  assert.equal(readGoogleCode("?google="), null);
});

test("availability decides whether the Google block appears and whether it is usable", () => {
  assert.deepEqual(googleBlockState({ available: true, reason: null }), {
    hidden: false,
    disabled: false,
    reason: null,
  });
  assert.deepEqual(googleBlockState({ available: false, reason: "preview" }), {
    hidden: false,
    disabled: true,
    reason: "Google sign-in works on the main site address, not on this preview.",
  });
  assert.deepEqual(googleBlockState({ available: false, reason: "misconfigured" }), {
    hidden: false,
    disabled: true,
    reason: "Google sign-in isn't available right now. Use your email and password.",
  });
  assert.deepEqual(googleBlockState({ available: false, reason: "unconfigured" }), {
    hidden: true,
    disabled: true,
    reason: null,
  });
});

test("a server that has not learned about Google yet hides the block", () => {
  assert.deepEqual(googleBlockState(null), { hidden: true, disabled: true, reason: null });
  assert.deepEqual(googleBlockState(undefined), { hidden: true, disabled: true, reason: null });
});
