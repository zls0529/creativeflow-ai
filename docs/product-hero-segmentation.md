# Product Hero v1 — extraction reliability (2026-09-19)

## Live result

The shoes.jpg segmentation-only check passed. No background generation, campaign composite, lighting/shadow processing, Vision call, new campaign version or automatic refinement ran. Product Hero remains experimental; one opaque shoe is not evidence of universal extraction reliability.

| Extraction | Coverage | Components | Largest / foreground | Result |
| --- | ---: | ---: | ---: | --- |
| Original SAM external negative grid | 0.6796% | 109 | 25.32% | Rejected |
| Identical SAM input; external negative grid disabled | 18.4749% | 1 | 100% | Accepted |
| Prioritized extraction: RMBG-1.4 | 18.6915% | 1 | 100% | Accepted |

RMBG had zero tiny-component mass and 64.16% bounding-box occupancy. Visual inspection shows toe, heel, sole, collar and tongue retained, with the photo background removed. Fine edges still need review; perfect alpha matting is not claimed. No manual mask or corrective intervention was needed. SAM used the previously frozen product region.

Evidence:

- `storage/segmentation-sam-root-cause.json`: original/corrected SAM masks and diagnostics.
- `storage/segmentation-verification-127a2907-591e-4a52-bab3-8868af127276.json`: source SHA256, rejected opaque-alpha candidate, accepted RMBG mask, template hash and no-background/no-Vision declaration.
- `storage/segmentation-shoes-preview-correction.json`: corrected transparent preview made from the saved source/mask only. The first script preview lost alpha during Sharp encoding; the report is retained with this explicit correction, and the script was fixed. No repeated inference.
- `storage/segmentation-shoes-isolation-preview.png`: visual inspection on a solid backdrop, a display aid rather than a campaign composite.

## Root cause

The old graph already supplied a bounding region and foreground centre point. It also enabled `mask_hint_use_negative: Outter`. Installed Impact Pack `modules/impact/core.py` calls `gen_negative_hints(image.shape[0], image.shape[1], ...)`, while the function interprets these as width, height. For the 6000×4000 source its negative grid therefore spans 4000×6000: 330 negative points, 140 out of bounds, with the intended right-hand area undersampled.

A segmentation-only A/B used the identical stored source, box, checkpoint and parameters, changing only Outter to False (plus output prefix). The mask changed from 109 fragments to one shoe silhouette. This isolates the external negative guidance as the practical failure trigger. The exact contribution of individual malformed points was not measured. The new template disables this optional grid; no node installation, model change or threshold reduction was needed. Historical SAM 1.0.0 remains unchanged.

## Strategies and dependencies

Default `auto` tries, in order:

1. Meaningful validated source alpha. Opaque JPEG alpha is rejected and recorded.
2. Explicitly configured installed RMBG-1.4 via Easy Use `easy imageRemBg`. Verify its local weights before submitting, preventing the missing-file download branch. Otherwise try conservative bright-neutral-background removal using existing Sharp: border-connected flood fill, bounded working resolution, mask restored to source dimensions. Inconsistent/non-neutral borders are rejected.
3. Guided SAM: complete-product box and centre foreground point, external negative grid disabled. Existing percentage controls provide user-assisted region selection.
4. Stop and offer manual-mask upload if no candidate passes. Never continue with a rejected mask.

Explicit alpha/background-removal/SAM/manual modes constrain extraction. Auto records every attempted method and rejection. RGB is unchanged during extraction. Shape checks alone cannot establish semantic correctness or detect every missing product part.

Local inspection:

- Impact Pack `SAMLoader`, `SAMDetectorCombined`, `MaskToSEGS` and standard image/mask nodes; installed `sam_vit_b_01ec64.pth`, 375,042,383 bytes.
- Easy Use `easy imageRemBg`; installed `models/rembg/RMBG-1.4.pth`, 176,718,373 bytes. Used once for the successful extraction.
- Inspyrenet nodes present, required cached weights absent; not selected/downloaded.
- LayerStyle BiRefNet loader advertises no installed model; not selected.
- No models/nodes installed or changed. No ComfyUI source patch.

