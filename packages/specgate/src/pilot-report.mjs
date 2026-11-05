import { compareScans } from "./gate.mjs";
import { generateTests } from "./generate.mjs";
import { canonical, hash, seal } from "./scan.mjs";

// Mapping reviewed steps is not another discovery engine. Inputs are first
// checked by the existing scenario compiler against the accepted scan.
function matches(route, step) {
  if (route.method !== step.method) return false;
  const left = route.path.split("/"),
    right = step.path.split("/");
  return (
    left.length === right.length &&
    left.every((part, i) =>
      part.startsWith(":")
        ? /^(?:[A-Za-z0-9_-]+|\{\{[A-Za-z][A-Za-z0-9_]*\}\})$/.test(right[i])
        : part === right[i],
    )
  );
}
const endpoint = (r) => ({ routeId: r.id, method: r.method, path: r.path });
const location = (r) => (r ? { file: r.file, line: r.line } : null);
const warning =
  "Static source observations only, not API compatibility or behavioral validation. Reviewed assertions are never rewritten. A reference is not proof of approval; protect trusted inputs operationally.";
const unassessedScope = [
  "Only explicit committed Git source scopes and the documented Express grammar are analyzed; untracked/working-tree changes and excluded files are not assessed.",
  "Imports outside supplied scopes, database/outbound dependencies, general control flow, authorization correctness, response schemas and full consumer compatibility are unassessed.",
  "Scenario-to-route association is not executed behavioral coverage, approved review identity, freshness, or proof that every route/state is represented.",
  "File hashes detect drift, including comments; registration locations are not exact changed statement locations or proof of a behavioral defect.",
];
export function buildPilotReport({ baseline, current, scenarios } = {}) {
  const check = compareScans(baseline, current);
  if (scenarios !== undefined) {
    // Internal structural-validation projection only: not a scan, baseline, or
    // completeness claim. Keep removed references and new supported routes
    // available to the existing compiler without rewriting either input.
    const { fingerprint, ...binding } = baseline;
    const routes = [
      ...new Map(
        [...baseline.routes, ...current.routes].map((r) => [r.id, r]),
      ).values(),
    ];
    const files = [
      ...new Map(
        [...baseline.files, ...current.files].map((f) => [f.path, f]),
      ).values(),
    ];
    generateTests(
      scenarios,
      seal({ ...binding, routes, files, gaps: [], complete: true }),
    );
  }
  const definitions = scenarios?.scenarios ?? [];
  const expectations = (route) =>
    definitions.flatMap((s) =>
      [
        ...s.steps.map((step) => ({ step, kind: "action" })),
        ...(s.cleanup ?? []).map((step) => ({ step, kind: "cleanup" })),
      ]
        .filter((x) => matches(route, x.step))
        .map(({ step, kind }) => ({
          scenarioId: s.id,
          classification: s.classification,
          reference: scenarios.review.reference,
          method: step.method,
          path: route.path,
          pathKind: "route-template",
          kind,
          expectedStatus: step.expected.status,
          bodyAssertion:
            "bodyEquals" in step.expected
              ? "exact"
              : "bodyMatch" in step.expected
                ? "subset"
                : "none",
          execution: "NOT_EXECUTED",
        })),
    );
  const previous = new Map(baseline.routes.map((r) => [r.id, r]));
  const next = new Map(current.routes.map((r) => [r.id, r]));
  const inventory = current.routes.map((r) => ({
    ...endpoint(r),
    source: location(r),
    observations: {
      auth: r.auth,
      validation: r.validation,
      responseStatuses: r.responseStatuses,
    },
    reviewedExpectations: expectations(r),
  }));
  const findings = check.findings.map((f) => {
    const before = previous.get(f.routeId),
      after = next.get(f.routeId);
    const candidates = f.routeId
      ? [after ?? before]
      : [
          ...new Map(
            [...baseline.routes, ...current.routes]
              .filter((r) => r.file === f.file)
              .map((r) => [r.id, r]),
          ).values(),
        ];
    const references = [
      ...new Map(
        candidates.flatMap(expectations).map((x) => [canonical(x), x]),
      ).values(),
    ];
    const missing = f.code === "route-removed" && !current.complete;
    const assessment =
      f.code === "analysis-gap" || missing ? "unknown" : "unverified-change";
    const recommendedAction = missing
      ? "Investigate unsupported scope before claiming endpoint removal; run the unchanged independently reviewed expectations in an approved isolated environment."
      : f.code === "route-added"
        ? "Obtain independent reviewed expectations for the added endpoint; do not infer assertions from its implementation."
        : f.code === "analysis-gap"
          ? "Review the unsupported construct manually; do not interpret missing observations as compatibility."
          : "Review the source change and run relevant unchanged independently reviewed scenarios; fix a confirmed defect or approve a requirement change separately.";
    return {
      code: missing ? "route-not-observed" : f.code,
      scannerCode: f.code,
      assessment,
      source: {
        base:
          location(before) ??
          (f.file ? { file: f.file, line: f.line ?? null } : null),
        head:
          location(after) ??
          (f.file ? { file: f.file, line: f.line ?? null } : null),
      },
      locationPrecision:
        f.code === "source-changed"
          ? "route-registration-in-changed-file"
          : "route-registration-or-gap",
      affectedEndpoints: candidates.map((r) => ({
        ...endpoint(r),
        source: location(r),
      })),
      endpointAssociation: f.routeId
        ? "route-identity"
        : "file-level-candidates-not-proven-impact",
      reviewedExpectations: references,
      expectationStatus: references.length
        ? "references-not-executed"
        : "unassessed",
      reason: f.reason ?? "Static drift; no confirmed behavioral diagnosis.",
      observationDelta:
        before && after
          ? {
              responseStatuses: {
                before: before.responseStatuses,
                after: after.responseStatuses,
              },
            }
          : null,
      recommendedAction,
    };
  });
  const without = inventory.filter(
    (r) => !r.reviewedExpectations.length,
  ).length;
  const verdict = !current.complete
    ? "INCOMPLETE"
    : check.passed && definitions.length && without === 0
      ? "UNCHANGED_DECLARED_SUBSET"
      : "REVIEW_REQUIRED";
  return {
    schemaVersion: "specgate.pilot/1",
    toolVersion: "0.1.0-rc.1",
    buildStatus: "unreleased-source-candidate",
    mode: "observe-only",
    verdict,
    exitCode: verdict === "UNCHANGED_DECLARED_SUBSET" ? 0 : 1,
    compatibility: "NOT_ASSESSED",
    behavioralValidation: "NOT_EXECUTED",
    source: {
      baseCommit: baseline.sourceCommit,
      headCommit: current.sourceCommit,
      scopes: current.scopes,
      baseFingerprint: baseline.fingerprint,
      headFingerprint: current.fingerprint,
    },
    reviewedScenarioFingerprint: scenarios ? hash(canonical(scenarios)) : null,
    coverage: {
      status: current.complete ? "declared-subset-only" : "incomplete",
      observedRoutes: inventory.length,
      routesWithReviewedScenario: inventory.length - without,
      routesWithoutReviewedScenario: without,
      executedScenarios: 0,
      unsupportedConstructs: current.gaps,
      unassessedScope,
    },
    routes: inventory,
    scenarios: definitions.map((s) => ({
      id: s.id,
      classification: s.classification,
      reference: scenarios.review.reference,
      status: "NOT_EXECUTED",
      review: "caller-asserted-not-verified",
    })),
    findings,
    warning,
  };
}
const esc = (v) =>
  String(v ?? "unknown")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replace(/[\\`*_|\[\]]/g, "\\$&");
export function pilotMarkdown(r) {
  const lines = [
    "# SpecGate developer pilot — observe only",
    "",
    esc(r.verdict),
    "",
    esc(r.warning),
    "",
    "## Coverage",
    `Observed routes: ${r.coverage.observedRoutes}; associated with reviewed scenarios: ${r.coverage.routesWithReviewedScenario}; without reviewed scenarios: ${r.coverage.routesWithoutReviewedScenario}; executed scenarios: 0.`,
    ...r.coverage.unassessedScope.map((x) => "- " + esc(x)),
    "",
    "## Supported route observations",
    ...r.routes.map(
      (x) =>
        `- ${esc(x.method)} ${esc(x.path)} — ${esc(x.source.file)}:${x.source.line}; reviewed scenarios: ${x.reviewedExpectations.map((e) => esc(e.scenarioId)).join(", ") || "none (unassessed)"}`,
    ),
    "",
    "## Unsupported constructs",
    ...r.coverage.unsupportedConstructs.map(
      (g) => `- ${esc(g.code)} — ${esc(g.file)}:${g.line ?? "unknown"}`,
    ),
    "",
    "## Reviewed scenarios (not executed)",
    ...r.scenarios.map(
      (x) =>
        `- ${esc(x.id)} — ${esc(x.classification)}; ${esc(x.reference)}; NOT EXECUTED`,
    ),
    "",
    "## Detected changes",
  ];
  for (const f of r.findings) {
    lines.push(
      `### ${esc(f.code)} — ${esc(f.assessment)}`,
      `Source base: ${esc(f.source.base?.file)}:${f.source.base?.line ?? "unknown"}; head: ${esc(f.source.head?.file)}:${f.source.head?.line ?? "unknown"}. ${esc(f.locationPrecision)}.`,
      ...f.affectedEndpoints.map(
        (e) =>
          `- Endpoint candidate: ${esc(e.method)} ${esc(e.path)} — ${esc(e.source.file)}:${e.source.line}`,
      ),
      ...f.reviewedExpectations.map(
        (e) =>
          `- Reviewed expectation: ${esc(e.scenarioId)}; ${esc(e.method)} ${esc(e.path)}; HTTP ${e.expectedStatus}; body assertion ${esc(e.bodyAssertion)}; reference ${esc(e.reference)}; NOT EXECUTED.`,
      ),
      `Expectation status: ${esc(f.expectationStatus)}.`,
      esc(f.recommendedAction),
      "",
    );
  }
  if (!r.findings.length)
    lines.push(
      "No static changes in the declared subset; no API compatibility or behavioral pass is claimed.",
    );
  return lines.join("\n") + "\n";
}
