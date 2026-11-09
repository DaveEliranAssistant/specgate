# Platform post drafts: SpecGate code-first scan (+ optional triage spike)

> **DRAFTS ONLY. Nothing here has been posted, scheduled or submitted.** The owner reviews, edits and posts manually.
> Before posting, check:
> - `<LANDING_URL>` is live and is this product's landing page. The package metadata points at `https://specgate-qe-atlas.vercel.app`; verify it.
> - The npm version is current (`0.1.0-rc.2` at the time of writing).
> - The GitHub repo is still private. If it is, don't link it.
> - The optional triage is still a POC. Don't present it as shipped or required.

Facts the drafts rely on, all from the README in this repository:

- local CLI, MIT, `npm exec --package=@qe-atlas/specgate@0.1.0-rc.2 -- specgate scan`;
- no OpenAPI input;
- reads only committed Git source and never runs it;
- narrow Express ESM subset;
- exit 0 means unchanged, 1 means review, 2 means error;
- pilot use only, no production qualification yet.

---

## LinkedIn (company page)

We've released a pilot of **SpecGate**, a local CLI that reviews API changes straight from your Express source code. No OpenAPI spec required.

What it does:
• Scans committed source (never runs it) and lists routes, validation, auth gates and response statuses
• `specgate check` compares a PR against a reviewed baseline and flags removed routes, changed validation and new endpoints
• Compiles human-reviewed scenarios into Playwright API tests

What it doesn't do: auto-approve, heal tests or upload your code anywhere.

We're also exploring an *optional* triage layer that sorts findings into "consumer break / approved change / noise". It's deterministic by default, and a free-tier model can add suggestions only if you opt in.

It's MIT and free for pilots. The Express subset is narrow on purpose, and we're looking for teams willing to try it on a real service: <LANDING_URL>

#API #Testing #NodeJS #DevTools

---

## DEV (dev.to)

**Title:** Catching breaking API changes from Express source, without an OpenAPI spec

**Tags:** node, express, testing, api

Most contract-testing tools start from an OpenAPI file. Plenty of Express services don't have one, or the one they have has drifted.

SpecGate takes the other route. It reads **committed** source from Git objects, never imports or runs it, and records what it can prove inside a narrow Express subset: routes, type and length checks, bearer gates and literal status codes.

```sh
npm exec --package=@qe-atlas/specgate@0.1.0-rc.2 -- specgate scan --root . --source src --format markdown
# later, in CI, against a baseline reviewed on main:
specgate check --root . --source src --baseline trusted-baseline.json
```

Exit 0 means the declared subset is unchanged. Exit 1 means a human should look. There's no auto-accept switch.

**What we're exploring next:** an *optional* triage step. Line moves and comment edits currently show up as findings. Deterministic rules can already label most of them `noise`, label stricter validation or removed routes `consumer_break`, and label anything listed in a reviewed intent file `approved_change`. A free-tier model (Groq, Gemini or Workers AI) can add a suggestion next to each label. It only sees pseudonymized deltas, never your source, and it can't change the result.

Limits, honestly: pilot only, ESM Express with literal paths, no routers or TypeScript yet. Feedback and pilot volunteers are welcome: <LANDING_URL>

---

## Hacker News (Show HN)

**Title:** Show HN: SpecGate – review Express API changes from source, no OpenAPI needed

**Text:**
SpecGate is a local, MIT-licensed CLI. It statically scans committed Express source (read from Git blobs, never executed) and emits route, validation, auth and status observations. `check` diffs a PR against a baseline you reviewed on the trusted branch. `generate` compiles human-reviewed scenarios into Playwright API tests that only talk to 127.0.0.1.

It's deliberately narrow: ESM, `const app = express()`, literal paths, same-file handlers. Anything outside that subset is reported as a gap and blocks a green result. There's no model in the core path and no upload.

We're prototyping an optional triage layer that labels findings consumer-break / approved / noise. The rules are deterministic, and an advisory free-tier LLM can only add suggestions and never changes the exit code. I'd like to hear whether that's useful or just noise.

npm: @qe-atlas/specgate (0.1.0-rc.2). Pilot quality: not production-qualified yet.

---

## Product Hunt

**Name:** SpecGate
**Tagline:** Catch breaking API changes from Express source. No spec needed.
**Description:** A local CLI that scans committed Express source, compares each PR against a reviewed baseline, and turns reviewed scenarios into Playwright API tests. It never runs your code, never uploads it, and never auto-approves. MIT, free pilot.
**First comment (maker):** We built SpecGate for teams whose OpenAPI file is missing or stale. The supported Express subset is intentionally small, and anything it can't prove becomes a "needs review" gap instead of a false green. Next up is an optional triage view that sorts findings into breaking / approved / noise. It runs without any AI, and a free-tier model can add suggestions only if you opt in. We'd love pilot users with an ESM Express service.
**Topics:** Developer Tools, Open Source, API
> Product Hunt launches are scheduled. **Do not schedule** without the owner.

---

## Buffer (short queue copy; the owner picks channels and time, nothing is scheduled)

1. SpecGate pilot: scan Express source for API changes with no OpenAPI file, no upload and no auto-approve. MIT. <LANDING_URL>
2. Every finding needs a human, so we're testing an optional triage view: breaking / approved / noise. Deterministic by default; AI suggestions only if you opt in. <LANDING_URL>
3. Exit 0 = unchanged. Exit 1 = look. Exit 2 = error. That's the whole SpecGate CI contract. <LANDING_URL>

---

## r/webdev: Showoff Saturday (post on a Saturday only, per subreddit rules)

**Title:** [Showoff Saturday] I made a CLI that flags breaking API changes straight from Express source (no OpenAPI)

Hi r/webdev! SpecGate is a free, MIT-licensed CLI. You point it at an Express service and it lists routes, validation, auth checks and status codes by reading committed source. It never runs your code. In CI it compares each PR to a baseline you reviewed and exits 1 when something changed, for example a removed route or a tighter length limit.

It's early (pilot) and supports a narrow Express ESM style, so I'm looking for people to try it and tell me where it breaks. I'm also experimenting with an optional "is this a real break or just noise?" triage. It works without AI; a free-tier model can add suggestions if you want.

`npm exec --package=@qe-atlas/specgate@0.1.0-rc.2 -- specgate scan --root . --source src --format markdown`

Feedback welcome: <LANDING_URL>
