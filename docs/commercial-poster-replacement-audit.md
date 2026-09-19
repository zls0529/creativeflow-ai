# Commercial poster replacement audit

Date: 2026-09-19. Scope: candidate selection and dependency availability, not integration or generation.

## Result

No qualifying Liblib workflow was found in this bounded search. This is not a claim that none exists anywhere on Liblib. After explicitly reporting the source change, three official public ComfyUI templates were audited. Recommend **FLUX.2 Klein 4B Distilled Image Edit** for the next local baseline. It passes acquisition availability, not runtime or poster-quality validation. It is an official general image-editing workflow with product-reference examples, not a proven complete commercial-poster production system.

The previous Fanhe candidate is rejected and will not be integrated. No private LoRA was removed or substituted.

## Liblib screening: rejected before shortlist

Existing search: 商品海报, workflow filter, signed-in public page inspection. Three additional entries were inspected alongside the five previously compared:

| Entry | Export | Critical dependency / suitability failure | Result |
| --- | --- | --- | --- |
| [Homer — 展示产品更换](https://www.liblib.art/modelinfo/eba93ca1ceaf4d71936048bf6ab4a586?versionUuid=e8aeed3193b241909069e0fb4dcb5d9f) | Download button, 6.45 KB, 8 nodes | `FluxKontextProImageNode` plus `LibLibTranslate`; cloud-service graph rather than a publicly downloadable local checkpoint chain. Reposted from Chuck. | Reject; do not substitute Dev for Pro and claim reproduction. |
| [范特西 — 一键生成产品海报](https://www.liblib.art/modelinfo/fe49d2204c0d48f892b404c746867f98?versionUuid=83f29c546f4c450883e4ef29c420b76c) | Download button, 14.39 KB, 11 nodes | Explicit noncommercial output label; text-to-image graph without a visible reference-image input; required LoRA/checkpoint not identified on page. | Reject; incomplete dependency evidence and use-case mismatch. |
| [迷落之境 — miluo丨自然光感美妆-多场景](https://www.liblib.art/modelinfo/e31915b8d481470daea6f5a710db017d?versionUuid=d88249c97ece4ffdb13c5d7ceb648d0e) | Download button, 19.87 KB, 30 nodes | Explicit noncommercial output label; checkpoint/LoRA unspecified; listed nodes do not establish uploaded product conditioning. | Reject; no fully verified chain. |

Once a disqualifying issue was found, remaining unknowns were not represented as verified. No files or model weights were acquired from these three entries. Prior rejected cases: Xiao uses Gemini for main generation; Fanhe requires a non-downloadable LoRA; kop and AI摄影师幻 have noncommercial output labels.

## Three public replacements: acquisition audit passed

All three JSON templates were downloaded directly from `Comfy-Org/workflow_templates`, parsed locally including subgraph nodes, and preserved under `external/public-workflow-audit/`. Every model URL extracted from those graphs was checked with an unauthenticated HTTP HEAD request: **200**, with byte lengths recorded in `model-access.json` and `klein-model-access.json`. No weights downloaded. HEAD establishes availability at audit time, not checksum integrity or execution compatibility.

| Candidate | Product support / visual rationale | Required model files (decimal GB) | LoRA / ControlNet / IP-Adapter | Nodes / gates | 4070 Super assessment |
| --- | --- | --- | --- | --- | --- |
| [Official Klein 4B Distilled Image Edit](https://docs.comfy.org/tutorials/flux/flux-2-klein) | Multi-reference editing; official example uses handbag plus logo. Most directly useful product-reference example of these three. Copy-space and exact shoe fidelity untested. | `flux-2-klein-4b-fp8.safetensors` 4.071; `qwen_3_4b.safetensors` 8.045; `flux2-vae.safetensors` 0.336. Total 12.452 GB disk. | None required, confirmed from graph. | Core nodes only; public source. All three weight URLs return 200 without credentials. No membership, points, private model or paid API needed for acquisition. BFL model card labels 4B Apache-2.0. | Best relative fit; encoder offload likely needed. Comfy docs cite 8.4 GB distilled benchmark, BFL card says ~13 GB: different setups, not a local guarantee. |
| [Official Flux Kontext Dev](https://docs.comfy.org/tutorials/flux/flux-1-kontext-dev) | Reference-latent image editing with object/style preservation; no author fusion LoRA. Official generic editing baseline, not equivalent to Fanhe's tuned output. | `flux1-dev-kontext_fp8_scaled.safetensors` 11.905; `clip_l.safetensors` 0.246; `t5xxl_fp8_e4m3fn_scaled.safetensors` 5.157; `ae.safetensors` 0.335. Total 17.643 GB disk. | None required. | Core nodes; public source and all model URLs 200. Model card has Flux Dev noncommercial model license; public download must not be conflated with unrestricted commercial deployment. | Model alone nearly fills 12 GB before activations. Requires offload assessment; slower/higher risk than Klein. |
| [Official Qwen Image Edit](https://docs.comfy.org/tutorials/image/qwen/qwen-image-edit) | Reference-image semantic/appearance editing and bilingual text editing. Useful for packaging/text; no evidence here that it beats the others on this shoe. | `qwen_image_edit_fp8_e4m3fn.safetensors` 20.431; `qwen_2.5_vl_7b_fp8_scaled.safetensors` 9.385; `qwen_image_vae.safetensors` 0.254. Optional template acceleration LoRA 0.850. Total with LoRA 30.919 GB disk. | Template offers public `Qwen-Image-Edit-Lightning-4steps-V1.0-bf16.safetensors`; audited even though acceleration is optional. No ControlNet/IP-Adapter. | Core nodes; all model URLs 200. Qwen model card Apache-2.0. No creator-private/member/points acquisition gate found. | Largest offload burden, poor first choice for 12 GB. No claim of resident VRAM fit. |

### Exact sources and destinations

Full resolved URLs and byte lengths are in the adjacent machine-readable audit files. Sources:

- Klein diffusion: [BFL original FP8 repository](https://huggingface.co/black-forest-labs/FLUX.2-klein-4b-fp8); destination `models/diffusion_models/flux-2-klein-4b-fp8.safetensors`.
- Klein encoder: [Comfy-Org z_image_turbo](https://huggingface.co/Comfy-Org/z_image_turbo/tree/main/split_files/text_encoders); destination `models/text_encoders/qwen_3_4b.safetensors`.
- Klein VAE: [Comfy-Org flux2-dev](https://huggingface.co/Comfy-Org/flux2-dev/tree/main/split_files/vae); destination `models/vae/flux2-vae.safetensors`.
- Kontext diffusion: [Comfy-Org approved-format repository](https://huggingface.co/Comfy-Org/flux1-kontext-dev_ComfyUI); destination `models/diffusion_models/`.
- Kontext encoders: [comfyanonymous/flux_text_encoders](https://huggingface.co/comfyanonymous/flux_text_encoders); destination `models/text_encoders/`.
- Kontext VAE: [template-specified Comfy-Org repository](https://huggingface.co/Comfy-Org/Lumina_Image_2.0_Repackaged/tree/main/split_files/vae); destination `models/vae/`.
- Qwen diffusion: [Comfy-Org/Qwen-Image-Edit_ComfyUI](https://huggingface.co/Comfy-Org/Qwen-Image-Edit_ComfyUI); encoder/VAE: [Comfy-Org/Qwen-Image_ComfyUI](https://huggingface.co/Comfy-Org/Qwen-Image_ComfyUI). Destinations `models/diffusion_models/`, `models/text_encoders/`, `models/vae/`.
- Qwen optional LoRA: [original lightx2v repository](https://huggingface.co/lightx2v/Qwen-Image-Lightning); destination `models/loras/`.
- All shortlisted execution nodes: [public ComfyUI core source](https://github.com/Comfy-Org/ComfyUI). No third-party custom-node install is required by these graphs. UI subgraphs must be compiled/exported to API form during integration, not sent as UI JSON directly to `/prompt`.

Local inventory found CLIP-L and an **unscaled-name** T5 FP8 file. The scaled T5 file required by the audited template is different; it was not marked installed by name similarity. Klein and Qwen required weights are absent. Download eligibility is based on verified public endpoints, not local presence.

## Runtime compatibility is a separate blocker

Read-only `/object_info` inspection of the running local ComfyUI found these required types missing:

- Klein: `EmptyFlux2LatentImage`, `Flux2Scheduler`, `GetImageSize`, `ReferenceLatent`.
- Kontext: `FluxKontextImageScale`, `ImageStitch`, `ReferenceLatent`.
- Qwen: `CFGNorm`, `ComfySwitchNode`, `PrimitiveBoolean`, `PrimitiveFloat`, `PrimitiveInt`, `TextEncodeQwenImageEdit`.

Their sources are public core, so this is a local version/import compatibility problem rather than a private dependency. Updating the shared ComfyUI install has not been attempted; existing workflows must be regression-checked before adopting an update. Source code accessibility is verified, execution readiness is not.

## Additional IC-Light investigation

The public Kijai `ic_light_example_02.png` was downloaded and its embedded graph extracted. It specifies `1_5/photon_v1.safetensors`, `iclight_sd15_fc.safetensors`, bundled checkpoint VAE, IC-Light and KJNodes; no LoRA/ControlNet/IP-Adapter. IC-Light weight endpoint returns 200 (1,719,148,312 bytes), and all listed custom node types are present locally. However the exact Photon checkpoint's trusted original distribution was not established; HF search found third-party uploads. **Not shortlisted**. The installed majicMIX checkpoint was not silently substituted. Its portrait-relighting example also does not demonstrate a complete commercial poster pipeline.

## Selected recommendation and limits

Recommend **only Klein 4B Distilled Image Edit** for subsequent baseline evaluation, because its public acquisition chain is complete, it has a product-reference example, no private tuning dependency, and the lowest model memory burden among the three admitted candidates. This is a public-source alternative recommendation under the user's fallback instruction, not a claim to have found three suitable Liblib workflows.

No direct quality ranking is justified without same-brief outputs. All three can regenerate product details; logo/sole fidelity and copy-space quality remain untested. No workflow has been registered as commercial_poster_v1, no global routing changed, no model downloaded, no installation, no generation or Vision call. Only source/audit artifacts and documentation changed; runtime lint/typecheck/test/build were not rerun for this research-only phase.

## Evidence files

- `external/public-workflow-audit/flux_kontext_dev_basic.json`
- `external/public-workflow-audit/image_qwen_image_edit.json`
- `external/public-workflow-audit/image_flux2_klein_image_edit_4b_distilled.json`
- `external/public-workflow-audit/model-access.json`
- `external/public-workflow-audit/klein-model-access.json`
- `external/public-workflow-audit/runtime-audit.json` (template SHA-256 and missing runtime nodes)
- `external/public-workflow-audit/ic_light_example_02.png`
- `external/public-workflow-audit/ic_light_example_02.json`
