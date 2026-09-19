# Golden Workflow registry and migration roadmap

Design date: 2026-09-19. **Nothing in this document is wired into production.** Existing modes, environment selection, agents, UI and saved versions remain unchanged. The authoritative technical rationale is [commercial-workflow-research.md](commercial-workflow-research.md); acceptance is defined in [workflow-benchmark-plan.md](workflow-benchmark-plan.md).

## 1. Architectural boundaries

Keep the current `ImageGenerationProvider` entry point, storage boundary, durable job ownership/cancellation, immutable generation versions, readiness and usage scopes. Do not introduce a second campaign orchestrator or an LLM workflow router.

Future additions should be small typed contracts:

- **Intent:** use case, placement, human/contact requirement, identity contract, copy-space layout, resource/tier preference and permitted providers.
- **Plan:** immutable workflow release + typed inputs + ordered stages + required capabilities + explicit cost/resource envelope + routing explanation.
- **Artifacts:** source/alpha/protected core, pose/edge/depth maps, background, product layer, contact shadow, intermediate composites, final image and masks, with storage IDs/hashes and ownership checks.
- **Execution record:** resolved graph/settings/provenance, stage state, output hashes, usage and independent reviews. This should extend existing generation context incrementally, not rewrite history.

Do not force non-diffusion tasks into giant ComfyUI graphs: deterministic resize/composite/type rendering can use the server image boundary; ComfyUI owns sampled stages. Keep one job with durable stage checkpoints, not nested independent campaigns. Reusing a saved artifact is valid only when source/config/stage hashes match. Failed Vision review must not regenerate a successful image.

Planned capability names might include `textToImage`, `maskedEdit`, `poseConditioning`, `referenceAppearance`, `protectedComposite`, `transparentLayer` and `exactOutsideMask`. A provider must advertise implemented semantics, not claim a feature solely because it accepts an image input. Current runtime has no OpenAI image adapter; proposed `IMAGE_PROVIDER=openai` is conceptual only.

## 2. Proposed registry

Registry releases are immutable data, independent of display labels or `.env` defaults. Separate use-case ID, release version, model profile and operational tier. Avoid a combinatorial set of copy-pasted JSON files: version a small number of tested stage compositions, with explicitly compatible extension slots. A fragment must specify input/output ports; stop relying on magical node IDs such as3/11 as a generic extension interface.

| Proposed workflow ID | Starting model/technique profile | Required inputs / reference types | Initial defaults to benchmark | Output sizes | Initial status |
|---|---|---|---|---|---|
| product_hero_v1 | Existing SD1.5 background + deterministic product compositor; one SDXL challenger later | Product image, reviewed alpha/core, layout; optional style only for background | Background28 steps/CFG6/dpmpp_2m/karras, denoise1; no product diffusion | Hero1024×768, post/product1024²; story/banner layout variants | proposed, benchmark not run |
| commercial_poster_v1 | Hero stages + layout/scene controls and exact typography layer | Product/core, copy-safe area; optional background edge/depth/style | Same background baseline; optional edge integration denoise0.2, isolated ablation | All five placement dimensions | proposed |
| ecommerce_product_v1 | Original product pixels + CPU compositing first | Product per actual view, reviewed matte, color profile | Sampler/CFG/steps **N/A** when no generated scene | Product/post1024² plus declared catalogue exports | proposed |
| lifestyle_v1 | One vetted human model profile + contact-aware product layers | Product, contact layout, optional pose/style; matching view for strict identity | Start from existing quality28+16/CFG6/refine0.25, then tune one variable; detail optional | Hero/post/story; banner only via different validated layout | proposed, contact risk high |
| sports_pose_v2 | Existing SD1.5 pose baseline first; independent compatible SDXL candidate later | Single complete pose; product reference + view contract; layout | Existing32+18/CFG5.5/refine0.22; pose0.8/0..0.85; face16/0.22 only when needed | Hero/post/story; banner composite profile separate | proposed, not a replacement yet |
| social_fast_v1 | Approved template reuse / one-pass scene model | Product/core if identity required; optional style | Existing basic20/CFG7/Euler/normal baseline. Distilled model gets its own schedule, not this preset | Post/story, optional hero | proposed |
| repair_v1 | Current masked SD1.5 or face-detail path | Stored source, confirmed mask or face detection; optional manual product ref | Existing24/CFG5.5/dpmpp_2m/karras/denoise0.4 | Source size under validated limits | implemented as legacy operation; not registry-released; live quality unverified |

