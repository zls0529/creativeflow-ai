# Provider and workflow readiness

## Architecture and behavior

The server-only `lib/readiness.ts` reuses `openAIConfiguration`, the existing ComfyUI constructor, workflow selection, repository graph validators, reference loaders, and pose/IP-Adapter dependency validators. There is no second provider architecture. `ComfyUIProvider.readinessPlan` builds a validation-only graph from the existing templates, without uploading references, sampling, or queuing jobs. Generation templates, image settings, Vision scoring, brand rules and database schema are unchanged.

`POST /api/readiness` accepts campaign/asset context, optional refinement intent/conditioning strengths, and generation or brand-analysis purpose. It returns typed status, severity, explanations and remediation. Provider choices, URLs and secrets always come from the server environment, never the request body. Errors from unavailable dependencies become blocking report items.

Generate, Regenerate and Refine first open the compact, expandable readiness panel. Continue is disabled while checking or when blockers exist. The orchestrator independently checks again under the campaign lock before any agents run; a client cannot bypass this by directly calling the generation endpoint. Each actual image request is checked again before reserving a version or submitting an image job. A blocked initial attempt creates no agent/generation history; the lease is released. Existing history is retained if services fail later.

The same panel appears in Settings & providers and the Brand Intelligence analysis section. It runs on opening or context changes and on Recheck; there is no polling timer. Recheck sees newly started services and models once ComfyUI advertises them. A changed `.env` file still requires a server restart, consistent with the existing configuration lifecycle.

## Categories and confidence

| Category | What is checked | Status when successful |
|---|---|---|
| LLM / Vision | Provider allowlist, required key, model name, timeout settings, known incompatible Vision model prefixes | Configured for OpenAI; Ready for intentional mock |
| ComfyUI | Bounded, read-only GET `/object_info`, 5-second timeout, valid metadata | Ready |
| Checkpoint | Configured filename appears in loader model choices | Ready |
| Workflow | Selected repository template exists, graph structure passes existing validation, required nodes and advertised selections exist | Ready |
| OpenPose / ControlNet | Relevant stored pose image, nodes, configured SD1.5 model | Ready, or Not required |
| FaceDetailer | Required nodes and detector filename | Ready, or Not required |
| IP-Adapter / CLIP Vision | Relevant adapter/encoder nodes and models, supported conditioning modes | Ready, or Not required |
| References | Selected stored image bytes exist and pass the existing image validators | Ready, or Not required |
| Brand analysis | Existing LLM configuration; other providers unnecessary for this action | Configured; mock analysis warns that it extracts no rules |

Configured OpenAI credentials are **not authenticated** by readiness. Quota, model access, model capabilities beyond existing configuration validation, network reachability and successful paid inference are not tested. ComfyUI Ready means metadata and inputs were verified, not that an image was successfully generated.

## Blocking and campaign context

Unavailable required configuration, server, template, model, node or reference blocks execution. Informational and warning items do not. Missing Vision configuration blocks because the current campaign workflow requires Vision evaluation to finish; mock images plus real Vision also block because mock SVGs cannot be evaluated by the PNG Vision adapter. No provider silently falls back to mock.

Existing placement prompts use the same workflow selection as generation. Plain sports needs no pose input; auto sports with a pose reference becomes sports_pose. Product/style conditioning adds adapter checks to the selected base workflow. An unused pose, face or adapter dependency is Not required, even if that optional component is absent.

For new or missing placements, changed approved constraints, or refinement, final prompts may not exist yet. Auto checks basic/quality/sports candidates conservatively (including sports_pose when a pose input would be selected), and labels the plan provisional. This can require a dependency that the eventual prompt does not use. Selecting an explicit workflow is the predictable alternative. Actual per-image checks protect against later changes; they cannot undo LLM work already completed before an unexpected refined prompt or service outage.

## Security and limits

