# Klein 4B Distilled local validation

Date: 2026-09-19. **Baseline passed. Recommendation A: feasible on this RTX 4070 SUPER at the tested settings; ready to consider CreativeFlow integration as an experimental workflow.** No integration performed. One successful generation, no generation retries, no paid OpenAI/Vision calls.

## Source and isolation

- Official template: https://github.com/Comfy-Org/workflow_templates/blob/main/templates/image_flux2_klein_image_edit_4b_distilled.json
- Untouched source: `external/klein-validation/original_workflow.json`.
- Source SHA-256: `e0388a8870495802314d58fa61616ddcdb7064dac5f85a8787c9e08180b8a560`.
- Existing ComfyUI: commit `9ee0a6553ab94f221789d1905af66435bb1b2b96` (2024-10-27), Python 3.11.9, PyTorch 2.4.1+cu124, port 8188. Preserved without upgrades.
- Isolated official ComfyUI: `external/klein-validation/ComfyUI`, stable tag `v0.36.0`, commit `ee71d5c4993f29086b27fde1629a945ae48425bf`.
- Isolated Python environment: `external/klein-validation/.venv`, Python 3.12.14. Running on port 8190; loopback only, external API/custom nodes disabled.

## Exact missing dependencies

The four missing types are official **core nodes**, not third-party custom nodes:

- `EmptyFlux2LatentImage`, `Flux2Scheduler`: reviewed in `comfy_extras/nodes_flux.py`.
- `GetImageSize`: reviewed in `comfy_extras/nodes_images.py`.
- `ReferenceLatent`: reviewed in `comfy_extras/nodes_edit_model.py`.

The old core predates these features. Installing random custom-node packs would not address the underlying model compatibility. The separate official checkout supplies model architecture and helper implementations together. No third-party custom node pack installed.

Required weights: all downloaded from public official repositories and SHA-256 verified against upstream metadata. Install root: `<project>/external\klein-validation\ComfyUI`.

| File | Bytes | Source | Relative destination |
| --- | ---: | --- | --- |
| flux-2-klein-4b-fp8.safetensors | 4,070,624,520 | https://huggingface.co/black-forest-labs/FLUX.2-klein-4b-fp8 | models/diffusion_models/ |
| qwen_3_4b.safetensors | 8,044,982,048 | https://huggingface.co/Comfy-Org/z_image_turbo/tree/main/split_files/text_encoders | models/text_encoders/ |
| flux2-vae.safetensors | 336,213,556 | https://huggingface.co/Comfy-Org/flux2-dev/tree/main/split_files/vae | models/vae/ |

No LoRA, ControlNet, IP-Adapter, segmentation or upscaler weights required. The source contains separate one- and two-reference examples; only the existing single-reference example is used for this controlled baseline.

## Minimal test adaptation

`prepare_baseline.py` derives `baseline_api.json` and a flat loadable `baseline_workflow.json` from the source's single-reference subgraph. Inference stages and connections preserved: text encode → reference latent conditioning → CFG guider → Flux2 scheduler/Euler sampler → VAE decode.

- Reference: existing `shoes.jpg`, copied as `ComfyUI/input/klein_shoes_reference.jpg`.
- Batch 1, 4 steps, CFG 1, Euler: unchanged from the source.
- Fixed seed 20260919.
- Image scaling: 0.5 megapixels instead of 1; dimensions rounded to multiples of 16.
- Prompt requests the same shoe on a dark studio floor, natural grounding and empty copy space; no people/text/extra shoe.
- Adds SaveImage output and exposes the input in the flat test copy; no CreativeFlow provider changes.

## Local test result

