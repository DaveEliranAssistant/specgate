# Deterministic scan provenance hardening

Base: `bf36fc76297480834d244609c29b78aee6c7ac11` (main).

An inherited `GIT_DIR` could override the scanner's explicit repository root.
A regression test reproduced a scan returning another repository's commit and
routes. Git acquisition now removes inherited `GIT_*` settings once per scan,
then sets noninteractive/read-only operation flags. Repository/object selectors,
configuration injection, pathspec modes and tracing cannot alter acquisition via
the caller's Git environment. Host Git configuration and repository metadata
still need the isolation documented in SECURITY.md.

Scanner and CLI regressions verify provenance, route selection, identical JSON
and empty stderr under conflicting Git environment settings. The import manifest
retains the original upstream hashes and records these changes as adaptations.

## Validation (headless relaunch, 2026-11-09)

Node v22.22.2, macOS. Continued the previous isolated checkout and feature
branch; fetched the base as a shallow commit to repair missing parent metadata.

- Before the fix, the earlier provenance regression reproduced another
  repository's substituted commit.
- `npm test`: passed sequentially: 18 root tests, 59 scanner/CLI tests,
  21 POC tests (98 total; zero failures or skips).
- `npm run test:pack`: passed. Local archive/offline install, scan,
  unchanged/changed review, generation and unsafe scope rejection passed.
  No package was published.
- `npm run test:proofs`: passed. Good service: 21/21; seeded defect: 7 failed,
  14 passed as predicted; maintenance: 1 failed, 20 passed as predicted;
  closed-port probe: ECONNREFUSED classified as fixture_or_setup_breakage.
- Proof execution rewrites timing/path-dependent evidence. Restored those
  generated artifacts to their pinned imported bytes after reviewing results;
  the imported provenance assertions were retained. An initial concurrent
  test run failed its evidence hash assertion while proofs rewrote files.
  The final unit suite was rerun sequentially after restoring evidence.
- `git diff --check`: passed.

## Next reviewable steps

1. Repeat platform qualification on Node 24 and Linux, then validate against a
   representative real service and an independently approved behavior baseline.
2. Review the Git environment boundary, especially use from Git hooks and CI.
   Add isolated negative cases for further acquisition threats as they are found.
3. Keep the public pilot observe-only and the adapter limited to the documented
   JavaScript/Express literal-route subset. No consumer compatibility or
   code-versus-OpenAPI capability is introduced here.

The checker requires no model. A later optional Groq/Gemini/Cloudflare free-tier
demo should use synthetic fixture data only, with no customer logs or page HTML,
and remain independent of deterministic scan results. No agentic integration is
added in this increment.

Draft platform copy and an optional agentic-step research note are in
`docs/drafts/first-dollar-path-platforms.md` and
`docs/plans/first-dollar-agentic-demo.md`. Nothing has been posted or scheduled.
