# Workflow audit and commercial matrix

Research-only, 2026-09-19. Read with [research conclusions](commercial-workflow-research.md), [benchmark plan](workflow-benchmark-plan.md) and [migration design](workflow-roadmap.md). No runtime workflow was changed.

## 1. Current workflow inventory

All current generation modes select the same configured majicMIX realistic v7 SD1.5 checkpoint. `auto` is a deterministic selector, not another graph. Local repair is a separate provider operation, not a supported value of `COMFYUI_WORKFLOW_MODE`. No production template has a formal immutable version today; the [audit snapshot](workflow-audit-snapshot.json) records current raw-file SHA256s.

VRAM entries are **unmeasured planning bands in GiB**, with sequential loading/batch 1. They describe a plausible working envelope, not memory guarantees. Existing runs establish that some cases fit this machine, not all placements/seeds/configurations.

| Existing mode / template | Intended use and actual stages | Controls / references / detail | Default settings and finishing | Planning VRAM | Evidence, weaknesses and disposition |
|---|---|---|---|---|---|
| basic / `basic_text2img_api.json` (7 nodes) | Prompt → empty latent → sampler → VAE → PNG; quick product/concept image | No ControlNet/detailer; optional IP-Adapter extension | 20 steps, CFG7, Euler/normal, denoise1, at final placement size; no upscale pass | 4–8; high-aspect/full-resolution can cost more | Simple/fast baseline. Full reconstruction, duplicated subjects, weak geometry. **KEEP AS LEGACY**, usable for drafts/scene-only backgrounds, not strict SKU claims |
| quality / `human_quality_api.json` (11) | Lower-resolution base → decode → bicubic image resize → VAE encode → low-denoise sampler → decode | No ControlNet/detailer; optional reference extension affects both samplers | 28+16 steps, CFG6, dpmpp_2m/karras, second denoise0.25; same seed both stages | 6–10 | More readable subject in one comparison; same-seed different resolution is not identical noise. Low denoise retains bad structure. **KEEP AS LEGACY**; rebuild as explicit validated finishing modules |
| sports / `sports_api.json` (15 before optional face removal) | quality-style two passes with sports prompts/settings → pre-face PNG → face detector/detailer → final PNG | Optional FaceDetailer (on by default); no pose control; no shoe detector; reference extension optional | 32+18 steps, CFG5.5, dpmpp_2m/karras, refine0.22; face16 steps/0.22, guide512/max768 | 7–11 | Face pass changed pixels; larger subject, rear blur/bib artifacts persisted. No isolated face-quality proof. **REBUILD**, preserve old graph as legacy |
| sports_pose / `sports_pose_api.json` (19) | sports plus photo preparation/OpenPose and base-sampler ControlNet | Body only; face/hand detection off. SD1.5 pose strength0.8, start0/end0.85. Refinement not pose-conditioned; FaceDetailer remains | Sports settings; contain/pad pose to base size | 8–12+, possible offload | V7→V8 coarse pose improved, score69→69; copy-space tradeoff, no shoe-identity guarantee. **REBUILD** version2 with contact/product QA; legacy retained |
| manual repair / `inpaint_repair_api.json` (12) | Source+rectangle mask → VAEEncode → SetLatentNoiseMask → sampler → decode → masked composite → server composite | No ControlNet/detailer. Optional existing product IP-Adapter; no automatic style-reference branch | 24 steps, CFG5.5, dpmpp_2m/karras, denoise0.4; source size, max60% mask, inward feather≤8px; random seed recorded | 5–10 depending source; full-frame latent even for small mask | Offline exact outside-mask preservation and queue tests; **no live quality test**. **KEEP**, then benchmark; crop/context enhancement later |
| automatic face repair / `face_repair_api.json` (9) | Source → Ultralytics face detector → FaceDetailer → image + exported mask → server composite | All detected faces; missing/empty/excessive mask fails; product reference not supported on this path | Repair settings, guide512/max768, feather8, one cycle | 5–9 plus source buffers | Explicit bounded local contract, manual selection for one face. No new live face repair trial. **KEEP**, benchmark before claiming quality |
| reference-conditioned variants / `reference_conditioning_api.json` (6-node fragment, unused role pruned) | CLIPVision + IPAdapterModelLoader + role image/attention branches patch base sampler(s) | SD1.5 Plus + ViT-H; style then product, default0.4/0.8; linear product, style-transfer style; start0/end1. No regional attention mask. FaceDetailer unpatched | Both base/refinement affected where present; 768² padded reference prep | Additional ~1–3 above parent, not a measured additive law; may exceed12 | Product trial26/46/44, geometry drift/style leakage. **KEEP AS LEGACY** for resemblance/style; **DEPRECATE its use as an identity guarantee**, rebuild identity route |
| auto / `selectWorkflow`, `resolveWorkflow` | Product-only→basic; dynamic human→sports; human→quality; otherwisebasic; sports+valid pose→sports_pose | Adds references independently; requested missing dependencies fail | Uses selected mode defaults | Selected graph | Prevents prior product-as-runner mistake; English regexes/indirect context remain coarse. **REBUILD routing**, keep current behavior until tested migration |

