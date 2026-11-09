# Research: which agentic step comes next on the code-first scan

Date: 2026-11-09. Scope: SpecGate `0.1.0-rc.2` code-first scan/check. Prototype: `poc/agentic-triage/`.

## Constraints

- The scan and check must keep working with **no model at all**. Any model step is opt-in and advisory.
- Demos use **free tiers only**: Groq free plan, Gemini API free tier and Cloudflare Workers AI's free daily allocation. No paid Bedrock, no Cursor.
- Free tiers are not an SLA. Rate limits, model lists and terms change without notice.
- Customer logs, repository secrets, page HTML and source text are **never** sent to a free tier.
- Suggestions stay reviewable. Nothing silently heals, rewrites assertions or accepts a baseline.

## Candidate steps

| # | Step | What it classifies or proposes | Input it needs | Value | Risk | Verdict |
|---|---|---|---|---|---|---|
| A | **Finding triage** | Labels each `check` finding `consumer_break` / `approved_change` / `noise` / `needs_review`, with a one-line rationale | Structured deltas (pseudonymized), optional PR description | High: turns an all-or-nothing exit 1 into a ranked review list | Low: the input is already-derived metadata, and the output is a label, not code | **Do next.** Prototyped here. |
| B | Intent ↔ finding matcher | Proposes entries for a reviewed intent file from a PR description or changelog ("this PR removes DELETE /tickets/:id") | PR text and finding list | Medium: removes the busywork of writing approvals | Medium: an over-eager match could look like an approval. Must stay a *proposal* that a human commits on the trusted branch. | Second. It is A plus "draft the intent file for review". |
| C | Scenario drafting for added routes | Drafts `unverified_proposal` scenarios for `route-added` findings | Route shape, validation metadata | Medium: speeds up test authoring | High: the model would invent expected behavior, which breaks the oracle rule ("implementation is evidence, not the oracle"). | Later, and only as `unverified_proposal` that is never executable until reviewed. |
| D | Gap explainer | Explains why a statement is an `analysis-gap` and suggests how to bring it into the supported subset | Source snippet | Low–medium | High: needs source text, which conflicts with the privacy rule | Do not do this on free tiers. Use a static, hand-written message per gap code instead. |
| E | Failure-cause classifier for generated Playwright runs | Labels a failing generated test `genuine_regression` / `env_flake` / `approved_change` | Test ids, statuses, error class | Medium | Medium: runtime output can contain response bodies and logs. Only status, error class and assertion id are safe to send. | After A, reusing the same label vocabulary and validator. |

**Recommendation: A, finding triage.** It needs no new data, adds value even with the model switched off (most labels are deterministic; see the demo below), and has the smallest blast radius: a wrong label can't change the gate result. B is the natural follow-up because it reuses A's payload and validator.

## What the deterministic layer already decides

The rules in `poc/agentic-triage/src/rules.mjs` run before any model:

- **consumer_break**: route removed; stricter validation (`maxLength` down, `minLength` up, field now required, new required check); auth gate added; a response status no longer produced.
- **noise**: only the handler name or registration line changed, or a scoped file's hash changed with no route-level delta in that file. In practice this is common: every line shift makes core `check` report `route-observation-changed`.
- **needs_review**: an added route, loosened validation, an ambiguous type change, and every analysis gap (locked).
- **approved_change**: only via a reviewed `specgate.intent/1` file from the trusted branch. A model can never produce this label as a final result.

In the synthetic demo, six of the eight findings get a definite label without any model, and three of them are noise. The model's useful remainder is matching **free text** (PR descriptions) to findings and writing human-readable rationales.

## Free-tier fit for demos

| Provider | Default demo model | Why it fits | Watch out for |
|---|---|---|---|
| **Groq free plan** | `llama-3.1-8b-instant` (or a current `gpt-oss` model) | OpenAI-compatible, `response_format: json_object`, very low latency, so it's the best live-demo feel | Per-model RPM/TPM/RPD limits per org. Check the console's limits page. Groq's published terms say inputs and outputs are not used for training by default. Verify current data controls before a demo. |
| **Gemini API free tier** | `gemini-2.5-flash` | Strong instruction following, native JSON mode (`responseMimeType`) | Google's pricing page states free-tier content **is used to improve Google products**, and human reviewers may read it. Fine for the synthetic fixture; **never** send pilot or customer data on the free tier. |
| **Cloudflare Workers AI** | `@cf/meta/llama-3.1-8b-instruct` | 10,000 free Neurons/day; runs on the same account that could later host an edge endpoint | The daily Neuron budget is shared across models. JSON adherence of 8B models is weaker, which the strict validator absorbs (invalid suggestions are dropped). |

All three sit behind one adapter (`src/providers.mjs`): one attempt, a 15-second timeout, `redirect: 'error'`, keys only in headers, and no response bodies echoed. A failure means the report keeps its deterministic labels and records `model.status: unavailable`.

**Demo recommendation:** use Groq for live walkthroughs because of its latency. Show Gemini only on the synthetic fixture because of its training-use terms. Treat Workers AI as the fallback when Groq hits its limit.

## Privacy limits (enforced in code, tested)

- **Allowlisted payload.** Finding id and code, HTTP method, delta key, before/after scalars and direction, and the rules label. Paths and field names are pseudonymized (`route#1`, `field#1`) unless `--include-identifiers` is passed.
- **Never sent.** Source, file paths, hashes, commit SHAs, fingerprints, string literals, logs, HTML, environment values, analysis-gap findings.
- **Change-intent text.** Opt-in via a file. It is scrubbed (tokens, JWTs, PEM blocks, long hex/base64, URLs, emails, HTML tags) and capped at 1,500 characters. This is defense in depth, not a secret scanner.
- **Visible before sending.** A provider without `--send` prints the exact payload and makes no request.
- **Pilot users.** Default to `--provider none`. Recommend a paid or self-hosted model with a no-training data agreement before any non-synthetic use. That decision belongs to the owner and is not part of this spike.

## How results stay reviewable and optional

- Separate tool (`specgate-triage`), not wired into the published CLI. Removing it changes nothing about `scan`, `check` or `generate`.
- The exit code mirrors `check`. `check.passed`, the finding count and the fingerprints are copied verbatim.
- Model output lives in `modelSuggestion` next to the rules label, with `agreesWithRules`. Disagreements are flagged `⚠ disagrees` in markdown, never applied.
- The validator accepts only `{id, label, rationale}` for known ids and the four labels. Patches, unknown ids and unknown labels are dropped and counted (`rejectedSuggestions`).
- Approvals come only from a reviewed intent file on the trusted branch, the same trust model as the baseline.

## Open questions for the owner

1. Should triage ship as a `specgate triage` subcommand in a later RC, or stay a separate optional package?
2. Is step B (drafting intent-file entries from PR text) wanted, given that it moves the model closer to "approval"?
3. Is there a budget for a no-training paid tier (for example, Groq Developer or Gemini paid) before pilots try the model path on real repositories?
