# Customer onboarding preview

A static guided-pilot experience for the EXISTING scan/check candidate, published on npm as `@qe-atlas/specgate@0.1.0-rc.1`. It is not a hosted signup or a claim that unreleased API-compatibility modes work.

## Build and preview

```bash
npm run build:onboarding
python3 -m http.server 8766 --bind 127.0.0.1 --directory dist/onboarding
```

Open http://127.0.0.1:8766. Serve ONLY dist/onboarding, never the repository root. Build refuses an existing output directory; use a new path with `node scripts/build-onboarding.mjs /absolute/new/output` rather than silently overwriting assets. The one exception is on Vercel (`VERCEL` set), whose builder runs the build command twice: a directory holding exactly the allowlisted export is reused untouched, and anything else is still refused.

The allowlisted export contains only index.html, quickstart.md, quickstart.sh, trust.md and pilot-brief.md. All CSS/JS/recorded JSON is embedded in index.html, with no external dependencies at runtime. The scanner, its bundled parser, fixtures, repository files and private packages are not exported. No deployment configuration or account state is changed. The standalone index.html also works without a server; offline clipboard access may fall back to manual selection.

## Verification

```bash
npm run test:onboarding
npx --no-install playwright install chromium --only-shell
npm run test:onboarding:browser
```

For local installed Chrome, set `REPORT_BROWSER_CHANNEL=chrome`. Browser checks start their own loopback allowlist server, cover desktop/mobile, fit results, copy fallback/success, all three recorded results, download/navigation, no unexpected network requests, keyboard focus, no-JS fallback and axe accessibility. They do not execute scanned service code. The archive-install test packs the unchanged private candidate, installs offline with an empty cache and scans controlled committed source with service dependencies deliberately unavailable. It proves REVIEW and error preservation, digest refusal, no overwrites and exclusion of uncommitted edits. It is NOT authenticated release-download evidence.

Recordings were captured by `node scripts/record-onboarding.mjs` from controlled source and have source commits/hashes, scanner revision and actual native output. That script prints NEW recording data for review; it never overwrites approved expectations. Do not regenerate recordings to make a regression pass.

## Deliberate remaining gates

- No public deployment. The waitlist API stays closed until the owner connects a SpecGate database.
- No cross-repository CI artifact install until scoped reader provisioning and real download proof.
- No real-customer qualification or production enforcement.
- No conform/diff implementation or C/D/E compatibility proof.
- Existing CI service-runtime proof jobs require separate execution approval under the no-scanned-service-execution constraint; this onboarding PR uses a skip-ci commit and reports its targeted local verification explicitly. Existing assertions, workflows and baselines are unchanged.
