import {loadFixtures,dryRunBenchmark,saveBenchmarkResult,loadBenchmarkResult,compareResults,samplePlan} from '../lib/workflows/benchmark';
import {workflowIdSchema,workflowVersionSchema} from '../types/workflow';
async function main(){
 const args=process.argv.slice(2);
 if(args.includes('--live'))throw new Error('Live execution is not implemented. No generation or paid review can run through this command.');
 if(args[0]==='compare'){
  if(args.length!==3)throw new Error('Usage: workflow:benchmark -- compare <comma-separated left result IDs> <comma-separated right result IDs>');
  const left=await Promise.all(args[1].split(',').map(id=>loadBenchmarkResult(id))),right=await Promise.all(args[2].split(',').map(id=>loadBenchmarkResult(id)));
  console.log(JSON.stringify(compareResults(left,right),null,2));return;
 }
 const allowed=['--dependencies','--save','--mode','--fixture','--seed','--workflow','--plan'];
 const options:Record<string,string|boolean>={};
 for(let i=0;i<args.length;i++){const key=args[i];if(!allowed.includes(key)||key in options)throw new Error('Unknown or duplicate benchmark option.');if(['--mode','--fixture','--seed','--workflow'].includes(key)){if(!args[i+1]||args[i+1].startsWith('--'))throw new Error('Missing option value.');options[key]=args[++i];}else options[key]=true;}
 const mode=options['--mode']??'development';if(mode!=='development'&&mode!=='release')throw new Error('Mode must be development or release.');
 if(options['--plan']){console.log(JSON.stringify({samplePlan,executed:false},null,2));return;}
 const fixtures=await loadFixtures(),selected=options['--fixture']?fixtures.filter(f=>f.id===options['--fixture']):fixtures;
 if(!selected.length)throw new Error('Unknown fixture.');
 for(const original of selected){
  const fixture=structuredClone(original);
  if(typeof options['--workflow']==='string'){const parts=options['--workflow'].split('@');if(parts.length!==2)throw new Error('Use workflow ID@version.');fixture.expectedWorkflow={id:workflowIdSchema.parse(parts[0]),version:workflowVersionSchema.parse(parts[1])};}
  const result=await dryRunBenchmark(fixture,{mode,seed:options['--seed']===undefined?undefined:Number(options['--seed']),inspectDependencies:!!options['--dependencies']});
  const file=options['--save']?await saveBenchmarkResult(result):undefined;
  console.log(JSON.stringify({...result,...(file?{saved:file.replaceAll('\\','/')}: {})},null,2));
  if(!result.validation.valid)process.exitCode=1;
 }
}
main().catch(error=>{console.error(error instanceof Error&&!(error.name==='ZodError')?error.message:'Invalid benchmark configuration.');process.exitCode=1;});
