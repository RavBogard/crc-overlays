/**
 * I3 - "Add from siddur" opens as a shelf: books, then the sections a reader would find
 * printed in that book, then the units themselves. Everything here is pure except
 * `fetchBookUnits`, which is the one request the shelf makes and which never throws at the
 * page: a failure comes back as a short message the shelf can print in place.
 *
 * The unit shapes are described structurally (and generically) so the client types in
 * `app/author/types.ts` flow straight through without this module importing the app.
 */

/** The minimum a shelf row needs; `app/author/types.ts` `BookUnit` satisfies it. */
export type ShelfUnitLike = {
  id: string;
  name: string;
  folio: string | null;
  blockCount: number;
  /** Only source English a siddur prints as a note - hidden until the reader asks for notes. */
  noteLikeOnly: boolean;
};
export type ShelfSectionLike<U extends ShelfUnitLike> = { index: number; title: string | null; units: U[] };
export type ShelfResultLike<U extends ShelfUnitLike> = { sections: ShelfSectionLike<U>[] };
/** One printed section, ready to render. `title` is null for a book that prints no section names. */
export type ShelfGroup<U extends ShelfUnitLike> = { key: string; index: number; title: string | null; units: U[] };

/**
 * `list_book_units` already returns printed sections; this only normalises them for display:
 * printed order, blank titles treated as unnamed, empty sections dropped, and a book that
 * prints no section names at all collapsed into a single unnamed group.
 */
export function groupUnits<U extends ShelfUnitLike>(result: ShelfResultLike<U> | null | undefined): ShelfGroup<U>[] {
  const sections = (result?.sections || [])
    .map((section, position) => ({
      index: typeof section?.index === "number" && Number.isFinite(section.index) ? section.index : position,
      title: typeof section?.title === "string" && section.title.trim() ? section.title.trim() : null,
      units: Array.isArray(section?.units) ? section.units : [],
    }))
    .filter((section) => section.units.length > 0)
    .sort((a, b) => a.index - b.index);
  if (!sections.length) return [];
  if (sections.every((section) => section.title === null)) {
    return [{ key: "all", index: sections[0].index, title: null, units: sections.flatMap((section) => section.units) }];
  }
  return sections.map((section) => ({ key: `section-${section.index}`, index: section.index, title: section.title, units: section.units }));
}

/** Units a reader sees: instructions and notes stay out of the way until they ask for them. */
export function visibleUnits<U extends ShelfUnitLike>(units: U[] | null | undefined, showNotes: boolean): U[] {
  const list = Array.isArray(units) ? units : [];
  return showNotes ? list : list.filter((unit) => !unit.noteLikeOnly);
}

/** Hebrew needs `lang`/`dir`; a romanised or English name must not get them. */
export function hasHebrew(value: string | null | undefined): boolean {
  return typeof value === "string" && /[\u0590-\u05FF\uFB1D-\uFB4F]/.test(value);
}

export type BookUnitsOutcome<R> = { ok: true; result: R } | { ok: false; error: string; message: string };

export const BOOK_UNITS_OPERATION = "list_book_units";
const COULD_NOT_LOAD = "That book could not be opened. Try again.";

/**
 * The shelf's own `/api/authoring` call - same request shape as `authoringCall`, but the
 * outcome is returned rather than thrown so a missing book is one quiet line in the shelf.
 */
export async function fetchBookUnits<R>(
  controlKey: string,
  book: string,
  signal?: AbortSignal,
  fetchImpl: typeof fetch = fetch,
): Promise<BookUnitsOutcome<R>> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (controlKey !== "session") headers.Authorization = `Bearer ${controlKey}`;
  let response: Response;
  try {
    response = await fetchImpl("/api/authoring", {
      method: "POST",
      cache: "no-store",
      headers,
      body: JSON.stringify({ operation: BOOK_UNITS_OPERATION, input: { book } }),
      ...(signal ? { signal } : {}),
    });
  } catch {
    if (signal?.aborted) return { ok: false, error: "aborted", message: "" };
    return { ok: false, error: "network", message: COULD_NOT_LOAD };
  }
  const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (!response.ok) {
    const code = typeof body?.code === "string" ? body.code
      : typeof body?.error === "string" ? body.error
      : "request_failed";
    return {
      ok: false,
      error: code,
      message: code === "unknown_source" ? "That book is not in the library yet." : COULD_NOT_LOAD,
    };
  }
  return { ok: true, result: body as R };
}