“DEPRECATE” here is a design decision, not a code removal. Do not delete a historical graph or migrate old version metadata. The discarded latent-upscale experiment retained in hero V2 is historical evidence, not the current quality template. No checkpoint migration is applied.

### Resolution audit

| Placement | Basic output/sampling | quality/sports/sports_pose base → final |
|---|---|---|
| Hero | 1024×768 | 768×576 → 1024×768 |
| Instagram post | 1024×1024 | 640×640 → 1024×1024 |
| Instagram story | 768×1344 | 512×896 → 768×1344 |
| Website banner | 1536×512 | 1152×384 → 1536×512 |
| Product | 1024×1024 | 640×640 → 1024×1024 |

Generation uses the provider's placement dimensions. Large output dimensions do not prove sufficient subject detail or good anatomy at the original latent size. Current “upscale” is bicubic resize plus diffusion refinement, not ESRGAN/UltraSharp or tiled super-resolution. Repair uses source dimensions and performs no upscale.

### Dependency audit

| Group | Advertised locally / currently used | Gaps or cautions |
|---|---|---|
| Core | CheckpointLoaderSimple, CLIPTextEncode, samplers, VAE, image resize/save; VAEEncodeForInpaint and InpaintModelConditioning also present | Current repair uses ordinary VAEEncode + noise mask, not a dedicated inpaint checkpoint |
| Pose | OpenposePreprocessor, DWPreprocessor; `control_v11p_sd15_openpose_fp16.safetensors` installed | Current uses OpenPose, not DWPose; full detector weights/runtime provenance must be pinned later |
| Detail | FaceDetailer, DetailerForEach, Ultralytics face/hand/person choices; SAMLoader and SAM ViT-B/ESAM choices | Only face route integrated automatically; no dedicated shoe detector. Advertised SAM option is not a quality/weight-loading test |
| Reference | IPAdapterAdvanced, SD1.5 adapter variants, ViT-H encoder | No SDXL IP-Adapter model advertised; current code expressly requires SD1.5 Plus |
| Other controls | Canny, depth/lineart preprocessor; canny/depth control-LoRA files and FLUX control file advertised | Model naming alone cannot assign base-family compatibility; do not load them into SD1.5 by assumption |
| Finishing | DifferentialDiffusion, ImageUpscaleWithModel; ESRGAN and UltraSharp filenames | Not used by current generation; verify provenance/license and benefit before integration |
| Candidate checkpoints | majicMIX, XL-base-named checkpoint, DreamShaper XL v2.1 Turbo, two sd3_medium files | No file-content verification in this audit; none selected as a new production default |

