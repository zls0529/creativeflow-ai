import {z} from 'zod';

export const workflowIdSchema=z.string().regex(/^[a-z][a-z0-9_]{1,79}$/);
export const workflowVersionSchema=z.string().regex(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[a-z0-9]+(?:[.-][a-z0-9]+)*)?$/);
export const sha256Schema=z.string().regex(/^[a-f0-9]{64}$/);
export const safeNameSchema=z.string().min(1).max(240).refine(s=>!/[\x00-\x1f\\/:]/.test(s)&&!s.includes('..')&&!/sk-[a-z0-9_-]{10,}/i.test(s),'Use a public identifier, not a path or credential.');
export const scalarSchema=z.union([z.string(),z.number().finite(),z.boolean(),z.null()]);
export const workflowInputSchema=z.enum(['prompt','product','style','pose','source','mask']);
export const releaseStateSchema=z.enum(['experimental','benchmarking','candidate','validated','legacy']);
export const modelRequirementSchema=z.object({role:z.string(),node:z.string(),input:z.string(),environmentKey:z.string().regex(/^COMFYUI_[A-Z_]+$/).optional(),defaultName:z.string().nullable()}).strict();
export const workflowDefinitionSchema=z.object({
 architecture:z.string().optional(),validationObservation:z.object({hardware:z.string(),width:z.number(),height:z.number(),steps:z.number(),batch:z.number(),runtimeSeconds:z.number(),sampledGlobalVRAMMiB:z.number(),evidence:z.string(),sourceWorkflow:z.string()}).strict().optional(),
 id:workflowIdSchema,version:workflowVersionSchema,displayName:z.string().min(1),useCase:z.string().min(1),
 kind:z.enum(['workflow','extension','placeholder']),status:z.enum(['active','legacy','experimental','deprecated_candidate']),
 releaseState:releaseStateSchema,workflowTemplate:z.string().regex(/^[a-z0-9_]+\.json$/).nullable(),templateHash:sha256Schema.nullable(),
 checkpoint:z.object({family:z.string(),environmentKey:z.literal('COMFYUI_CHECKPOINT_NAME'),defaultName:z.string().nullable()}).nullable(),
 requiredNodes:z.array(z.string()).min(0),requiredModels:z.array(modelRequirementSchema),
 supportedInputs:z.array(workflowInputSchema),requiredInputs:z.array(workflowInputSchema),supportedReferenceTypes:z.array(z.enum(['product','style','pose'])),
 qualityTiers:z.array(z.enum(['fast','standard','professional'])),
 expectedVRAM:z.object({minGiB:z.number().nonnegative(),maxGiB:z.number().nonnegative(),measured:z.literal(false)}).nullable(),
 defaultParameters:z.record(scalarSchema),outputProfiles:z.record(z.object({width:z.number().int().positive(),height:z.number().int().positive()})),
 knownLimitations:z.array(z.string()).min(1),benchmarkStatus:z.enum(['not_run','offline_only','limited_live_evidence','benchmarked']),
 releaseEvidence:z.object({reportSha256:sha256Schema,reviewedBy:safeNameSchema,reviewedAt:z.string().datetime()}).optional(),
}).strict().superRefine((w,c)=>{
 if(w.kind==='placeholder'&&(w.workflowTemplate!==null||w.templateHash!==null))c.addIssue({code:'custom',message:'Future placeholders cannot point to an executable template.'});
 if(w.kind!=='placeholder'&&(!w.workflowTemplate||!w.templateHash))c.addIssue({code:'custom',message:'Registered templates require a pinned hash.'});
 if(w.requiredInputs.some(i=>!w.supportedInputs.includes(i)))c.addIssue({code:'custom',message:'Required input is unsupported.'});
 if(w.expectedVRAM&&w.expectedVRAM.maxGiB<w.expectedVRAM.minGiB)c.addIssue({code:'custom',message:'Invalid VRAM range.'});
 if(w.releaseState==='validated'&&(!w.releaseEvidence||w.benchmarkStatus!=='benchmarked'||w.kind!=='workflow'))c.addIssue({code:'custom',message:'Validated releases require an executable workflow and a reviewed benchmark report.'});
});
export type WorkflowDefinition=z.infer<typeof workflowDefinitionSchema>;
export const dependencySnapshotSchema=z.object({
 source:z.enum(['existing_catalog','explicit_read_only_probe','not_queried']),comfyuiVersion:safeNameSchema.nullable(),
 nodes:z.array(z.object({classType:safeNameSchema,module:safeNameSchema.nullable(),version:safeNameSchema.nullable(),available:z.boolean().nullable()})),
 models:z.array(z.object({role:safeNameSchema,name:safeNameSchema.nullable()})),
 runtime:z.object({node:safeNameSchema,platform:safeNameSchema,arch:safeNameSchema}),
 notes:z.array(z.string()),
});
export const reproducibilitySchema=z.object({
 schemaVersion:z.literal(1),workflowId:workflowIdSchema,workflowVersion:workflowVersionSchema,
 templateHash:sha256Schema,definitionHash:sha256Schema,hashAlgorithm:z.literal('sha256-canonical-json-v1'),registeredHashMatches:z.boolean(),
 templates:z.array(z.object({file:safeNameSchema,hash:sha256Schema})),checkpoint:safeNameSchema.nullable(),seed:z.number().int().nonnegative().nullable(),
 resolution:z.object({width:z.number().int().positive(),height:z.number().int().positive()}),
 sampling:z.array(z.object({nodeId:z.string(),stage:z.string(),seed:z.number().nullable(),steps:z.number().nullable(),cfg:z.number().nullable(),sampler:safeNameSchema.nullable(),scheduler:safeNameSchema.nullable(),denoise:z.number().nullable(),width:z.number().nullable(),height:z.number().nullable()})),
 controlNet:z.array(z.object({model:safeNameSchema.nullable(),strength:z.number().nullable(),start:z.number().nullable(),end:z.number().nullable(),preprocessor:safeNameSchema.nullable(),sourceId:safeNameSchema.nullable(),sourceSha256:sha256Schema.nullable()})),
 references:z.array(z.object({id:safeNameSchema,role:z.enum(['product','style']),strength:z.number().nullable(),weightType:safeNameSchema,sha256:sha256Schema})),
 detailer:z.object({enabled:z.boolean(),detector:safeNameSchema.nullable(),parameters:z.record(z.union([z.number().finite(),z.boolean()]))}),
 dependencies:dependencySnapshotSchema,
 notes:z.array(z.string()),
});
export type Reproducibility=z.infer<typeof reproducibilitySchema>;
