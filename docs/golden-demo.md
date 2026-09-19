# Golden demo — After Hours — Studio Runner

Verified locally on 20 September 2026. Fictional Northline Studio portfolio concept; not an official product advertisement.

## Result

One new campaign completed Brand → Creative Direction → placement prompt → routed local Klein generation → stored V1 → one real reference-aware Vision review. Campaign creation/reference upload used local API calls; Generate, readiness confirmation and review/history inspection used the workspace UI. The saved asset is **awaiting a human decision**, not human-approved. The approval control is available; no approval was fabricated.

| Evidence | Value |
| --- | --- |
| Campaign | `cmu8hht8j0000v1pslq4f2co1` |
| Mode / route | Commercial Poster / `commercial_poster_v1` |
| Workflow version / maturity | `1.0.0` / experimental (unchanged) |
| Asset / version | Hero / V1 |
| Generation | `cmu8hmk1r000zv1lww85nkrmz` |
| Output | 880 × 592 PNG, [unaltered copy](screenshots/commercial-poster.png) |
| Reference | Existing local shoes.jpg, stored as studio-runner-reference.jpg |
| Reference SHA256 | `31f663e07ce50cd5aa78239b893dbd2ae1af842d51516871986f4de1e67c3ad6` |
| Model | flux-2-klein-4b-fp8.safetensors |
| Seed / steps / CFG | 20260919 / 4 / 1 |
| Sampler / scheduler | euler / Flux2Scheduler |
| Template SHA256 | `e4d93bcdd993bd8e31a3d02f7e608b2950236b54d34cd08bb3f9ea8fefdd8900` |
| Definition SHA256 | `7d7ab262bfdab2316dbde6a10613436b4404500e5c21c9fe9a2a01e70320fed3` |
| Image generation duration | 10.912 seconds |
| Agent + image job | Approximately 23 seconds |
| Vision model / duration | gpt-4.1-2025-04-14 / 9.457 seconds |

The actual saved route matches the requested route. No fallback, extra image, automatic refinement, repair, workflow tuning or model installation occurred.

## Quality, without hiding blockers

The poster has a single prominent cream/dark sneaker, graphite plinth, midnight-blue setting, warm side/rim light and useful left-hand copy space. No unwanted generated text, people or extra shoes were visible. It is useful for demonstrating the production/review system.

**It is not exact SKU fidelity.** Compared visually with the original reference, the shoe points left instead of right; mesh/support-cage treatment and sole proportions differ. Vision flagged the translucent exoskeleton becoming an opaque dark band and altered structural geometry. The review retains three overlapping blocking observations; these have not been removed to improve the apparent result. No visible logo supports a claim of logo preservation.

Vision gave **69/100**, with medium product fidelity. Component scores were brand 84, composition 92, hierarchy 94, visibility 89, colour 84, relevance 90, visual quality 95 and prompt adherence 88. Mean 90, penalty 16, blocking cap 69: the overall score is not an arithmetic average. The view reversal is our visual finding, not a claim that Vision identified it.

**Decision:** acceptable as an honest concept/pipeline demo; unsuitable for an exact-product commercial release without correction and human review. Workflow maturity remains experimental. A single image does not validate production quality.

## Calls and cost

| Operation | Calls | Estimated USD |
| --- | ---: | ---: |
| Brand, gpt-4.1-mini | 1 | 0.0004156 |
| Creative Director, gpt-4.1-mini | 1 | 0.0009736 |
| Prompt Engineer, gpt-4.1-mini | 1 | 0.0009984 |
| ComfyUI, local | 1 | Not configured |
| Reference-aware Vision | 1 | 0.0190800 |
| **API estimate** | **4 paid calls** | **0.0214676** |

Usage records contain 6,661 input and 2,212 output tokens (8,873 total; no cached tokens). These are app pricing estimates, not an invoice. Local GPU/electricity costs are not measured. No additional paid calls were made for documentation or screenshots.

The standalone review now compares the generated image with its hash-verified original product reference. It reuses the existing Vision adapter, schema, persistence and usage boundaries. Repeating the one-review action returns the saved evaluation; a previous recorded attempt blocks an unplanned retry.

## History and presentation

All pre-existing rows were compared with the pre-demo SQLite backup: six campaigns, 62 generations, 61 evaluations and their related historical records were unchanged. The live campaign intentionally has only V1. The two-version screenshot is from the separately seeded **mock Quiet Energy** campaign; it is not evidence of live refinement.

See [screenshots](screenshots/README.md), [storyboard](demo-script.md) and [release checklist](github-release-checklist.md). Raw local databases, references and diagnostic reports are excluded from the publication candidate. Verify rights to the reference/product design and curated media before public publication.
