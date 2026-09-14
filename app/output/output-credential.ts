/**
 * Which credential the graphics page uses, and where it came from (D5).
 *
 * The compositor's scene file stores `/output#device=cd_...`, and that URL — not browser
 * storage — is what survives a compositor or machine restart. The fragment is therefore
 * authoritative; `localStorage` only covers the case where someone later opens the page
 * without one. The legacy `#key=`/`sessionStorage` path keeps working unchanged.
 *
 * Precedence: fragment (device, then legacy key) → preview session → stored device →
 * legacy session key. Preview sits above the stored device so the console's preview frame
 * keeps using the signed-in session cookie exactly as it does today.
 *
 * Pure and DOM-free so the precedence can be unit-tested without a browser.
 */

export const OUTPUT_DEVICE_STORAGE_KEY = "crc-output-device";
export const OUTPUT_LEGACY_STORAGE_KEY = "crc-output-key";

export type OutputCredentialSource =
  | "fragment-device"
  | "fragment-key"
  | "preview"
  | "stored-device"
  | "legacy-session"
  | "none";

export type OutputCredentialInput = {
  /** `location.hash`, with or without its leading `#`. */
  hash: string;
  preview: boolean;
  /** `localStorage['crc-output-device']`. */
  storedDevice: string | null;
  /** `sessionStorage['crc-output-key']`, the legacy path. */
  legacySessionKey: string | null;
};

export type OutputCredentialResolution = {
  /** The bearer value, or `session` for a preview frame, or '' when nothing was supplied. */
  credential: string;
  source: OutputCredentialSource;
  /** Write to `localStorage['crc-output-device']`, or null to leave it alone. */
  storeDevice: string | null;
  /** Write to `sessionStorage['crc-output-key']`, or null to leave it alone. */
  storeLegacyKey: string | null;
  /** True when a credential came out of the fragment and the fragment must be replaced away. */
  clearFragment: boolean;
};

const clean = (value: string | null | undefined) => (typeof value === "string" ? value.trim() : "");

export function resolveOutputCredential(input: OutputCredentialInput): OutputCredentialResolution {
  const fragment = new URLSearchParams(input.hash.replace(/^#/, ""));
  const device = clean(fragment.get("device"));
  if (device) {
    return {credential: device, source: "fragment-device", storeDevice: input.preview ? null : device, storeLegacyKey: null, clearFragment: true};
  }
  const legacyFragmentKey = clean(fragment.get("key"));
  if (legacyFragmentKey) {
    return {credential: legacyFragmentKey, source: "fragment-key", storeDevice: null, storeLegacyKey: input.preview ? null : legacyFragmentKey, clearFragment: true};
  }
  if (input.preview) {
    return {credential: "session", source: "preview", storeDevice: null, storeLegacyKey: null, clearFragment: false};
  }
  const stored = clean(input.storedDevice);
  if (stored) {
    return {credential: stored, source: "stored-device", storeDevice: null, storeLegacyKey: null, clearFragment: false};
  }
  const session = clean(input.legacySessionKey);
  if (session) {
    return {credential: session, source: "legacy-session", storeDevice: null, storeLegacyKey: null, clearFragment: false};
  }
  return {credential: "", source: "none", storeDevice: null, storeLegacyKey: null, clearFragment: false};
}
