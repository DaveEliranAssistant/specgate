# Optional agentic triage on top of the code-first scan (spike)

**Status: proof of concept. Optional. Not part of `@qe-atlas/specgate`. Not published.**

`specgate check` answers "did the declared subset change?" and exits 1 when anything moved. That's the right gate, but a reviewer then has to work through every finding by hand. This spike adds a triage layer on top of `check` that labels each finding as one of:

| label | meaning |
|---|---|
| `consumer_break` | Existing API clients would likely fail: route removed, stricter validation, auth gate added, a response status dropped. |
| `approved_change` | Covered by a **reviewed intent file** that names the route and, optionally, the delta keys. |
| `noise` | No client-visible delta in the observed subset: handler rename, line moves, comment-only file edits. |
| `needs_review` | Additive or loosened changes (a new route, a field made optional), unclear cases, and every analysis gap. |

The deterministic rules produce the labels. A free-tier model, if you turn one on, can only add a **suggestion** shown next to each label.

## Guarantees

1. **Works with no model.** The default provider is `none`, which makes no network calls and has no dependencies beyond the core package.
2. **The gate result never changes.** `check.passed` and the exit code (0 pass / 1 review / 2 error) are the same as `specgate check`. A model can't turn a red check green.
3. **The model can't override the rules.** Its output goes into `modelSuggestion`. When it differs from the rules label, the report marks it `⚠ disagrees` and a human decides.
4. **Nothing is healed or rewritten.** There are no patches, no baseline acceptance and no assertion edits. The validator drops any model output whose id is unknown, whose label isn't one of the four, or that carries extra fields such as `patch`.
5. **Analysis gaps are locked.** They are always `needs_review`, are never sent to a model and can't be relabeled.
6. **Free tiers are not an SLA.** The tool makes one attempt with a 15-second timeout. A 429, 5xx, timeout or malformed reply leaves the deterministic report in place with `model.status: unavailable` and an error from a fixed vocabulary. Response bodies are never echoed.

## What leaves the machine (only with `--provider X --send`)

The payload is built from an allowlist (`src/payload.mjs`):

- finding id, finding code, HTTP method;
- delta keys and directions, such as `validation.length.maxLength 80 → 40 tightened`;
- the rules label.

By default, route paths and field names are replaced with stable pseudonyms (`route#1`, `field#1`). `--include-identifiers` sends the real values, and only on request.

The payload **never** contains source text, file paths, content hashes, commit SHAs, fingerprints, string literals, logs, page HTML or environment values. Free-text change intent (for example, a PR description) is sent only when you pass `--intent-text FILE`. Before sending, it is scrubbed of token-shaped strings (GitHub, Slack, AWS and Google keys, `sk-` keys, bearer tokens, JWTs, PEM blocks, long hex or base64 strings), URLs, email addresses and HTML tags, then capped at 1,500 characters. The scrubber is defense in depth, not a secret scanner. Don't put customer logs or secrets in that file.

Without `--send`, choosing a provider only prints the payload that **would** be sent, on stderr, and makes no request.

## Usage

```sh
# 1. Deterministic only (default). No keys, no network.
node poc/agentic-triage/bin/specgate-triage.mjs \
  --baseline trusted-baseline.json --current current-scan.json --format markdown

# 2. Add reviewed approvals (trusted file from the base branch, like the baseline)
#    {"schemaVersion":"specgate.intent/1","review":{"reference":"CHANGELOG.md#v2"},
#     "approved":[{"routeId":"route.<24 hex>","keys":["route-removed"],"reference":"CHANGELOG.md#drop-delete"}]}
node poc/agentic-triage/bin/specgate-triage.mjs ... --intent reviewed-intent.json

# 3. Preview the model payload (no request)
node poc/agentic-triage/bin/specgate-triage.mjs ... --provider groq

# 4. Ask a free-tier model for advisory suggestions (explicit opt-in)
GROQ_API_KEY=... node poc/agentic-triage/bin/specgate-triage.mjs ... --provider groq --send
GEMINI_API_KEY=... ... --provider gemini --send
CLOUDFLARE_ACCOUNT_ID=... CLOUDFLARE_API_TOKEN=... ... --provider cloudflare --send
# Override the default model with SPECGATE_TRIAGE_MODEL (names are validated against a strict pattern).
```

Default models: Groq `llama-3.1-8b-instant`, Gemini `gemini-2.5-flash`, Workers AI `@cf/meta/llama-3.1-8b-instruct`. Free-tier model lists change, so check each console before a demo.

## With and without the extra: the synthetic demo

`node poc/agentic-triage/scripts/demo.mjs` builds a throwaway two-commit Express repo and writes `evidence/`. It makes no network calls; the "model" run replays a **simulated** reply.

| finding | `specgate check` alone | + triage, no model | + reviewed intent | + simulated model suggestion |
|---|---|---|---|---|
| `POST /tickets` maxLength 80→40 | route-observation-changed | **consumer_break** | consumer_break | agrees |
| `DELETE /tickets/:id` removed | route-removed | **consumer_break** | **approved_change** | not sent back (invalid label `rewrite_assertion` dropped) |
| `PATCH /tickets/:id` title optional | route-observation-changed | needs_review | needs_review | approved_change ⚠ disagrees (intent text says so; a human confirms) |
| `GET /health` handler renamed | route-observation-changed | **noise** | noise | agrees |
| `GET /tickets/:id` line moved only | route-observation-changed | **noise** | noise | — |
| `GET /audit` added | route-added | needs_review | needs_review | approved_change ⚠ disagrees |
| `src/helpers.mjs` comment edit | source-changed | **noise** | noise | — |
| `src/service.mjs` changed | source-changed | consumer_break (inherited) | consumer_break | noise ⚠ disagrees (deliberately wrong; the rules label stands) |
| exit code | 1 | 1 | 1 | 1 |

Takeaways:

- **Most of the value is deterministic.** Without any model, six of the eight findings get a definite label (not `needs_review`), and three of them are noise. Line moves alone make the core check report `route-observation-changed`; triage collapses them.
- **The model is useful where text is involved.** It can match a free-text PR description to findings ("Make PATCH title optional"). It can't approve anything; approval still needs the reviewed intent file.
- **When the model is wrong or rate-limited, nothing degrades.** See `evidence/4-simulated-model.md` and `evidence/5-free-tier-rate-limited.md`.

**Not verified here:** live calls to Groq, Gemini or Workers AI. No free-tier keys were available in this environment. `scripts/demo.mjs --live <provider>` runs one live call when keys are present.

## Tests

```sh
node --test poc/agentic-triage/test/*.test.mjs   # also included in the root `npm test`
```

The tests cover:

- deterministic labels and approval scoping;
- an invariant check result and exit code;
- payload allowlisting and pseudonymization;
- scrubbing of secrets, JWTs, HTML, URLs and emails;
- locked analysis gaps;
- strict suggestion validation;
- 429, 5xx, timeout and malformed-reply fallbacks;
- endpoint shape, with keys sent only in headers;
- CLI exit codes and the no-network dry run.

All tests use an injected `fetch`, so they never touch the network.
