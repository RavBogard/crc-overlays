// The selected graphic travels with live state. Catalog publication only changes
// what a later command selects, including after the output browser restarts.
export function withPinnedCue<T extends {id: string}>(catalog: T[], cueId: string | null, payload: T | null | undefined): T[] {
  if (!cueId || !payload || payload.id !== cueId) return catalog;
  return [...catalog.filter(cue => cue.id !== cueId), payload];
}
