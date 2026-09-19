# Product Hero v1 — experimental

Latest evidence: [full live verification V11](product-hero-live-v11.md) completed the pipeline with high product fidelity but failed grounding/campaign quality (27/100). Status remains experimental; the earlier failure below is retained as history.

Update 2026-09-19: see [segmentation reliability](product-hero-segmentation.md) for the diagnosed first-run failure, prioritized extraction, manual fallback and successful segmentation-only verification. The first full-run failure below remains historical evidence; no second full run has been performed.

Version `product_hero_v1@1.0.0`. This is an explicit per-asset preservation workflow; existing basic/quality/sports/sports_pose/auto routing is unchanged. The proposed `0.1.0-proposed` registry record remains for historical fixture compatibility. See [registry](workflow-registry.md), [benchmarking](workflow-benchmarking.md) and [commercial research](commercial-workflow-research.md).

## Architecture and contract

Stored clean product → orientation/sRGB normalization → SAM box/point mask (or existing source alpha) → validate mask → generate empty background independently → deterministic scale/position → procedural shadows/reflection → alpha composite with inward edge feather → opaque-core pixel check → source/output Vision review → human review.

**Never feed the product photograph into the background sampler or IP-Adapter.** A separately selected style reference can condition only the background, using the existing style-transfer adapter. The product is not diffused, relit with a generative model, inpainted or generatively upscaled. The output is composed at final placement resolution. No automated refinement loop runs.

The preservation contract `preserve-transformed-opaque-core-v1` covers exact RGB equality in fully opaque pixels relative to the declared Lanczos3-resized, colour-normalized source crop. It preserves visible texture, structure, original marks and colour within that core. It does **not** establish original-resolution pixel equality, complete segmentation, transparent-material fidelity, readable logos or correct product identity by itself. All those require source-aware review.

### Input and placement

Required: one campaign-owned product upload (PNG/JPEG/WebP, minimum 256 pixels on each side, at most 10 MB/40 megapixels), existing asset, Brand Profile and Creative Direction. Best suited to one opaque, substantially visible product with simple background and padding. Cropped, transparent, very thin or occluded products are unsupported/likely to fail.

Input settings include product/source ID, optional style ID, `sam` or `source_alpha` extraction, normalized source bounding region, placement (`center`, `left`, `right`, `lower-center`, `custom`), normalized custom centre, width target, safe margins, copy space, seed, optional background direction, reflection and edge integration. No absolute local paths are accepted in requests or shown in metadata.

Scale preserves aspect ratio and is clamped to the available copy-space rectangle, safe margins and a maximum 72% canvas height. There is no perspective warp. Foreground artifacts receive four transparent pixels of extra padding; this artifact-only padding is excluded from placement dimensions. Original source and full-resolution mask are also retained for inspection.

### Segmentation and dependency inspection