Numbers are initial experimental configurations, not endorsed optimal presets. Face, edge, depth and reference models must match the chosen base family. A missing product source blocks strict Product Hero; absence is not a reason to quietly pick social_fast.

### Illustrative registry record (documentation only)

```json
{
  "id": "product_hero_v1",
  "version": "1.0.0-proposed",
  "useCase": "product_hero",
  "status": "proposed",
  "provider": "comfyui_with_local_compositor",
  "identityContracts": ["strict_pixels", "controlled_appearance"],
  "modelProfile": {"family": "sd15", "checkpoint": "existing-majicmix-profile", "sha256": null},
  "requiredNodes": ["CheckpointLoaderSimple", "CLIPTextEncode", "EmptyLatentImage", "KSampler", "VAEDecode", "SaveImage"],
  "requiredModelFiles": [{"role": "checkpoint", "approvedManifestId": null}],
  "stages": ["validate_cutout", "background", "composite", "contact_shadow", "protected_core_restore", "qa"],
  "optionalModules": ["reviewed_segmentation", "edge_integration"],
  "vramGiB": {"planningRange": [6, 10], "measuredPeak": null},
  "supportedInputs": ["brief", "layout", "product_png", "alpha_mask", "protected_core_mask"],
  "supportedReferences": {"product": "required original layer", "style": "background only", "pose": "unsupported"},
  "defaults": {"steps": 28, "cfg": 6, "sampler": "dpmpp_2m", "scheduler": "karras", "batch": 1},
  "outputSizes": [[1024,768], [1024,1024], [768,1344], [1536,512]],
  "limits": ["supplied product view only", "approved mask required", "no generative product recoloring"],
  "benchmark": {"protocol": "commercial-benchmark-v1", "status": "not_run", "reportHash": null},
  "templateSha256": null,
  "dependencyManifestSha256": null,
  "licenseReviewStatus": "pending"
}
```

Null hashes/measurements are intentional evidence gaps, not placeholders accepted at runtime. A future readiness gate must reject a production release with unresolved model hashes, required dependencies, unsupported size/contract or missing benchmark approval. An optional segmentation stage adds its own verified node/model manifest; it is not smuggled into this core example.

## 3. Workflow versioning and reproducibility

1. Freeze existing template bytes and assign legacy audit IDs without inventing historical provenance. Save current hashes from the audit. Old generations with unknown seed/checkpoint hash stay `unknown`.
2. New releases use files such as `sports_pose_v2_api.json`; a released file is never edited in place. Semantic version reflects behavior; content hash is authoritative. Maintain the old release for replay.
3. Store both raw template hash and a canonical fully-resolved graph hash; canonicalization rules themselves are versioned. Save every fragment hash, prompt transformation revision and final positive/negative strings.
4. Each generation records workflow ID/version/hash, exact checkpoint/VAE/encoder/adapter/ControlNet hashes, seeds **per stage**, sampler/scheduler/steps/CFG/denoise, control schedules, reference roles/strengths/preprocessed hashes, layout/mask/transform hashes, actual output dimensions, ComfyUI/custom-node commits, Python/PyTorch/CUDA/driver/dtype and device metadata where available.
5. Record provider/model snapshot, external request ID and actual returned settings for cloud runs; mark seed unsupported rather than fake a seed. Store no credentials or absolute model paths in public history.
6. Dependency manifests start as read-only version/provenance inventories, not a new package manager. Full locking/containerization is later; do not auto-update nodes when reproducing a benchmark.
7. Parameter changes create new run records; graph/model changes require a new registry release and rerun relevant benchmark strata. A benchmark hash ties approval to that exact bundle.
8. Replay promises exact settings/provenance, not guaranteed bitwise identity across GPU kernels/software. State observed determinism and retain intermediate images to diagnose divergence.

## 4. Deterministic routing design

Typed routing inputs should come from explicit request fields and existing saved strategy, without a new LLM call. Existing text-derived human/action flags can remain provisional hints until confirmed; do not let regex confidence override an explicit product-only requirement.

