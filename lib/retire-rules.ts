import {AuthoringError,type Draft} from './authoring-model';
import {baselineCatalogForWorkspace} from './workspace-catalog';

/**
 * retire_cue's refusals (MCP plan A3), in one place so batch_retire's dry run (G8) refuses with the
 * same sentence retire_cue would. The version check and the already-retired answer stay with each caller.
 */
export function missingCueRefusal(id:string){
 const builtIn=baselineCatalogForWorkspace().find(cue=>cue.id===id);
 if(builtIn)return new AuthoringError('not_a_draft',`"${builtIn.name}" is a built-in graphic with no draft in this library yet. Import it first (import_cue), then retire the imported draft.`,409);
 return new AuthoringError('unknown_cue',`No graphic in this library has the id ${id}. Check the id with list_catalog.`,404);
}
export const notPublishedRefusal=(draft:Pick<Draft,'name'>)=>new AuthoringError('not_published',`"${draft.name}" has never been published, so it is not in the live library and there is nothing to retire. Archive the draft instead (archive_draft) to take it out of the editor.`,409);
