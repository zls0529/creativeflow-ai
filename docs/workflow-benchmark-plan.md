# Commercial workflow benchmark plan

Protocol `commercial-benchmark-v1`, 2026-09-19. **Designed, not executed.** No new image generation or OpenAI call is authorized by this document. Execution is a separate, budgeted task. Existing saved images are evidence/examples, not a representative benchmark sample.

## 1. Frozen local fixtures

The initial six cases deliberately reuse available user-provided inputs. No image was downloaded, synthesized or modified for this task. Reference assets remain at their existing paths and are pinned by SHA256, dimensions and role; a mismatch blocks a future run. Archive a rights-cleared immutable copy in the future benchmark runner before execution. Reference manifest is [workflow-benchmark-fixtures.json](workflow-benchmark-fixtures.json).

| ID | Repository-relative file | SHA256 | Role and limits |
|---|---|---|---|
| P1 | `shoes.jpg` | `31f663e07ce50cd5aa78239b893dbd2ae1af842d51516871986f4de1e67c3ad6` | 6000×4000 product photo; one visible shoe view, cream sole/overlays, grey collar, striped mesh. No rear/other-side ground truth |
| R1 | `reference.jpg` | `51f6e891eaeabb9afd3a04d200797cde809ff154687151dfd9a013154a75c386` | 896×896 running-pose photo; pose role only, not product or person-identity authority |
| D1 | `storage/generated/40b024cb-f84e-400d-b4d4-e90d3a65cc80.png` | `9907ae595ba1c586cf09aa2c42e357be863e4384c547342f04039ddd83520721` | 1024×768 Midnight Pulse hero V7; existing rear-shoe blur case, real score69; generated cyan shoe is not P1's cream shoe |

P1/R1 are private local fixtures supplied in this task history, not licensed public benchmark distribution assets. External upload requires the corresponding authorization. Keep hashes/IDs in results, do not upload files just to validate checksums. No claim of fixture redistribution rights is made.

No approved alpha matte, product landmark annotations, same-product multi-angle photos or true sports contact-product photo currently exist. Those are **explicit preparation gates** before claiming strict-pixel segmentation or worn-product identity accuracy. The six briefs below are fixed now; initial available-fixture results would still be shoe-specific, not evidence for perfume, glass, cosmetics or electronics.

## 2. Common experiment contract

- Frozen positive/negative strings below bypass prompt-generation agents for image-pipeline comparison. Keep the submitted transformed strings too. No LLM rewrite between arms.
- Seed list for development: **2026091701, 2026091702, 2026091703, 2026091704, 2026091705, 2026091706, 2026091707, 2026091708, 2026091709, 2026091710**. One batch item per seed. Multi-pass seed derivation is fixed and recorded; do not rely on implicit increment behavior.
- Use the same seed where graph/model/resolution allows. Different models or latent shapes do not produce matched noise merely because integers match. Pair cases/seed labels for analysis, and describe that limitation.
- Lock workflow/version/hash, checkpoint/hash, VAE, encoders, control/adapter settings, node commits, dtype, GPU/driver/runtime, dimensions, masks, source transforms and exact preprocessing. Disable automatic extra refinement for first-pass testing.
- Same target output size; compare at native output and 100% crops. Record intermediate stage outputs. Separate semantic instruction equivalence from model-specific syntax (e.g. distilled guidance).
- No result cherry-picking. Keep provider failures, censored timeouts, refused reviews and no-detection masks. Predeclare a maximum of one human-confirmed local repair for the **separate** bounded-repair arm; no unconstrained regenerate-until-good loop.
- Randomize candidate execution order; alternate warm runs, measure at least three cold-start runs separately. Single GPU concurrency. Cache/skip keys include all inputs, configuration and code revision.
- Tag a run with use case **and** placement; do not let `auto` select a different arm unnoticed. Routing itself has a separate deterministic fixture suite.

Shared negative prompt `N1` (unless a model does not support negative conditioning, which must be recorded):

> duplicate product, extra shoe, missing product parts, invented vents, deformed sole, altered product color, illegible added text, unrequested logo, watermark, extra person, duplicated limbs, missing feet, twisted ankle, malformed hands, blurred product, cropped product

For models without a negative channel, preserve these requirements in the positive specification or record unsupported capability; do not silently claim equivalent conditioning. Intended marks visible in P1 are not to be erased by a generic “no logo” request; N1 prohibits **unrequested** marks.

## 3. Six fixed briefs

Each case uses N1 except repair's explicit negative below. All numeric targets are proposed acceptance criteria, not measured outcomes. Existing Vision dimension names are preserved; “priority” means report these dimensions prominently, not change server score weights.

### B01 — Product Hero

