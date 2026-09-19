# Commercial Poster — Klein v1

Status: **experimental**, explicitly selected, integration smoke test completed. Not commercially validated or an auto default. No benchmark/release promotion.

## Origin and preserved baseline

The selected public workflow is [Comfy-Org Klein 4B Distilled image editing](https://github.com/Comfy-Org/workflow_templates/blob/main/templates/image_flux2_klein_image_edit_4b_distilled.json). Klein was chosen after Liblib candidates could not supply a reproducible public dependency chain. Historical acquisition findings are preserved in [acquisition history](commercial-poster-acquisition-history.md); see [replacement audit](commercial-poster-replacement-audit.md) and [local baseline validation](klein-workflow-validation.md).

The original, validated UI/API graphs, artifact hashes, source metadata and installed model manifest in `external/klein-validation/` remain unchanged. The adapted template is `comfyui/workflows/commercial_poster_v1.json`. It retains the baseline graph and sampling settings; SaveImage node 201 is renamed 9 for the existing transport, creative text/reference/seed/prefix are substituted, and scheduler/latent dimensions are explicitly bound to the supported output profile rather than derived from the reference aspect ratio. The reference itself still uses nearest-exact 0.5 MP scaling with 16-pixel alignment. Source upload validation preserves aspect ratio rather than applying the SD1.5 CLIP square pad.

Registry: `commercial_poster_v1@1.0.0`, FLUX.2 Klein 4B Distilled, experimental. Historical `0.1.0-proposed` remains a non-executable placeholder for frozen benchmark compatibility.

Canonical adapted template SHA-256: `e4d93bcdd993bd8e31a3d02f7e608b2950236b54d34cd08bb3f9ea8fefdd8900`.

## Dependencies and endpoint

- Official ComfyUI v0.36.0, isolated local endpoint `http://127.0.0.1:8190`.
- `models/diffusion_models/flux-2-klein-4b-fp8.safetensors`
- `models/text_encoders/qwen_3_4b.safetensors`
- `models/vae/flux2-vae.safetensors`
- Required core nodes: CFGGuider, CLIPLoader, CLIPTextEncode, ConditioningZeroOut, EmptyFlux2LatentImage, Flux2Scheduler, GetImageSize, ImageScaleToTotalPixels, KSamplerSelect, LoadImage, RandomNoise, ReferenceLatent, SamplerCustomAdvanced, SaveImage, UNETLoader, VAEDecode, VAEEncode, VAELoader.
- No additional downloads, custom nodes, LoRA, ControlNet or IP-Adapter were installed for this integration. Model sources, exact hashes and install paths remain in the baseline documentation/manifest.

Set `IMAGE_PROVIDER=comfyui` and `COMFYUI_KLEIN_URL=http://127.0.0.1:8190`. Retain existing `COMFYUI_URL`, `COMFYUI_CHECKPOINT_NAME` and legacy settings: the shared ComfyUI provider still validates its existing base configuration. `COMFYUI_TIMEOUT_MS` also applies. Start the isolated Klein server and restart the CreativeFlow server/worker after environment changes. LLM/Vision credentials are not accessed by the poster job.

## Parameters and prompt mapping

Input: stored campaign product `sourceId`, integer seed (default 20260919), width 880, height 592. Only Hero is supported. Creative prompt and safe UUID output prefix are generated server-side. Steps 4, CFG 1, Euler, Flux2Scheduler, batch 1 are fixed.

The adapter reuses saved Brand Profile, Creative Direction mood and Prompt Engineer scene/lighting/palette/style/composition, plus active approved rules. It excludes runner/body framing and motion-camera instructions for this product-only composition. It asks for one prominent complete product, reference viewpoint, campaign copy space and realistic contact shadows. Avoidance is written into the positive text: CFG 1/ConditioningZeroOut does not provide an ordinary separately controlled negative prompt. No agent reruns or paid semantic checks occur. Unapproved draft rules or unresolved conflicts block readiness; inclusion of approved rules does not prove output compliance.

One explicitly selected product upload is used by native VAE/ReferenceLatent conditioning. Other upload roles are explicitly outside this workflow's contract. No arbitrary reference-strength knob, multiple products, style/pose references, people treatment or new resolution profiles. The source image is not overwritten. This is generative editing, not pixel-preserving Product Hero compositing.

## Provider, jobs, readiness and history

Explicit `commercialPoster` job input selects the new branch in the existing ComfyUI provider. Existing auto/basic/quality/sports/sports_pose/Product Hero/repair routing is unchanged. UI: select Hero → **Commercial Poster — Klein v1 · Experimental**, select the product, inspect readiness, continue.

Readiness checks campaign ownership, stored/decodable upload, baseline dimensions, pinned template, separate endpoint, required nodes and all three model filenames in the live node catalog. Missing dependencies fail before queue submission. No paid authentication/generation call is made during readiness.

Jobs use the existing durable queue, leases, cancellation, usage scope and storage. Stages: queued → preflight → preparing references → commercial poster generation → saving output → awaiting optional Vision review → completed. No invented progress percentages. Cancellation in flight saves the returned image before stopping; retry reuses that job's completed output. New actions create new versions without replacing older ones.

Reproducibility stores workflow/version/template+definition hashes, seed, 4 steps, CFG/sampler/scheduler, dimensions, source ID and SHA-256, native reference mode (strength null because no independent weight exists), dependency snapshot, actual creative prompt/adapter version and duration. The existing panel displays it. Filenames/catalog presence do not prove installed file hashes; the separate baseline manifest provides installation-time hashes.

## One live CreativeFlow integration — 2026-09-19

- Campaign: `Midnight Pulse — workflow comparison`; Hero **V12**.
- Generation ID: `cmu8d0t4r0007v14kwz8txopm`; job: `684c7f06-7f64-4d10-a9f2-02e583bc8e50`.
- Output: `/api/generated/3aa75aea-cb4e-4861-b283-0b946de40fe7.png`; file: `storage/generated/3aa75aea-cb4e-4861-b283-0b946de40fe7.png`.
- Source: stored product hash matched local `shoes.jpg` exactly.
- Submitted via the actual jobs API handler (HTTP Request/Response contract), executed with the existing `workOnce` worker. This is a server integration test, not a browser-click automation test.
- One local generation, no seed search; seed 20260919, 880×592, 4 steps, batch 1.
- Completed, no OOM/fatal error; all previous versions unchanged.
- ComfyUI execution: **8.78 s** (server log). Provider usage duration: **9.837 s**. Overall job: **10.457 s**.
- GPU memory sampled every 500 ms: observed maximum **11,448 MiB / 11.18 GiB**, global across processes. Not a guaranteed peak or standalone model requirement. Prior isolated baseline observation: 10.04 s and 10,981 MiB sampled global memory. Neither establishes feasibility for larger sizes or concurrent GPU jobs.
- Exactly one successful `comfyui_generation` usage row linked to job/asset/generation, mode commercial_poster_v1 and 880×592. Local monetary cost **null**, as no rate is configured; paid API calls **zero**.
- Vision has **not** been performed. Explicit approval was requested after generation; no score is invented.
- Evidence: `external/klein-validation/creativeflow-integration-result.json` and server log. This integration record is separate from benchmark/release evidence.

### Direct visual inspection (not Vision scoring)

One complete prominent shoe appears against wet midnight streets with cyan/warm lighting, a contact shadow and left/upper space. The scene follows the campaign's palette and atmosphere. However the shoe faces the opposite direction from the source. The side cage layout, mesh pattern, collar/tongue details and cream material colour have changed; these are product-identity limitations. The busy reflected ground reduces clean copy space. No claim of exact identity preservation, superior fidelity or commercial reliability is supported by this single result.

## Validation and limitations

`npm run lint`, `npm run typecheck`, `npm test` (215/215), `npm run build` passed during integration; the final prompt adapter passed the same complete checks. The updated dev server and worker were restarted; the local home page returned HTTP 200. Offline tests cover registry/template/parameters, native reference injection, prompt mapping, readiness and missing dependencies, job persistence, usage, native sampler metadata, in-flight cancellation/retry and unchanged legacy selection. External vendored ComfyUI/Python packages are excluded from app ESLint/TypeScript traversal. Build must run after DB-using tests/servers release Prisma's Windows DLL.

Only one product/image and one local hardware configuration tested. No multi-seed benchmark, other placements, commercial reliability validation, paid Vision, automatic refinement or quality tuning. GPU concurrency is not validated. Reference-guided editing can alter identity; human product review is required. Baseline remains experimental.

## Exact implementation/configuration/documentation files changed

- `.env.example`
- `.env (only COMFYUI_KLEIN_URL added; secrets unchanged)`
- `comfyui/registry.json`
- `comfyui/workflows/commercial_poster_v1.json`
- `types/commercial-poster.ts`
- `types/workflow.ts`
- `types/refinement.ts`
- `types/jobs.ts`
- `lib/commercial-poster/pipeline.ts`
- `lib/commercial-poster/readiness.ts`
- `lib/commercial-poster/execute.ts`
- `lib/providers/image/base.ts`
- `lib/providers/image/comfyui.ts`
- `lib/providers/image/references.ts`
- `lib/providers/index.ts`
- `lib/product-hero/transport.ts`
- `lib/workflows/registry.ts`
- `lib/workflows/reproducibility.ts`
- `lib/jobs/store.ts`
- `lib/jobs/executor.ts`
- `lib/readiness.ts`
- `app/api/readiness/route.ts`
- `components/campaign/commercial-poster-panel.tsx`
- `components/campaign/provider-readiness.tsx`
- `components/campaign/workspace.tsx`
- `components/campaign/reproducibility.tsx`
- `tests/commercial-poster.test.ts`
- `tests/registry-benchmark.test.ts`
- `package.json`
- `eslint.config.mjs`
- `tsconfig.json`
- `docs/commercial-poster-v1.md`
- `docs/commercial-poster-acquisition-history.md`

Additional verification artifacts created: `external/klein-validation/inspect-integration.ts`, `verify-integration.ts`, `creativeflow-integration-started.json`, `creativeflow-integration-result.json`, `integration-tests.log`, `integration-build.log`, `creativeflow-dev.log`, `creativeflow-dev-errors.log`. The ComfyUI server log was appended by its run; local database, generated image and ComfyUI input/output files were created through existing boundaries. Generated build files (`.next`, `tsconfig.tsbuildinfo`, Prisma client) are build artifacts, not source changes. Original/baseline graphs and dependency manifests were not modified.


## Development Stability Benchmark — 2026-09-19

**Recommendation A: continue as the primary experimental commercial-poster candidate.** Targeted product-identity/orientation work is justified next; none was performed. Commercial scene quality is consistently promising in this small set, while exact SKU fidelity is consistently inadequate. Registry status remains experimental; auto routing unchanged.

### Frozen setup

`commercial_poster_v1@1.0.0`; canonical template SHA-256 `e4d93bcdd993bd8e31a3d02f7e608b2950236b54d34cd08bb3f9ea8fefdd8900`. Same Klein FP8 diffusion model, Qwen encoder, VAE, native single-reference handling, creative prompt/context, 880×592, Euler, CFG 1, 4 steps, batch 1. Prompt SHA-256 `f8d57aa395a0716ad95635e9e07851900ceac4ab5cb552d53bea274b761300ec`. Reference SHA-256 `31f663e07ce50cd5aa78239b893dbd2ae1af842d51516871986f4de1e67c3ad6`.

V12 seed 20260919 reused unchanged. Only **two** additional images were generated: seeds 20260920 and 20260921 (V13/V14). No extra seeds, retries of image generation, refinement, new models or tuning. Source campaign/asset are unchanged from the integration record.

[Side-by-side report](../storage/benchmarks/klein-stability-20260919/comparison.html) includes original reference, all three images, per-image observations and historical V9/V11. Raw fixture, freeze manifest, GPU samples, generation/version IDs, reports and summary are in `storage/benchmarks/klein-stability-20260919/`.

### Measured results

| Seed | Version | Provider runtime | Sampled global VRAM max | Overall | Composition | Product visibility | Visual quality | Prompt adherence | Campaign relevance |
|---|---|---|---|---|---|---|---|---|---|
| 20260919 | V12 | 9.837 s | 11,448 MiB | 69 | 90 | 81 | 93 | 83 | 91 |
| 20260920 | V13 | 4.052 s | 11,417 MiB | 69 | 93 | 89 | 94 | 85 | 92 |
| 20260921 | V14 | 3.894 s | 11,417 MiB | 69 | 92 | 91 | 95 | 88 | 90 |

- Generation success **3/3 (100%)**, OOM **0/3**, missing nodes/provider generation errors **0/3**. Mean provider wall time **5.928 s**. New-image duration total **7.946 s**; three-image total **17.783 s**.
- V12 had a colder model state; V13/V14 reused resident models. Runtime differences are not evidence about seed complexity. Memory is global across processes, sampled at 500 ms; true peak may occur between samples. Not a standalone model minimum/maximum or larger-resolution guarantee.
- Vision mean/min/max **69/69/69**. Component means before deductions/cap: **88/90/90**. Each has medium product drift, 16 points in category penalties and a 69 cap; equal final scores do not mean equal quality.
- Blocker rate **3/3**, product-fidelity issue rate **3/3**. Every fidelity level is **medium**.
- Composition-only subset passes **3/3** using the existing reviewer “good” band: composition and visibility ≥75, without composition/prominence blockers. This descriptive subset is not full campaign acceptance. Full configured acceptance (≥80 with no blockers): **0/3**.

### Per-image blockers and visual observations

- **V12:** sole/midsole contour and cage geometry become softer; mesh/stripe detail changes. Assistant sees reversal of reference-facing direction and cyan material shift. Commercial focus and lighting are strong; reflections make some copy space busy.
- **V13:** cage thickness, vent placement, mesh and toe/midfoot patterns differ; assistant sees source-direction reversal and tongue/collar changes. Scene and product prominence remain strong. Vision incorrectly described the viewpoint as matching; preserve that disagreement rather than trusting its wording blindly.
- **V14:** cage, stripe and mesh details are simplified/reinterpreted; assistant sees shorter/bulkier proportions and smaller product scale. Source-facing direction is retained. Night scene and cyan/warm lighting remain coherent.

Each evaluation stores **three medium blocker rows across two categories**, `product_geometry_drift` and `product`. These rows overlap the same underlying identity drift through explicit, fidelity and integrity findings; they are not three independent root causes. Existing scoring rules were preserved.

Across all three, one complete prominent shoe, coherent wet-night background, believable contact/reflections, and no obvious unwanted text or duplicate complete products were observed. All show product redesign. Neither source logo/text preservation nor commercial reliability is established. Assistant observations are marked separately; human review remains `not_reviewed`.

### Controlled real Vision and cost

Exactly **three successful reviews**, one per image, using configured `gpt-4.1` (all returned `gpt-4.1-2025-04-14`), the same review instructions and `component-mean-with-defect-penalties-v2`. Each receives its output plus original shoes reference and the frozen campaign context. Structured Zod fidelity findings supplement the existing eight dimensions. No image generation or automatic refinement follows scores.

The initial V12 call failed authentication (401): an inherited process key differed from `.env`. No score was returned. The user explicitly authorized a single retry using the project `.env`, then the two remaining reviews. Total HTTP attempts: **4**, successful evaluations: **3**; no duplicate successful review. The failed ledger remains preserved, with unknown tokens/cost.

Successful-call estimated API costs: V12 **$0.017964**, V13 **$0.017660**, V14 **$0.018028**, total **US$0.053652**. Input **11,706** tokens, output **3,780**, cached input 0. Rates are $2/M input and $8/M output for standard GPT-4.1, verified against [official model pricing](https://developers.openai.com/api/docs/models/gpt-4.1). This is recorded token-based estimation, not an invoice; failed-auth cost is null, not a fabricated charge or confirmed zero. Local GPU monetary cost stays null because no rate is configured.

### Prior saved evidence

V9 (sports_pose/reference) is dominated by a person and clothing artifacts; its shoe does not preserve this SKU. V11 Product Hero retains the source product identity much better but appears suspended with weak scale/grounding. Klein's three images give a practically stronger product-scene presentation in this saved sample. This is an **unpaired visual comparison** with different prompts/workflows; historical scores 26/27 are not evidence of a controlled score gain. Klein does **not** improve on Product Hero's exact product preservation.

### Evidence and changes in this task

The existing `benchmarkFixtureSchema`, `benchmarkResultSchema`, `saveBenchmarkResult` and usage/evaluation storage were reused. Three immutable unreviewed result records and three later reviewed records exist under `storage/benchmarks/`; the reviewed records explicitly supersede the former for quality summaries, not additional attempts. `summary.json` lists the three current result files. Old integration/benchmark evidence was not overwritten.

Code/docs changed only:

- `lib/workflows/benchmark.ts`: fix recording/preflight bug that incorrectly added SD1.5 IP-Adapter dependencies for native Klein product references.
- `tests/registry-benchmark.test.ts`: regression coverage for that fix.
- `scripts/benchmark-commercial-poster.ts`: frozen, guarded two-new-seed benchmark runner.
- `scripts/review-commercial-benchmark.ts`: explicit, guarded reference-aware review runner; reads project `.env` deliberately and preserves the approved authentication retry ledger.
- `docs/commercial-poster-v1.md`: this section.

Created evidence includes `fixture.json`, `baseline.json`, two seed-start ledgers, two seed results, `generation-set.json`, `visual-observations.json`, `comparison.html`, `review-instructions.txt`, review-start/retry ledgers, `vision-failure.json`, three review files, `review-set.json`, `summary.json`, test/build logs, and the six UUID benchmark records. Existing boundaries created V13/V14 images, job/version/usage rows and three critic evaluations. Build outputs are generated artifacts. No generation/provider/template/registry/model/environment source was modified by this benchmark.

Validation: `npm run lint`, `npm run typecheck`, `npm test` (**216/216**) and `npm run build` all passed. Three seeds are insufficient for commercial validation or statistical claims. Human adjudication and more independent product references remain necessary before any release promotion.
