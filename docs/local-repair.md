# Targeted local repair

## Architecture

Reuses `ImageGenerationProvider`, ComfyUI template substitution, local storage, durable jobs, campaign locks, generation JSON metadata, Vision evaluation, version comparison, brand checks and usage events. The optional provider `repair()` method is separate from `generate()`; unsupported providers fail explicitly. Existing generation modes and database schema are unchanged.

Manual repair: stored source PNG → confirmed rectangle → separately stored feathered mask → VAEEncode → SetLatentNoiseMask → KSampler → VAEDecode → ImageCompositeMasked → server-side masked composite → new immutable version. The final composite copies decoded original pixels outside the mask exactly. It never falls back to full regeneration.

Templates: `comfyui/workflows/inpaint_repair_api.json` and `comfyui/workflows/face_repair_api.json`. Source must be a stored PNG, at most 32 MB / 16 million pixels, with dimensions divisible by eight. Manual regions are normalized coordinates, at least 8×8 pixels, at most 60% of the image. Empty detector masks, changed output dimensions and unchanged target pixels fail explicitly.

## Installed dependencies

Local inspection found VAEEncodeForInpaint, InpaintModelConditioning, SetLatentNoiseMask, mask conversion/composite/grow/feather nodes, FaceDetailer, DetailerForEach, BboxDetectorSEGS, SAMLoader, crop and mask upscalers. Detector options: face_yolov8m, hand_yolov8s and person_yolov8m-seg; SAM options include sam_vit_b_01ec64 and ESAM. Full inspected node names are in `comfyui/repair-node-inspection.json`. Presence does not establish reliable localization or all model dependencies for unused nodes.

Uses the existing configured SD1.5 checkpoint (locally majicMIX realistic v7); no specialized inpainting checkpoint, model or custom node was installed. Manual repair uses core nodes. Automatic face repair additionally uses UltralyticsDetectorProvider, `bbox/face_yolov8m.pt` and FaceDetailer. SAM is not required by either implemented path.

Optional manual product-reference repair reuses the existing IPAdapterAdvanced extension, `ip-adapter-plus_sd15.safetensors` and ViT-H CLIP Vision encoder. It is opt-in, records reference hashes/strength, and fails if the reference or required dependency is missing. Style conditioning was not redesigned.

## Configuration and use

Keep `IMAGE_PROVIDER=comfyui`, `COMFYUI_URL`, and `COMFYUI_CHECKPOINT_NAME` configured. Defaults in `.env.example`:

```dotenv
COMFYUI_REPAIR_DENOISE=0.4
COMFYUI_REPAIR_STEPS=24
COMFYUI_REPAIR_CFG=5.5
COMFYUI_REPAIR_SAMPLER=dpmpp_2m
COMFYUI_REPAIR_SCHEDULER=karras
```

These are conservative starting settings, not universal quality guarantees. Existing ComfyUI timeout and face-detector configuration apply. `.env` was not changed.

Start web and worker with `npm run dev:all`. Select an asset and source version → **Repair region** → target → manual rectangle or automatic face → focused instruction/reason → confirm selection → **Check repair readiness** → continue to queue. Readiness itself is read-only and makes no paid calls. A real execution with OpenAI Vision configured sends the repaired image and existing campaign review context for one paid review.

All eight targets are supported manually: face, hand, foot, ankle, shoe, product, text_artifact, generic_region. Automatic selection is face-only and repairs **all detected faces**; use manual selection for one face. It records “Detail pass applied: face repair.” Hand, shoe, ankle and product automatic localization is not claimed. Vision findings suggest a target/instruction, never fabricated coordinates. Multiple/global problems recommend full regeneration; repairs are never automatically scheduled.

Product instructions focus on edges/geometry; shoe/foot instructions request complete shoes, intact soles and plausible ankle connections. Artifact removal is limited to the confirmed mask; intended text/logos require explicit selection. Product identity, readable typography and exact reconstruction are not guaranteed.

## Persistence, review and failure behavior

`RepairRequest` stores sourceGenerationId, targetType, selection, region, repairPrompt, negativeConstraints, sourceCriticFindingId, repairReason, workflowMode, userConfirmed and useProductReference. `_generation.repair` adds sourceVersion, maskId, maskMethod, settings/seed, changedPixels and outsideMaskUnchanged. Masks use opaque IDs and a private PNG route; filesystem paths/configuration/credentials are server-side.

Each successful repair creates a new version and leaves all old image/prompt/evaluation records intact. History and comparison expose source, target, mask, instruction/reason, settings, before/after review and blocker categories. “Before/After” labels are used only when the compared version really is the repair source. Score comparisons require matching real provider/model/scoring policy. A score gain with another worsened dimension or added blocker is mixed; category resolution is not proof that a particular physical defect disappeared.

Real Vision runs once after the repaired image is persisted. Mock Vision is skipped as quality evidence. No repair is automatically approved or automatically refined. Cancellation follows existing semantics: an in-flight local result may finish and be saved, then subsequent review stops. Retry reuses a saved repaired image and retries only missing review. ComfyUI timeouts may leave work queued on the server; inspect that queue before retrying. Usage records the repair and review separately, never recharges the original generation; duration is provider wall-clock time, not measured GPU kernel time. Existing approved source-brand rules may require an additional tracked LLM conflict check.

## Validation and live status

- `npm run lint`: passed.
- `npm run typecheck`: passed.
- `npm test`: 169/169 passed, including 16 repair tests; providers/network are mocked, no paid calls or live ComfyUI required.
- `npm run build`: passed.
- Read-only local dependency preflight passed for the proposed Midnight Pulse V7 shoe region.
- Browser checks cover selecting an older source, form confirmation/region validation and readiness. No generation was submitted.

**Live repair deferred at the user's explicit request.** No new ComfyUI image, OpenAI request, repair score, blocker change or quality improvement is claimed. Proposed source is Midnight Pulse hero V7, score 69; the saved finding concerns rear-shoe blur/product clarity. `docs/repair-proposal.json` records the prepared region and preflight. `scripts/verify-repair.ts` is read-only by default; `--live` is a future explicitly authorized one-repair/one-review run, with original-record and outside-mask pixel checks. Run it with the standalone worker stopped to avoid competing claims.

## Files changed

Added:

- types/repair.ts
- lib/repair/guidance.ts
- lib/repair/masks.ts
- lib/repair/input.ts
- lib/repair/readiness.ts
- lib/repair/execute.ts
- lib/providers/image/repair.ts
- comfyui/workflows/inpaint_repair_api.json
- comfyui/workflows/face_repair_api.json
- comfyui/repair-node-inspection.json
- components/campaign/repair-panel.tsx
- components/campaign/repair-details.tsx
- app/api/repair-masks/[id]/route.ts
- tests/repair.test.ts
- scripts/verify-repair.ts
- docs/repair-proposal.json
- docs/local-repair.md

Modified:

- lib/storage.ts
- types/refinement.ts
- types/jobs.ts
- lib/providers/image/base.ts
- lib/providers/image/comfyui.ts
- lib/jobs/control-providers.ts
- lib/jobs/store.ts
- lib/jobs/executor.ts
- lib/readiness.ts
- app/api/readiness/route.ts
- components/campaign/provider-readiness.tsx
- components/campaign/workspace.tsx
- components/campaign/refinement-timeline.tsx
- components/campaign/generation-review.tsx
- components/campaign/version-comparison.tsx
- app/globals.css
- .env.example
- package.json

No database migration. Generated build/typecheck caches are not part of the implementation file list.
