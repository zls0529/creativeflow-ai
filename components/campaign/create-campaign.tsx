'use client';
import {CreativeModeSelection} from './creative-mode-selection';
import {routeCreative} from '@/lib/workflows/creative-modes';
import type {CreativeSelection} from '@/types/creative-mode';
import { useState } from 'react';
import { ArrowRight, Upload, Sparkles, LoaderCircle } from 'lucide-react';
import { Dialog } from './dialog';
import { demoBrief } from '@/lib/demo';
import { jsonFetch, postJson } from '@/lib/client';
import { briefSchema } from '@/types/campaign';

export function CreateCampaign({ onClose, onCreated, mockMode=false }: { mockMode?:boolean; onClose: () => void; onCreated: (id: string) => Promise<void> }) {
  const [form, setForm] = useState({ name: '', brandName: '', objective: '', audience: '', brief: '', style: 'Cinematic editorial', colours: ['#172D3B', '#C4CCC9', '#D5B58B'] });
  const [creative,setCreative]=useState<CreativeSelection>({mode:mockMode?'social_fast':'commercial_poster'});
  const [files, setFiles] = useState<Record<string, File[]>>({});
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [draftId, setDraftId] = useState<string | null>(null);
  const field = (key: keyof typeof form, value: string) => setForm(f => ({ ...f, [key]: value }));
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError('');
    try {
      const parsed = briefSchema.parse({...form,creative});
      const route=routeCreative({selection:creative,placement:'hero',references:Object.entries(files).flatMap(([role,group])=>group.map((_,i)=>({id:role+i,role})))});if(route.blockers.length)throw new Error(route.blockers.join(' '));
      const selected = Object.values(files).flat();
      if (selected.length > 8 || selected.some(f => f.size > 5 * 1024 * 1024) || selected.reduce((n, f) => n + f.size, 0) > 20 * 1024 * 1024) throw new Error('Use up to 8 files, under 5 MB each and 20 MB in total.');
      const id = draftId ?? (await jsonFetch<{ id: string }>('/api/campaigns', postJson(parsed))).id;
      setDraftId(id);
      if (selected.length) {
        const data = new FormData(); Object.entries(files).forEach(([role, group]) => group.forEach(file => data.append(role, file)));
        await jsonFetch(`/api/campaigns/${id}/uploads`, { method: 'POST', body: data });
      }
      await onCreated(id);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not create campaign.'); }
    finally { setBusy(false); }
  }
  return <Dialog title="Start a new campaign" onClose={() => { if (!busy) onClose(); }} wide>
    <form onSubmit={submit} className="brief-form">
      {mockMode&&<p className="revision-note">Mock sandbox · no paid calls. Social Fast works without keys or ComfyUI. Commercial Poster and Product Hero need real providers.</p>}<CreativeModeSelection value={creative} onChange={setCreative} disabled={busy||!!draftId} references={Object.entries(files).flatMap(([role,group])=>group.map((_,i)=>({id:role+i,role})))}/><div className="form-intro"><p>Give your creative team a direction to build on.</p><button type="button" className="text-button" disabled={busy || !!draftId} onClick={() => setForm({ ...demoBrief, name: 'Quiet Energy — Summer' })}><Sparkles size={14}/> Use example brief</button></div>
      <fieldset disabled={busy || !!draftId}>
        <div className="form-grid"><label>Campaign name<input required minLength={2} maxLength={100} placeholder="e.g. Quiet Energy" value={form.name} onChange={e => field('name', e.target.value)}/></label><label>Brand name<input required minLength={2} maxLength={80} placeholder="e.g. Northline Coffee" value={form.brandName} onChange={e => field('brandName', e.target.value)}/></label></div>
        <label>Campaign objective<input required minLength={5} maxLength={1000} placeholder="What should this campaign achieve?" value={form.objective} onChange={e => field('objective', e.target.value)}/></label>
        <label>Target audience<input required minLength={3} maxLength={500} placeholder="Who are we creating for?" value={form.audience} onChange={e => field('audience', e.target.value)}/></label>
        <label>Creative brief<textarea required minLength={15} maxLength={5000} rows={4} placeholder="Describe your product, the feeling, and what matters most…" value={form.brief} onChange={e => field('brief', e.target.value)}/></label>
        <div className="form-grid"><label>Preferred style<input required maxLength={300} list="styles" value={form.style} onChange={e => field('style', e.target.value)}/><datalist id="styles"><option>Cinematic editorial</option><option>Minimal studio</option><option>Bold and playful</option><option>Natural lifestyle</option></datalist></label><label>Brand colours<span className="colour-inputs">{form.colours.map((colour, i) => <input key={i} aria-label={`Brand colour ${i + 1}`} type="color" value={colour} onChange={e => setForm(f => ({ ...f, colours: f.colours.map((c, j) => j === i ? e.target.value : c) }))}/>)}</span></label></div>
      </fieldset>
      <div className="upload-heading"><span>Brand references <small>{['commercial_poster','product_hero'].includes(creative.mode)?'Product image required':creative.mode==='sports'?'Pose recommended':'Optional'}</small></span><small>PNG, JPG, WebP · Guidelines also accept PDF</small></div>
      <div className="upload-grid">{['logo', 'product', 'style', 'guidelines', 'pose'].map(role => <label className="upload-box" key={role}><Upload size={18}/><span>{role === 'pose' ? 'Pose reference' : role === 'style' ? 'Style reference' : role === 'guidelines' ? 'Brand guidelines' : role === 'product' ? 'Product image' : 'Brand logo'}</span><small>{files[role]?.map(f => f.name).join(', ') || 'Choose file'}</small><input disabled={busy} aria-label={`Upload ${role}`} type="file" accept={role === 'guidelines' ? 'image/png,image/jpeg,image/webp,application/pdf' : 'image/png,image/jpeg,image/webp'}  onChange={e => setFiles(f => ({ ...f, [role]: Array.from(e.target.files || []) }))}/></label>)}</div>
      <p className="muted small">Product images guide product appearance; style references guide visual treatment; pose images guide body structure. Uploaded materials can be analysed and approved in Brand Intelligence before generation.</p>
      {error && <p role="alert" className="error-message">{error}{draftId && ' Your brief is saved. Adjust the files and retry, or close to keep the draft.'}</p>}
      <div className="dialog-footer"><span className="small muted">{(creative.override?.workflowId??(creative.mode==='commercial_poster'?'commercial_poster_v1':''))==='commercial_poster_v1'?'Hero placement · Full version history':'5 coordinated assets · Full version history'}</span><button className="primary" disabled={busy}>{busy ? <LoaderCircle className="spin" size={16}/> : <Sparkles size={16}/>} {busy ? 'Preparing campaign…' : 'Create campaign'}<ArrowRight size={16}/></button></div>
    </form>
  </Dialog>;
}
