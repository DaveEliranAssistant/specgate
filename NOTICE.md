# Source provenance and license

SpecGate is released under the [MIT License](LICENSE), as approved by the owner on 2026-11-05.

This repository begins with an allowlisted committed snapshot from [DaveEliranAssistant/qe-atlas](https://github.com/DaveEliranAssistant/qe-atlas) at `b24b96daf16814b11b6d225d3b502f4acfb7a2c2`. Its last runtime code change was `44d999ad9055844826b9edbf0250327a7e636682`; the later source revision adds verification documentation.

The bounded discovery engine originates in Grok's source-first proof of concept at upstream commit `8d5766c8c3a51fb14a43ebd50f6e5a3760307b74`. Hermes added the scanner hardening, CLI, reviewed-scenario compiler, packaging, regression tests and release preparation. Original authorship is retained through explicit attribution and upstream commit references.

This is a **snapshot migration, not a Git-history-preserving clone**. The upstream repository retains the original ancestry and draft PRs. Nested `NOTICE.md`, README and release reports were copied unchanged to preserve the verified artifact; phrases such as “this same private repository” and claims about ancestry there refer to the upstream QE Atlas context, not this new Git history.

[The migration manifest](docs/provenance/import-manifest.json) records SHA-256 for every imported file. The migration integrity test checks all imported bytes, with one explicitly recorded adaptation: the proof artifact test verifies the pinned upstream scenario revision and file hashes rather than requiring upstream Git ancestry in this new repository. Its behavior/oracle assertions are unchanged. Future source modifications should explicitly update migration accounting rather than silently implying the original hashes still match.

Acorn and Playwright/Express dependencies retain their own licensing terms. No credentials, personal knowledge store, other product source, live account data or local uncommitted adoption files were imported.
