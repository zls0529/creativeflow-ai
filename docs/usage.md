# Usage and estimated costs

## Architecture

The existing Responses API adapter, ComfyUI provider, mock providers, campaign lock, durable jobs/attempts, generation versions and refinement loop are reused. No prompts, workflow templates, image sampling settings, Vision scoring or refinement decisions were changed by usage instrumentation.

`withUsageScope` carries campaign/asset/generation context through asynchronous calls. The existing job execution context supplies job ID and attempt number (the existing unique job/attempt pair). `measure` creates one durable pending event immediately before a provider call and finalizes it once. OpenAI text and Vision share the existing `structuredResponse` boundary, so a Vision call creates only one event. ComfyUI has one event per generation invocation, not one event per HTTP poll or detail node. Mock providers record diagnostics explicitly labeled mock.

Routes for brand material analysis, brand conflict checks and standalone Vision compliance reviews already use the campaign lock, which now supplies the same usage scope. Initial prompt calls are linked to reserved asset IDs. Image and Vision calls are linked to their generation IDs. Prompt refinement is linked to its **source** generation; the subsequent image/Vision events belong to the resulting generation. Campaign/job/asset summaries include every recorded version, including unsuccessful calls and earlier refinement iterations.

Direct adapter calls outside a campaign scope (for example unit tests or ad hoc external scripts) do not persist orphan events. Integration scripts must use `withUsageScope({campaignId}, work)` or the existing campaign/job entry points.

## Persistent model and privacy

`UsageEvent` has: ID, campaign FK, job ID, attempt number, asset ID, generation ID, refinement index, provider, category, model, operation, timestamp, status, duration, input/output/cached/total tokens, nullable estimated USD cost, pricing snapshot and whitelisted operational metadata. Campaign deletion cascades to usage. Job/asset/generation associations remain historical identifiers.

Statuses are `pending`, `success`, `failed`. A pending row after a worker interruption means the external outcome/cost is unknown; it is never assumed free. The original durable job recovery still controls retries. This cannot guarantee exactly-once external inference or recover usage lost when a process crashes between remote completion and local persistence.

No prompts, images, response text, raw provider error messages, headers, keys or environment dumps are stored in usage. Only allowlisted counters and metadata are extracted from responses. Model/checkpoint/detail labels redact secret-like content and configured secret values. The usage API returns only these usage rows, not provider configuration or job payloads. Existing sanitized job errors continue to explain failures.

## Authoritative OpenAI usage and pricing

The Responses API `usage.input_tokens`, `output_tokens`, `input_tokens_details.cached_tokens` and `total_tokens` are captured before structured/domain validation. Refusal, incomplete responses and malformed structured output can therefore still have paid usage. HTTP failures retain usage if actually returned; network errors and absent/malformed counters remain null. No tokenizer or invented token counts are used.

Standard USD estimate:

`((input − cached) × inputPerMillion + cached × cachedInputPerMillion + output × outputPerMillion) / 1,000,000`

Cached tokens are already included in input tokens and are not added again. Missing cache/input/output counters, unknown model prices, inconsistent cached counts or nonstandard service tiers yield unavailable monetary cost. Reported total tokens are preserved rather than synthesized. Vision uses the same authoritative tokens, including the provider's image-token accounting, with no extra fabricated image charge.

Registry: `lib/usage/pricing.ts`; version `openai-standard-2026-09-19`. Standard rates per million tokens:

| Model / exact dated alias | Input | Cached input | Output |
| --- | ---: | ---: | ---: |
| gpt-4.1-mini / gpt-4.1-mini-2025-04-14 | $0.40 | $0.10 | $1.60 |
| gpt-4.1 / gpt-4.1-2025-04-14 | $2.00 | $0.50 | $8.00 |

