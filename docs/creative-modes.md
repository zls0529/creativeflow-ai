# Creative Modes and use-case routing

## Delivered

Campaign creation now starts with six Creative Mode cards. Routing uses local metadata, never an LLM. The existing Director and Prompt Engineer receive concise mode intent, selected workflow contract and supported placements. No second agent architecture was added.

| Mode | Recommended registry workflow | Support |
| --- | --- | --- |
| Commercial Poster | commercial_poster_v1 1.0.0 | Experimental; Hero only, 880 × 592; one product required |
| Product Hero | product_hero_v1 1.0.0 | Experimental; five existing placements; one product required |
| Lifestyle Campaign | legacy_quality_v1 1.0.0 | Explicit legacy fallback; no dedicated professionally validated Lifestyle workflow |
| Sports Advertising | legacy_sports_pose_v1 with pose; legacy_sports_v1 otherwise | Legacy; missing pose dependencies block the selected pose route |
| Social Fast | legacy_basic_v1 1.0.0 | Legacy; lightweight concept generation |
| Custom / Advanced | Explicit compatible registered selection | Retains the selected workflow's registry maturity |

### Inputs and overrides

Mode selection shows required/optional inputs, current evidence and maturity. Advanced selection lists only executable registered workflows compatible with the current placement/reference contract. It records a reason. A per-job override does not rewrite the campaign's saved mode. Selecting Recommended clears the saved override for that job (`workflowOverride: null`); omitting this field keeps campaign defaults. Custom always requires a selection.

Poster requires exactly one product. Product Hero accepts one product and optional style, passed to its existing background-style input. Sports selects pose conditioning only when a pose reference is present. Unsupported pose inputs or multiple ambiguous references block incompatible legacy routes. Product-only workflows explicitly warn about unused pose; Poster explicitly warns that style conditioning is unsupported.

Commercial Poster creates only its supported Hero placement. Other modes retain five placements. Unsupported ratios are blocked rather than forced into the poster template. Explicit asset actions retain the selected asset's placement contract.

### Frozen routing, readiness and execution

Job creation recomputes routing server-side and ignores caller-supplied routing snapshots. Each placement records mode, recommended and selected workflow ID/version, reason, maturity, references, product source, warnings, blockers and override. Retries reuse this snapshot. A deleted frozen reference blocks execution. Dependencies becoming unavailable block execution, with instructions to fix the requirement or explicitly choose another mode/workflow.

Readiness dispatches to the existing Poster/Product Hero checks or checks the exact forced legacy workflow. It does not inspect unrelated auto candidates. Legacy automatic refinement may revise prompts but cannot change a frozen workflow. Old jobs/campaigns without mode metadata retain their existing auto behavior.

New special-workflow campaigns first use the existing orchestrator to prepare missing brand strategy and placement prompts, then call the existing durable Poster or Product Hero executor. Strategy-only preparation cannot call image generation or Vision. Poster retains its existing separate optional Vision-review behavior; Product Hero retains its existing reference-aware Vision review. Neither workflow template nor model settings changed.

### Metadata, history and usage

`Campaign.creativeConfig` is a nullable JSON selection field. Job payloads store routing; generation context stores its placement decision. Reproducibility and version comparison show mode and routing alongside actual recorded workflow evidence. Job details expose the frozen route. Usage groups by recorded mode/workflow and retains existing provider, cost and duration reporting.

Historical missing modes display **Not recorded**. Existing recorded workflow identifiers remain visible; no historic mode was inferred or backfilled. Mock execution remains identified as mock in actual provider/reproducibility fields; selecting a route is not evidence that a real workflow ran.

Settings adds a compact catalog with registry maturity, evidence and read-only dependency discovery. Poster evidence remains: three successful development generations, no OOM, consistent commercial composition, limited exact SKU fidelity. This is not production certification. Catalog discovery only establishes advertised dependencies; generation readiness also checks references, templates, extraction and agents.

## Verification

No live images, OpenAI calls, new models or workflow tuning were performed for this task.

Browser verification checked:

- New Campaign: Commercial Poster selected by default, experimental label, Hero-only limit and product-required message.
- Product Hero: product required, experimental label.
- Sports without pose: Sports selected.
- Custom: compatible Basic / Quality / Sports selection; changing to Quality updates selection.
- Settings: Poster and both Sports dependency chains advertised by the local servers.
- Midnight Pulse: all fourteen Hero versions accessible; campaign mode correctly shows Not recorded.

