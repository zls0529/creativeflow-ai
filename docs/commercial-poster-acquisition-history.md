# Commercial Poster v1 — Liblib acquisition research

Status: **Fanhe rejected; replacement acquisition audit completed; not integrated or registered**.

Latest: see [replacement dependency audit](commercial-poster-replacement-audit.md). No qualifying Liblib candidate was found in the bounded search. Three official public templates passed acquisition checks; Klein 4B Distilled is the sole recommendation for a future local baseline, with a local ComfyUI core-node compatibility blocker. No large model downloads or runtime changes were made.

## Fanhe source inspection and blocking dependency

Preserved the user's second download byte-for-byte at `external/liblib/fanhe-light-shadow/original_workflow.json` (776,484 bytes). SHA-256: `d98332862e3cb9073895de380bf5c5482d65f7d315b580ba97c73403f8d53ab1`. This is a UI workflow, not an API prompt. It contains ten named groups covering Kontext, Klein and Qwen variants. The default active generation branch is Kontext 5.0; other generation branches are bypassed. It uses reference latents, BiRefNet mask processing and high-frequency detail restoration, which must be preserved in any faithful adaptation.

The essential strength-1 LoRA at node #11 is `F.1 Kontext 产品电商场景合成光影融合全能溶图产品打光_5.0全能版`. Found the original author's exact [5.0 model page](https://www.liblib.art/modelinfo/59aa388df3434d24a25ea817db5e31d4?versionUuid=6382678e89074ac2b270c6c049294a8c). It shows no download control, download count unavailable, and an author response dated 2026-05-25 explicitly declining to open downloads. Therefore account login and workflow JSON access do not supply the required model weights. No local filename, weight size or authorized local distribution URL can be verified. No author contact, payment or cloud generation was initiated.

### Default-branch dependency inventory (blocked, not installation-ready)

