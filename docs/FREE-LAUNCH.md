# Free launch readiness — 2026-11-05

This branch prepares a public product landing export, not a deployment. Existing recorded reports are synthetic actual CLI captures; no customer qualification is claimed. Free observe-only means human review of a supported subset, no automatic release blocking. Private archive delivery still requires a coordinator, archive and digest. Representative service qualification is separate SpecGate PR #6; this branch does not change the engine or claim that gate passed.

## Deployment proposal

`vercel.json` builds the allowlisted static export with `npm run build:onboarding` and serves only `dist/onboarding`. Connect the SpecGate repository root to the existing specgate project only after owner review; do not change SSO/protection or deploy as part of this PR. Existing output refusal is intentional; use a fresh build checkout. The root is private; CLI and fixtures never enter the site export.

## Waitlist

`POST /api/waitlist` is a Vercel function (`api/waitlist.mjs`) modeled on A11yGate's waitlist: explicit consent, normalized and deduplicated email, a 4 KiB payload bound, a per-instance rate limit, a honeypot and no stored IP. It collects less than A11yGate, with no role or company. A11yGate's endpoint and database are not reused.

The form stays hidden until `GET /api/waitlist` reports a configured database. Without one, the page says the waitlist is temporarily unavailable, the API returns 503 and no success is claimed. A failed write also returns 503.

### Owner setup

No database or secret is created by this repository. As of 2026-11-06 the waitlist code is merged but not deployed, and no `DATABASE_URL_POOLED` is configured.

1. Create a Postgres database owned by SpecGate, separate from A11yGate.
2. In the SpecGate Vercel project, set server-only `DATABASE_URL_POOLED` (preferred) or `DATABASE_URL`. See `.env.example`. Never use a `NEXT_PUBLIC_` name or a static asset.
3. Connect the Vercel project to this repository's root. `npm run vercel-build` applies `sql/waitlist.sql` when a URL is set, then builds the static export. If a URL is set and the migration fails, the build stops and the log redacts the connection string. Without a URL the migration is skipped.

`npm run db:migrate` runs only the migration, using a URL already in the environment.

The page tells visitors that signups are kept until they ask for deletion, and that deletion requests go to dave.eliran.assistant@gmail.com. There is no automatic expiry. The owner should confirm this wording before opening the waitlist.

## Distribution

SpecGate is MIT licensed, approved by the owner on 2026-11-05. `@qe-atlas/specgate@0.1.0-rc.1` is published on npm with dist-tags `latest` and `next` (registry readback 2026-11-06). The package is `private: false`, `license: MIT`, and its tarball includes `LICENSE`. The repository root stays `private` in `package.json` and is not published. Publishing needs an npm login with two-factor authentication or a granular token with 2FA bypass. `packages/specgate/README.md` ships in the tarball. The GitHub repository remains private and its visibility is a separate owner decision: while it is private, the package's `repository` and `bugs` links return 404 for the public. The published `homepage` metadata points to https://specgate.vercel.app, which is not this product's landing (see below); correcting registry metadata needs a new package version. No public product website or hosted signup is live.

## Read-only live evidence

2026-11-05: unauthenticated `curl -I https://specgate.vercel.app` returned HTTP 200 and HTML titled “SpecGate — Pre-Flight Deployment Portal”, loading hashed JS/CSS assets. It is a different thin pre-flight site, not evidence that this repository's onboarding is deployed. Authenticated Vercel API `GET /v9/projects/specgate?teamId=qe-atlas` returned 404, and a team project listing returned no SpecGate-named project. Actual alias ownership/source is therefore not verified; a 404 may mean inaccessible scope. Do not replace or link that project blindly. The checked-in build configuration is a reviewable proposal, not proof of live source wiring.

## Local verification

Node v22.22.2: `npm test` passed 68 tests (6 repository/onboarding, 41 CLI, 21 POC). `npm run test:pack` passed an empty-cache offline installation plus supported scan, unchanged/changed checks, generation and unsafe-path refusal. `npm run build:onboarding` passed. `npm run test:onboarding:browser` passed desktop/mobile, keyboard, downloads, recorded examples, copy fallback, no-JS and axe checks (zero violations and external requests). Existing browser assertion was updated only for the changed product heading. Migration source hashes remain intact with explicit launch-doc/metadata adaptations; engine bytes are unchanged.

`npm run test:proofs` also passed: 21 clean Playwright API cases; seeded-defect 7 expected failures/14 passes and maintenance 1 expected failure/20 passes matched predictions; setup probe classified ECONNREFUSED. These execute controlled synthetic fixtures only. Generated evidence timestamps were restored to retain historical pinned recordings. `npm run audit:production` reported zero vulnerabilities for root, CLI and POC. Alias lookup `GET /v4/aliases/specgate.vercel.app?teamId=qe-atlas` also returned 404; only the qe-atlas team was visible.
