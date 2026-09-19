# Durable generation jobs

## Execution lifecycle before this change

Inspected before implementation: `lib/agents/orchestrator.ts`, campaign run/brand routes, `lib/database/campaigns.ts`, provider adapters, readiness and workspace/activity UI.

The run route directly invoked `runCampaign` from an NDJSON response stream. Closing the browser did not deliberately cancel work, but execution still depended on that web process staying alive. React consumed transient stage events and reloaded saved campaign data at completion. Refresh polled only a campaign marked running. No independent queued operation, execution attempt or cancellation record existed.

`withCampaignLock` claimed `Campaign.lockAt` with a conditional database update. It used a fixed 30-minute stale timeout without heartbeat. Campaign reads recovered expired running campaigns and stage records. `AgentRun` stored stage activity, while `Generation` reserved monotonically increasing asset versions before image calls. Images were persisted before Vision; strategy and placement prompts were reusable on full-campaign retries. Asset retries otherwise started a new generation even when an image had succeeded and only evaluation failed.

OpenAI requests already had bounded timeouts (default 60 seconds, configurable to 120 seconds). ComfyUI used bounded polling (default 300 seconds, configurable to 600 seconds), with warnings that timed-out remote jobs could still finish. Existing readiness ran before the campaign and each image request. Quality defects went through the refinement policy, not provider error handling.

## New implementation

### Persistence and queue

`ExecutionJob` holds campaign, optional asset, action, validated action payload, idempotency request key, current status/stage/message, attempt/retry counters, cancellation timestamp, lifecycle timestamps, owner and lease. `JobAttempt` preserves every attempt's status and failure independently. `JobEvent` holds stage-based execution activity. `Generation.jobId/jobAttempt` associates creative versions with their originating execution without combining the two histories. Existing output rows are retained. No image template, model, scoring or brand extraction logic changed.

States are `queued`, `running`, `cancel_requested`, `cancelled`, `failed`, `completed`. Retrying transitions back to queued with a new numbered attempt; the previous attempt remains terminal. Preflight blockage and interruption are explicit failure codes. A low quality score is not a job failure: normal refinement runs, and an exhausted quality budget can complete with assets needing human review.

`lib/jobs/store.ts` is the SQLite queue adapter. A transaction reserves one active job per campaign using `Campaign.activeJobId`. Request keys return the same job on duplicate submission. A different request conflicts while a job or campaign write lock exists. Retry uses the expected attempt number, preventing double retry requests. Only the most recent campaign job can be retried; older jobs remain readable.

A single database `WorkerLease` slot serializes local image work globally. Claim, heartbeat and completion use conditional ownership updates in transactions. Additional worker processes may wait but cannot execute the same claimed job. The campaign reservation also blocks existing brand/upload/approval mutations that use the campaign lock. No Redis or other external queue dependency was installed.

### Worker and orchestration boundary

`scripts/worker.ts` runs outside the web request and polls idle work once per second. `workOnce` claims one job, performs the existing readiness check while still queued/Preflight, then transitions to running and invokes the original orchestrator. Progress callbacks become durable events. HTTP disconnects do not signal cancellation. Queue and campaign APIs never run the generation loop.

`executionContext` attaches ownership fences and cancellation checkpoints through Node AsyncLocalStorage. Wrapped providers check before each call and verify ownership after it. Existing stage boundaries also check cancellation. Agent logic and provider implementations remain behind their current interfaces. Offline injected providers remain usable in tests; clients cannot supply a provider override.

### Cancellation

- Unclaimed queued jobs cancel immediately without providers or stages.
- Claimed/running jobs become Cancel requested. The worker waits for the current provider call to finish or time out, saves returned image/evaluation data where the existing persistence boundary permits, and does not start later calls or refinement.
- The UI distinguishes the request from acknowledged cancellation. Cancel is idempotent; terminal jobs are unaffected.
- OpenAI calls are **not claimed to be forcibly terminated**. Existing timeout bounds remain in force.
- ComfyUI is treated as a shared external service. This implementation deliberately does not issue a server-wide interrupt that could affect unrelated ComfyUI work. Submitted image work may finish while cancellation is pending (up to the configured provider timeout). Safe per-submission remote cancellation/reconciliation is not implemented here.

