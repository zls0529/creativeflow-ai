# Workflow benchmark harness

Product Hero extension: [Product Hero v1](product-hero-v1.md) adds a frozen single-job preparation manifest. B01 now targets its experimental 1.0.0 version; no live execution is implied by the generic benchmark dry-run command. Original infrastructure verification evidence below remains historical.

Implementation of the [research benchmark plan](workflow-benchmark-plan.md). See [registry](workflow-registry.md) and the [roadmap](workflow-roadmap.md). This harness implements **offline preflight, optional read-only dependency checks, result storage, descriptive comparison and release evidence checks**. It does not execute images or call OpenAI. `--live` is explicitly rejected.

## Fixtures

`benchmarks/fixtures.json` contains six Zod-validated, versioned definitions. Each includes ID/category, campaign brief, placement/dimensions, frozen positive and negative text, ten fixed seeds, repository-relative reference paths and SHA256, expected registered baseline, optional future target, evaluation criteria, blockers, human checklist and limitations. Repair also includes its source rectangle. The fixed wording and references are taken from the existing research plan; no new external assets were acquired.

| ID | Category | Current baseline | References |
|---|---|---|---|
| B01 | product_hero | legacy_quality_v1@1.0.0 | P1 shoes.jpg |
| B02 | commercial_poster | legacy_quality_v1@1.0.0 | P1 |
| B03 | lifestyle | legacy_quality_v1@1.0.0 | P1 |
| B04 | sports | legacy_sports_pose_v1@1.0.0 | P1 + R1 reference.jpg |
| B05 | ecommerce_product | legacy_basic_v1@1.0.0 | P1 |
| B06 | repair | repair_v1@1.0.0 | D1 existing Midnight Pulse V7 |

P1 is one user-supplied product view, not enough for exact worn-shoe identity or multi-angle claims. D1 is a separate cyan-shoe image, not P1. Private fixture ownership does not grant redistribution or external upload rights. The runner checks file hashes locally and rejects traversal/symlink escapes; it never uploads fixtures. Missing files cause explicit preflight failure.

The fixture checksum covers the complete experiment inputs/rubric but excludes the expected/future workflow binding, so the same fixture can be paired across workflow versions. Changing prompt, seed set, reference, placement or rubric breaks fixture equivalence. Registry ID/version/template hash are recorded separately. Seed equality across different models/environments does not imply identical noise or pixels.

## Commands

Run from the repository root with the existing `.env`:

```powershell
# All six definitions, first fixed seed only, no network and no results written:
npm run workflow:benchmark
# One fixture, alternate frozen seed, immutable result file:
npm run workflow:benchmark -- --fixture B01 --seed 2026091702 --save
# Optional local GET-only checks; saves preflight records, not image results:
npm run workflow:benchmark -- --dependencies --save
# Planning only; never executes a batch:
npm run workflow:benchmark -- --mode release --plan
# Inspect a different registered arm (placeholders fail explicitly):
npm run workflow:benchmark -- --fixture B01 --workflow product_hero_v1@0.1.0-proposed
# Compare persisted results; each side accepts comma-separated UUIDs:
npm run workflow:benchmark -- compare LEFT_RESULT_ID RIGHT_RESULT_ID
```

`--mode release` without `--plan` still only validates definitions; it does not loop through seeds/reference sets. Unknown options are rejected. Failed preflight returns a nonzero exit code. `--dependencies` checks the checkpoint and all required nodes/models, including the reference extension, against server-advertised options. Offline preflight can report valid with `dependencies: not_checked`; that is not generation readiness.

Results are independent immutable `storage/benchmarks/<uuid>.json` files; `wx` writes reject overwrite. They never become campaign generations or alter version history. Loading validates the schema and identity. Library `saveBenchmarkResult` supports a measured-result contract for a future explicitly authorized executor; this task provides no live executor or paid reviewer. Integrators must preserve attempted failures, submitted graph provenance and reviewer identity, rather than fabricate measured rows from preflight.

## Result contract and comparisons

`types/benchmark.ts` records workflow ID/version/template hash, frozen fixture hash/reference hashes/seed, execution mode, dependency snapshots and optional submitted-graph reproducibility. Metrics include success/failure, duration, optional real OpenAI Vision score/model/rubric, blocker count/categories, human-review status, refinement count, observed dependency/OOM failures and optional anchored product-fidelity score (0–4).

Dry-run outcomes are `not_run`; time, scores, blockers and failure observations are **null**, not zero. Schema validation rejects invented measured fields on dry runs. A measured attempt requires an outcome, duration and hash, and any submitted-graph provenance must match its workflow/hash/seed. Refused/unavailable reviews remain missing. Dependency preflight failure is a validation issue, not a generated-image failure.

