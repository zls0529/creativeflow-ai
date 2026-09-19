import {z} from 'zod';
import {workflowIdSchema,workflowVersionSchema,sha256Schema,dependencySnapshotSchema,reproducibilitySchema,safeNameSchema} from './workflow';

export const workflowKeySchema=z.object({id:workflowIdSchema,version:workflowVersionSchema}).strict();
export const benchmarkFixtureSchema=z.object({
 id:safeNameSchema,version:z.literal(1),category:z.enum(['product_hero','commercial_poster','lifestyle','sports','ecommerce_product','repair']),
 campaignBrief:z.string().min(1),placement:z.enum(['hero','post','story','banner','product']),
 fixedPrompt:z.object({positive:z.string().min(1),negative:z.string()}),seeds:z.array(z.number().int().min(0).max(4294967295)).min(1).refine(s=>new Set(s).size===s.length,'Duplicate seeds'),
 references:z.array(z.object({id:safeNameSchema,role:z.enum(['product','style','pose','source']),file:z.string().regex(/^(?!.*(?:\.\.|:|\\|\/\/))[a-zA-Z0-9_-][a-zA-Z0-9_./-]*$/),sha256:sha256Schema})),
 expectedWorkflow:workflowKeySchema,targetWorkflow:workflowKeySchema.optional(),
 outputSize:z.object({width:z.number().int().positive(),height:z.number().int().positive()}),
 region:z.object({x:z.number().min(0).max(1),y:z.number().min(0).max(1),width:z.number().positive().max(1),height:z.number().positive().max(1)}).refine(r=>r.x+r.width<=1&&r.y+r.height<=1).optional(),
 evaluationCriteria:z.array(z.string().min(1)).min(1),blockerDefinitions:z.array(z.string().min(1)).min(1),humanReviewChecklist:z.array(z.string().min(1)).min(1),limitations:z.array(z.string()),
}).strict();
export type BenchmarkFixture=z.infer<typeof benchmarkFixtureSchema>;
export const benchmarkResultSchema=z.object({
 schemaVersion:z.literal(1),id:z.string().uuid(),createdAt:z.string().datetime(),protocol:z.literal('commercial-benchmark-v1'),
 mode:z.enum(['development','release']),execution:z.enum(['dry_run','dependency_check','measured']),
 fixtureId:safeNameSchema,fixtureHash:sha256Schema,category:benchmarkFixtureSchema.shape.category,
 workflow:workflowKeySchema,templateHash:sha256Schema.nullable(),seed:z.number().int().min(0).max(4294967295),
 referenceHashes:z.array(sha256Schema),dependencies:z.array(dependencySnapshotSchema),reproducibility:reproducibilitySchema.nullable(),
 validation:z.object({valid:z.boolean(),issues:z.array(z.string()),dependencies:z.enum(['not_checked','advertised','unavailable'])}),
 metrics:z.object({generation:z.enum(['not_run','success','failure']),durationMs:z.number().finite().nonnegative().nullable(),
  vision:z.object({provider:z.literal('openai'),model:safeNameSchema,rubric:safeNameSchema,score:z.number().min(0).max(100)}).nullable(),
  blockerCount:z.number().int().nonnegative().nullable(),blockerCategories:z.array(safeNameSchema).nullable(),humanReview:z.enum(['not_reviewed','approved','rejected']),
  refinementCount:z.number().int().nonnegative().nullable(),dependencyFailure:z.boolean().nullable(),oomFailure:z.boolean().nullable(),
  productFidelity:z.object({rubric:safeNameSchema,score:z.number().min(0).max(4)}).nullable(),
 }),notes:z.array(z.string()),
}).strict().superRefine((r,c)=>{
 const m=r.metrics;
 if(r.execution!=='measured'&&(m.generation!=='not_run'||Object.entries(m).some(([k,v])=>!['generation','humanReview'].includes(k)&&v!==null)||m.humanReview!=='not_reviewed'))c.addIssue({code:'custom',message:'Dry runs cannot contain measured outcomes.'});
 if(r.execution==='measured'&&(m.generation==='not_run'||m.durationMs===null||r.templateHash===null))c.addIssue({code:'custom',message:'Measured attempts require an outcome, duration and template hash.'});
 if(m.blockerCount!==null&&m.blockerCategories===null||m.blockerCount===null&&m.blockerCategories!==null)c.addIssue({code:'custom',message:'Blocker count and categories must be recorded together.'});
 if(m.blockerCount===0&&m.blockerCategories?.length||m.blockerCount!==null&&m.blockerCategories&&m.blockerCategories.length>m.blockerCount)c.addIssue({code:'custom',message:'Inconsistent blocker observations.'});
 if(m.generation!=='success'&&(m.vision||m.productFidelity||m.humanReview!=='not_reviewed'||m.blockerCount!==null))c.addIssue({code:'custom',message:'Output reviews require a successful generation.'});
 if(r.reproducibility&&(r.reproducibility.workflowId!==r.workflow.id||r.reproducibility.workflowVersion!==r.workflow.version||r.reproducibility.templateHash!==r.templateHash||r.reproducibility.seed!==r.seed))c.addIssue({code:'custom',message:'Submitted graph provenance does not match this benchmark attempt.'});
});
export type BenchmarkResult=z.infer<typeof benchmarkResultSchema>;
