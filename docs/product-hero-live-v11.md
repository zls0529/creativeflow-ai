# Product Hero v1 — full live verification, hero V11

## Outcome (2026-09-19)

The single authorized run completed: RMBG extraction, one background generation, compositing, procedural shadow and edge integration, then exactly one real OpenAI Vision review. No automatic refinement or second generation/review ran. Workflow and release status remain **experimental**. Technical completion did not produce an acceptable campaign image.

- Campaign: Midnight Pulse — workflow comparison.
- Asset: hero, `cmu416ga50006v16gz8pcmacq`.
- New immutable version: **V11**, generation `cmu7zeb1x0005v1accirktjv4`.
- Job: `af82830f-c3c4-458e-af1c-23f71f88dbee`.
- Image: `storage/generated/921b53a3-94de-4523-bf06-b1e4872b2e01.png`.
- All ten prior generation rows were hashed before and after; unchanged, including failed V10.
- Saved result: human review needed. No approval or release promotion.

## Product fidelity and visual comparison

The original `shoes.jpg`, hero V9 and the new V11 were inspected directly. V9 is the identifiable previous IP-Adapter result using this exact reference SHA256, strength 0.8. Its image is `storage/generated/71eff991-130c-4c28-b812-6c0488063603.png`.

**The exact shoe identity is substantially better preserved in V11 than V9.** V9 depicts a runner wearing narrower grey/blue shoes with a different collar, conventional upper/lacing and thinner sole construction. It does not retain the reference's cream sculpted shell, broad side cut-outs/striped mesh and substantial undulating sole. V11 retains those source-specific features, the side-view proportions, grey knitted collar and tongue, cream shell, mesh pattern and visible sole silhouette.

This is a visual comparison of existing outputs with different compositions, not a controlled paired benchmark or proof of overall campaign-quality improvement. No new IP-Adapter arm or second paid comparison review was run. V9's previous score (26) is not treated as directly comparable to V11's paired-reference score (27).

| Criterion | Finding |
| --- | --- |
| Silhouette | Complete shoe retained, no apparent duplication or perspective warp. Vision: high fidelity. |
| Sole geometry | Thick curved cream sole, heel/toe profile and underside contour retained at output scale; tiny tread detail is limited by resizing. |
| Colour/material | Cream shell and grey/black/white textile patterns preserved. The source remains brightly studio-lit. |
| Logo/text | No added marks observed. No clearly readable logo/text in this view supports a claim of exact small-letter preservation; Vision said markings retained, but this remains visually limited. |
| Product prominence | One clearly visible shoe, right-hand focal placement, left copy space. It reads as an oversized floating object in the generated scene. |
| Composite seam | Overall silhouette is clean; no gross cut-out tear. Thin light edges and retained studio illumination still contribute to a pasted appearance against the night scene. Vision reported no visible seam. |
| Shadow/grounding | **Major failure:** shoe bottom is near y564 while the scene's ground/horizon is lower. No physical plinth supports it. The procedural shadow executes but is not a convincing contact/cast shadow on the scene. |
| Lighting integration | Edge-only adjustment executes, but does not truly relight the product. The bright source shoe does not fully inherit the cyan night ambience. Vision described the lighting as consistent; visual assessment is more conservative. |
| Campaign suitability | Midnight/cyan palette and copy space are useful, but the floating shoe and missing requested display support make this unsuitable for approval. |

Opaque-core preservation: **91,308 pixels checked; 0 changed; mean absolute error 0** against the resized, colour-normalized source. This is not bitwise equality with the original 6000×4000 photo: Lanczos resampling and boundary alpha/edge treatment still apply. The product itself did not pass through IP-Adapter or diffusion regeneration; only the background was generated.

## Vision and all stored blockers

One Responses API review used the final composite plus the source image. Actual usage model: `gpt-4.1-2025-04-14` (configured `gpt-4.1`). Product fidelity: **high**. Overall: **27/100**; component mean 75, defect penalty 48, cap 49 under the existing scoring policy.

All five stored blocker entries:

1. High `product_geometry_drift`: shoe floats without a plinth, grounded surface or convincing shadow.
2. Medium `prompt_adherence`: requested dark navy matte plinth/horizontal support absent.
3. High `product_geometry_drift`: paired-reference finding repeats floating/ungrounded product despite structural fidelity.
4. High `product`: integrity review repeats missing physical support/plinth.
5. Medium `product`: prominence achieved, but floating appearance undermines realism.

