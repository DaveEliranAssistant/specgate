# SpecGate platform drafts

UNPUBLISHED DRAFTS — owner review required. Do not post, submit, schedule or
publish from this document. Links point to the repository, not a launch page.
The hardening change is a draft PR; copy deliberately describes it as proposed.
Public SpecGate remains an observe-only pilot. No agentic feature is shipped.

## LinkedIn company page

Release review starts with knowing what the checker actually inspected.

SpecGate is an observe-only pilot for a constrained JavaScript/Express
literal-route subset. Its deterministic local scanner reads committed Git
source without executing the service or calling a model, and reports observed
routes and analysis gaps for human review.

Our proposed hardening change isolates source acquisition from inherited Git
settings, with regression tests checking repository provenance and repeatable
CLI output. Unsupported framework patterns still require manual review.

We are looking for feedback from teams with small Express services: what would
you need to review before trusting a source-derived route inventory?

https://github.com/DaveEliranAssistant/specgate

## DEV

Title: Keeping a code-first API scan tied to the repository you selected

A deterministic report is only useful if it describes the input you selected.
SpecGate reads committed Git blobs, but inherited Git environment settings can
override the repository root passed through Git's `-C` flag. A regression test
reproduced another checkout's commit and route appearing in the scan.

The proposed fix removes inherited `GIT_*` settings from acquisition subprocesses
and restores explicit noninteractive flags. Tests cover repository/object
selectors, injected configuration and identical CLI JSON. This does not replace
isolated repository metadata or a trusted Git executable.

The scope stays narrow: an observe-only pilot with a constrained JavaScript/Express
literal-route adapter. Observations are not correctness assertions. Dynamic
routes, routers and unsupported middleware remain gaps, and no model is needed.
The separate synthetic POC exercises reviewed scenarios against a good service,
a seeded defect and a maintenance edit.

Next: review this boundary, qualify additional platforms, and evaluate a real
service against independently approved expected behavior.

Code and limitations: https://github.com/DaveEliranAssistant/specgate

## Hacker News Show HN

Title: Show HN: SpecGate – deterministic source scans for a small Express subset

We’re building SpecGate, an observe-only pilot that scans committed service source
locally and reports observed routes and unsupported analysis. It currently
supports a constrained JavaScript/Express literal-route subset, not general
framework analysis. It needs no model and does not execute scanned code.

A proposed hardening change prevents inherited Git environment settings from
redirecting acquisition to another checkout. The separate synthetic POC runs
reviewed API scenarios and checks predicted seeded-defect failures.

We’d value criticism of the provenance boundary and the distinction between an
implementation observation and an independently approved assertion. There is
no consumer-compatibility or code/OpenAPI comparison feature in this build.

https://github.com/DaveEliranAssistant/specgate

## Product Hunt

Name: SpecGate
Tagline: Local source observations for focused Express release review

Description: An observe-only pilot that scans committed JavaScript/Express
literal routes and reports observed behavior and coverage gaps. Deterministic,
local and model-free. The supported adapter is intentionally narrow; unsupported
patterns require human review. A separate synthetic POC demonstrates execution
of independently reviewed API scenarios.

Maker comment: We are testing whether a bounded, explicit inventory helps
reviewers ask better release questions. Our current draft hardens Git source
provenance. It does not prove compatibility or replace correctness review.
We welcome feedback on the limits and report format before broader adoption.

Link: https://github.com/DaveEliranAssistant/specgate

## Buffer

SpecGate is an observe-only pilot for a constrained JavaScript/Express
literal-route subset. The local deterministic scanner needs no model.
Our draft hardens Git source provenance and adds CLI regressions.
Feedback welcome: https://github.com/DaveEliranAssistant/specgate

## r/webdev Showoff Saturday

Title: Showoff Saturday: a bounded, model-free Express source scanner

We’re working on SpecGate, an observe-only pilot that inventories committed
JavaScript/Express literal routes and reports gaps. It parses source without
running it or calling a model. Routers, dynamic routes and general framework
coverage are outside the supported subset.

The current draft fixes a provenance issue where inherited Git settings could
redirect a scan to another checkout. A separate synthetic POC runs reviewed
API scenarios against good and deliberately changed fixtures.

Would route/file references plus explicit unsupported-analysis gaps help your
review workflow? We’re especially interested in where the report could create
false confidence. Repo: https://github.com/DaveEliranAssistant/specgate

Posting note: Check the current subreddit thread and rules manually before any
future submission. This document authorizes no posting or scheduling.