| Item | Observed result |
| --- | --- |
| Prompt ID | `8771db26-1d2d-4aae-ab6f-d5c3c18c7674` |
| Execution | Success, completed; no node errors, fatal execution error or OOM |
| Runs | One submitted, one completed, no refinement or retry |
| Server execution time | 10.04 seconds (history timestamps: 10.038 seconds) |
| Client wall time | 10.31 seconds including polling |
| Output | `ComfyUI/output/klein_baseline_shoes_00001_.png` |
| Image | 880 × 592, RGB, 565,691 bytes; prompt and workflow embedded in PNG |
| Steps / batch / seed | 4 / 1 / 20260919 |
| Initial sampled global VRAM | 3,057 MiB |
| Highest sampled global VRAM | 10,981 MiB (~10.72 GiB) of 12,282 MiB |
| Sampled available system RAM | 2,709 → 2,054 → 1,964 MiB |
| Paid API cost | $0; no external scoring API called |

Evidence: `submission.json`, `history.json`, `result.json`, `server.log`, `artifact-hashes.json`. The first inference on this server had an empty execution-cache list. This is **not a cold-machine benchmark**: checksum verification can warm the OS disk cache. Downloads/install time is excluded from generation time. VRAM was sampled every ~5 seconds, across the whole GPU, only three samples for this short run; a higher transient peak may have been missed. It is not isolated process peak memory.

Hardware: RTX 4070 SUPER (12,282 MiB), driver 560.94, approximately 16 GiB system RAM, NVMe SSD. Old ComfyUI queue was checked empty before releasing its idle model caches; that service was not stopped. DynamicVRAM and disk-backed offloading were enabled on the isolated server. Logs show VAE, Qwen text encoder and Flux2 loaded and all four sampling steps completed. Staged model sizes do not mean all weights were simultaneously GPU-resident. After validation, isolated-server model caches were also released; output and services remain available.

## Visual findings and suitability

Human/assistant visual comparison against the original `shoes.jpg`; no paid Vision score:

- The output contains one complete shoe, maintaining the side-view direction, recognizable sculpted cream sole, cream cage, grey knit collar and black/white upper pattern.
- The white background becomes a dark studio floor/background. The visible contact/cast shadow grounds the shoe; there is useful empty space above it for later typography.
- Product details are **not pixel-preserved**: knit/mesh texture is regenerated, the collar is brighter, sole surface texture and small edge/lace details differ. The main identity reads well in this image, but exact manufacturing geometry is not certified.
- No readable logo/text was tested. Typography/layout generation, other products, multiple placements, multi-reference inputs and repeated-seed consistency were not tested.

| Criterion | Assessment from this baseline |
| --- | --- |
| Commercial poster visual base | Promising studio product still life with copy space; not a completed branded poster or print-resolution asset |
| Product-scene generation | Demonstrated with this shoe; approximate identity retention, not a protected-pixel compositor |
| API automation | Demonstrated via a plain local `/prompt` request and `/history` polling, using standard core nodes and SaveImage |
| RTX 4070 SUPER feasibility | Demonstrated at 880×592, batch 1, four steps with dynamic offloading; memory headroom is limited |

**Recommendation A**, limited to an experimental integration candidate. Keep its status experimental. This single image does not establish production quality, higher-resolution feasibility, throughput, exact logos, or consistent product identity across campaigns. Do not replace a pixel-preserving Product Hero path with this generative edit workflow on the basis of this test.

## Installation and compatibility notes

`download_models.py` used the audited URLs with resumable HTTP range transfers. `installed-models.json` records complete filenames, sources, sizes, hashes and absolute installation paths. `upstream-model-hashes.json` pins repository revisions and upstream hashes; `checksum-verification.json` confirms all three weights and the PyTorch wheel match. Temporary range files were removed after verification. Download-only helper libraries/cache were also removed; no optional model families were installed.

Installed PyTorch 2.11.0+cu128 into the isolated Python 3.12 environment. Official wheel SHA-256 `7c78215c3af4f62e63f2b2e360f1722fc719b0853c7ac22666483d9810613a4c` verified against the official PyTorch package index. CUDA 12.8 initialized on driver 560.94 and a 256×256 CUDA matrix multiplication succeeded; the separate full inference result is recorded above.

The isolated runtime requirements omit the unrelated workflow-gallery media packages and embedded documentation. The selected original workflow is already saved locally; these packages are not inference dependencies. All required core inference packages are installed separately. No optional model families are downloaded.

