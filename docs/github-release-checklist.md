# GitHub v1.0 release candidate checklist

Prepared locally, 20 September 2026. **Not published.** This is a presentation release candidate, not production certification of its experimental image workflows.

## Completed

- [x] One new routed Commercial Poster demo, one real output, one reference-aware real Vision review. [Evidence and honest blockers](golden-demo.md).
- [x] Actual route `commercial_poster_v1` matches Creative Mode; workflow template and experimental status unchanged.
- [x] Live version remains awaiting a human decision. No automatic refinement or staged “approval.”
- [x] README: concise mock Quick Start, optional real providers, architecture/user flow, limitations and roadmap.
- [x] Six curated images and a 90-second storyboard; live and simulated results distinguished.
- [x] Mock-first onboarding: Social Fast default, three mock providers, seeded five placements and V1/V2 reviews. Brand Intelligence is available with an empty rules state.
- [x] Isolated clean-copy `npm ci --offline`, `npm run setup` and localhost smoke check using Node 24.19.0. 402 packages installed, audit reported zero vulnerabilities. No local key, source database or model copied. This was a filesystem copy, not an actual clone: no remote exists yet.
- [x] `npm run lint`, `npm run typecheck`, `npm test` (**228 passed**) and `npm run build` passed. Automated tests made no paid or live ComfyUI calls.
- [x] Local default Node 20.18 produced experimental JSON warnings in build but passed. It is below the declared 20.19 minimum; use the documented supported Node version for installation.
- [x] Pre-demo historical database rows unchanged, including 62 generations and 61 evaluations.
- [x] MIT application LICENSE exists; upstream models, nodes and media retain separate licenses.
- [x] `.env.example` contains placeholders/mock defaults; `.env`, databases, storage, raw references, external installs, model weights, archives and logs are ignored.
- [x] Publication-source allowlist secret/path/size scan: no findings. Real local credential values are checked without printing them. OpenAI Authorization header construction was inspected: it uses a server-side variable, not a literal key.

## Remaining owner publication steps

- [ ] Confirm redistribution rights for the shoe reference/product design and curated generated media; replace gallery media if needed. MIT source licensing does not establish image rights.
- [ ] Review the proposed publication file list before initializing/staging Git. At the preparation snapshot, this folder had no `.git` directory; the final release task now initializes Git and audits the actual staged file set before committing. “No secrets committed” cannot be asserted from a filesystem scan.
- [ ] During final release preparation, inspect `git status`, `git ls-files` and the staged diff; run a tracked-file/history secret scanner before any push. Verify no `.env`, model weights, database, raw local diagnostics or private paths were staged. `.gitignore` alone cannot remove already tracked files.
- [ ] Replace the README clone placeholder with the actual repository URL after choosing a repository.
- [ ] Obtain explicit owner instruction to publish. No repository, push, release tag or cloud deployment was created here.

## Reproduce local checks

Run `npm run setup` first. Stop local dev/worker processes before tests/build. Then run lint, typecheck, test, build and `npm run release:check`. The release scan covers an explicit source/documentation allowlist; it is not an exhaustive forensic scan of external installations or Git history. Review its scope before adding new top-level publication folders.

## Known limits

Commercial Poster can change product structure and markings. This demo scored 69/100 and remains unapproved for exact-SKU use. Vision can miss defects. ComfyUI needs compatible local dependencies; prices are estimates and hardware costs may be unknown. Dedicated professional Lifestyle/Sports workflows and public multi-user hosting remain future work. The app is a localhost workspace, not a secured internet service.

## Exact source and presentation files changed in this task

No Git baseline exists, so this is the task's explicit edit inventory, not a claimed Git diff. Existing changes from earlier tasks are not included.

- `.env.example`
- `.gitignore`
- `README.md`
- `package.json`
- `app/api/campaigns/[id]/review-poster/route.ts`
- `components/campaign/create-campaign.tsx`
- `components/campaign/inspector.tsx`
- `components/campaign/workspace.tsx`
- `components/workflow/workflow.tsx`
- `lib/commercial-poster/review.ts`
- `lib/providers/vision/base.ts`
- `lib/providers/vision/image.ts`
- `lib/providers/vision/openai.ts`
- `lib/usage/capture.ts`
- `scripts/release-audit.mjs`
- `tests/commercial-poster.test.ts`
- `tests/vision.test.ts`
- `docs/klein-workflow-validation.md`
- `docs/provider-reference.md`
- `docs/golden-demo.md`
- `docs/demo-script.md`
- `docs/technical-story.md`
- `docs/github-release-checklist.md`
- `docs/screenshots/README.md`
- `docs/screenshots/workspace.png`
- `docs/screenshots/creative-modes.png`
- `docs/screenshots/commercial-poster.png`
- `docs/screenshots/vision-review.png`
- `docs/screenshots/version-comparison.png`
- `docs/screenshots/usage.png`

Local-only artifacts: one new campaign with reference, Hero V1, evaluation/job/usage rows in SQLite; an unchanged source photo; the saved generated PNG; a pre-demo database backup; local verification JSON/logs; and the isolated setup copy under `external/release-smoke`. These are ignored, not release assets. No model binaries or workflow templates were changed in this task.