RMBG is opt-in: the [official model card](https://huggingface.co/briaai/RMBG-1.4) specifies non-commercial use and a separate commercial agreement. This development verification does not establish commercial licensing.

### Configuration and verification

Actual `.env` is unchanged. To use the verified installed RMBG path in a later run:

```dotenv
COMFYUI_PRODUCT_HERO_REMBG=rmbg14
COMFYUI_LOCAL_ROOT=<COMFYUI_ROOT>
```

The root contains `models/rembg/RMBG-1.4.pth`, is read-only, and requires a loopback ComfyUI URL. Missing nodes/weights are reported; no automatic downloads. Blank RMBG config uses alpha, neutral-background removal, corrected SAM. Existing `COMFYUI_PRODUCT_HERO_SAM_MODEL` remains supported.

`npm run workflow:product-segmentation -- --run` runs only frozen shoe extraction and writes a unique report. It has no campaign execution or Vision entry point. The live check supplied RMBG/root to that process only. Full Product Hero generation is not authorized in this task.

## Mask rules and manual fallback

Analysis uses source-resolution, 8-connected components at threshold 127; fragments are not deleted to improve statistics.

- Coverage between 0.3% and 94%, not a fixed expected shoe area.
- Bounding width/height at least 8 pixels and 1.5% of each source dimension.
- Largest component at least 85% of foreground; at most four significant components (each at least 1% of foreground and 32 pixels).
- At most 64 total components; tiny-fragment mass at most 2% (tiny means below max(16 pixels, 0.1% of foreground)).
- Foreground fills at least 12% of its bounding area.
- Reject foreground touching the outer two-pixel boundary; require a complete product with padding.
- Validate mask dimensions, manual PNG size/single frame, source ownership/checksum.

Product Hero → Extraction → Upload manual mask: opaque source-sized PNG, white product, black background. Upload validates and preserves even rejected masks, displays metrics/preview, and requires completeness confirmation. Transparent manual masks are rejected as ambiguous; transparent product photos use source-alpha extraction. Manual confirmation does not bypass sanity checks. Some legitimate thin/disconnected products remain unsupported by these conservative checks.

Readiness reports validated alpha/manual, installed removal, neutral-background removal or guided SAM. It blocks with a manual-fallback explanation if none is usable, and warns that human mask inspection may be needed. Discovery does not perform inference or paid review.

## History / scope

Sources stay untouched. Store each returned mask including failures, source snapshot, mask hash, coverage/components, acceptance/reasons, method/model/template, SAM region and intervention flag. Immutable JSON is under `storage/segmentation`; PNGs use existing generated storage. Successful Product Hero metadata and failed generation context carry the final extraction report, shown in Reproducibility. No database migration; old versions remain readable.

New registered templates: `product_hero_sam_v1@1.1.0` / `product_hero_segmentation_guided_api.json`, and `product_hero_rembg_v1@1.0.0` / `product_hero_rembg_api.json`. Old SAM template is retained. Background graph and workflow identity are unchanged. Compositing only imports the strengthened shared validator; its RGB, placement, relighting, shadow and Vision algorithms are untouched.

A mocked durable-job test confirms a rejected mask causes one segmentation submission, zero background submissions, no composite and zero Vision calls, while retaining diagnostics/history. Cancellation is checked before each attempted extraction.

## Validation

Lint, typecheck, all **210 automated tests**, and production build passed. Providers/network are mocked in automated tests. Existing non-fatal Node JSON-module warnings remain. Logs: `storage/segmentation-full-tests.log`, `storage/segmentation-build.log`.

Coverage: alpha priority, white background, empty/full, fragmentation, dominant/multi-component masks, small legitimate products, manual confirmation/source binding, readiness, installed/missing RMBG, pipeline stop, existing campaign/version/Vision regressions.

## Exact task files

New:

- `lib/product-hero/mask.ts`
- `lib/product-hero/segmentation-store.ts`
- `lib/product-hero/white-background.ts`
- `lib/product-hero/segmentation.ts`
- `comfyui/workflows/product_hero_segmentation_guided_api.json`
- `comfyui/workflows/product_hero_rembg_api.json`
- `app/api/campaigns/[id]/product-mask/route.ts`
- `scripts/verify-product-segmentation.ts`
- `tests/segmentation.test.ts`
- `docs/product-hero-segmentation.md`

Updated:

- `.env.example`
- `package.json`
- `comfyui/registry.json`
- `types/product-hero.ts`
- `types/refinement.ts`
- `lib/product-hero/composite.ts` (shared validator import)
- `lib/product-hero/pipeline.ts`
- `lib/product-hero/readiness.ts`
- `lib/product-hero/execute.ts`
- `lib/workflows/benchmark.ts` (current SAM dependency version)
- `components/campaign/product-hero-panel.tsx`
- `components/campaign/reproducibility.tsx`
- `tests/product-hero.test.ts`
- `tests/registry-benchmark.test.ts`
- `docs/product-hero-v1.md`

Ignored local artifacts additionally include node catalog, SAM diagnostic ID/history, `storage/inspect-segmentation-evidence.ts`, reports/previews listed above, extraction JSON/PNGs, test/build logs and regenerated build caches. No `.env`, original asset, historical generation, legacy template or model file changed.

## Readiness conclusion

Ready for a separately approved second Product Hero live test with the verified extraction settings. Carry over the two RMBG configuration values to reproduce that path. Both corrected guided SAM and installed RMBG isolated this shoe. This task stops after segmentation; complete campaign compositing and reference-aware paid Vision remain untested with the new extraction.
