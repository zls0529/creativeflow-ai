'use client';
import {GenerationMetadata,StoredPrompt} from './generation-review';
import {reviewText} from '@/lib/review-comparison';

import { useState } from 'react';
import { CriticReview } from './critic-review';
import { Sparkles, Copy, CheckCheck, ArrowUpRight } from 'lucide-react';
import type { CampaignView, GenerationView } from '@/types/campaign';
export function Inspector({ campaign, generation, threshold }: { campaign: CampaignView; generation?: GenerationView; threshold: number }) {
  const [tab, setTab] = useState('Direction'), [copied, setCopied] = useState(false);
  const direction = campaign.direction;
  return <aside className="inspector"><div className="inspector-tabs" role="tablist" aria-label="Asset details">{['Direction', 'Prompt', 'Review'].map(t => <button role="tab" aria-selected={tab === t} key={t} onClick={() => setTab(t)} className={tab === t ? 'active' : ''}>{t}</button>)}</div>
    <div className="inspector-body" role="tabpanel">
      {tab === 'Direction' && (direction ? <>
        <div className="eyebrow"><Sparkles size={14}/> CREATIVE DIRECTION</div><h2 className="concept-title">{direction.concept.length>80?campaign.name:direction.concept}</h2>{direction.concept.length>80&&<p>{direction.concept}</p>}<p>{direction.campaign_idea}</p>
        <div className="inspector-section"><h3>Visual direction</h3><p>{direction.visual_direction}</p></div>
        <div className="inspector-section"><h3>Colour palette</h3><div className="palette">{direction.colour_palette.map((c, i) => <div key={`${c}-${i}`}><span style={{ background: /^#[\da-f]{6}$/i.test(c) ? c : '#777' }}/><small>{c}</small></div>)}</div></div>
        <div className="inspector-section"><h3>Lighting</h3><p>{direction.lighting}</p></div>
        <div className="inspector-section"><h3>Composition</h3><p>{direction.composition}</p></div>
        <div className="inspector-section"><h3>Mood & style</h3><div className="tags">{direction.mood.split(' · ').map(m => <span key={m}>{m}</span>)}</div><p>{direction.photography_style}</p></div>
        {campaign.brandProfile && <details className="brand-details"><summary>Brand Agent output <ArrowUpRight size={14}/></summary><dl>{Object.entries(campaign.brandProfile).map(([key, value]) => <div key={key}><dt>{key.replaceAll('_', ' ')}</dt><dd>{Array.isArray(value) ? value.join(', ') : value}</dd></div>)}</dl></details>}
      </> : <div className="panel-empty">Your creative direction will appear after Brand Analysis.</div>)}
      {tab === 'Prompt' && (generation ? <><div className="section-label"><span className="eyebrow">PRODUCTION PROMPT · V{generation.version}</span><button className="icon-button" aria-label="Copy prompt" onClick={async()=>{try{await navigator.clipboard.writeText(reviewText(JSON.stringify(generation.prompt,null,2)));setCopied(true);}catch{setCopied(false);}}}>{copied?<CheckCheck size={16}/>:<Copy size={16}/>}</button></div><GenerationMetadata generation={generation} campaign={campaign}/><StoredPrompt generation={generation}/><div className="revision-note"><div><h3>Why this version?</h3><p>{reviewText(generation.reason)}</p></div></div></>:<p className="muted">Generate an asset to inspect its prompt.</p>)} 
      {tab === 'Review' && (generation?.evaluation ? <CriticReview key={generation.id} evaluation={generation.evaluation} threshold={threshold}/> : <p className="muted">The critic will review this asset after generation.</p>)}

    </div><div className="inspector-footer"><span className="green-dot"/> Saved to your local workspace</div>
  </aside>;
}
