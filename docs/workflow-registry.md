# Golden Workflow Registry

Subsequent implementation: [Product Hero v1](product-hero-v1.md) now adds experimental `product_hero_v1@1.0.0` and its SAM extraction extension. The earlier proposed version and all legacy definitions remain; the infrastructure implementation notes below describe the original registry delivery.

Infrastructure implementation, 2026-09-19. “Golden” names the versioning process; **no current workflow is commercially validated**. See [research](commercial-workflow-research.md), [matrix](workflow-matrix.md), [roadmap](workflow-roadmap.md) and [benchmarking](workflow-benchmarking.md).

## Registry contract

`comfyui/registry.json` is validated by `types/workflow.ts` and `lib/workflows/registry.ts`. Identity is the exact `(id, version)` pair. Duplicate pairs, invalid semantic versions, unsafe template paths and incomplete executable definitions are rejected. Multiple versions of one ID are permitted. Lookups require both fields; there is no implicit “latest”.

Definitions include display name, use case, kind, status, release state, template basename and pinned canonical SHA256, checkpoint family/configuration key, node/model requirements, supported/required inputs and reference roles, quality tiers, estimated VRAM, sampler defaults, placement dimensions, limitations and benchmark status. VRAM ranges are estimates, not measured capacity guarantees. A model filename advertised by ComfyUI does not prove model compatibility or file integrity.

| ID (version 1.0.0) | Classification | Release state | Meaning |
|---|---|---|---|
| legacy_basic_v1 | legacy | legacy | Existing fast single-pass SD1.5 baseline |
| legacy_quality_v1 | legacy | legacy | Existing two-pass baseline |
| legacy_sports_v1 | legacy | legacy | Existing sports/detailer baseline |
| legacy_sports_pose_v1 | legacy | legacy | Existing OpenPose sports baseline |
| repair_v1 | experimental | experimental | Existing masked manual repair; no new live validation |
| repair_face_v1 | experimental | experimental | Existing automatic face repair |
| reference_sd15_v1 | deprecated_candidate | experimental | Optional existing IP-Adapter extension; soft identity conditioning, not exact SKU preservation |

Six **non-executable** placeholders use version `0.1.0-proposed`: `product_hero_v1`, `commercial_poster_v1`, `lifestyle_v1`, `sports_v2`, `ecommerce_product_v1`, `social_fast_v1`. They have no templates, hashes or new model requirements. They are contracts for future design, not selectable production workflows.

## Behavior and compatibility

Existing `selectWorkflow` / `resolveWorkflow`, providers, prompts, sizes, seed generation, refinements and templates continue unchanged. After graph substitution, new ComfyUI attempts are annotated using an explicit legacy-mode-to-registry mapping. Reference conditioning remains an extension of the selected base workflow. The registry does not reroute generation or enable a future placeholder.

`routingCandidates({useCase,tier,inputs})` prepares explicit future resolution. It excludes placeholders and checks required inputs and optional reference support, but does **not** imply release approval; future production routing must additionally enforce a reviewed release gate. Current production routing never calls it.

Metadata is stored under the existing prompt JSON `_generation.reproducibility`; no database migration is needed. Old records are never backfilled. An old `sports` label cannot establish which bytes/seed/checkpoint actually ran, so version details show **Not recorded**. New mock outputs also do not claim a ComfyUI identity. A review retry retains the original submitted-graph metadata.

## What is recorded

New ComfyUI generations and repairs capture registry ID/version; template and composite definition hashes; registry-match flag; actual checkpoint filename, seed, resolution and each sampling/detailing stage's steps, CFG, sampler, scheduler and denoise; ControlNet model/strength/start/end/preprocessor and pose source ID/hash; reference IDs, source hashes, roles, strengths and weight types; detailer detector/settings; and a dependency snapshot. Existing repair metadata additionally preserves the source generation, mask ID, region and preservation evidence. Reference adapter/encoder filenames appear in dependencies and existing reference-conditioning metadata.

Capture occurs from the final resolved graph before submission, including graph settings for requests that later fail. Async context passes this metadata into the existing failed-attempt record. Failures before a graph is prepared have no invented metadata. The pose checksum identifies the prepared pose bytes before placement framing; product/style checksums identify uploaded original bytes. Neither is a claim that preprocessing is frozen across future application versions.

The compact **Reproducibility** expander appears in version review/details, including the comparison workspace. No provider-specific generation UI was added.

## Hash rules

`sha256-canonical-json-v1` recursively sorts object keys by Unicode code-unit order, preserves array order and JSON values, and hashes UTF-8 canonical JSON. Whitespace and object-key order do not change a hash; connections and constants do. Hash inputs are static repository templates, never resolved prompt/upload/credential data. Absolute paths, credential-named fields, credential-like values and URLs are rejected. The definition hash covers the ordered set of template filenames and hashes, including reference extensions when used.

Actual substituted settings are recorded separately. Hashes do **not** freeze provider transformation code, model bytes, preprocessing implementation or a full environment. Preserve the application revision separately for release studies. The research audit's earlier `sha256` values hash raw file bytes; those are intentionally a different checksum from this canonical algorithm.

Changing a file without updating its registered version/hash produces an explicit mismatch in the audit and dry run. Production still executes existing behavior and records `registeredHashMatches: false`; it does not silently describe changed bytes as the verified release. Future releases should retain the prior template under a distinct basename and register a new version, rather than overwrite the only historical copy.

## Dependency snapshots and audit

Production reuses `object_info` responses already required by existing reference/sports/repair generation. Basic/quality generation performs **no extra network calls**. Node class/module/version and ComfyUI version remain null when undiscoverable. Public model basenames are retained; private absolute paths are not. No environment dump, key or full package lock is stored.

Explicit CLI dependency inspection uses only bounded GET requests to `object_info` and optional `system_stats`; it records the server-advertised version. No upload, prompt submission, model installation or paid call occurs.

```powershell
npm run workflow:audit -- --registry-only
npm run workflow:audit -- --registry-only --local-capabilities
# Full research/history audit, requires the existing local research assets/database:
npm run workflow:audit -- --local-capabilities
```

The registry-only audit reports identities, statuses, expected/actual hashes, missing/invalid templates, unregistered JSON files and configured model/node gaps. It works independently of campaign history and research reference files. Configured model names require the local `.env`; missing configuration is reported, not assumed. An advertised dependency is not proof of a successful GPU execution.

## Development lifecycle

Research → Prototype → Register → Benchmark → Candidate → Validate → Route.

1. Define the preservation contract, supported inputs/tiers and blockers.
2. Prototype a separate template, without changing a deployed baseline.
3. Register exact version, hash, dependencies and limitations as experimental.
4. Run offline preflight, then obtain explicit authorization for any live/paid evaluation.
5. Collect representative measured evidence and human reviews before candidate promotion.
6. Review the full release protocol; record a hashed, named human release report before setting validated. The schema requires this attestation and `benchmarked` status, but cannot authenticate a human attestation.
7. Add routing only in a separate reviewed change. A validated label is scoped to tested use cases/configurations, not a universal quality claim.

The release checker deliberately cannot automatically grant validated status because held-out campaign, protected-pixel and calibrated statistical evidence are not yet implemented in the result model. See [benchmarking](workflow-benchmarking.md). Infrastructure is ready for a separately scoped Product Hero v1 prototype; its image-quality implementation is not part of this task.