Startup dependency resolution: `ImageScaleToTotalPixels` additionally imports Kornia; installed `kornia==0.8.3` and `kornia-rs==0.1.14`. `pip check` passes. Matching `torchvision==0.26.0+cu128` and `torchaudio==2.11.0+cu128` installed from the official PyTorch index. Full package versions: `external/klein-validation/installed-packages.txt`.

Compatibility preflight: service 8190 starts, DynamicVRAM is enabled, and all 18 distinct node types used by the 19-node baseline are registered (`node-check.json`). Required-input schema checks pass (`input-schema-check.json`). Both untouched original and local test-copy JSON opened in the browser. After model downloads and refresh, the missing-model errors disappeared; the API submission returned `node_errors: {}`.

Nonfatal startup limitations: optional upscale-model/GLSL modules are absent (`spandrel`/`comfy-angle` not required by this graph); optional template gallery and embedded docs are absent. This core's optimized comfy-kitchen CUDA backend requires CUDA 13 and is disabled with CUDA 12.8; eager PyTorch backend remains available. Do not assume optimized performance. No driver upgrade attempted.

## Reproduce the isolated setup

From `<project>/external\klein-validation\ComfyUI`:

```powershell
& '..\.venv\Scripts\python.exe' main.py --listen 127.0.0.1 --port 8190 --disable-auto-launch --disable-api-nodes --disable-all-custom-nodes --fast-disk --reserve-vram 1
```

Open `http://127.0.0.1:8190`, use Ctrl+O to open `baseline_workflow.json` from its parent directory. All required weights are now installed and checksum-verified. `original_workflow.json` preserves both official examples; the baseline copy contains only the single-reference branch. Running it again would be a new generation; this task stopped after the first successful result.

The baseline runner operates directly on the isolated ComfyUI API, records a prompt ID/history and one saved-image output, and never touches CreativeFlow's database or providers. It does not request automatic refinement or external scoring.

## Validation and exact file scope

Passed: runtime CUDA smoke check, `pip check`, Python syntax checks for the four setup/test scripts, model checksums, original-workflow/reference-copy integrity, required-node/input checks, browser workflow loading, and one real end-to-end ComfyUI execution with a readable saved PNG. PNG-embedded node types/inputs exactly match the submitted graph; ComfyUI's added `LoadImage.is_changed` hash matches the original shoe file.

Application source, `.env`, provider configuration, workflow routing, database and campaign versions are unchanged. `npm run lint`, `npm run typecheck`, `npm test` and `npm run build` were **not run**: this task affects only isolated ComfyUI setup, validation artifacts and documentation, as allowed by the task. No paid Vision calls, CreativeFlow integration, driver upgrade or benchmark batch.

Created/updated documentation: `docs/klein-workflow-validation.md`.

Exact retained top-level files under `external/klein-validation/`:

```text
.gitignore
original_workflow.json
baseline_workflow.json
baseline_api.json
prepare_baseline.py
run_baseline.py
download_models.py
verify_downloads.py
core-requirements.txt
installed-packages.txt
upstream-model-hashes.json
torch-wheel-access.json
installed-models.json
downloaded-wheel.json
checksum-verification.json
node-check.json
input-schema-check.json
runtime-smoke.json
reference-integrity.json
artifact-hashes.json
old-service-cache-release.json
download-cleanup.json
submission.json
history.json
result.json
server-initial.log
server.log
```

Installed/generated directories under the same root: `ComfyUI/` (official pinned checkout, three weights listed above, its local runtime state, unchanged input copy `input/klein_shoes_reference.jpg`, and the single output `output/klein_baseline_shoes_00001_.png`); `.venv/` (versions recorded in `installed-packages.txt`); `wheels/` (official torch, torchvision and torchaudio wheels); `__pycache__/` (script syntax-check cache). Existing `external/public-workflow-audit/` artifacts and the old D-drive ComfyUI checkout were not modified.