Comparison calculates technical success over all measured attempts, blocker rate over reviewed successful outputs, means over observed scores/timings/refinements, optional fidelity means and observed dependency/OOM counts. It includes denominators and missing-review counts. Dry runs are excluded. Each arm should contain one pinned workflow; paired fixture/hash/seed/reference sets, reviewer/rubric equivalence and environment differences are checked. Mixed or incomplete evidence produces warnings. No automatic winner is selected, even when descriptive means differ. No confidence interval or causal quality claim is implemented.

## Development and release planning

- Smoke: 3 seeds × 6 fixtures = 18 images per arm, only in a separately authorized future live run.
- Development comparison: 10 seeds × 6 fixtures = 60 per arm, then at least 3 distinct reference sets for a use case being promoted.
- Release: at least 5 independent reference/brief sets × 20 seeds = 100 first-pass attempts **per use case and model-tier configuration**.
- Product consistency also needs at least 20 held-out five-placement campaign sets; repair needs at least 20 distinct defect/source masks.

These counts come from the research plan and have **not been executed**. The current six definitions reuse only P1/R1/D1, so cannot meet release diversity. Additional rights-cleared sets, approved masks/landmarks and source truth must be supplied before release evaluation. Automatic repeatability is limited by model, node, GPU/runtime and preprocessing differences; current metadata is lightweight, not a complete environment lock.

## Release states

`experimental` → `benchmarking` → `candidate` → `validated`; `legacy` retains existing baselines.

`releaseGate` is a pure evidence checklist, never a registry mutation. Benchmarking requires passing preflight. Candidate checks require one pinned workflow/use case, distinct fixture/seed attempts, at least three reference sets, verified actual graph provenance, consistent checkpoint, complete human/blocker review, and the research's proposed technical-success (98%), human-acceptance (80%) and blocker-rate (≤5%) thresholds. These remain proposed project thresholds, not industry standards or observed achievements.

Validated additionally needs the full research protocol: representative/held-out strata, protected/unmasked pixel checks, adjudicated identity evidence, bounded-repair outcomes, Wilson confidence bounds and performance budgets. These evidence types are not fully implemented here, so the checker explicitly refuses **automatic validated promotion**, even with 100 perfect rows. A separately reviewed release report and registry change are required. One attractive output or high Vision score cannot validate a workflow.

## Verification in this task

All six local fixtures passed checksum, template and GET-only dependency preflight. ComfyUI advertised version `v0.2.4-11-g9ee0a65`; required configured nodes/models were advertised. Seven executable/extension templates matched pinned hashes, six placeholders had no executable files, and no unregistered workflow JSON was found. No generation, paid review, model installation or release batch ran.

The full audit confirmed the existing 6 campaigns and 57 generation rows, unchanged history digest and unchanged raw template checksums relative to the prior research snapshot. Results are validation evidence only; **there are no new image-quality comparisons or improvement claims**.

## Files changed by this implementation

New:

- `comfyui/registry.json`
- `types/workflow.ts`
- `types/benchmark.ts`
- `lib/workflows/hash.ts`
- `lib/workflows/registry.ts`
- `lib/workflows/dependencies.ts`
- `lib/workflows/reproducibility.ts`
- `lib/workflows/benchmark.ts`
- `components/campaign/reproducibility.tsx`
- `benchmarks/fixtures.json`
- `scripts/workflow-benchmark.ts`
- `tests/registry-benchmark.test.ts`
- `docs/workflow-registry.md`
- `docs/workflow-benchmarking.md`

Updated:

- `types/refinement.ts`
- `lib/providers/image/base.ts`
- `lib/providers/image/comfyui.ts`
- `lib/providers/image/repair.ts`
- `lib/agents/orchestrator.ts`
- `lib/repair/execute.ts`
- `components/campaign/generation-review.tsx`
- `scripts/audit-commercial-workflows.ts`
- `tests/comfyui.test.ts`
- `tests/repair.test.ts`
- `package.json`

Local verification artifacts (not source/history): `storage/benchmark-preflight.log`, `storage/workflow-registry-audit.log`, `storage/registry-tests.log`, and these six preflight result files:

- `storage/benchmarks/d6c7f91b-1660-4d61-bf26-492fb61f54e9.json` (B01)
- `storage/benchmarks/6b6a35f7-a67a-4611-9c03-45cf0286d533.json` (B02)
- `storage/benchmarks/8650e29d-65f8-4a2b-924e-035c4884171c.json` (B03)
- `storage/benchmarks/46079650-e34e-4f54-8305-b0acb74a5800.json` (B04)
- `storage/benchmarks/07acc927-377d-4100-9687-d83d7a815664.json` (B05)
- `storage/benchmarks/009d6d1f-a3a8-4c32-a24b-0a0cb3b2d4e5.json` (B06)

Automated validation: 182 tests passed, 0 failed; lint, typecheck and production build passed. The build emitted Node's non-fatal experimental JSON-module warning. Tests use mocked provider responses; none require live ComfyUI or paid OpenAI. Build/typecheck regenerate ignored `.next` and TypeScript cache files. No existing workflow JSON, database schema, environment configuration, model, or historical campaign image was edited.
