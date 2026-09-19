import {setTimeout as delay} from 'node:timers/promises';
import {workOnce} from '../lib/jobs/executor';
import {db} from '../lib/database/client';
let stopping=false;
for(const signal of ['SIGINT','SIGTERM'] as const)process.on(signal,()=>{stopping=true;console.log('Worker stopping after its current operation. In-flight calls may still finish.');});
async function main(){console.log('CreativeFlow local worker ready. Database queue; concurrency 1.');while(!stopping){try{if(!await workOnce())await delay(1000);}catch{console.error('Worker could not access its queue. Retrying; no raw provider error was logged.');await delay(2000);}}}
main().catch(()=>{console.error('Worker stopped unexpectedly. Stale jobs will become retryable after lease expiry.');process.exitCode=1;}).finally(()=>db.$disconnect());