| Dependency | Original reference / source | Required | Local status / destination | Size |
| --- | --- | --- | --- | --- |
| Kontext diffusion model | UI alias `F.1 Kontext dev_fp8`; embedded model metadata identifies [flux1-dev-kontext_fp8_scaled.safetensors](https://huggingface.co/Comfy-Org/flux1-kontext-dev_ComfyUI/blob/main/split_files/diffusion_models/flux1-dev-kontext_fp8_scaled.safetensors) | Yes | Missing; `models/diffusion_models/` | Not fetched/verified |
| Author fusion LoRA | Exact 5.0 alias and original page above; physical filename unavailable | Yes, strength 1 | Missing; intended `models/loras/`; distribution blocked | Unknown |
| CLIP-L | UI alias `clip_l`; embedded metadata `clip_l.safetensors`, comfyanonymous/flux_text_encoders | Yes | Existing `models/clip/clip_l.safetensors`; identity/hash compatibility not yet verified | 246,144,152 bytes local |
| T5 | UI alias `t5xxl_fp8_e4m3fn`; metadata instead names `t5xxl_fp8_e4m3fn_scaled.safetensors` from comfyanonymous/flux_text_encoders | Yes | Unscaled-name file exists in `models/clip/`; exact intended variant unresolved, no silent substitution | 4,893,934,904 bytes local file |
| VAE | UI `ae.sft`; embedded metadata `ae.safetensors` from Comfy-Org/Lumina_Image_2.0_Repackaged/split_files/vae | Yes | Alias-to-file compatibility needs verification before install | Unverified |
| Segmentation | `BiRefNet-general-epoch_244.pth`, BiRefNetUltraV2 with VITMatte selected | Yes | Exact source/model compatibility unresolved | Unverified |
| Optional LoRAs | Sharpness repair, colour consistency and Qwen 3D character LoRAs, all strength 0 in active branch | No effect at saved weights | Do not download unrelated weights; verify loader short-circuit during adaptation | Not applicable |
| Custom nodes | LayerStyle: HLFrequencyDetailRestore, ImageMaskScaleAs, ImageScaleByAspectRatio V2, MaskGrow, BiRefNetUltraV2/LoadBiRefNetModel; ImpactInt; rgthree labels/comparer/group bypass UI | Processing nodes required; UI helpers not inference stages | LayerStyle, Impact-Pack and rgthree directories present; runtime compatibility not yet proven | Existing installations |

No explicit ControlNet or IP-Adapter is required by the default branch. Core UNET/CLIP/VAE/KSampler/ReferenceLatent nodes still need runtime availability verification. Other suite branches are not being installed. The original sampler is 30 steps, CFG 1, Euler/simple, guidance 3. A connected size integer is 2048: do not blindly run this on 12 GB. Offloading and a smaller initial resolution would need assessment after weights are available; no hardware changes or baseline run have occurred.

Acquisition is paused at the author's model distribution restriction, as requested. Proceed only with an authorized copy/local-use permission or an explicitly communicated return to candidate selection. No runtime changes, experimental registry entry, benchmark, paid Vision call, or validation-suite run has occurred at this documentation/source-artifact checkpoint.

## Downloaded source inspection

The user downloaded the Xiao workflow through Liblib. Preserved byte-for-byte at `external/liblib/xiao-product-scene/original_workflow.json` (50,781 bytes), SHA-256 `74b10014ab5fd4a3f448c9ebf20aba93c77f43b7e439b15f8952c70fa87c4bcb`.

The 32-node UI graph directly connects `LoadImage` #29 → aspect-ratio resize #33 → `GeminiImage2Node` #109 → `SaveImage` #16. Node #109 selects `gemini-3.1-flash-image-preview`, 2K, IMAGE output. Prompt text #115 feeds a repeater #111 controlled by integer #112 (2). Thus the main generator is Gemini, not a local diffusion checkpoint. No service execution or image upload was performed.

The separate SeedVR2 tiling/upscale branch is saved in mode 4 (bypass), including loaders for `seedvr2_ema_7b_sharp_fp16.safetensors` and `ema_vae_fp16.safetensors`. These are not substitutes for the main generator and were not downloaded. No local baseline is appropriate for this candidate: replacing Gemini would materially redesign the author's graph. Candidate rejected for the local-reproduction objective.

The user was informed before moving to the previously compared Fanhe light/shadow fusion suite. Its signed-in page exposes 319 nodes with local UNET/VAE/CLIP/LoRA/sampler nodes, Qwen edit encoding, reference latents and segmentation/detail-restoration utilities. Exact model files and feasible active branch remain unknown until JSON inspection. Official Download click again produced no observable file or dialog; do not extract the embedded preview URL as a workaround. Source is the Fanhe link in the comparison table below. No dependencies installed.

## Signed-in follow-up

The user signed in. The selected page now exposes a 32-node preview and a normal Download button (51.63 KB), alongside a promotional discount badge. Clicking the official button produced neither an observable file nor a purchase/error dialog. Membership entitlement and any additional payment requirement therefore remain unconfirmed; no purchase was attempted.

Newly visible node types include `GeminiImage2Node`, `SeedVR2VideoUpscaler`, `SeedVR2LoadVAEModel`, `SeedVR2LoadDiTModel`, TTP tiling/assembly, image scaling and prompt text nodes. This raises a material concern that the main image generation uses an external Gemini service, followed by local upscaling. That is an inference from node names, not a verified graph trace. Obtain the JSON through the normal download flow before deciding; do not install dependencies or claim pure local generation. If external generation is confirmed, this candidate should be rejected for the local reproduction objective and the user informed before moving to the next candidate.
Observed 2026-09-19 using Liblib's public pages in the built-in browser, signed out. No workflow/model was downloaded, no dependency installed, no generation or paid Vision call performed. Existing workflows and routing are unchanged.

## Candidate comparison

The following five candidates were compared before attempting any download. Descriptions and license labels below are page claims, not independently verified quality or legal conclusions. Unknown dependencies are deliberately not inferred from promotional titles.

| Candidate / source | Use case and visible examples | Dependencies and complexity | Access and API suitability | Decision |
| --- | --- | --- | --- | --- |
| [Qwen-Klein全套全能电商万物光影融合人像溶图产品打光合成自动生成阴影融图重打光背景合成海报 — 饭盒](https://www.liblib.art/modelinfo/19df6b8dafd742528994206214c136be?versionUuid=cce16fa9c2b34d1e8ac5095d72cc307e) | Relighting/fusion suite; polished warm food still-life cover, also portrait examples. Product fidelity and copy space not established. | Qwen/Klein families named; LoRA weight 0.6–1.5. Exact checkpoint, LoRA, ControlNet and nodes unknown. 608.55 KB workflow; multi-version suite suggests integration complexity, not a measured node count. VRAM unknown. | Member download; generated content labelled members-only commercial use. Hosted API advertised. Local export/automation needs JSON inspection. Selected version shows 79.4k runs / 256 downloads. Points, additional purchase or author approval unknown. | Established usage, but primarily fusion and dependency opacity; not first acquisition choice. |
| [Kontext-Klein-Qwen2511全套最新电商角度自适应自动纠正透视场景产品溶图海报合成 — 饭盒](https://www.liblib.art/modelinfo/e34900f1c5a14da08cc7d6a4a92eef3e?versionUuid=93ec81c929fe48a4b0782d7206f3e72e) | Perspective adaptation and scene fusion for appliances/furniture/3C. Appliance scene examples; requires an already prepared product AND scene image. | Kontext/Klein/Qwen2511 suite, LoRA weight 1.0–1.5. Exact files/nodes/ControlNet unknown. 193.91 KB source. Multi-model complexity and VRAM unverified. | Member download and members-only commercial-use label; hosted API advertised. Selected version 4.4k runs / 93 downloads. Other gates unknown. | Requires external scene; author/comments acknowledge product-angle changes. Less aligned with complete scene generation. |
| [产品海报设计 — kop](https://www.liblib.art/modelinfo/f233f178ab1c4d93a2151489e90a5d52?versionUuid=313be0caf025430eba6c7e098e6be1dd) | Product relighting. Strong prominent red/white sneaker in neon wet street; busy background and little obvious copy space. | 18 nodes. Exposed types include CheckpointLoaderSimple, SegmentAnythingUltra V2, ICLightConditioning, LoadAndApplyICLightUnet, easy ipadapterApply, BackgroundScaler, DetailTransfer, rgthree comparer. Exact checkpoint/IP-Adapter/IC-Light files unknown; ControlNet/LoRA unconfirmed. Moderate graph complexity; potentially lighter family but no numeric VRAM estimate justified. | Ordinary Download 21.98 KB button; login need not tested. **Generated content explicitly noncommercial.** 98 runs / 29 downloads. Local API adaptation plausible but not verified. | Excluded for stated commercial-use restriction despite relevant shoe example. |
| [250126-新年海报 产品元素设计 — AI摄影师幻](https://www.liblib.art/modelinfo/038b180fc8794534a62930a2b06d2afc?versionUuid=e2601bc0ae4746afbca3d06214a2df38) | Co-brand/concept product redesign. White-background sofas with fruit-like materials. More product alteration than identity-preserving advertising. | 56 nodes; FluxGuidance, UNETLoader, DualCLIPLoader, StyleModelLoader/ApplyAdvanced, LoraLoaderModelOnly, Joy_caption_two, Zoe-DepthMapPreprocessor, KJ/rgthree/easy/ttN utilities. Exact files and ControlNet unknown. Higher complexity; FLUX-family inference from exposed nodes, precision/offload/VRAM unknown. | Ordinary Download 64.64 KB button; login need not tested. **Generated content explicitly noncommercial.** 26 runs / 19 downloads. Custom text/caption nodes need API review. | Excluded for use-case mismatch, identity alterations, license label and heavier graph. |
| [白底产品生成场景图 场景海报图 电商产品场景图全自动生成 上传产品-自动匹配场景 — 晓](https://www.liblib.art/modelinfo/03e1aa41f6a54adf827d0e116023701b?versionUuid=8728880c634a493b986676ee493bed76) | Product photo to automatic scene. Visible before/after brown handbag on warmly lit wooden desk; clear prominence, believable photographic environment, but busy props and limited proven copy space. Small previews cannot establish logo/seam fidelity. | Exact base checkpoint, LoRA filename, ControlNet and nodes not disclosed in visible description. Recommends Euler, 20–25 steps, CFG 3.5, LoRA 0.8–1.0, 1024×1500 or reverse. 51.63 KB advertised download; complexity/VRAM unknown. Page says workflow but file label says safetensors: actual downloaded format must be checked. | **Member download**, members-only commercial-use label. Hosted API advertised; does not prove local export suitability. 407 runs / 18 downloads. Additional points/payment/author gates unknown until authorized account access. | **First acquisition candidate, conditional on dependency and source inspection.** Best direct input-to-scene match, useful product before/after and photographic composition. Not claimed mature/validated merely from examples. |

## Selection and access blocker

Prioritize the fifth candidate for obtaining and inspecting its original source, not for unconditional installation. It matches the complete product-scene objective better than the two fusion suites, and avoids the two public candidates' explicit noncommercial labels. Dependency clarity, source format and RTX 4070 Super feasibility remain unresolved and can disqualify it after inspection.

The browser is signed out and the selected page explicitly shows **会员下载 (51.63KB)**. User sign-in/member access is required before proceeding. No purchase, point spend, cloud run, protected URL extraction or alternate mirror has been attempted. No exact price or required membership tier is visible. Do not buy membership based solely on this preliminary selection.

## Pending acquisition and dependency manifest

After the user resolves access, use the normal author download control. Preserve the original unchanged under `external/liblib/<author-workflow>/original_workflow.json` only if the downloaded file is in fact JSON. Inspect all nodes and exact model references before downloading dependencies. Record source URLs, exact filenames, sizes, destinations and installed status. Do not fill a manifest with guessed model names.

No original/adapted hash or version exists yet. No hardware adaptations have been made. The advertised 1024×1500 output alone does not establish 12 GB feasibility; inspect model precision, offloading, batch size and stages before selecting the minimum necessary adaptation.

## Pending implementation and validation

1. Inspect original, complete dependency manifest and review any missing custom-node source.
2. Establish local baseline without Vision; preserve author quality stages.
3. Only after successful execution add a separate parameterized `comfyui/workflows/commercial_poster_v1.json` and experimental registry entry, reusing current providers, jobs, readiness, version history and reproducibility boundaries.
4. Keep explicit selection and existing auto routing unchanged.
5. Run the existing commercial_poster fixture with at most 2–3 seeds; request explicit approval before any paid OpenAI Vision review.
6. Add offline integration tests, then run lint, typecheck, tests and build.

No benchmark has run. No runtime code was changed, so validation commands have not been rerun for this documentation-only checkpoint. This document is the only file created in the acquisition phase.
