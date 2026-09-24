import {z} from 'zod/v4';
import {type McpIdentity,type RegisterTool,version} from './shared';

const assetId=z.string().regex(/^asset_[a-f0-9]{64}$/,{message:'Pass an asset id from list_assets (asset_ followed by 64 hex characters).'});
const uploadId=z.string().regex(/^upload_[a-f0-9]{32}$/,{message:'Pass the uploadId upload_asset step:\'begin\' returned.'});

// Artwork assets (packet A6, R-B1): the web artwork library's upload, list and archive, over the
// same rules. Operations live in lib/asset-tools.ts.
export function registerAssetsTools(register:RegisterTool,identity:McpIdentity){
 register('upload_asset',`Add an image to the ${identity.shortName} artwork library in chunks: step 'begin' {name, altText, totalBytes} returns an uploadId; step 'append' {uploadId, chunkIndex from 0, dataBase64} sends the bytes in order, each chunk at most 192 KB before base64; step 'commit' {uploadId} checks and stores it. The rules are the editor's: a non-animated PNG, JPEG or WebP, at most 512 KB and 4096 px per side. The id is the image's sha256, so the same image uploaded twice is one asset. Attach it with update_draft patch.presentation.imageAssetId; ship_draft then shows it in the frame.`,z.object({step:z.enum(['begin','append','commit']),name:z.string().min(1).max(160).optional(),altText:z.string().min(1).max(240).optional().describe('What the image shows, for anyone who cannot see it.'),totalBytes:z.number().int().min(1).max(512*1024).optional().describe('The image size in bytes before base64.'),uploadId:uploadId.optional(),chunkIndex:z.number().int().min(0).max(1000).optional(),dataBase64:z.string().min(4).max(262_144).optional()}).strict(),{readOnlyHint:false});
 register('list_assets',`List the ${identity.shortName} artwork library: id, name, type, size, dimensions, version, whether it is archived or published, and which drafts use it (usedBy). Archived artwork is left out unless includeArchived:true; query narrows by name or alt text.`,z.object({includeArchived:z.boolean().optional(),query:z.string().min(1).max(100).optional()}).strict(),{readOnlyHint:true});
 register('archive_asset','Archive one image so it is no longer offered for new graphics. Refused, changing nothing, while a published graphic uses it; the refusal names those graphics. Unpublished drafts that use it are named in the result and will not publish until it is restored in the editor or replaced. expectedVersion is the version list_assets returned.',z.object({assetId,expectedVersion:version.min(1)}).strict(),{readOnlyHint:false});
}
