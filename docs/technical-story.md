# Technical story

CreativeFlow is a local-first TypeScript/Next.js creative-production workspace. Its engineering focus is keeping generative steps inspectable and recoverable, rather than treating an image API response as a completed campaign.

- **Structured agents:** existing provider contracts and Zod domain schemas connect Brand, Creative Director, Prompt Engineer and Refinement agents. Real OpenAI Responses and deterministic mocks share the same boundaries.
- **Deterministic routing:** Creative Modes resolve to registered workflow definitions before execution. Jobs freeze the chosen route; readiness explains missing dependencies rather than substituting a different pipeline silently.
- **ComfyUI automation:** server-side adapters load repository templates, submit workflows, poll bounded execution and save outputs through storage. Model weights remain external dependencies.
- **Multimodal QA:** Vision can compare a saved poster with its hash-verified reference. Structured findings, penalties and blockers supplement the overall score. They do not replace human inspection.
- **Durable execution:** SQLite-backed job state, attempts, events, cancellation and a separate worker keep long image operations outside a browser request's lifetime. This is local execution, not a distributed production queue.
- **Reproducibility:** immutable image versions retain prompts, route/version/hash, seeds and reference identity. Stored evaluations and usage remain inspectable alongside history.
- **Observability:** provider token counts, duration and configured price estimates are associated with operations and generations. Missing local hardware costs are shown as unknown, not zero.
- **Human decisions:** review, comparison, optional refinement/repair and approval are distinct actions. Experimental workflow status is not automatically promoted by a high score.

The [golden demo](golden-demo.md) is a concrete end-to-end example: one routed Klein image and one real reference-aware Vision review. Its 69/100 result exposes a product-identity limitation instead of hiding it. No cloud/auth/payment system or production-grade multi-user deployment is claimed.

See the readable architecture and user-flow diagrams in the [README](../README.md), and the [release checklist](github-release-checklist.md) for validation scope.
