'use client';
import {useEffect,useState} from 'react';
import {creativeModes,routeCreative} from '@/lib/workflows/creative-modes';
import {jsonFetch} from '@/lib/client';
export function WorkflowCatalog(){
 const [rows,setRows]=useState<{id:string;maturity:string;hardware:string;reason:string;note:string}[]>([]),[error,setError]=useState('');
 useEffect(()=>{void jsonFetch<{workflows:typeof rows}>('/api/workflows/catalog').then(r=>setRows(r.workflows)).catch(()=>setError('Hardware inspection unavailable.'));},[]);
 return <section><h3>Creative Mode / workflow catalog</h3><p>Read-only dependency inspection. Experimental does not mean production-certified.</p>{error&&<p>{error}</p>}{creativeModes.map(m=>{const route=routeCreative({selection:{mode:m.id},placement:'hero',references:[]}),w=rows.find(w=>w.id===route.selected.id);return <details key={m.id}><summary>{m.name} · {m.support}</summary><p>{m.id==='custom'?'Manual compatible registered selection':route.selected.id+(m.id==='sports'?' / legacy_sports_pose_v1 with pose':'')}</p><p>{m.evidence}</p><p>{w?w.hardware+(w.reason?': '+w.reason:''):m.id==='custom'?'Depends on selected workflow':'Checking dependencies…'}</p>{m.id==='sports'&&<p>With pose: {rows.find(r=>r.id==='legacy_sports_pose_v1')?.hardware??'Checking…'} · {rows.find(r=>r.id==='legacy_sports_pose_v1')?.reason}</p>}<small>{w?.note??'Full generation readiness checks input contracts and agent configuration.'}</small></details>;})}</section>;
}