- Server-only provider inspection; API keys and raw environment objects are never returned.
- Readiness text redacts known environment secrets and local paths; model labels use safe filenames. Unsupported provider labels are not echoed, including in `/api/config`.
- Same-origin/local-host validation; no client-supplied service URL or environment override.
- No raw upstream bodies/errors in readiness responses or logs. Discovery redirects are rejected and its response body is limited to 16 MB.
- Discovery does not load model weights or test GPU memory, checkpoint architecture compatibility, OpenPose annotator weights/detection, or execution quality. These remain explicit nonblocking limitations.
- Readiness is a snapshot. Dependencies can become unavailable between checking and running.
- The local single-user application boundary remains unchanged; no authentication or cloud features were added.

## Verification (2026-09-18)

Saved sanitized results: `docs/readiness-verification.json`.

| Scenario | Result |
|---|---|
| A: existing Midnight Pulse hero, local services running | Can generate; auto resolved sports_pose. Checkpoint, face, pose and product-reference dependencies Ready. OpenAI LLM/Vision Configured. |
| B: same context, unreachable local URL substituted only in the check | Blocked, with connectivity and dependent verification explanations. Real ComfyUI was not stopped or reconfigured. |
| C: explicit sports_pose | Can generate; `control_v11p_sd15_openpose_fp16.safetensors` and required nodes recognized. |
| D: basic request without reference conditioning | Can generate; pose, FaceDetailer, IP-Adapter and reference inputs Not required. |

The local checkpoint advertised was `majicMIX realistic 麦橘写实_v7.safetensors`. Reference discovery confirmed `ip-adapter-plus_sd15.safetensors` and `CLIP-ViT-H-14-laion2B-s32B-b79_CLIP-ViT-H-14.safetensors`. No models were installed or changed.

Browser verification: Settings panel, Recheck with refreshed timestamp, collapsed status/details layout, and Midnight Pulse hero Regenerate opening preflight with Continue initially disabled and enabled only after readiness. Continue was not clicked; no image or paid OpenAI request occurred.

Automated tests cover ready/offline/timeout/malformed metadata, optional-only unrelated nodes, checkpoint/detector/ControlNet/adapter/encoder absence, sports vs sports_pose, stored references, mock behavior, missing configuration, warnings vs blockers, missing templates, endpoint sanitization and orchestrator blocking before agents/history/version reservation. All network responses in automated readiness tests are mocked.

Final validation: `npm run lint`, `npm run typecheck`, `npm test` (120 passing), and `npm run build` all passed. The build retains the existing Node experimental JSON-module warning. On Windows, database tests and Prisma generation must run sequentially to avoid a temporary locked engine DLL; the final build ran after the tests finished.

Reproduce the four local checks from the repository root:

```powershell
node --env-file=.env --import tsx --conditions=react-server scripts/verify-readiness.ts
```

This script permits only read-only loopback `/object_info` requests. Its optional argument is an existing campaign ID with a hero asset and stored pose reference.

## Exact task file list

New:

- `types/readiness.ts`
- `lib/readiness.ts`
- `app/api/readiness/route.ts`
- `components/campaign/provider-readiness.tsx`
- `tests/readiness.test.ts`
- `scripts/verify-readiness.ts`
- `docs/readiness-verification.json`
- `docs/provider-readiness.md`

Updated:

- `lib/providers/openai/responses.ts` — injectable environment for shared configuration validation.
- `lib/providers/image/comfyui.ts` — read-only requirements and template/dependency plan.
- `lib/agents/orchestrator.ts` — mandatory server preflight and per-image guard.
- `app/api/campaigns/[id]/run/route.ts` — structured readiness failures in the existing stream.
- `app/api/campaigns/[id]/brand/route.ts` — configuration preflight before material analysis.
- `app/api/config/route.ts` — safe allowlisted provider labels.
- `components/campaign/workspace.tsx` — generation gate and settings panel integration.
- `components/campaign/brand-intelligence.tsx` — analysis readiness section.
- `app/globals.css` — compact panel styles.
- `package.json` — include readiness tests in the existing test command.
