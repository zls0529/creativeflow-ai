# Brand Guideline Intelligence — implementation and verification

## Architecture reused

The feature uses the existing LLMProvider / OpenAI Responses adapter, Zod validation, upload records and local storage, campaign lock, Brand Agent, Creative Director, Prompt Engineer, Prompt Refinement Agent, VisionProvider, CriticEvaluation history and campaign review UI. ComfyUI graphs, image models, reference conditioning and the numeric Vision scoring algorithm are unchanged. No database migration is needed.

BrandProfile's existing JSON data holds `_intelligence` alongside the original profile fields. An analysis-only record does not masquerade as a generated BrandProfile. `_constraintsRevision` tracks which approved rules produced the strategy. Each new generation snapshots the applicable approved constraints in its existing `_generation` JSON. Compliance evaluations retain the actual rules assessed, so later edits cannot rewrite historical evidence.

## Constraint model and provenance

Brand Intelligence contains a draft, an approved constraints revision and conflicts. Approved constraints contain revision, approval time, summary, sources, rules and explicit overridden rule IDs. Each rule retains an ID, category, text, original extraction, source ID, origin (`source` or `inferred`), binding flag, visual-review eligibility, quote/observation evidence, optional PDF page, uncertainty and user-edit flag.

Categories cover personality, tone, primary/secondary/prohibited colours, typography, logo, photography, lighting, composition, product, audience, messaging, must-follow, avoid and visual style. Source records retain a safe filename, role, MIME, content hash, analysis provider, timestamp and summary. The UI links to the existing upload endpoint and displays the page/evidence; no internal storage paths are needed.

Source PDF rules default to binding. Observable image properties default to context only, because one reference image does not establish a universal brand mandate. Users can explicitly enforce a source observation after review. Inferred suggestions remain nonbinding, even if a client tries to promote one in an approval request. User edits preserve the original evidence and are labelled as edits.

## Material analysis

