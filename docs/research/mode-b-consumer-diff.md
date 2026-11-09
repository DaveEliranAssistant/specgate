# Mode B consumer diff — preview / unreleased

The question is “Will this PR break my API consumers?” This implementation finds selected static evidence of breaks; it cannot answer “no” for arbitrary Express services. It uses the hardened Git acquisition and worker scanner, validates sealed scans through gate.mjs, and adds a separate comparison because compareScans intentionally flags every changed source file. No server, OpenAPI, model, project installation or target code execution is needed.

## Implemented evidence

- Exact method/path matches ignore file/line, handler naming, comments and ordering.
- A unique same-method path shape identifies parameter renames. Appending a parameter identifies parameter addition; the old URL is also reported removed. Other URL edits conservatively remove the old route and add the new one. Method removal is distinguished when the exact path survives under another method.
- A new non-optional `typeof` body-field rejection guard is a required-field addition. Other observed validation changes need review. Enum values are not emitted or compared; enum validators require review even when unchanged.
- Literal JSON object responses expose only top-level field names and primitive types, including recognized guard rejection responses. Removal and any primitive type change are conservatively breaking. Union/nested schemas and true subtype inference are unsupported. Added response fields and routes are non-breaking observations.
- Any observed status-set change is conservatively breaking. Runtime status reachability is not proven.
- Gaps in either revision fail closed to needs_review. Unknown response identifiers, dependency calls, middleware and multiple/no terminal responses also require review. Findings may overlap (for example a required field and its validation/status change).

JSON seals bind both resolved commits, scan fingerprints, scopes, sorted findings, warning and result. Identical inputs produce identical output. Markdown is a summary; retain JSON for the sealed evidence. Fingerprints are unkeyed integrity hashes, not signatures or attestations.

Exit codes: **0** no breaking found within the supported static scope; **1** breaking or needs_review; **2** unreadable/invalid input or analysis failure. **Exit 0 is NOT a compatibility guarantee.**

## Limits and next step

Only explicitly selected committed scopes count; imports are not followed. JavaScript ESM with the scanner's literal Express `app` grammar is supported. TypeScript, JSX, CommonJS, router mounts, dynamic paths, arbitrary bindings, async handlers, decorators, general branches, serializers, database behavior and outbound calls are unsupported. Primitive value changes, behavioral meaning, consumer-specific assumptions, content types/headers, coercion, runtime middleware and dependencies outside selected scopes are not proven. Structural field additions may still violate strict consumers. No consumer tests or real-service qualification are supplied. Unsupported constructs produce gaps where recognized; this is not a proof that all hidden effects have been discovered.

The next step is a bounded, binding-aware intermediate contract representation: model branch-specific request acceptance and response shapes with explicit unknown nodes, then qualify it against independently reviewed real-service and consumer fixtures. Nested schemas, unions, imported helpers and router mounts should be added only with negative fixtures and a stated soundness boundary. Advisory triage can explain evidence, but must never change deterministic pass/fail.

## GitHub Actions example (documentation only)

This is not an installed workflow. Use an audited immutable tool revision that contains this preview. Separate tool and target checkouts prevent running a PR's modified scanner. Do not install or execute target dependencies; avoid pull_request_target and credentials in an untrusted checkout. Adapt explicit scopes for the service.

```yaml
name: Consumer diff preview
on: pull_request
permissions:
  contents: read
jobs:
  diff:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          path: tool
          repository: DaveEliranAssistant/specgate
          ref: REPLACE_WITH_AUDITED_FULL_TOOL_SHA
          persist-credentials: false
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npm ci --ignore-scripts --prefix tool/packages/specgate
      - uses: actions/checkout@v4
        with:
          path: target
          ref: ${{ github.event.pull_request.head.sha }}
          fetch-depth: 0
          persist-credentials: false
      - name: Compare committed source
        env:
          BASE_SHA: ${{ github.event.pull_request.base.sha }}
          HEAD_SHA: ${{ github.event.pull_request.head.sha }}
        run: >-
          node tool/packages/specgate/bin/specgate.mjs diff
          --root target --source src --base "$BASE_SHA" --head "$HEAD_SHA"
          --output consumer-diff.json
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: consumer-diff
          path: consumer-diff.json
```

For hardened CI, pin action versions to audited full SHAs and use isolated, resource-bounded runners with no target credentials/network. Exit 1 requires review; never automatically bless a baseline or convert an analysis gap into a green compatibility claim.

## Local validation

On Node 22.22.2, the full `npm test` suite passed 124 tests (18 root, 76 package, 21 synthetic POC, 9 optional triage). The 17 new Mode B tests cover each break category, additive changes, refactor/comment/ordering guards, gaps from both revisions, dirty-tree exclusion, seals, deterministic output, ref resolution with foreign Git environment selectors and CLI exit codes. `npm run test:proofs` passed its good-service run and matched expected seeded-defect/maintenance failures. `npm run test:pack` passed its offline installed-package smoke. `npm run audit:production` reported zero vulnerabilities in all three dependency trees. This is synthetic evidence, not real-service or consumer qualification; Node 24 and browser QA were not run locally for this change.