**Brief:** AERON RUN cream/grey shoe; premium studio hero with exact supplied-view product and room for separate typography.

**Fixed prompt:**

> Create a premium product hero for the exact single cream-and-grey shoe in P1, using its supplied camera view. Keep the complete silhouette, cream sole profile, grey collar, translucent layered overlays and striped mesh. Place one shoe on the right half on a dark navy matte plinth, soft cyan light in the background, neutral product illumination, subtle grounded contact shadow. Keep the left 35 percent visually quiet for later copy. No people, no added text or logos. Preserve the product's original colors and details.

**Inputs/output:** P1 product; approved alpha/core annotation required for strict arm. Hero 1024×768. Compare full reference regeneration vs composite-protected architecture as clearly different preservation contracts. No invented views.

**Measure:** silhouette/landmark correspondence; protected-core pixel error after declared transform; color patches; product occupancy 20–40% canvas; left35% safe area; plausible shadow. Vision priorities: product_visibility, visual_hierarchy, composition, colour_consistency, campaign_relevance. Blockers: changed construction/print, doubled product, missing heel/toe, gross halo, source-color drift, copy-space invasion. Human: zoom sole/mesh/edges against P1, check exact count and lighting integration.

### B02 — Commercial Poster

**Brief:** Midnight Pulse poster featuring the supplied product, not a runner; identity plus cinematic campaign atmosphere.

**Fixed prompt:**

> Build a cinematic Midnight Pulse running-shoe poster. Use exactly the single cream-and-grey shoe from P1 in its supplied view as the foreground hero at lower right, resting credibly on wet dark pavement. Keep its shape and product colors unchanged. Use a navy nighttime city background, cyan light trails behind the product and a restrained warm rim light. Leave the upper-left 35 percent quiet for copy. No person, no generated writing, no invented accessories, no duplicate shoes.

**Inputs/output:** P1; no R1. Hero 1024×768; later locked layout variants story768×1344/banner1536×512. Preserve product layer; generate atmosphere outside it.

**Measure:** B01 identity plus 35% safe area, foreground/background separation, shadow/reflection agreement. Vision priorities: composition, visual_hierarchy, brand_consistency, campaign_relevance, prompt_adherence. Blockers: bright-studio substitution, recolored SKU, unreadable product at export, typography generated into image, impossible reflection. Human: compare source and proposed product pixels, test an overlay box for actual copy fit; do not score “empty space” from prompt alone.

### B03 — Lifestyle Human

**Brief:** One adult preparing a shoe at a daylight bench; this tests human-product contact without requiring invented unseen shoe angles.

**Fixed prompt:**

> Photograph one adult runner seated beside a simple bench in a daylight apartment, preparing for a run. The exact cream-and-grey shoe from P1 is on the bench in its supplied side view, fully visible, with one relaxed hand resting lightly at the heel without hiding the sole or mesh. Keep the other hand visible and naturally placed on the knee. Natural anatomy, soft window lighting, realistic scale and contact. One person and one featured shoe, no text, no invented product details. Leave the upper-left quarter uncluttered.

**Inputs/output:** P1; no person identity reference; post1024². Frozen hand-overlap mask/layout must be reviewed before a compositing arm. Hand may cover at most10% of product region; protect remaining visible product.

**Measure:** visible product fidelity, skin/product occlusion order, number of hands/fingers where visible, face coherence and scale. Vision priorities: visual_quality, product_visibility, composition, prompt_adherence; integrity hands/body/product_structure. Blockers: fused hand/product, duplicated limbs, altered shoe, impossible support, subject count wrong. Human: verify occlusion boundaries, hand contact and facial features. Success here **does not validate wearing/flexible footwear**; a wearing subcase needs matching-angle assets and a separate fixture version.

### B04 — Sports

**Brief:** Pose-controlled action with identifiable footwear; intentionally difficult stress case, allowed to fail.

**Fixed prompt:**

> One adult athlete running to the right with the broad torso, arm and leg layout of R1, full body and both feet fully inside frame. Wet urban street at night, navy scene, cyan background lights and warm rim lighting. Wear shoes matching P1's cream-and-grey color blocks, sole profile, collar and layered mesh construction. Sharp body and footwear; motion blur only in background light trails. Keep runner on the right two-thirds with quiet space on the left. No race bib, text, extra athlete, extra shoe or invented clothing accessories.

**Inputs/output:** R1 pose, P1 product; hero1024×768. Reference-faithful worn-shoe claim is **not eligible** from only one flat product view. Evaluate visible-view consistency/approximate identity, and separately record the exactness gate as unmet. Future matching-view/3D fixture required for release.

