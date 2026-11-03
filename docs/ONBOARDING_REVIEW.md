# Customer onboarding review

This branch adds a reviewable guided-pilot onboarding experience, not a production launch. Start at [the onboarding guide](../onboarding/README.md).

## Delivered

- A responsive four-step experience: scope fit → private install → understand a report → prepare a pilot brief.
- Local-only support check that refuses to call unsupported frameworks/handlers or uncommitted source ready.
- Actual recorded synthetic CLI examples: declared-subset scan (0), source drift (1), unsupported async handler (1). Source commit/hash and native reports are visible. The original check signal is not relabeled as consumer compatibility.
- A downloadable private-archive setup guide and helper that verifies SHA-256 before installation, installs offline with a fresh npm cache and lifecycle scripts disabled, pins the scanned commit, retains status 1 and maps setup/tool failures to 2. It refuses both existing destinations and destinations inside the service repository.
- Trust/troubleshooting notes and a local pilot-brief template. Downloading is not a signup, email or access grant.
- A self-contained static HTML build with exactly five allowlisted files. Scanner source/runtime, dependencies and repository metadata are excluded. No external assets, analytics, source-upload endpoint or data persistence.

## Verified locally

See [machine-readable verification](reports/onboarding-verification.json), [desktop screenshot](reports/onboarding-desktop.png) and [mobile screenshot](reports/onboarding-mobile.png).

- TDD: the four initial onboarding tests failed for missing features, then passed. A later regression test demonstrated that a pilot destination inside a service repo was accepted; the helper now refuses it before writing.
- 4 onboarding/installation tests and 30 existing static/provenance regression tests passed on macOS with Node 22.22.2.
- The customer helper was exercised against the actual locally packed, unchanged private CLI. Target Express dependencies were deliberately unavailable; target code was not imported/started. Bad digest, existing destination and unsafe source scope were refused; unsupported analysis stayed exit 1; uncommitted changes stayed excluded.
- 11 browser checks passed in actual local Chrome: fit decisions, all three native recordings, keyboard skip/disclosure, copy success/denied fallback, real pilot-brief download, all links, no source files served, no-JS fallback, no horizontal mobile overflow, no page errors and no external requests.
- axe found zero violations at desktop and mobile sizes. This is not a full manual accessibility certification.
- [Independent read-only review](reports/onboarding-independent-review.json) passed with no security or logic concerns. The recording source-hash/commit consistency suggestion was implemented; a follow-up fully read the reformatted CSS and updated tests with no remaining concerns. This is a source review, not execution evidence.
- Root npm audit reported zero vulnerabilities. The only added dependency is exact-pinned development-only @axe-core/playwright with its axe-core dependency.
- Git diff verifies that packages/specgate, POC code/baselines and existing workflows are unchanged.

## Explicit remaining gates

- Not deployed. No existing Vercel project, signup database, Pages configuration or Hermes publisher was changed.
- Authenticated private-release CI install remains blocked by the scoped reader credential. A local offline archive install does not prove cross-repository download.
- Existing full CI was deliberately not triggered: its runtime/proof steps start service fixtures, conflicting with the current no-scanned-service-execution constraint. The commit uses [skip ci]; no existing assertion, workflow or baseline is weakened. This PR does not claim remote CI is green.
- Linux/Node24 execution of the new helper, real-service qualification and production enforcement are not verified.
- This is existing scan/check onboarding, not conform/diff implementation or C/D/E consumer-compatibility validation.

Review/publish is a separate owner decision. No merge, closure, main push or release is authorized by this PR.
