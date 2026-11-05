# Implementation provenance

`src/engine/discover.mjs`, `hash.mjs` and `constants.mjs` originate from Grok's code-first service-testing POC in the upstream QE Atlas repository, branch `grok/code-first-service-tests`, commit `8d5766c8c3a51fb14a43ebd50f6e5a3760307b74` (draft PR #1). The parent implementation/attribution is preserved in Git history.

Hermes added pinned Git-blob acquisition, resource-bounded worker parsing, safe observation projection, CLI/report/check contract, reviewed-scenario compilation and production-preparation tests/docs. The packaged discovery adapter adds synchronous block-bodied inline-handler support and fail-closed function/binding/import-argument checks identified by independent review. The independent POC remains under `poc/code-first-service-tests/`; only its vulnerable Express dependency/lockfile is updated on this branch, with reproduced tests. Its synthetic-only runtime, credentials and generated artifacts are not part of the packed CLI.

SpecGate is released under the MIT License (see `LICENSE`), as approved by the owner on 2026-11-05. Acorn is a separate dependency with its own license metadata.