### Retry and restart recovery

Completed campaign strategy and placement prompts are reused as before. A retry of the same job also reuses its locally saved image when Vision failed or cancellation occurred before evaluation; it evaluates that image rather than generating another version. Saved evaluations are reused when the pending step was refinement. Completed ready/needs-review assets are skipped. Failed image attempts stay in version history and a later image attempt receives a new version. A new Regenerate action is a new job and intentionally creates new creative output. Changed approved brand constraints prevent unsafe reuse of an old image.

Heartbeats run every 5 seconds; ownership expires after 120 seconds without renewal. Recovery runs in the worker and job reads, so a stopped worker does not leave the UI permanently running. Stale claimed jobs (including interrupted preflight) become failed/interrupted, release campaign ownership and retain successful outputs. They are **not automatically resubmitted**. Old owners are fenced from subsequent stages or job completion. Queued, unclaimed jobs survive restart and remain eligible for execution.

Exactly-once external inference cannot be guaranteed: a process may die after remote success but before local output persistence. Remote ComfyUI prompt IDs are not reconciled by this queue. Interruption/timeout messages instruct users to inspect external work before explicitly retrying. Unsaved model responses may need repeating; already persisted local images/strategies are reused where safe. Heartbeat fencing cannot retract an external request already sent.

### API and UI

- `POST /api/jobs`: enqueue validated campaign/asset/refinement input with `requestKey`; returns 202 and the job, not a stream.
- `GET /api/jobs?campaignId=...`: latest 30 jobs with attempts/events.
- `GET /api/jobs/:id`: durable current status.
- `POST /api/jobs/:id/cancel`: request cancellation.
- `POST /api/jobs/:id/retry`: require `{attempt: number}` and create the next attempt.
- The previous `/api/campaigns/:id/run` endpoint is an enqueue compatibility entry point returning 202 JSON. NDJSON clients must migrate.

The campaign panel shows action, state, stage, start/finish time, activity, attempt history and appropriate Cancel/Retry controls. Completed jobs have no Retry button. Asset version history remains separate. UI polls every 1.5 seconds while active, every 10 seconds while idle, with a Refresh jobs action. Navigation is available during work; refresh restores the last opened campaign and reloads jobs from the database. The existing readiness panel remains before submission, and the worker independently rechecks before expensive work.

The local-host/same-origin boundary is enforced on job APIs. Public job DTOs omit payload, ownership tokens and environment/configuration. Errors/events are sanitized for known secret values, key patterns and filesystem paths. API failures do not expose raw exception bodies. This remains a trusted local single-user app, not a multi-user authorization system.

### Local startup and migration