Read-only scenario verification used the existing Midnight Pulse Hero and saved product/pose references in memory. The campaign itself was not edited:

| Scenario | Selected workflow | Local readiness |
| --- | --- | --- |
| A: Commercial Poster | commercial_poster_v1 | Passed; no OpenPose check |
| B: Product Hero | product_hero_v1 | Passed; product/segmentation/background/Vision configuration |
| C: Sports with saved pose | legacy_sports_pose_v1 | Passed |
| D: Sports without pose | legacy_sports_v1 | Passed; no OpenPose check |
| E: Custom Quality | legacy_quality_v1 | Passed |

Re-run this read-only check with:

```powershell
node --env-file=.env --import tsx --conditions=react-server scripts/verify-creative-routing.ts
```

The script checks that generation and usage counts do not change. Readiness does not validate OpenAI authentication, quota, image quality or end-to-end execution.

Offline tests cover mode definitions, routing, missing dependencies, unsupported placement, overrides/reset, readiness, prompt context, historical compatibility, idempotent job snapshots, ignored caller routing, frozen provider choice, missing frozen references, and Hero-only strategy preparation. New tests never call image generation or external services. Existing test suites use their established mock fixtures.

Validation: lint, typecheck, full test suite (226 tests), and production build. The only build notice is the existing Node experimental JSON-module warning.

The local database was backed up to `prisma/pre-creative-modes-backup.db` before applying `prisma db push`. Comparison after verification confirmed the original Campaign (6), CampaignAsset (24), Generation (62), Upload (3), ExecutionJob (6) and UsageEvent (14) rows unchanged. Only the nullable schema field was added; disposable offline test records were removed by test cleanup.

## Limitations

- No new end-to-end paid/live generation was requested or used to certify this routing change.
- Poster remains experimental and Hero-only; exact product identity can drift. Product Hero remains experimental; seams, grounding and extraction need human review.
- Lifestyle remains legacy quality; Sports remains existing legacy workflows. No new dedicated workflows were introduced.
- Advanced choices cover the six registered generation adapters currently executable by the app, not segmentation helpers, repair-only graphs or arbitrary registry candidates.
- Existing saved strategy/prompts are reused when already present; this change does not rewrite historical creative direction. Mode intent applies when the existing agents produce new strategy/prompts.
- Required provider environment configuration still applies. Dependency readiness is not an authentication or quality test.
- Workflow templates, hashes, registry release states and existing benchmarks were not changed.

## Exact source files changed

New:

- `types/creative-mode.ts`
- `lib/workflows/creative-modes.ts`
- `lib/workflows/routing.ts`
- `lib/workflows/routing-readiness.ts`
- `lib/workflows/execute-routed.ts`
- `components/campaign/creative-mode-selection.tsx`
- `components/campaign/workflow-catalog.tsx`
- `app/api/workflows/catalog/route.ts`
- `tests/creative-modes.test.ts`
- `scripts/verify-creative-routing.ts`
- `docs/creative-modes.md`

Updated:

- `prisma/schema.prisma`
- `package.json`
- `types/campaign.ts`
- `types/refinement.ts`
- `types/jobs.ts`
- `types/usage.ts`
- `lib/database/campaigns.ts`
- `lib/agents/creative.ts`
- `lib/agents/orchestrator.ts`
- `lib/providers/image/base.ts`
- `lib/providers/image/comfyui.ts`
- `lib/jobs/context.ts`
- `lib/jobs/store.ts`
- `lib/jobs/executor.ts`
- `lib/readiness.ts`
- `lib/commercial-poster/execute.ts`
- `lib/product-hero/execute.ts`
- `lib/usage/capture.ts`
- `lib/usage/report.ts`
- `app/api/readiness/route.ts`
- `components/campaign/create-campaign.tsx`
- `components/campaign/provider-readiness.tsx`
- `components/campaign/workspace.tsx`
- `components/campaign/reproducibility.tsx`
- `components/campaign/version-comparison.tsx`
- `components/campaign/usage-panel.tsx`
- `components/campaign/job-status.tsx`

Local verification artifacts: `creative-mode-test.log`, `creative-mode-build.log`, `creative-mode-verification.log`, the database backup and the updated local `prisma/dev.db`. Prisma client, Next build output and TypeScript cache were regenerated by normal checks.
