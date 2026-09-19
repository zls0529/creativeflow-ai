'use client';
import {UsagePanel} from './usage-panel';
import {useEffect,useState} from 'react';
import {jsonFetch,postJson} from '@/lib/client';
import {activeJobStates,type JobView} from '@/types/jobs';
import type {CampaignView} from '@/types/campaign';
export function JobStatus({campaignId,refreshToken,onJobs,onCampaign}:{campaignId:string;refreshToken:number;onJobs:(jobs:JobView[])=>void;onCampaign:(campaign:CampaignView)=>void}){
 const [jobs,setJobs]=useState<JobView[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false),[refresh,setRefresh]=useState(0);
 useEffect(()=>{
  let active=true,timer:ReturnType<typeof setTimeout>;setJobs([]);onJobs([]);
  const check=async()=>{let delay=10000;try{
   const result=await jsonFetch<JobView[]>('/api/jobs?campaignId='+encodeURIComponent(campaignId));if(!active)return;setJobs(result);onJobs(result);setError('');
   if(result.some(j=>activeJobStates.includes(j.status)))delay=1500;
   const campaign=await jsonFetch<CampaignView>('/api/campaigns/'+campaignId);if(active)onCampaign(campaign);
  }catch{if(active)setError('Could not refresh job status. Your job remains saved; retry refreshing.');}finally{if(active)timer=setTimeout(check,delay);}};
  void check();return()=>{active=false;clearTimeout(timer);};
 },[campaignId,refreshToken,refresh,onJobs,onCampaign]);
 async function action(job:JobView,operation:'cancel'|'retry'){
  if(busy)return;setBusy(true);setError('');try{await jsonFetch('/api/jobs/'+job.id+'/'+operation,postJson({attempt:job.attempt}));setRefresh(n=>n+1);}catch(e){setError(e instanceof Error?e.message:'Job action failed.');}finally{setBusy(false);}
 }
 const latest=jobs[0];
 const row=(job:JobView)=> <article key={job.id} className="job-row"><header><strong>{job.action.replaceAll('_',' ')}</strong><span className="tag">{job.status.replaceAll('_',' ')}</span></header><p><b>{job.stage}</b> · Attempt {job.attempt}{job.retryCount?` · ${job.retryCount} retries`:''}</p><p>{job.failure||job.message}</p>{job.routing?.length?<details><summary>Frozen workflow routing</summary>{job.routing.map(r=><p key={r.placement}>{r.placement} · {r.creativeMode} · Recommended {r.recommended.id} → Selected {r.selected.id} ({r.selected.version}, {r.maturity}). {r.reason}</p>)}</details>:<small>Creative Mode: Not recorded</small>}<small>{job.startedAt?'Started '+new Date(job.startedAt).toLocaleString():'Queued '+new Date(job.createdAt).toLocaleString()}{job.completedAt?' · Finished '+new Date(job.completedAt).toLocaleTimeString():''}</small>{job.status==='queued'&&job.stage==='Queued'&&<p className="muted">Waiting for the local worker. Start with npm run dev:all, or npm run worker alongside the app.</p>}{job.status==='cancel_requested'&&<p>Cancellation is pending. A submitted provider request may still finish; later stages will stop.</p>}<div className="job-actions">{['queued','running'].includes(job.status)&&<button disabled={busy} onClick={()=>action(job,'cancel')}>Cancel job</button>}{job.id===latest?.id&&['failed','cancelled'].includes(job.status)&&<button disabled={busy||jobs.some(j=>activeJobStates.includes(j.status))} onClick={()=>action(job,'retry')}>Retry job</button>}</div><UsagePanel jobId={job.id} title="Job usage" refreshToken={job.status+job.attempt+job.events.length}/><details><summary>Execution attempts & activity</summary>{job.attempts.map(a=><div key={a.number}><p>Attempt {a.number} · {a.status}{a.failure?' · '+a.failure:''}</p><UsagePanel jobId={job.id} attempt={a.number} title="Attempt usage"/></div>)}<ol>{job.events.map(e=><li key={e.id}><small>{new Date(e.createdAt).toLocaleTimeString()} · attempt {e.attempt}</small> <b>{e.stage}</b> — {e.message}</li>)}</ol></details></article>;
 return <section className="job-status" aria-label="Generation jobs"><header><h3>Generation jobs</h3><button disabled={busy} onClick={()=>setRefresh(n=>n+1)}>Refresh jobs</button></header>{error&&<p role="alert">{error}</p>}{latest?row(latest):<p className="muted">No execution jobs yet. Creative output versions remain in asset history.</p>}{jobs.length>1&&<details><summary>Earlier jobs ({jobs.length-1})</summary>{jobs.slice(1).map(row)}</details>}</section>;
}