These entries overlap around the same grounding failure; they are not five distinct product-identity defects. The critic used `product_geometry_drift` for placement/grounding despite reporting preserved silhouette/structure. No separate missing-part, duplicated-part, colour-drift or logo-loss finding was returned. Raw findings and score are retained, not corrected or selectively removed. The overlap may compound the existing score penalty; no scoring logic was changed for this verification.

## Reproduction and timing

| Field | Recorded value |
| --- | --- |
| Segmentation | `rmbg14` / installed RMBG-1.4; no manual mask |
| Mask coverage | 18.691483%; one component, 100% largest-component dominance |
| Background workflow | `product_hero_background_api.json` |
| Background checkpoint | `majicMIX realistic 麦橘写实_v7.safetensors` |
| Resolution / seed | 1024×768 / 2026091701 |
| Sampling | 20 steps, CFG 7, euler, normal, denoise 1 |
| Product placement | right; left 390, top 311, width 573, height 253; scale target 0.56; left copy space |
| Source crop | left 1213, top 1149, width 3977, height 1758; uniform Lanczos3 scaling |
| Shadow | `procedural-contact-and-soft-cast-v1` |
| Integration | bounded edge-only luminance matching, one-pixel inward alpha feather; opaque core unchanged |
| Reflection / repair / upscale | off / none / none |
| Extraction stage | 7.129 s including uploads/checks/storage; local inference request 4.701 s |
| Background stage | 8.328 s |
| Compositing stage | 1.209 s |
| Total image pipeline | 18.003 s |
| Vision request | 8.815 s |
| Total worker run | 27.444 s, excluding queue wait |
| API usage | 4,035 input + 1,304 output = 5,339 tokens; zero cached input |
| Estimated API cost | **USD 0.018502** from stored pricing snapshot; not a billing receipt |
| Local GPU cost | unavailable, not assumed zero |
| Calls / refinement | two local ComfyUI calls, one OpenAI review, zero refinement |
| Workflow | `product_hero_v1@1.0.0`, experimental |

Hashes (SHA256 canonical JSON for templates/bundle):

```text
Background template: 03bcba48afc2a218bdef670054c1d28a62d31e879cf9b6762733a4563c6c6081
RMBG template:       856d65b78eaeb22a4def190abed6bb61f5869af5ead51b874cfbdf47d7866829
Definition bundle:   7fee609cf3cf5c41fd6d03dfd1259b569ca458174fdbc826b4e9397c4f954ec2
Source photo:        31f663e07ce50cd5aa78239b893dbd2ae1af842d51516871986f4de1e67c3ad6
Composited mask PNG:  428944fd88e93f4ab78f89d3735fe74ff38fe00ecd547721bd900376753272d0
```

The raw returned mask artifact has a separate hash from the thresholded compositor mask; both are recorded. Template registry hashes match. Background input references are empty: no product IP-Adapter branch was used.

## Validation, evidence and limits

Lint, typecheck, all **210 tests**, and production build passed before the live run. Tests used mock providers, not paid calls. Existing non-fatal Node JSON-module warnings remain.

- Full immutable report: `storage/product-hero-live-verification-rmbg-v2.json` (evaluation, usage, timings, settings, history digest result).
- Previous comparison provenance: `storage/product-hero-comparison-history.json`.
- Logs: `storage/product-hero-rmbg-live-tests.log`, `storage/product-hero-rmbg-live-build.log`, `storage/product-hero-rmbg-preflight.log`.
- Script update: `scripts/verify-product-hero.ts` adds a separate `--verified-rmbg` request key/report, preserving the first verification record and refusing duplicate runs; adds cost and prior-version preservation evidence.
- Registry metadata: Product Hero and RMBG now record `limited_live_evidence`; status/release state remain experimental. This records execution evidence, not campaign-quality acceptance.

The app/worker were restarted with the tested RMBG configuration in their process environment; `.env` and API credentials were not edited. No automatic repair/refinement or extra paid request followed the low score.

Remaining work is support-surface/background adherence, product-to-surface placement, physically convincing contact shadow and lighting integration. None was changed during this inspection request. One product/view/placement, one seed and one stochastic Vision review cannot validate the workflow. Keep experimental; inspect V11 directly before authorizing further work.
