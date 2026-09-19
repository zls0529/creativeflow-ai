import { Check, LoaderCircle, Circle, AlertCircle, ArrowRight, Workflow as WorkflowIcon } from 'lucide-react';
import { stages, type Run, type RunState } from '@/types/campaign';
export function Workflow({ runs, running, onInspect, saved }: { saved?:{image:boolean;vision:boolean}; runs: Run[]; running: boolean; onInspect: () => void }) {
  return <section className="workflow"><div className="section-label"><span><WorkflowIcon size={15}/> Agent workflow <span className="live-label">{running ? 'LIVE' : 'ACTIVITY'}</span></span><button className="text-button" onClick={onInspect}>View activity <ArrowRight size={13}/></button></div>
    <div className="workflow-nodes">{stages.map((stage, i) => {
      const last = runs.filter(r => r.stage === stage).at(-1);
      const stored=saved&&(stage==='Image Generation'?saved.image:stage==='Vision Review'||stage==='Completed'?saved.vision:false);
      const state = (stored?'completed':running && stage === 'Completed' ? 'pending' : last?.status || 'pending') as RunState;
      return <div key={stage} className={`workflow-node ${state}`} title={last?.message || (stored?'Verified from saved output/review':saved&&stage==='Refinement'?'Not requested for this poster':'Waiting to start')}><span className="node-icon">{state === 'completed' ? <Check size={14}/> : state === 'running' ? <LoaderCircle className="spin" size={14}/> : state === 'failed' ? <AlertCircle size={14}/> : <Circle size={12}/>}</span><span>{stage}</span>{i < stages.length - 1 && <span className="node-connector"/>}</div>;
    })}</div>
  </section>;
}
