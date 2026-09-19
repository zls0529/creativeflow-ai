import {creativeModes,creativeWorkflowCatalog} from '@/lib/workflows/creative-modes';
import {getWorkflow} from '@/lib/workflows/registry';
import {checkDependencies,probeDependencies} from '@/lib/workflows/dependencies';
import {safeReadinessText} from '@/lib/readiness';
export const runtime='nodejs';
export async function GET(){
 const probes=await Promise.allSettled([probeDependencies(),probeDependencies({...process.env,COMFYUI_URL:process.env.COMFYUI_KLEIN_URL})]);
 return Response.json({modes:creativeModes,workflows:creativeWorkflowCatalog.map(w=>{const p=probes[w.id==='commercial_poster_v1'?1:0],result=p.status==='fulfilled'?checkDependencies(getWorkflow(w.id,w.version),process.env,p.value.catalog):null;return {id:w.id,version:w.version,name:w.displayName,maturity:w.releaseState,evidence:w.benchmarkStatus,hardware:result?.state==='advertised'?'Dependencies advertised':'Unavailable',reason:result?result.missing.map(m=>safeReadinessText(m,process.env)).join('; '):'ComfyUI dependency endpoint unavailable.',note:'Hardware dependency inspection only. Full readiness also validates templates, references, extraction and required agents.'};})},{headers:{'Cache-Control':'no-store'}});
}
