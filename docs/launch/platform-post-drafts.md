# Platform post drafts: SpecGate code-first scan (+ optional triage spike)

> **DRAFTS ONLY. Nothing here has been posted, scheduled or submitted.** The owner reviews, edits and posts manually.
> Before posting, check:
> - `<LANDING_URL>` is live and is this product's landing page. The package metadata points at `https://specgate-qe-atlas.vercel.app`; verify it.
> - The npm version is current (`0.1.0-rc.2` at the time of writing).
> - The GitHub repo is still private. If it is, don't link it.
> - The optional triage is still a POC. Don't present it as shipped or required.
> - Voice: all copy speaks as QE Atlas ("we"), not as an individual.

Facts the drafts rely on, all from the README in this repository:

- local CLI, MIT, `npm exec --package=@qe-atlas/specgate@0.1.0-rc.2 -- specgate scan`;
- observe-only pilot: it flags route/source drift for a human to review;
- reads only committed Git source and never runs it; it does not take an OpenAPI file as input;
- narrow Express ESM subset;
- exit 0 means unchanged, 1 means review (not a proven defect), 2 means error;
- no consumer-compatibility mode and no code-versus-OpenAPI comparison in this build;
- pilot use only, no production qualification yet.

Do not claim that SpecGate detects or catches breaking/consumer-breaking changes, that it replaces an OpenAPI contract, or that "no OpenAPI is needed".

---

## LinkedIn (company page)

We've released an observe-only pilot of **SpecGate**, a local CLI that reads committed Express source and flags route and source drift for review.

What it does:
• Scans committed source (never runs it) and lists observed routes, validation, auth gates and response statuses, plus anything it couldn't analyse
• `specgate check` compares a PR against a reviewed baseline and flags drift (for example removed routes, changed validation or new endpoints) for a human to review
• Compiles human-reviewed scenarios into Playwright API tests

What it doesn't do: decide whether a change breaks consumers, compare against OpenAPI, auto-approve, heal tests or upload your code anywhere.

We're also exploring an *optional* triage layer that suggests a review label for each flagged item. It's deterministic by default, a free-tier model can add suggestions only if you opt in, and a human still makes the call.

It's MIT and free for pilots. The Express subset is narrow on purpose, and we're looking for teams willing to try it on a real service: <LANDING_URL>

#API #Testing #NodeJS #DevTools

---

## DEV (dev.to)

**Title:** Flagging Express route drift from committed source for human review

**Tags:** node, express, testing, api

SpecGate is an observe-only pilot. It reads **committed** source from Git objects, never imports or runs it, and records what it can observe inside a narrow Express subset: routes, type and length checks, bearer gates and literal status codes. It doesn't read OpenAPI files and it doesn't decide whether a change is compatible; it shows reviewers what drifted.

```sh
npm exec --package=@qe-atlas/specgate@0.1.0-rc.2 -- specgate scan --root . --source src --format markdown
# later, in CI, against a baseline reviewed on main:
specgate check --root . --source src --baseline trusted-baseline.json
```

Exit 0 means the declared subset is unchanged. Exit 1 means a human should look; it is not a proven defect. There's no auto-accept switch.

**What we're exploring next:** an *optional* triage step. Line moves and comment edits currently show up as drift. Deterministic rules can suggest a label for each item, such as likely noise, worth a closer look (for example stricter validation or a removed route), or listed in a reviewed intent file. A free-tier model (Groq, Gemini or Workers AI) can add a suggestion next to each label. It only sees pseudonymized deltas, never your source, and it can't change the result. Labels are suggestions for the reviewer, not a compatibility verdict.

Limits, honestly: observe-only pilot, ESM Express with literal paths, no routers or TypeScript yet, no consumer-compatibility or OpenAPI comparison. Feedback and pilot volunteers are welcome: <LANDING_URL>

---

## Hacker News (Show HN)

**Title:** Show HN: SpecGate – observe-only drift review for a narrow Express subset

**Text:**
SpecGate is a local, MIT-licensed CLI. It statically scans committed Express source (read from Git blobs, never executed) and emits route, validation, auth and status observations. `check` diffs a PR against a baseline you reviewed on the trusted branch and flags drift for review. `generate` compiles human-reviewed scenarios into Playwright API tests that only talk to 127.0.0.1.

It's deliberately narrow: ESM, `const app = express()`, literal paths, same-file handlers. Anything outside that subset is reported as a gap and blocks a green result. There's no model in the core path and no upload. It doesn't compare against OpenAPI and makes no consumer-compatibility claim.

We're prototyping an optional triage layer that suggests review labels for flagged drift. The rules are deterministic, and an advisory free-tier LLM can only add suggestions and never changes the exit code. We'd like to hear whether that's useful or just noise.

npm: @qe-atlas/specgate (0.1.0-rc.2). Observe-only pilot: not production-qualified yet.

---

## Product Hunt

**Name:** SpecGate
**Tagline:** Flag Express route drift from committed source for review
**Description:** An observe-only pilot CLI that scans committed Express source, compares each PR against a reviewed baseline and flags route/source drift for a human to review, and turns reviewed scenarios into Playwright API tests. It never runs your code, never uploads it, and never auto-approves. MIT, free pilot.
**First comment (maker):** We built SpecGate to give reviewers an explicit inventory of what changed in an Express service's routes. The supported Express subset is intentionally small, and anything it can't analyse becomes a "needs review" gap instead of a false green. It does not prove compatibility or replace correctness review. Next up is an optional triage view that suggests review labels for flagged drift. It runs without any AI, and a free-tier model can add suggestions only if you opt in. We'd love pilot users with an ESM Express service.
**Topics:** Developer Tools, Open Source, API
> Product Hunt launches are scheduled. **Do not schedule** without the owner.

---

## Buffer (short queue copy; the owner picks channels and time, nothing is scheduled)

1. SpecGate observe-only pilot: flag Express route drift from committed source for review. No upload, no auto-approve. MIT. <LANDING_URL>
2. Every flagged item needs a human, so we're testing an optional triage view that suggests review labels. Deterministic by default; AI suggestions only if you opt in. <LANDING_URL>
3. Exit 0 = unchanged. Exit 1 = look. Exit 2 = error. That's the whole SpecGate CI contract. <LANDING_URL>

---

## r/webdev: Showoff Saturday (post on a Saturday only, per subreddit rules)

**Title:** [Showoff Saturday] We made an observe-only CLI that flags Express route drift from committed source

Hi r/webdev! SpecGate is a free, MIT-licensed observe-only pilot from QE Atlas. You point it at an Express service and it lists routes, validation, auth checks and status codes by reading committed source. It never runs your code. In CI it compares each PR to a baseline you reviewed and exits 1 when something drifted, for example a removed route or a tighter length limit, so a human can take a look. It doesn't decide whether a change breaks consumers.

It's early (pilot) and supports a narrow Express ESM style, so we're looking for people to try it and tell us where it breaks. We're also experimenting with an optional triage view that suggests review labels for flagged drift. It works without AI; a free-tier model can add suggestions if you want.

`npm exec --package=@qe-atlas/specgate@0.1.0-rc.2 -- specgate scan --root . --source src --format markdown`

Feedback welcome: <LANDING_URL>
