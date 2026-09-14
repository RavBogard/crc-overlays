/**
 * Copy and small pure helpers for the Google sign-in parts of `/access`.
 *
 * Kept out of the page component so the wording can be unit-tested without React.
 * Everything a member reads about Google lives here; the page only places it.
 */

/** Codes that can arrive as `?google=<code>` after a round trip, plus `password`. */
export const GOOGLE_NOTICE_CODES = [
  "signed_in",
  "removed",
  "no_access",
  "linked",
  "already_linked",
  "confirm",
  "invite_invalid",
  "cancelled",
  "mismatch",
  "unavailable",
  "password",
] as const;

export type GoogleNoticeCode = (typeof GOOGLE_NOTICE_CODES)[number];

export type GoogleNotice = { text: string; kind: "error" | "success" };

export type GoogleAvailabilityReason = "preview" | "unconfigured" | "misconfigured";

export type GoogleSignInState = { available: boolean; reason: null | GoogleAvailabilityReason };

/** How the signed-out / invitation / link blocks render for a given availability. */
export type GoogleBlockState = { hidden: boolean; disabled: boolean; reason: string | null };

export type GoogleConfirmDetails = {
  kind: "link" | "redeem";
  accountEmail?: string;
  invitedEmail?: string;
  googleEmail: string;
};

/** The member entered the wrong current password when linking: the page's existing wording. */
const WRONG_PASSWORD = "Enter your current password, or use a fresh invitation link to reset it.";
/** The page's existing wording for an invitation that has expired or was already used. */
const INVITE_INVALID = "This link has expired or was already used. Ask your administrator for a new link.";

export const GOOGLE_UNAVAILABLE_TEXT = "Google sign-in isn't available right now. Use your email and password.";
export const GOOGLE_PREVIEW_TEXT = "Google sign-in works on the main site address, not on this preview.";
export const GOOGLE_UNLINKED_TEXT = "Google account unlinked. Your password still works.";

/** `signed_in` navigates to /author, so it deliberately has no notice of its own. */
const NOTICES: Record<Exclude<GoogleNoticeCode, "signed_in" | "linked" | "confirm">, GoogleNotice> = {
  removed: {
    text: "Your access to this workspace has been removed. Ask your administrator if it should be restored.",
    kind: "error",
  },
  no_access: {
    text:
      "This Google account isn't connected to anyone in this workspace. Ask your congregation's administrator for an invitation, or sign in with your password and choose Link Google account.",
    kind: "error",
  },
  already_linked: { text: "That Google account is already linked to a different member here.", kind: "error" },
  mismatch: { text: "That sign-in attempt expired or didn't match this browser. Try again.", kind: "error" },
  cancelled: { text: "Google sign-in was cancelled. Nothing changed.", kind: "success" },
  unavailable: { text: GOOGLE_UNAVAILABLE_TEXT, kind: "error" },
  invite_invalid: { text: INVITE_INVALID, kind: "error" },
  password: { text: WRONG_PASSWORD, kind: "error" },
};

export function isGoogleNoticeCode(value: unknown): value is GoogleNoticeCode {
  return typeof value === "string" && (GOOGLE_NOTICE_CODES as readonly string[]).includes(value);
}

/**
 * The notice for a returned code, or null when the page shows something else instead
 * (`signed_in` navigates, `confirm` renders its own card) or the code is unknown.
 */
export function googleNotice(code: unknown, context: { email?: string | null } = {}): GoogleNotice | null {
  if (!isGoogleNoticeCode(code)) return null;
  if (code === "signed_in" || code === "confirm") return null;
  if (code === "linked") {
    const email = context.email;
    return { text: email ? `Google account linked as ${email}.` : "Google account linked.", kind: "success" };
  }
  return NOTICES[code];
}

/** Reads `google` out of a `location.search` string; everything else is ignored. */
export function readGoogleCode(search: string): GoogleNoticeCode | null {
  const value = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search).get("google");
  return isGoogleNoticeCode(value) ? value : null;
}

/** Absent availability (server not yet updated) is treated as unconfigured: the block is hidden. */
export function googleBlockState(state: GoogleSignInState | null | undefined): GoogleBlockState {
  if (!state || (!state.available && state.reason === "unconfigured")) {
    return { hidden: true, disabled: true, reason: null };
  }
  if (state.available) return { hidden: false, disabled: false, reason: null };
  if (state.reason === "preview") return { hidden: false, disabled: true, reason: GOOGLE_PREVIEW_TEXT };
  return { hidden: false, disabled: true, reason: GOOGLE_UNAVAILABLE_TEXT };
}

/** The question on the confirmation card, naming both addresses. */
export function googleConfirmPrompt(details: GoogleConfirmDetails): string {
  if (details.kind === "redeem") {
    return `This invitation was created for ${details.invitedEmail ?? ""}. Google signed you in as ${details.googleEmail}. Continue with this Google account?`;
  }
  const account = details.accountEmail ?? "";
  return `You're signed in as ${account}. Google signed you in as ${details.googleEmail}. Link this Google account to your ${account} membership?`;
}