**Measure:** peoplecount1; two complete shoes/feet; ankles/leg connections; normalized pose landmark distances after documented frame transform; visible shoe construction; face; copy space. Vision priorities: all eight, especially product_visibility, visual_quality and prompt_adherence; feet_ankles/pose_plausibility integrity. Blockers: extra/missing limbs, cropped/melted shoe, impossible ankle, tiny product, studio/garment pattern leakage. Human compares R1 and P1 separately; “not visible” is not identity success.

### B05 — E-commerce / Catalogue

**Brief:** Single supplied-view catalogue image. No generated alternate-angle claim.

**Fixed prompt:**

> Create a clean catalogue image of exactly the single shoe in P1 in the same view. Center the complete product against a neutral near-white background with a subtle physically plausible ground shadow. Preserve cream-and-grey product colors, sole geometry, mesh pattern, overlays, collar and all existing product details. Product occupies 65 to 80 percent of image width. No people, additional shoe, decoration, new text, recoloring or invented angles.

**Inputs/output:** P1 product; product1024². Strict compositor can omit diffusion altogether. Baseline reconstruction is still useful as a comparison, not as assumed compliance.

**Measure:** transformed-core equality, silhouette/edge halo, neutral background, occupancy, original details at100%. Vision priorities: product_visibility, colour_consistency, visual_quality, prompt_adherence; product_structure/duplicated_product_parts. Blockers: any source detail invented/deleted, wrong angle, crop, heavy color cast, duplicate product. Human signs off geometry and catalog truthfulness. Multiple views require separate real reference captures and immutable fixture entries.

### B06 — Local Repair

**Brief:** Existing Midnight Pulse V7 rear shoe blur; improve one region while preserving the rest.

**Fixed repair prompt:**

> Repair the raised rear shoe into one complete crisp realistic cyan running shoe with an intact sole and natural ankle connection. Preserve its existing silhouette, foot direction, cyan color, nighttime lighting and runner identity. Change only the selected region.

**Fixed negative:**

> duplicated shoe, missing foot, twisted ankle, extra foot, changed shoe color, changed face, changed pose, new text, seam, halo

**Inputs/output:** D1 source; manual rectangle `{x:0.625,y:0.505,width:0.125,height:0.16}`; existing inward feather≤8px; source1024×768; no P1 identity transplant. Freeze the actual generated mask bytes/hash before comparing repair variants. Use recorded source generation `cmu5fd34j0001v1owmce8g3o4` and source finding `blocking:1`.

**Measure:** exact decoded RGBA equality where mask=0 (mandatory), changed target pixels>0, target clarity/ankle plausibility, seam continuity and no new blockers. Existing real source score69 can be reported historically; compare fresh paired reviews only when explicitly authorized and pinned to the same reviewer/config. Human inspects rear shoe crop, face, lighting, whole-image composition. A higher score without a visibly better target is not a success. Current status remains **not run**.

## 4. Evaluation layers

1. **Execution:** output decodes, dimensions/colorspace correct, no OOM/timeout, expected stage graph used, no ignored reference/control, complete metadata. Failed technical runs remain in attempt denominator.
2. **Deterministic preservation:** mask/core comparisons against the declared source transform; checksum, silhouette alignment, overlay safe areas and export dimensions. SSIM/embedding similarity are supporting signals only; a similar wrong sole can score highly.
3. **Current real Vision schema:** brand_consistency, composition, visual_hierarchy, product_visibility, colour_consistency, campaign_relevance, visual_quality, prompt_adherence plus integrity and blocker categories. Record model, prompts, date, policy and raw component scores. Do not compare mock vs real or uncalibrated scoring revisions numerically.
4. **Reference-aware human rubric:** two independent reviewers blinded to workflow/seed, original reference visible, 0–4 anchored grades: 0 wrong/missing; 1 severe drift; 2 recognizable but incorrect; 3 minor deviation; 4 faithful at declared view/scale. Grade silhouette, proportions, construction/details, material/color, human anatomy, face, hand/foot contact, pose, copy space and campaign suitability separately. N/A is excluded, not scored4. Adjudicate disagreement≥2 points and record it.
5. **Final acceptance:** no medium/high unresolved blocking defect, required identity contract satisfied, adequate source visibility and human approval. Overall score is supporting evidence. Report original, repaired and newly introduced defects by region/observation, not only category counts.

The existing Vision adapter does not see P1/R1. For this plan identity and pose evidence comes from human comparison. A future benchmark-only paired-image Vision evaluator would be additional scoped engineering and paid calls; no implied implementation or authorization here.

## 5. Stability metrics and sample sizes

