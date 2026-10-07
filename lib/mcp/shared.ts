import {z} from 'zod/v4';
import {layoutIds} from '../layout-registry';
import {TEXT_SIZE_IDS,type TextSizePreset} from '../template-looks';

export type ToolAnnotations={readOnlyHint?:boolean;idempotentHint?:boolean;destructiveHint?:boolean};
// Each lib/mcp/<area>.ts module registers its tools through this one function, so validation,
// coverage checks and result shaping stay in lib/mcp.ts and cannot drift between areas.
export type RegisterTool=(name:string,description:string,inputSchema:z.ZodObject,annotations:ToolAnnotations)=>void;
// Who this connection serves. Each deployment has its own database, issuer and relay, so a token
// reaches one congregation only - but an editor at both holds two connectors that otherwise look
// alike, so every description, result and refusal names the congregation.
export type McpIdentity={workspaceId:string;shortName:string;organizationName:string;host:string};
export type RegisterArea=(register:RegisterTool,identity:McpIdentity)=>void;

// Built when each server is created, so a layout registered after startup is offered too. The
// list keeps the historical order (left, bottom, right, corner) so the published schema is unchanged.
export const layoutId=()=>{const ids=layoutIds(),historical=['left','bottom','right','corner'].filter(id=>ids.includes(id)),added=ids.filter(id=>!historical.includes(id));return z.enum([...historical,...added] as [string,...string[]])};
export const id=z.string().min(1).max(200);
export const version=z.number().int().nonnegative();
export const presentation=z.object({hebrewFontSize:z.number().int().min(24).max(52).optional(),transliterationFontSize:z.number().int().min(20).max(48).optional(),translationFontSize:z.number().int().min(20).max(48).optional(),titleFontSize:z.number().int().min(20).max(42).optional(),hebrewLineHeight:z.number().min(0.9).max(2).optional(),transliterationLineHeight:z.number().min(0.9).max(2).optional(),translationLineHeight:z.number().min(0.9).max(2).optional(),titleLineHeight:z.number().min(0.9).max(2).optional(),hebrewLetterSpacing:z.number().min(-2).max(8).optional(),transliterationLetterSpacing:z.number().min(-2).max(8).optional(),translationLetterSpacing:z.number().min(-2).max(8).optional(),titleLetterSpacing:z.number().min(-2).max(8).optional(),hebrewFontFamily:z.enum(['noto-sans','david-libre','frank-ruhl-libre']).optional(),bottomLayout:z.enum(['columns','stacked']).optional(),verticalAlignment:z.enum(['top','center','bottom']).optional(),legacyTitleWatermark:z.boolean().optional(),keepHyphenatedWords:z.boolean().optional(),largePrint:z.boolean().optional(),alignment:z.enum(['start','center']).optional(),lineSpacing:z.enum(['compact','spacious']).optional(),latinLineBreaks:z.enum(['preserve','paragraphs','phrases']).optional(),imageAssetId:z.string().regex(/^asset_[a-f0-9]{64}$/).optional()}).strict();
export const rowOrder=z.array(z.enum(['he','tr','en'])).length(3).refine(order=>new Set(order).size===3,{message:'rowOrder must list he, tr and en exactly once each'}).describe('Order the Hebrew (he), transliteration (tr) and translation (en) layers stack in on a left or right panel, in both arrangements. Default he, tr, en, which is stored as absent; also sets the order of stacked bottom panels and corner cards.');
const sourceGroup=z.object({sourceId:z.string().min(1).max(160),blockIds:z.array(z.string().min(1).max(220)).min(1).max(48)}).strict();
const bilingual=z.object({mode:z.literal('bilingual'),hebrewGroups:z.array(sourceGroup).min(1).max(24),transliterationGroups:z.array(sourceGroup).min(1).max(24),includeTranslation:z.boolean().optional(),layers:z.array(z.enum(['he','tr','en'])).min(1).max(3).optional(),arrangement:z.enum(['together','blocks']).optional(),rowOrder:rowOrder.optional(),preserveGroups:z.boolean().optional()}).strict();
const originalEnglish=z.object({mode:z.literal('original-en'),englishGroups:z.array(sourceGroup).min(1).max(24)}).strict();
const sourceEnglish=z.object({mode:z.literal('source-en'),englishGroups:z.array(sourceGroup).min(1).max(24)}).strict();
const canonicalContent=z.discriminatedUnion('mode',[bilingual,originalEnglish,sourceEnglish]);
const variantOverride=z.object({sourceId:z.string().min(1).max(160),blockId:z.string().min(1).max(220),channel:z.enum(['he','tr','en']),sourceText:z.string().min(1).max(4000),localText:z.string().min(1).max(4000)}).strict();
const localVariant=z.object({mode:z.literal('local-variant'),label:z.string().min(1).max(80),reason:z.string().min(1).max(500).optional(),base:canonicalContent,overrides:z.array(variantOverride).min(1).max(96)}).strict();
const custom=z.object({mode:z.literal('custom'),text:z.string().min(1).max(4000)}).strict();
const content=z.union([canonicalContent,localVariant,custom]);
// R-A6 - optional: left out, the draft takes the layout's look (list_templates `looks`).
export const templateCueId=z.string().min(1).max(80).describe("A baseline template id from list_templates. Leave it out to use the layout's default look; it contributes motion and timing only.");
export const textSize=z.enum(TEXT_SIZE_IDS as [TextSizePreset,...TextSizePreset[]]).describe("A named text size: comfortable uses the template's sizes; large is a floor of 49/41/41/41 for Hebrew/transliteration/translation/title; compact uses 34/28/24/28. Larger explicit font sizes are preserved.");
export const draftFields=()=>z.object({name:z.string().min(1).max(80),title:z.string().min(1).max(100),accentTitle:z.string().max(60).optional(),layout:layoutId(),templateCueId:templateCueId.optional(),content,presentation:presentation.optional()}).strict();
// T1 - opt out of the workspace's house defaults (get_authoring_defaults) for this one call.
export const applyDefaults=z.boolean().describe("false skips this workspace's house defaults (get_authoring_defaults) for this call. Left out, they apply; a value the call names itself always wins.");