Commercial release also requires resolving upstream pose/annotator and detector licenses; see the [dependency release gate](commercial-workflow-research.md#commercial-dependency-release-gate). This audit establishes technical advertisements, not license clearance.

## 2. Commercial taxonomy and recommended matrix

**Definitions:** “preserved” means a reviewed original layer under a declared transform; “approximate” means reconstructed and liable to drift. Human fidelity is a risk classification, not a numeric grade. Speed is relative expected pass/load count, not measured seconds. Complexity: low = one simple stage, medium = several explicit layers, high = coupled human/product controls and QA. All future rows are **unbenchmarked recommendations**.

| Use case / proposed ID | Recommended architecture | Product fidelity contract | Human fidelity risk | Relative speed | Planning local VRAM | Complexity / status |
|---|---|---|---|---|---|---|
| A Product Hero / product_hero_v1 | Reviewed segmentation → scene-only generation → original product composite → shadow/edge integration → protected core restore | Preserved supplied view; exact labels layered | N/A unless hands added | Medium | 6–10 SD1.5 background; 8–11 SDXL sequential | Medium; first build candidate |
| B Commercial Poster / commercial_poster_v1 | Layout/copy-space specification → controlled background → hero product layer → atmosphere outside product → deterministic copy/logo | Preserved if product supplied; conceptual if absent and allowed | Low if no people | Medium–slow | 8–11 sequential; heavier multi-control can exceed12 | Medium/high; follows Hero |
| C Lifestyle / lifestyle_v1 | Person/scene with pose/depth as needed → explicit contact/occlusion layers → matching-view product integration → face/hand QA | Preserved only where source view/contact allows; otherwise approximate with label | High at grasp, fit and occlusion | Slow | 8–12+; crop detail/offload | High; benchmark before acceptance |
| D Sports / sports_pose_v2 | Validated pose/layout → compatible base → product/contact strategy → optional crop detail/local foot repair → finishing → QA | Worn-shoe exactness needs matching views/3D; never guaranteed by pose/adapter | High for ankles, feet, motion | Slow | 8–12+; one control at a time initially | High; redesign legacy family |
| E E-commerce / ecommerce_product_v1 | Native product cutout → clean background/grounding → exposure/color-controlled export; distinct source per angle | Highest controllability for supplied angles; no invented back views | N/A | Fast–medium; may need no diffusion | CPU compositor; ~1–4 segmentation estimate, 6–10 if scene generation | Low/medium; share Hero core |
| F Social / social_fast_v1 | Approved identity-preserving template variations or one-pass scene concept → safe-area crop/layout | Preserved template SKU; approximate only for labelled concepts | Medium if humans, avoid action in fast tier | Fast | 4–8 baseline; distilled XL measured separately | Low; reuse approved modules |
| G Local Repair / repair_v1 | Source+confirmed mask → local denoise/detail → final exact keep-mask composite → re-review | Original outside mask; identity inside mask must be checked | Localized risk; cannot cure global composition | Medium | 5–10; source size dependent | Implemented/offline-tested; live quality deferred |

Use case is separate from placement: “Instagram story” can be a Product Hero, Lifestyle or Sports task. A high-risk product request cannot become approximate just because it is a social placement. **Brand graphics/copy is a cross-cutting deterministic layer**, not another image model: clean typography, logos and legal lines use approved artwork/fonts with layout QA.

## 3. Selection of technique by task

| Technique | Product/catalogue | Poster | Lifestyle/sports | Repair |
|---|---|---|---|---|
| Full generation | Backgrounds/concepts only when exact SKU needed | Scene/background, unbranded concepts | Base person/scene; anatomy QA required | Not a local repair substitute |
| Reference-conditioned generation | Approximate candidates; not catalogue certification | Appearance/mood variation | Regional, bounded experiment to avoid clothing leakage | Optional product appearance within confirmed mask |
| Original-pixel compositing | Preferred for supplied view | Preferred product/logo layer | Conditional on camera/occlusion/contact; do not fake unseen surfaces | Preserve everything outside mask |
| Canny/depth/lineart | Helpful geometry/layout adjunct, not exact print | Spatial/layout guide | Pose/contact adjunct; conflicting maps increase risk | Local geometry candidate where source is usable |
| Inpainting | Background/edge bands; product core protected | Remove distractions, integrate scene | Local defect only; regenerate if global failures | Main operation, reviewed outcome |
| LoRA/multi-reference | Later repeated-SKU research with adequate data | Later style specialization | Later identity consistency experiment | Not required first implementation |

This matrix expresses controllability and risk, not benchmark scores. Promotion criteria are in the benchmark plan; no row is currently labelled commercially stable.