Verified from the official [GPT-4.1 mini](https://developers.openai.com/api/docs/models/gpt-4.1-mini) and [GPT-4.1](https://developers.openai.com/api/docs/models/gpt-4.1) pages. Usage fields follow the official [Responses API reference](https://developers.openai.com/api/reference/cli/resources/responses/methods/create). No runtime web pricing lookup occurs.

Update the server registry and version after checking official pricing, or configure a JSON override in `.env`, then restart both web and worker:

```dotenv
OPENAI_PRICING_JSON='{"my-model":{"inputPerMillion":1,"cachedInputPerMillion":0.25,"outputPerMillion":4}}'
```

Overrides are validated finite nonnegative rates and merged by exact model name. Configure the returned dated model name too when the API resolves an alias to a snapshot. Every event stores the numeric rates and registry version used. Editing the registry does not reprice existing events. Unknown models remain unpriced. Estimates exclude special negotiated rates, taxes, tools, nonstandard tiers and billing adjustments; they are not invoices.

## Local ComfyUI

Metadata includes selected workflow, checkpoint, output dimensions, planned/completed image refinement passes and existing detail-pass observations. Count distinguishes attempts from successful generations. `durationMs` measures the complete provider invocation, including uploading, queue wait, polling, processing, retrieval and storage. **It is not measured GPU execution time.**

Default display: **Local GPU / not monetized**. No default electricity or GPU charge exists. Optional:

```dotenv
LOCAL_GPU_COST_PER_HOUR=
```

A configured rate estimates `provider wall-clock hours × rate`, including failed-call elapsed time. The rate and time basis are snapshotted. This is a user-defined approximation, not metered GPU utilization. Local estimates are separate from estimated API cost. Mock calls are visibly labeled mock and contribute $0, never paid API usage.

## Soft guardrails

```dotenv
MAX_CAMPAIGN_API_COST_USD=
MAX_JOB_API_COST_USD=
```

Blank disables the relevant limit; zero prevents the next paid call. Before another paid OpenAI call, accumulated recorded API estimates are checked across the campaign/job, including retries and failed calls. A reached limit raises a clear `UsageLimitError` and durable jobs fail with `cost_limit`. Unknown prior API costs or missing next-model prices block conservatively when a relevant limit is configured. Invalid numeric settings fail explicitly. Mock/local calls are not subject to API budgets.

These are **soft accumulated-cost limits**, not reserved-spend ceilings: exact next-call tokens are unknown, so one in-flight call can cross a limit. No output caps or prompt changes were introduced to alter generation quality. Historical unrecorded calls are outside the known sum. Interrupted pending calls conservatively block further paid calls with a configured budget until the user reviews and resolves their cost situation (for example disabling a soft guardrail knowingly); this release does not offer a cost-reconciliation editor.

## UI and export

- Campaign usage: compact expandable metadata above workflow activity.
- Job usage and individual attempt usage: inside the existing job cards/history.
- Asset usage (all versions) and Version usage: expandable sections beside version/refinement history.
- Settings & providers: workspace totals, provider/category/model breakdown and recent 100 calls; current campaign panel also available.
- Refresh usage fetches persisted data; open campaign/job panels also update when parent activity changes.
- `GET /api/usage` supports campaignId, jobId, attempt, assetId, generationId; attempt requires jobId. Totals use all matching rows, not just recent 100.
- `&export=json` exports every matching event, snapshots and explicit nulls. The UI provides this download directly.

No events => **Not recorded**. Mixed histories flag unrecorded earlier versions. Partial known API estimates show the number of unpriced calls. Token sums include only reported counters and do not imply unavailable calls consumed zero. All monetary values are labeled **Estimated**.

## Setup, testing and manual verification

Stop the local web/worker before Prisma generation on Windows, back up `prisma/dev.db`, then run `npx prisma db push`. The additive table preserves existing records. This implementation backed up `prisma/pre-usage-backup.db`; `docs/usage-history-integrity.json` records comparison of the original 6 campaigns / 56 generations.

Automated tests never call paid OpenAI or live ComfyUI. They cover actual LLM/Vision adapters with mocked Responses, cache accounting, unknown pricing, failure usage, missing usage, service tiers, local duration/rates, mock $0, job/attempt aggregation, a complete two-version refinement loop, guardrails, pending calls, context isolation, export and secret exclusion. Existing workflow tests remain intact.

Manual live helper (requires an existing campaign with a reviewed product asset):

```powershell
node --env-file=.env --import tsx --conditions=react-server scripts/verify-usage.ts --live CAMPAIGN_ID
```

This makes one product refinement job with process-local `MAX_REFINEMENTS=0`, preserves all previous versions, checks readiness first, verifies token records and local duration, checks aggregation and secret exclusion, and saves `docs/usage-verification.json`. It uses paid APIs; do not repeatedly run it just to refresh the UI. If readiness blocks, no paid call is made. Open the job and campaign usage panels afterward, compare events and exported totals. See the verification report for actual execution results.

### Verification results

`npm run lint`, `npm run typecheck`, `npm test` (**153 passing**) and `npm run build` passed. The existing Node experimental JSON-module warning remains; no dependency update was performed.

After explicit user approval, live job `7f5934a8-2234-42d8-ba1a-c4018ac08827` completed on **Tidal Field — OpenAI verification / Product image V3**. Initial readiness correctly prevented paid calls while ComfyUI was offline. The existing local installation was started; no model was installed. The single approved job then made exactly three recorded calls:

| Operation | Model / workflow | Input | Output | Estimated API USD / local duration |
| --- | --- | ---: | ---: | ---: |
| Prompt refinement | gpt-4.1-mini-2025-04-14 | 1,717 | 473 | $0.0014436 |
| Image generation | ComfyUI basic, 1024×1024 | — | — | 12.160 seconds, not monetized |
| Vision review | gpt-4.1-2025-04-14 | 3,052 | 1,194 | $0.015656 |
| Total API | 2 real API calls | 4,769 | 1,667 | **$0.0170996 estimated** |

Cached tokens reported: 0; total API tokens: 6,436. One human-requested refinement was included; additional automatic refinements were disabled only for this verification process. No paid verification calls were repeated. The resulting image has Vision findings requiring human review (42/100); this is not a claim of quality improvement.

The helper checked campaign/event aggregation, preserved prior versions and excluded the API key from the export. A subsequent secret-exclusion check scanned 34 browser bundle files and the HTTP 200 usage JSON export (3 events); the configured API key was absent from both. Browser checks confirmed matching campaign/job/attempt/workspace totals, separate Vision/text/local breakdowns, version-specific records and unrecorded older history. Automated mock refinement verified 32 exactly-once diagnostics across five assets/two versions, all $0 and none paid. Details are in `docs/usage-verification.json` and `docs/usage-history-integrity.json`.

## Limitations

Single-user local observability, no billing system. Aggregation is an in-process scan appropriate to this MVP; very large histories would benefit from database-side aggregates/pagination. No exact cost preview, electricity telemetry, external billing reconciliation or remote inference reconciliation is claimed. Provider invocations without campaign context are not persisted. A provider call can succeed while a subsequent output-save/job fence fails; the event reflects the provider call, not the overall job result.

## Files changed

1. `prisma/schema.prisma`
2. `lib/usage/pricing.ts`
3. `lib/usage/capture.ts`
4. `lib/usage/report.ts`
5. `types/usage.ts`
6. `lib/providers/openai/responses.ts`
7. `lib/providers/image/comfyui.ts`
8. `lib/providers/llm/mock.ts`
9. `lib/providers/vision/mock.ts`
10. `lib/providers/image/mock.ts`
11. `lib/agents/orchestrator.ts`
12. `lib/jobs/executor.ts`
13. `app/api/campaigns/[id]/brand/route.ts`
14. `app/api/usage/route.ts`
15. `components/campaign/usage-panel.tsx`
16. `components/campaign/workspace.tsx`
17. `components/campaign/job-status.tsx`
18. `app/globals.css`
19. `.env.example`
20. `package.json`
21. `tests/usage.test.ts`
22. `scripts/verify-usage.ts`
23. `docs/usage.md`
24. `docs/usage-history-integrity.json`
25. `docs/usage-verification.json` (live result, when completed)
26. `README.md`

Generated Prisma client/build files, the database and backup are local runtime artifacts. No `.env` secrets/settings were edited.
