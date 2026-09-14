/**
 * F3/B-1 - what Live control says when a command is refused, and the one rule for reading a
 * refusal the server has already written.
 *
 * `/api/command` answers a bad request with plain operator language ("The scan card is not
 * set up for this congregation.", "The scan card needs the live connection.", "Page must be
 * 12 characters or fewer."). The console used to discard all of it and show one generic
 * sentence, so an operator was told nothing about what to do. These helpers are pure so the
 * suite can assert them without a browser.
 */

/** The fallback: a refusal the server did not put into words, or a network failure. */
export const COMMAND_NOT_CONFIRMED = 'Command not confirmed. Check requested and rendered status.';
/** E8, restated client-side so an over-long page never leaves the browser. */
export const PAGE_TOO_LONG = 'Page must be 12 characters or fewer.';
/** The characters `validBugPage` accepts, as an HTML `pattern` for the page field. */
export const BUG_PAGE_INPUT_PATTERN = '[A-Za-z0-9 .,\\-–]{0,12}';

/**
 * The refusal sentence from a command response body, or '' when the body carries none.
 * Only a string `error` is used: the route always writes one, and anything else is a shape
 * this console does not speak for.
 */
export function commandRefusal(body: unknown): string {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return '';
  const error = (body as Record<string, unknown>).error;
  return typeof error === 'string' && error.trim() ? error : '';
}

/** The message to show for a refused command: the server's words, else the generic one. */
export function commandErrorMessage(body: unknown): string {
  return commandRefusal(body) || COMMAND_NOT_CONFIRMED;
}

/**
 * Length is the only thing the console refuses by itself. A disallowed character is left to
 * the server, so there is exactly one authority on which characters a page may contain.
 */
export function bugPageLengthRefusal(value: string): string {
  return value.trim().length > 12 ? PAGE_TOO_LONG : '';
}