| Metric | Definition / denominator |
|---|---|
| Technical generation success | Valid saved outputs / all requested attempts; separately classify OOM, model/node, timeout and refusal |
| First-pass acceptance | Outputs passing all quality/identity gates / all requested attempts (technical failures count as not accepted) |
| Blocker rate | At least one medium/high human-adjudicated blocker / reviewed successful outputs; also report unreviewed count and end-to-end nonacceptance |
| Identity pass rate | Rubric≥3 in every required identity dimension + contract tests / all identity-eligible attempts; not_visible is failure when visibility was required |
| Anatomy failure rate | At least one medium/high anatomical defect / all successful human-required outputs; invisible required feet is a visibility failure, not anatomy-clear |
| Campaign consistency | All five placements preserve declared SKU attributes / attempted five-placement campaign sets; report joint success, not mean image similarity |
| Score | Mean, median, SD and range of each Vision dimension and overall on reviewed outputs; missing reviews stay missing |
| Repair yield | Accepted after at most one allowed repair / all initial attempts; separately show new-defect rate, outside-mask violations and human minutes |
| Cost/performance | Cold/warm p50/p95 provider and end-to-end time; actual paid usage, peak allocated/reserved VRAM, system RAM, OOM rate; cost per accepted result includes failed attempts |
| Repeatability | Same pinned config rerun at least3 times, pixel hash if deterministic; otherwise toleranced/semantic variation explicitly recorded |

**Development:** 3 seeds per case only for plumbing/smoke (18 images/arm), never stability evidence. Minimum candidate comparison is the fixed 10 seeds ×6 briefs =60 images/arm, followed by at least3 distinct reference sets in any category being considered for promotion. Do not run this budget in the current research task.

**Release candidate:** minimum5 independent reference/brief sets ×20 seeds =100 first-pass attempts **per use case / supported model-tier configuration**. Add at least20 held-out five-placement campaign sets for product consistency; 100 images but only20 campaign-level observations. Include reflective/translucent packaging, small type, varied skin tones, occlusion, difficult poses and aspect ratios where supported. Restrict release claims to supported strata; one shoe cannot certify all packaging or human use cases. Repair needs at least20 distinct defect/source masks across its claimed targets, not100 seeds on one image.

**Proposed gates, subject to calibration:** technical success≥98%; zero protected-core/unmasked violations; first-pass human acceptance≥80%; bounded-one-repair acceptance≥90%; blocker point rate≤5% with upper95% Wilson bound≤10%; no accepted catalogue image with invented SKU detail; no unexplained cloud/extra-pass cost; p95 within a declared measured budget. These are proposed product thresholds, not industry standards or achieved results. Report every stratum and uncertainty, not only a pooled average.

Zero failures in100 independent trials only bounds failure probability to roughly3% at95% confidence (rule of three), not zero risk. Reused references/seeds produce clustering; bootstrap paired differences by reference/brief, and do not treat five correlated placements as five independent campaign trials. Confidence intervals are descriptive when the fixture set is purposively selected. For tighter commercial guarantees, broaden both reference diversity and sample count.

## 6. Ablations and budget controls

- Identity: reference-only baseline → protected composite → optional edge/contact integration. Add one mechanism at a time; no adapter+depth+new checkpoint simultaneous comparison.
- Sports: frozen base with/without pose; compare pre/post text-only refinement; face pass on/off from identical base image; one local shoe repair arm. Match visibility targets and camera framing.
- Reference strength: predeclare a small sweep only after baseline, e.g.0.4/0.6/0.8 for the current SD1.5 adapter, same seeds; record scene leakage and SKU drift, not only aesthetics.
- Model: existing checkpoint vs one verified SDXL candidate; compatible controls in each arm, explicit model-family change. Use contract-equivalent prompts and output layouts.
- Performance: do not run all controls at once just because they are installed. Freeze chosen candidate before held-out evaluation.
- Precalculate images ×passes, review calls, input bytes/tokens, GPU hours and maximum spend. Stop at cap; preserve partial results and mark incomplete. No automatic paid benchmark from tests/CI.

## 7. Missing release fixtures

Before release, obtain rights-cleared product photographs for opaque packaging with precise label, transparent perfume/beverage bottle, reflective electronics, fabric/apparel, and multiple shoe angles; reviewed alpha/core masks and identifiable landmarks; diverse licensed person/pose captures. Record actual file hashes and approved use before execution. These are **missing**, not placeholder assets masquerading as a complete general-commercial benchmark.

Deliverable schema for future results: benchmark protocol/case/ref hashes, run ID, graph/model/dependency hashes, seeds by stage, settings, transform/mask IDs, planned/actual stages, output hashes, failures, timings/memory, costs, independent Vision review, human rubric, defect correspondence, acceptance and reviewer provenance. Preserve first-pass and repair results separately.