- PDFs: Mozilla PDF.js extracts server-side text per page, following its [Node text-extraction API](https://github.com/mozilla/pdf.js/blob/master/examples/node/getinfo.mjs). Limits are the existing 5 MB upload size, 60 pages, 80,000 extracted characters and a cooperative 20-second extraction budget checked between pages. JavaScript evaluation is disabled. Scanned/empty PDFs, encrypted/corrupted files and invalid provenance produce explicit errors. This is text analysis, not page-layout interpretation or OCR.
- PDF rules marked source-derived must cite a contiguous substring on the stated page. Whitespace and enclosing quotation marks are normalized; unsupported citations reject the analysis rather than becoming facts.
- Logos, style/reference and product images: Sharp decodes and bounds pixels on the server, then the existing LLM adapter attaches the image to a structured Responses request. Instructions differentiate logo properties, style observations and product appearance. They prohibit invented exact fonts or legal restrictions. No arbitrary external image URLs are fetched.
- Clear visual categories are eligible for assessment of a future generated image, regardless of whether the source was a PDF. Internal audience, tone and messaging rules are not visual violations. Exact typography or clear-space judgments may remain unassessable.
- Analysis succeeds atomically for selected sources. A failure preserves the prior draft and approved rules. Users can deselect an unreadable source and retry without deleting its upload or altering image-reference conditioning.

## Review and conflicts

Open **Brand Intelligence** from a campaign. Select materials, analyse them, inspect source/inferred sections, edit or remove draft rules, adjust binding/visual eligibility, and click **Approve & save rules**. Existing approved rules remain active until a replacement is approved. Campaign creation with brand materials opens this panel before automatic generation.

**Check brief conflicts** records a quoted requested instruction, rule ID, explanation, stage and status. The workflow also checks brief, generated strategy and final prompts. Unresolved conflicts stop before an image request. Users can enforce the guideline or override the rule for this campaign. Overrides are explicit and excluded from future active constraints. Enforcing a brief rule does not waive contradictory generated output: output conflicts still stop the workflow. Strategy is refreshed when the approved revision changes; earlier image versions are retained.

The Brand Agent and Creative Director receive compact approved constraints, with binding source rules authoritative and inferred advice optional. Prompt Engineer translates relevant rules into positive fields and negative constraints instead of copying source documents. The refinement agent receives the matching rule and finding and is instructed to make targeted corrections while preserving unrelated successes.

## Vision and version review

The real Vision request includes active constraints. Its strict output object requires an entry for every rule ID, preventing silent omissions or duplicate rule IDs. Each finding contains `satisfied`, `possible_violation` or `not_assessable`, confidence, severity, observed evidence and a recommendation. Nonvisual rules and nonbinding suggestions cannot become brand blockers. There is no invented aggregate brand-compliance score.

High-confidence possible violations with medium/high severity trigger refinement even if the ordinary numeric score meets its threshold. Existing refinement limits still apply. Review and A/B comparison expose a compact expandable Brand Compliance section; missing or entirely unassessable reviews are labelled explicitly. The ordinary quality score remains calculated by the existing scorer.

**Review selected image with Vision** checks an already stored image against the current approved rules without generating another image. Previous evaluations are retained. Mock analysis is clearly labelled and does not invent extracted rules; mock Vision cannot certify brand compliance. Campaigns without constraints keep their original workflow.

## Manual verification

Test campaign: **NORTHLINE LAB — brand intelligence verification**, ID `cmu5owonz0000v1vcpwejprbw`.

After explicit user authorization to send the named image and test materials to OpenAI:

1. Created a one-page synthetic guideline with white/navy/silver, prohibited neon green/orange, calm minimal style, soft studio lighting and product prominence.
2. Extracted and stored five source-grounded rules with page-one citations.
3. Detected the deliberately conflicting brief instruction, “Use bright neon green city lighting,” and recorded guideline enforcement.
4. Real Creative Director produced white/navy/silver and controlled studio light; Prompt Engineer included those instructions and excluded neon green/orange in negative constraints. Output conflict checks passed.
5. Verified source evidence, rule approval controls, conflict resolution and the Review panel in the browser, including a 390px visual check of the stacked Brand Intelligence panel. Corrected the five test rules' visual eligibility through the UI; their original text/evidence and conflict resolution remained intact.
6. Reused **Midnight Pulse hero V8** in the separate test campaign. The generation reason explicitly says this image was not generated from the NORTHLINE prompt/rules. No ComfyUI job or new image was created, and the original Midnight Pulse campaign was not modified.
7. The final real Vision review assessed all five rules: four high-confidence possible violations (palette, calm/minimal style, lighting, product prominence), one satisfied rule (no visible neon green/orange). The ordinary quality score was 29/100; this is not a brand-compliance percentage and does not show improvement. The earlier review remains in Saved review history.

The live trial caught an incompatible positive-integer JSON Schema keyword, overly permissive per-rule output coverage and incorrect visual-eligibility defaults. Those were fixed and covered offline before the final review. A separate online diagnostic was rejected by automatic approval and never executed; the schema issue was diagnosed locally. Several failed/incomplete attempts preceded the completed trial; this was not a single successful API call.

Artifacts: `storage/northline-brand-guidelines.pdf`, `storage/brand-intelligence-verification.json`, `storage/brand-tests.txt`. The existing SQLite database and local upload store contain the independent verification campaign and its PDF. The verification script requires explicit `--live`; automated tests disable the network.

## Limitations

- PDF text extraction does not inspect embedded swatches, diagrams or scanned pages. Its time budget is cooperative, not a separate sandbox worker that can pre-empt a stalled parser.
- Semantic extraction and conflict checks remain probabilistic. Exact quote validation establishes textual provenance, not that a model interpreted it correctly. User review is required.
- Compliance is a visual assessment, not legal certification, exact font recognition, precise colour measurement or product-identity proof. A model may misclassify a concern: this trial's ordinary integrity output included a colour-related concern under anatomy. Its wording is retained transparently rather than presented as ground truth.
- Real logo/style/product analysis paths are covered with offline pixel-input tests; this live trial covered PDF analysis and existing-image compliance, not a separate live trial for every source type.
- The live trial did not generate a new compliant image or prove that refinement improves one. Brand-triggered refinement decisions/context propagation are covered offline.
- Limits: 8 uploaded sources, 40 extracted rules per source, 100 rules total. Source selection is for brand analysis only. No source deletion UI, OCR, multi-user version locking, authentication or cloud deployment was added.

## Exact source/configuration files changed

1. `types/brand-intelligence.ts`
2. `types/campaign.ts`
3. `types/refinement.ts`
4. `types/vision.ts`
5. `lib/brand/materials.ts`
6. `lib/brand/store.ts`
7. `lib/brand/conflicts.ts`
8. `lib/brand/compliance.ts`
9. `lib/brand/service.ts`
10. `lib/database/campaigns.ts`
11. `lib/agents/creative.ts`
12. `lib/agents/orchestrator.ts`
13. `lib/agents/refinement-decision.ts`
14. `lib/providers/index.ts`
15. `lib/providers/llm/base.ts`
16. `lib/providers/llm/openai.ts`
17. `lib/providers/vision/base.ts`
18. `lib/providers/vision/openai.ts`
19. `app/api/campaigns/[id]/brand/route.ts`
20. `components/campaign/brand-intelligence.tsx`
21. `components/campaign/brand-compliance.tsx`
22. `components/campaign/create-campaign.tsx`
23. `components/campaign/workspace.tsx`
24. `components/campaign/critic-review.tsx`
25. `components/campaign/version-comparison.tsx`
26. `app/globals.css`
27. `next.config.ts`
28. `package.json`
29. `package-lock.json`
30. `tests/brand-intelligence.test.ts`
31. `tests/fixtures/brand-pdf.ts`
32. `tests/vision.test.ts`
33. `scripts/verify-brand-intelligence.ts`
34. `README.md`
35. `docs/brand-intelligence.md`

## Final validation

`npm run lint`, `npm run typecheck`, `npm test` (108 passing tests) and `npm run build` all passed. Build emits the existing Node experimental JSON-module warning. No live network or ComfyUI is required by the automated suite.