Priority order:

1. **Repair action + valid source/mask:** repair_v1; incompatible target/empty mask blocks.
2. **Explicit workflow release:** honor only if capabilities, identity contract and resources match; otherwise explain why blocked, do not reinterpret.
3. **Catalogue / exact supplied-view product:** ecommerce_product_v1; missing product/view/matte returns needs-input.
4. **Identity-critical product without human contact:** product_hero_v1; if cinematic/copy-heavy layout, commercial_poster_v1 built on its preservation stages.
5. **Human + dynamic action:** sports_pose_v2; pose required in Professional, missing pose requests input or offers an explicitly chosen non-pose concept. Product exactness additionally requires view-compatible source/contact plan.
6. **Other human-product interaction:** lifestyle_v1; unresolved contact geometry blocks strict identity, not downgraded automatically.
7. **Nonhuman poster/copy-heavy:** commercial_poster_v1, with product optional only when the brief explicitly permits a non-SKU concept.
8. **Speed-first eligible concept/template variation:** social_fast_v1; cannot override strict identity or difficult anatomy requirements.
9. **Unclassified/conflicting intent:** needs-selection with reasons, not arbitrary basic fallback.

After semantic routing, filter by model-family capabilities, available VRAM/RAM, reference rights and approved provider set. Choose only benchmarked compatible tier profiles. If none qualifies: explain missing input/dependency/resources; offer, but do not execute, a cloud route or a lower tier that still satisfies the contract. Snapshot the routing inputs/reason/resolved plan when queuing; do not change graphs midway if settings change.

Example decisions: product-only shoe story with P1→Hero layout; runner with pose but no matching product angle→Sports concept with exactness unresolved; no-reference mood board→Social Fast; strict new rear-angle catalogue from P1 only→needs more source views; image with one shoe defect→Repair, not a new complete campaign.

## 5. Quality tiers

| Tier | Meaning and bounded work | What it never implies |
|---|---|---|
| Fast | One approved scene pass or reusable product composite; no default detail/refine chain; conservative output size; preview QA and human review | Permission to ignore a reference, invent labels or drop required pose/product constraints |
| Standard | Validated base + one necessary control + optional single finishing/detail pass; preserve product layer; one normal QA review | Guaranteed first-pass acceptance or a mandatory face pass on every image |
| Professional | Reviewed masks/layout, explicit preservation contract, eligible control/contact strategy, protected finishing, reference-aware QA and human approval; at most one separately authorized localized correction in benchmark mode | “All nodes enabled,” guaranteed success, silent retries or automatic approval |

Tier budgets include planned GPU passes, expected/maximum runtime and paid QA calls. A successful provider call is distinct from a commercially accepted asset. If the Professional contract cannot be met with the supplied view, return needs-input instead of spending more steps. No UI tier feature is added now.

## 6. Implementation order and release gates

Complexity estimates are qualitative engineering scope, not promises of time or image quality. Every phase needs a separately authorized implementation task.

| Phase | Goal | Required models / nodes | Complexity and main risks | Exit criteria |
|---|---|---|---|---|
| 0 — Evidence and provenance first | Frozen fixtures, graph/setting provenance, compatible registry skeleton and reproducible first-pass baseline | Existing checkpoint/nodes only; benchmark runner later | Medium: legacy gaps, selected samples, costs; no new weights required | Hash/reference checks; actual seed/settings recorded; first-pass failures retained; dry-run budgets and offline fixtures pass |
| A — Product preservation + catalogue | Supplied-view hero/catalogue compositing with protected product core | Existing background checkpoint/core nodes; reviewed alpha first; optional SAM ViT-B only after licensing/edge validation | Medium: halos, shadow/camera mismatch, transparency | Exact transformed-core preservation; no generated SKU details; human mask QA; development then category release gates met |
| B — Commercial Poster | Layered scene/copy-space, brand type/logo compositor, optional contact/edge integration | PhaseA; optional family-compatible Canny/depth; no LLM inside image graph | Medium/high: crowded layout, incompatible controls, typography rights | Copy safe areas and export sizes pass; product unchanged; five-placement consistency; bound latency/VRAM |
| C — One model challenger and finishing | Compare one vetted SDXL baseline; separate controlled inpaint/upscale modules where useful | One provenanced XL checkpoint; matching VAE/control only if needed; optional dedicated inpaint model | Medium/high: incompatible adapters, memory, derivative terms | Paired baseline evidence, measured 4070 peak/time, no protected-core regression; retain existing model if challenger fails |
| D — Lifestyle | Human/contact-aware product integration, face/hand review | Winning compatible human profile, optional pose/depth; existing face detailer; matching-angle product sources | High: hand fusion, occlusion, identity vs relighting | Reference-aware contact rubric, diverse human cases, source-view gates; no broad identity claim from bench-only example |
| E — Sports v2 | Pose/layout then product/ankle strategy with bounded repair | Existing SD1.5 pose as control; optional validated DWPose and compatible model/control set; face/manual foot repair | High: complex articulation, small shoes, refinement pose drift | ≥100 attempts across varied sources/poses for release; anatomy/visibility/identity gates, measured12GB feasibility; no unbounded repairs |
| F — Registry promotion / retirement | Promote measured releases and explicit routing; enforce regression/performance/usage gates | No mandatory new model; optional image-provider adapter in a separate task | Medium: drift, stale hashes, rollout regressions | Reproducible readiness/queue/retry tests, complete benchmark reports, human approval and rollback by release ID |

