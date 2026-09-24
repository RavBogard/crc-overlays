import {z} from 'zod/v4';
import {IMPORT_KINDS} from '../imports';
import type {McpIdentity,RegisterTool} from './shared';

const importId=z.string().regex(/^import_[a-f0-9]{32}$/,{message:'Pass the importId open_import_dropzone returned (import_ followed by 32 hex characters).'});

// TBI redo G1 - file intake: a person drops a file on a short-lived link and a tool reads it by
// importId, so no one retypes a large file through tool arguments. Operations live in lib/import-tools.ts.
export function registerImportsTools(register:RegisterTool,identity:McpIdentity){
 register('open_import_dropzone',`Open a dropzone: a web link, valid for 30 minutes and needing no sign-in, where a person drops one file for ${identity.shortName}. kind says what it is for: singular-extract (the Singular extract JSON, for import_singular_extract), local-sources (the local sources JSON), asset (a PNG, JPEG or WebP image) or deck-plan (the deck plan CSV or JSON). JSON and CSV may be up to 2 MB, an image 5 MB. The file is checked when it arrives (type by content, nothing that looks like a credential) and kept 7 days. Returns the importId and the link; share the link only with the person who has the file. At most 10 links wait at once.`,z.object({kind:z.enum(IMPORT_KINDS),note:z.string().max(200).optional().describe('A short line shown on the page, such as which file to drop.')}).strict(),{readOnlyHint:false});
 register('get_import','Say what has arrived on a dropzone: status (waiting, receiving, ready or refused), file name, type, size, sha256, the refusal sentence if it was refused, and a summary by kind (compositions per app for a Singular extract, item and key counts for local sources, rows and columns for a deck plan, type and pixel size for an image). Never returns the file itself.',z.object({importId}).strict(),{readOnlyHint:true});
 register('list_imports',`List ${identity.shortName}'s kept imports, newest first: id, kind, status, file name, size and expiry. No content.`,z.object({}).strict(),{readOnlyHint:true});
}