Stop app and worker before schema/client updates on Windows (Prisma's DLL can otherwise remain locked). Back up SQLite and storage, then run `npx prisma db push`; the changes are additive. The existing database was backed up to ignored `prisma/pre-jobs-backup.db` before the update. No campaign reset or destructive migration was performed.

Use `npm run dev:all` for the web app and worker together. `npm run dev` remains web-only; `npm run worker` can run separately. For local production testing, use `npm run build`, then `npm start` plus `npm run worker`, with the same `.env` and database. Stopping only the web server does not stop a separately launched worker. Worker crashes become retryable after lease expiry.

### Verification

Automated tests use mocked providers and disposable campaign records. Manual verification used an isolated `prisma/jobs-verification.db`, mock providers and a deliberately delayed image provider. No paid OpenAI calls or real ComfyUI image jobs were made.

| Scenario | Result |
|---|---|
| A: normal campaign and browser refresh | API returned Queued before worker startup. Separate worker generated five mock assets. Browser refresh during Image Generation restored Running and the correct stage; job completed with preserved outputs. |
| B: duplicate | Same request key returned the same job; a conflicting new key was rejected. |
| C: cancel | In-flight request showed Cancel requested, saved its image, then became Cancelled; no Vision or later asset calls ran. |
| D: unavailable ComfyUI | Worker preflight marked failed/preflight_blocked; zero AgentRuns or generated assets. |
| E: retry | Cancelled attempt remained in history; attempt 2 completed, reusing the first stored image. |
| F: restart recovery | Safely simulated a stopped worker's expired heartbeat. Original attempt recorded interrupted; explicit retry completed as attempt 2. No real process was killed during paid work. |

Sanitized machine-readable results are in `docs/jobs-verification.json`. `scripts/verify-jobs.ts` refuses non-mock providers and requires a database name containing `jobs-verification`. Modes: `seed` queues through the real local HTTP API, `run` consumes one job with delayed mock images, and `verify` checks B–F after A completes. The slow mock delay exists only in the verification script.

Additional browser verification exercised Regenerate → preflight → enqueue, Cancel job → Cancelled, Retry job → attempt 2, then completion by the actual `npm run worker` process. The expanded execution history showed attempt 1 cancelled and attempt 2 completed, while asset V1 remained and the explicit regeneration created V2. Tests also fence an old delayed worker after recovery so it cannot overwrite a successful retry.

Final validation: lint, typecheck, all **134 tests**, and production build passed. The build retains the existing experimental JSON-module warning. A read-only comparison against the pre-migration backup confirmed all **6 existing campaigns and 56 generations**, including image URLs, prompts and evaluations, were unchanged. The original database had no active queued/running jobs before restoring the app and worker.

### Remaining scope and future queue replacement

Initial action scope is campaign generation, asset regeneration and prompt refinement. Standalone brand analysis/compliance reviews retain their current service routes and campaign locking; they are not new job types in this task. Queue priority, parallel GPU work, automatic retries, remote request reconciliation, retention/pagination beyond the latest 30 jobs, cloud/auth, billing and cost tracking are not implemented.

`store.ts` owns enqueue/claim/heartbeat/retry/recovery, while `executor.ts` invokes the existing orchestrator through an execution context and progress callback. A Redis/BullMQ or cloud task adapter can replace claim/delivery/lease coordination while retaining job/attempt history, idempotency, cancellation checks and the same orchestrator/provider interfaces. Distributed deployment would additionally need appropriate transactional fencing, authorization and external-request reconciliation; changing queue software alone does not guarantee exactly-once inference.

## Exact files changed

New files:

- `types/jobs.ts`
- `lib/jobs/api.ts`
- `lib/jobs/context.ts`
- `lib/jobs/control-providers.ts`
- `lib/jobs/errors.ts`
- `lib/jobs/executor.ts`
- `lib/jobs/store.ts`
- `app/api/jobs/route.ts`
- `app/api/jobs/[id]/route.ts`
- `app/api/jobs/[id]/cancel/route.ts`
- `app/api/jobs/[id]/retry/route.ts`
- `components/campaign/job-status.tsx`
- `scripts/worker.ts`
- `scripts/dev-all.mjs`
- `scripts/verify-jobs.ts`
- `tests/jobs.test.ts`
- `docs/generation-jobs.md`
- `docs/jobs-verification.json`

Updated files:

- `prisma/schema.prisma`
- `types/campaign.ts`
- `lib/agents/orchestrator.ts`
- `lib/database/campaigns.ts`
- `app/api/campaigns/[id]/run/route.ts`
- `components/campaign/workspace.tsx`
- `app/globals.css`
- `package.json`
- `README.md`

Local ignored artifacts: additive update to `prisma/dev.db`, its pre-change backup, isolated verification database, regenerated Prisma client, and normal build/test caches.
