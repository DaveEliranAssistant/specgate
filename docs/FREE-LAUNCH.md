# Free launch readiness — 2026-11-05

This branch prepares a public product landing export, not a deployment. Existing recorded reports are synthetic actual CLI captures; no customer qualification is claimed. Free observe-only means human review of a supported subset, no automatic release blocking. Private archive delivery still requires a coordinator, archive and digest. Representative service qualification is separate SpecGate PR #6; this branch does not change the engine or claim that gate passed.

## Deployment proposal

`vercel.json` builds the allowlisted static export with `npm run build:onboarding` and serves only `dist/onboarding`. Connect the SpecGate repository root to the existing specgate project only after owner review; do not change SSO/protection or deploy as part of this PR. Existing output refusal is intentional; use a fresh build checkout. The root is private; CLI and fixtures never enter the site export.

## Waitlist

Modeled on A11yGate's explicit consent, unavailable-state handling and server-only database design. The disabled UI has no submit handler, fetch, storage or success message. A11yGate's endpoint/database is not reused: cross-product ownership and consent have not been verified. No secrets added or requested for this static build.

Future server integration requires an approved SpecGate-owned database, server-only `DATABASE_URL_POOLED` (or `DATABASE_URL`), migration/schema, explicit purpose and withdrawal/retention policy, email validation, bounded payloads, rate limiting, deduplication and tests that missing credentials/write failure return 503 without claiming success. Do not expose a DB URL through NEXT_PUBLIC variables or static assets. Until then registration stays disabled regardless of environment variables.

## Distribution blocker

The inherited NOTICE explicitly withholds public distribution permission. Package metadata is prepared but `private: true` and `UNLICENSED` retain that boundary. The owner must resolve source rights/license before npm publication. See the package README for exact future qe-atlas npm commands. No publication occurs here.

## Read-only live evidence

2026-11-05: unauthenticated `curl -I https://specgate.vercel.app` returned HTTP 200 and HTML titled “SpecGate — Pre-Flight Deployment Portal”, loading hashed JS/CSS assets. It is a different thin pre-flight site, not evidence that this repository's onboarding is deployed. Authenticated Vercel API `GET /v9/projects/specgate?teamId=qe-atlas` returned 404, and a team project listing returned no SpecGate-named project. Actual alias ownership/source is therefore not verified; a 404 may mean inaccessible scope. Do not replace or link that project blindly. The checked-in build configuration is a reviewable proposal, not proof of live source wiring.

## Local verification

Node v22.22.2: `npm test` passed 68 tests (6 repository/onboarding, 41 CLI, 21 POC). `npm run test:pack` passed an empty-cache offline installation plus supported scan, unchanged/changed checks, generation and unsafe-path refusal. `npm run build:onboarding` passed. `npm run test:onboarding:browser` passed desktop/mobile, keyboard, downloads, recorded examples, copy fallback, no-JS and axe checks (zero violations and external requests). Existing browser assertion was updated only for the changed product heading. Migration source hashes remain intact with explicit launch-doc/metadata adaptations; engine bytes are unchanged.

`npm run test:proofs` also passed: 21 clean Playwright API cases; seeded-defect 7 expected failures/14 passes and maintenance 1 expected failure/20 passes matched predictions; setup probe classified ECONNREFUSED. These execute controlled synthetic fixtures only. Generated evidence timestamps were restored to retain historical pinned recordings. `npm run audit:production` reported zero vulnerabilities for root, CLI and POC. Alias lookup `GET /v4/aliases/specgate.vercel.app?teamId=qe-atlas` also returned 404; only the qe-atlas team was visible.