Benchmarking is a gate throughout phases, **not postponed until the end**. Repair v1 verification can be a bounded lane after phase0 if the user later authorizes it; the previous request to defer live repair remains respected. Social Fast should reuse validated A/B modules before considering a distilled checkpoint.

## 7. Existing mode disposition

- **KEEP:** provider/storage/jobs/Vision/usage/readiness architecture and protected-composite repair contract. Keep mock mode for offline/demo flows with honest unsupported-reference behavior.
- **KEEP AS LEGACY:** basic and current quality as explicit reproducibility/draft options; all historical JSON, output, prompt and review data.
- **REBUILD:** sports and sports_pose into a versioned validated family; auto routing into typed contract/capability routing; product/reference identity path into preservation-first modules.
- **DEPRECATE prospectively:** promoting reference-only reconstruction as a faithful catalogue/SKU workflow; selecting low-denoise whole-frame refinement as a generic anatomy repair; treating a high aesthetic/Vision score as commercial approval. No existing file is deleted and no current mode is disabled in this research task.

Deprecation procedure: add a new immutable release → benchmark → human approval → explicit selection/pilot → expand routing only for eligible cases → mark old release legacy in documentation → preserve replay/rollback. Never rename an old generation to a newer workflow it did not run.

## 8. Optional cloud path timing

The image-provider abstraction is worth preserving for a later OpenAI image adapter, particularly unavailable-local or deadline-sensitive concepts. Build only after phase0 records provenance/cost and requires explicit allowed-provider selection. It does not solve a missing source view or a strict product identity contract by itself. See researched capabilities, remaining limitations and campaign-cost calculations in the [research document](commercial-workflow-research.md#8-optional-cloud-image-provider).

## 9. Deliverables and repository validation

Created in this task:

- `docs/commercial-workflow-research.md`
- `docs/workflow-matrix.md`
- `docs/workflow-roadmap.md`
- `docs/workflow-benchmark-plan.md`
- `docs/workflow-benchmark-fixtures.json`
- `docs/workflow-audit-snapshot.json`
- `scripts/audit-commercial-workflows.ts` (read-only audit; prints JSON)

Existing production sources, workflow templates, `.env`, package dependencies and database schema were not changed. No runtime registry or benchmark runner was implemented. Reference files and existing output versions were retained.

Validation completed:

- `npm run lint`: passed, zero warnings.
- `npm run typecheck`: passed.
- `npm test`: **169/169 passed**, mocked providers; no live image or paid call.
- `npm run build`: passed. Existing experimental JSON-module warnings remain informational.
- Read-only before/after digest comparison: all **57 generation image/prompt/evaluation records unchanged**, **6 campaigns**, zero active jobs. All seven production workflow template hashes and three benchmark-reference hashes unchanged.
- Benchmark manifest references and local documentation links checked. No generated benchmark result is claimed.

Web/worker were temporarily stopped for Prisma build safety and offline queue tests, then restored. No new workflow, model or generation is installed/queued by the research deliverables.
