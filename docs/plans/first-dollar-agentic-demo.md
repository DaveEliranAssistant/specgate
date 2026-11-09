# Optional synthetic review-assistant demo — proposal only

Research checked 2026-11-09. No provider integration or provider call is added
by this PR. The scanner, CLI and proofs continue to work without any model.

## Recommended next agentic step

Add a bounded reviewer assistant that turns a *synthetic* scan-diff fixture into
questions for a human reviewer. It can explain a reported gap or propose a
scenario for independent review. It cannot set expected behavior from the
implementation, accept a baseline, suppress gaps, change an exit code, run a
command, modify source, or approve a release. A question must cite a supplied
route ID and observation; unknown IDs and malformed output are rejected.

This is a design recommendation based on the existing separation between
observed implementation and approved behavior. Starting with a healer would
blur that boundary. Consumer compatibility and code/OpenAPI comparison remain
outside this increment.

## Small, reviewable implementation sequence

1. Commit a hand-written synthetic input and expected output schema, separate
   from customer scans. Accept only that fixture ID, never a file path or stdin.
   Do not forward raw scan reports: identifiers and paths can be sensitive.
2. Add an offline stub and schema validation: bounded number/length of questions,
   known route IDs, no tool calls, no executable output. Persist proposals
   separately; never write to baselines or generated tests automatically.
3. Add one explicitly opted-in provider with a single bounded request, timeout,
   no automatic retry/fallback, redacted errors and no prompt/response logging.
   Read an existing environment credential; never alter credentials. Evaluate
   invalid JSON, unknown IDs, prompt injection, refusal, timeout, 429 and offline
   operation before adding more providers.
4. Compare questions against human-written synthetic review tasks. Reject
   invented observations and claims of compatibility. A provider failure must
   leave deterministic reports and exit codes unchanged.

## Provider research

| Provider | Demo suitability | Constraint to check at execution time |
| --- | --- | --- |
| Groq free | Candidate for short structured review questions | Quotas depend on account/model; check account limits and handle 429 without retries. Data retention has exceptions; synthetic data only. |
| Gemini free API | Candidate for a second provider experiment | Free availability depends on model/region; pricing marks free-tier content as usable for product improvement. Synthetic data only. |
| Cloudflare Workers AI | Candidate if an existing free account is available | Free daily allocation is 10,000 neurons; some models require paid access. Refuse paid-only models and do not enable paid resources. |

Sources: [Groq rate limits](https://console.groq.com/docs/rate-limits),
[Groq data policy](https://console.groq.com/docs/your-data),
[Gemini pricing and data-use table](https://ai.google.dev/gemini-api/docs/pricing),
[Workers AI pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/).
Quotas and eligible models are mutable; no model ID or perpetual-free claim is
part of this proposal. No customer logs, source, reports or page HTML go to a
free tier. No live API call is necessary to review this PR.
