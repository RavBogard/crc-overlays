/**
 * Which graphic each slot fills, in this workspace (Oct 16, docs/planning/2026-10-16-slots-use-your-graphics).
 *
 * The committed register (content/slot-cues.json) names a seed graphic for each slot. A congregation
 * that designs its own - a name plate for the student, a left panel per Torah reading - points the
 * slot at it from "This service", and that choice wins. It is stored as a build key
 * (lib/build-keys.ts, kind `draft`, key `slot:<slot key>`): a name pointing at a graphic, in a table
 * every workspace already has, so no migration is needed. Until that table exists in a database,
 * every slot keeps its committed graphic, and choosing another one says why it cannot.
 *
 * Server only.
 */
import {AuthoringError} from './authoring-model';
import {defaultBuildKeyRepository,type BuildKeyRepository} from './build-keys';
import {slotCueRegister} from './slot-catalog';
import {slotDefinition} from './slots';

export const SLOT_BINDING_PREFIX = 'slot:';

/** The committed register with this workspace's own choices laid over it. A store that cannot be read keeps the committed one. */
export async function resolvedSlotRegister(repository: BuildKeyRepository = defaultBuildKeyRepository()): Promise<Map<string, string>> {
  const register = new Map(slotCueRegister());
  try {
    for (const row of await repository.list('draft')) {
      if (!row.key.startsWith(SLOT_BINDING_PREFIX)) continue;
      const key = row.key.slice(SLOT_BINDING_PREFIX.length);
      if (slotDefinition(key)) register.set(key, row.targetId);
    }
  } catch (error) {
    console.warn('slot choices could not be read; every slot keeps its committed graphic', error instanceof Error ? error.message : String(error));
  }
  return register;
}

/** Points a slot at a graphic. The caller has already checked the graphic can be one. */
export async function bindSlot(key: string, cueId: string, actor: string, repository: BuildKeyRepository = defaultBuildKeyRepository(), now = Date.now()) {
  if (!slotDefinition(key)) throw new AuthoringError('unknown_slot', `There is no slot called ${key}`, 404);
  const workspaceId = process.env.WORKSPACE_ID?.trim().toLowerCase() || 'crc';
  return repository.put({ workspaceId, kind: 'draft', key: `${SLOT_BINDING_PREFIX}${key}`, targetId: cueId, createdBy: actor, createdAt: now, updatedAt: now });
}