The inspected local ComfyUI advertises `SAMLoader`, `SAMDetectorCombined`, `MaskToSEGS`, `ImageToMask` and `MaskToImage` from the existing Impact Pack/core nodes, with installed `sam_vit_b_01ec64.pth` (375,042,383 bytes). No new model or node was installed. The installed detector recommends `center-1`; the implementation supplies the product bounding region, a centre point and outside-negative hints, threshold 0.93, no dilation. SAM uses point/box prompts as documented by [Meta's SAM repository](https://github.com/facebookresearch/segment-anything); node integration is from [Impact Pack](https://github.com/ltdrdata/ComfyUI-Impact-Pack).

Template: `comfyui/workflows/product_hero_segmentation_api.json`. SAM outputs only a mask; the foreground RGB always comes from the original normalized upload, never a model-generated cutout RGB. Mask validation rejects wrong dimensions, near-empty/full masks, tiny regions and products clipped by the source boundary. It cannot detect every semantically missing component or multiple foreground objects.

The local alternatives were inspected: Inspyrenet nodes exist but their default checkpoint was absent and their implementation can download weights at execution; BiRefNet loader advertised no models. RMBG-1.4 weights exist, but its published model terms distinguish non-commercial access from commercial licensing ([model card](https://huggingface.co/briaai/RMBG-1.4)). It was not selected for this commercial workflow. IC-Light nodes and an SD1.5 model are installed, but generative relighting was intentionally not used because it would weaken the initial preservation contract. This is not a claim that IC-Light is unavailable.

On another machine, install the trusted [Impact Pack](https://github.com/ltdrdata/ComfyUI-Impact-Pack) using its documented dependencies, obtain the ViT-B checkpoint from the official [SAM checkpoint list](https://github.com/facebookresearch/segment-anything#model-checkpoints), place `sam_vit_b_01ec64.pth` under ComfyUI `models/sams`, and restart ComfyUI. This application does not auto-install or auto-download anything. An already transparent source can use `source_alpha` without SAM execution.

### Background and integration

Template: `comfyui/workflows/product_hero_background_api.json`. It uses the existing simple SD1.5 text-to-image structure, configured checkpoint, fixed 20 steps / CFG 7 / Euler / normal, and the request seed. Image sizes are the existing 1024×768 hero, 1024² post/product, 768×1344 story, 1536×512 banner profiles.

The positive background prompt combines background direction/environment, campaign mood/style/lighting, palette, relevant background constraints and explicit copy-space instructions. Foreground-product clauses are filtered rather than copied from an old runner/product prompt. Negative conditioning includes duplicate product, extra shoes/bottles, packaging, people, writing and watermarks. This reduces but cannot guarantee absence of hallucinated background products; the critic must still inspect duplicates.

Grounding uses two analytic soft/contact shadows under the product footprint. Optional reflection is a low-opacity vertically mirrored product on the background layer. It is suitable only for approximately flat glossy surfaces; depth/scene geometry is not estimated. Both precede product composition and cannot alter opaque product RGB.

One-pixel inward feathering softens the boundary without spreading product pixels into the background. Optional luminance matching adjusts only partially transparent edge RGB by at most ±5%; it does not globally blur or recolour the product. This is **not physical relighting or robust colour-spill removal**. Strong source/scene lighting mismatch should be fixed by choosing a better background. Optional local inpainting is not invoked in v1; existing repair remains a separate explicit operation and does not inherit a Product Hero preservation claim.

## Fidelity and Vision

The decoded final PNG is checked against the transformed source at every fully opaque mask pixel. Metadata records core count, changed count, mean absolute error and mask coverage. Any changed opaque core causes failure before the result is accepted. The success state is deliberately `core_preserved_identity_unreviewed`.

The existing real Vision adapter adds a second bounded image for Product Hero only: image 1 output, image 2 original product reference. Legacy reviews remain single-image. The schema adds high/medium/low/not_assessable fidelity, silhouette, structure, colour, logo/text, lighting and seam findings. Medium/high findings become persistent blockers, even when model component scores are attractive.

New blocker categories: `product_geometry_drift`, `product_missing_part`, `product_logo_loss`, `product_colour_drift`, `duplicated_product`, `weak_product_prominence`, `obvious_composite_seam`. Missing findings cause schema failure; missing reviews are not treated as identity success. Overall scores still use the existing defect caps/penalties. Human approval is always separate.

## Jobs, readiness, accounting and UI

Use the **Product Hero v1** action on an existing asset. The compact dialog selects a product, source region, placement/copy space, background direction and seed, then reuses the existing readiness UI. No product upload means the action cannot proceed. Preflight validates ownership/decoding, templates/hashes, segmentation model/nodes, background checkpoint and optional style dependencies, image compositor, real Vision configuration and unresolved brand state. It does no image inference or paid authentication test.

The existing durable job queue records Product extraction → Background generation → Compositing / shadow integration → Vision Review → Human Review Ready. Source versions are preserved. New outputs remain `needs_review`. Cancellation is checked between stages; in-flight local requests are not remotely interrupted. Completed composites are saved before the next cancellation boundary; an unfinished intermediate stage can be recomputed on an explicitly retried job. A Vision retry reuses the saved composite and does not generate another background.

Usage has separate non-overlapping local events for SAM extraction and background sampling, and one existing paid Vision event. Optional brand-conflict LLM checks retain existing tracking. Compositing/source-alpha CPU time and total image-pipeline time are recorded in generation metadata; queue/job timestamps include the review and orchestration. No repair runs, so repair duration is 0. Local GPU cost remains null unless `LOCAL_GPU_COST_PER_HOUR` is configured, never counted as OpenAI API spend.

The existing Reproducibility expander shows reference ID, workflow/version, background and segmentation hashes, seed/checkpoint/sampler, segmentation model, placement/crop/kernel, shadows, integration, no-inpaint/no-upscale flags, timings, deterministic core findings and Vision findings. Source, mask, foreground and background thumbnails link to stored artifacts. Historical generations remain unchanged and show Not recorded for unavailable fields.

## Configuration

```dotenv
IMAGE_PROVIDER=comfyui
COMFYUI_URL=http://127.0.0.1:8188
COMFYUI_CHECKPOINT_NAME=<installed SD1.5 checkpoint filename>
COMFYUI_PRODUCT_HERO_SAM_MODEL=sam_vit_b_01ec64.pth
VISION_PROVIDER=openai
VISION_MODEL=gpt-4.1
OPENAI_API_KEY=<server-side only>
```

`COMFYUI_WORKFLOW_MODE` remains the legacy workflow setting; Product Hero is explicitly selected per asset. Current environment values were not changed by implementation. Required style adapter/encoder filenames are the existing documented SD1.5 Plus / ViT-H defaults.

## Frozen smoke test and approval

`benchmarks/product-hero-v1.json` freezes B01 source checksum, source region, hero 1024×768, right placement, left copy space, seed 2026091701 and empty navy/cyan studio background. It targets the existing Midnight Pulse hero and its stored `shoes.jpg` upload; previous versions remain untouched. This is a B01-derived one-product development smoke case, not an exact replay of the AERON research brief or release evidence. The effective fixture is named `B01-PH1-smoke` and hashes the actual campaign context, transformed background prompt and Product Hero settings so it cannot be silently pooled with the original B01 experiment.

```powershell
# Read-only: source checksum, full settings/prompt and dependency readiness
npm run workflow:product-hero -- --prepare
# Only after explicit approval for this source/context upload and one live job:
npm run workflow:product-hero -- --run --approved-live
```

Live execution uses the already running local worker, permits only one fixed request key, refuses duplicate verification, and saves a report plus a measured benchmark record when an output exists. It does not run an old-reference comparison arm or automatic refinement. Failure and incomplete records remain in the durable job/history report; do not silently retry or discard them.

**Live verification (2026-09-19):** The user approved one run. Job `02896eeb-df93-471c-b2a6-a1e9e4539030` failed during product extraction after about 5.75 seconds of worker execution. ComfyUI completed SAM inference successfully (prompt `2d32f0ad-deea-4f8c-87fe-d0633ab56c99`), but its 6000×4000 mask retained only 163,106 pixels (0.6796% coverage), below the 1% minimum. Visual inspection shows scattered fragments and border noise rather than the shoe silhouette. The mask guard stopped the pipeline. This establishes an unusable segmentation result for this source/settings combination; the underlying model/input cause is not yet established. No background generation, composite or OpenAI Vision request was performed, and no automatic retry was made. The failed generation/history record is retained.

Report: `storage/product-hero-live-verification.json`; local ComfyUI history: `storage/product-hero-comfy-history.json`. No old IP-Adapter comparison was performed, no product-fidelity score exists and no improvement claim is made. The workflow remains experimental and end-to-end validation is outstanding. Registry `offline_only` describes the absence of successful live output benchmark evidence; this failed live attempt is not a successful benchmark.

Validation: lint, typecheck, all 198 automated tests and production build passed. Tests use mocked providers and synthetic bitmap fixtures, with no live generation or paid APIs. The build retains the existing non-fatal Node JSON-module warning. Historical audit: 6 campaigns, 57 generations, unchanged history digest and unchanged legacy workflow template bytes; no pending jobs before server restoration.

## Exact implementation file changes

New files:

- `types/product-hero.ts`
- `comfyui/workflows/product_hero_background_api.json`
- `comfyui/workflows/product_hero_segmentation_api.json`
- `lib/product-hero/composite.ts`
- `lib/product-hero/transport.ts`
- `lib/product-hero/pipeline.ts`
- `lib/product-hero/readiness.ts`
- `lib/product-hero/execute.ts`
- `components/campaign/product-hero-panel.tsx`
- `benchmarks/product-hero-v1.json`
- `scripts/verify-product-hero.ts`
- `tests/product-hero.test.ts`
- `docs/product-hero-v1.md`

Updated files:

- `.env.example`
- `package.json`
- `comfyui/registry.json`
- `benchmarks/fixtures.json`
- `types/jobs.ts`
- `types/refinement.ts`
- `types/vision.ts`
- `lib/providers/image/base.ts`
- `lib/providers/image/comfyui.ts`
- `lib/providers/vision/base.ts`
- `lib/providers/vision/image.ts`
- `lib/providers/vision/openai.ts`
- `lib/providers/vision/scoring.ts`
- `lib/workflows/registry.ts`
- `lib/workflows/reproducibility.ts`
- `lib/workflows/benchmark.ts`
- `lib/jobs/store.ts`
- `lib/jobs/executor.ts`
- `lib/readiness.ts`
- `app/api/readiness/route.ts`
- `components/campaign/provider-readiness.tsx`
- `components/campaign/workspace.tsx`
- `components/campaign/reproducibility.tsx`
- `tests/registry-benchmark.test.ts`
- `docs/workflow-registry.md`
- `docs/workflow-benchmarking.md`

Local ignored verification logs: `storage/product-hero-tests.log`, `storage/product-hero-full-tests.log`, `storage/product-hero-preflight.log`. The normal build/typecheck caches are regenerated. Existing workflow templates, `.env`, database schema, campaign images and model installations are unchanged.
