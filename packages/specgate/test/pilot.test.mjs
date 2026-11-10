import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scanRepository } from "../src/scan.mjs";
import { commitFixture } from "./fixture-git.mjs";
const source =
  "import express from 'express';export const app=express();app.post('/tickets',(req,res)=>{res.status(201).json({ok:true});});";
const reviewed = {
  schemaVersion: "specgate.scenarios/1",
  review: { reference: "requirements/approved-tickets#201" },
  scenarios: [
    {
      id: "tickets.create",
      classification: "approved_requirement",
      steps: [
        {
          method: "POST",
          path: "/tickets",
          expected: { status: 201, bodyEquals: { ok: "ASSERTION_CANARY" } },
        },
      ],
    },
  ],
};
async function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "specgate-pilot-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, "src"));
  const scan = async (text) => {
    writeFileSync(join(root, "src/app.mjs"), text);
    commitFixture(root);
    return scanRepository({ root, sources: ["src"] });
  };
  const baseline = await scan(source);
  return { baseline, scan };
}
async function report(input) {
  const { buildPilotReport } = await import("../src/pilot-report.mjs");
  return buildPilotReport(input);
}
test("clean change reports bounded unchanged inventory and unexecuted reviewed scenarios, never compatibility PASS", async (t) => {
  const { baseline } = await fixture(t);
  const r = await report({ baseline, current: baseline, scenarios: reviewed });
  assert.equal(r.verdict, "UNCHANGED_DECLARED_SUBSET");
  assert.equal(r.exitCode, 0);
  assert.equal(r.coverage.observedRoutes, 1);
  assert.equal(r.coverage.routesWithReviewedScenario, 1);
  assert.equal(r.coverage.executedScenarios, 0);
  assert.ok(r.coverage.unassessedScope.length);
  assert.equal(r.behavioralValidation, "NOT_EXECUTED");
  assert.equal(r.compatibility, "NOT_ASSESSED");
  assert.match(r.warning, /not.*compatibility/i);
});
test("seeded status drift explains endpoint, both source locations and unchanged reviewed 201 expectation", async (t) => {
  const { baseline, scan } = await fixture(t);
  const before = JSON.stringify(reviewed);
  const current = await scan(source.replace("status(201)", "status(200)"));
  const r = await report({ baseline, current, scenarios: reviewed });
  assert.equal(r.verdict, "REVIEW_REQUIRED");
  assert.equal(r.exitCode, 1);
  const f = r.findings.find(
    (x) => x.scannerCode === "route-observation-changed",
  );
  assert.ok(f);
  assert.deepEqual(
    f.affectedEndpoints.map((x) => [x.method, x.path]),
    [["POST", "/tickets"]],
  );
  assert.equal(f.source.head.file, "src/app.mjs");
  assert.equal(f.source.base.line, 1);
  assert.equal(f.reviewedExpectations[0].expectedStatus, 201);
  assert.equal(f.reviewedExpectations[0].scenarioId, "tickets.create");
  assert.match(f.recommendedAction, /review|run/i);
  assert.deepEqual(f.observationDelta.responseStatuses, {
    before: [201],
    after: [200],
  });
  assert.equal(JSON.stringify(reviewed), before);
  assert.ok(!JSON.stringify(r).includes("ASSERTION_CANARY"));
});
test("unsupported handler is incomplete and missing observations cannot become confirmed removed routes", async (t) => {
  const { baseline, scan } = await fixture(t);
  // An async handler is discovered, but its contract is outside the model.
  const opaque = await report({
    baseline,
    current: await scan(source.replace("(req,res)=>", "async (req,res)=>")),
    scenarios: reviewed,
  });
  assert.equal(opaque.verdict, "INCOMPLETE");
  assert.equal(opaque.exitCode, 1);
  assert.ok(opaque.coverage.unsupportedConstructs.length);
  assert.ok(opaque.findings.every((x) => x.assessment !== "confirmed-defect"));
  // Registration hidden inside a function the scanner does not evaluate: the
  // route is not observed, which must never become a confirmed removal.
  const r = await report({
    baseline,
    current: await scan(source.replace("app.post(", "function register(){app.post(").replace(/;$/, "}register();")),
    scenarios: reviewed,
  });
  assert.equal(r.verdict, "INCOMPLETE");
  assert.equal(r.exitCode, 1);
  assert.ok(r.coverage.unsupportedConstructs.length);
  assert.ok(
    r.findings.some(
      (x) => x.code === "route-not-observed" && x.assessment === "unknown",
    ),
  );
  assert.ok(r.findings.every((x) => x.assessment !== "confirmed-defect"));
});
test("new endpoint remains unassessed without independently reviewed expectations", async (t) => {
  const { baseline, scan } = await fixture(t);
  const r = await report({
    baseline,
    current: await scan(
      source +
        "app.get('/audit',(req,res)=>{res.status(200).json({ok:true});});",
    ),
    scenarios: reviewed,
  });
  assert.equal(r.coverage.routesWithoutReviewedScenario, 1);
  const f = r.findings.find((x) => x.scannerCode === "route-added");
  assert.equal(f.reviewedExpectations.length, 0);
  assert.match(f.recommendedAction, /independent/i);
});
test("independently reviewed expectations for a genuinely added supported endpoint can be referenced without baseline rewriting", async (t) => {
  const { baseline, scan } = await fixture(t);
  const doc = structuredClone(reviewed);
  doc.scenarios.push({
    id: "audit.reviewed",
    classification: "approved_requirement",
    steps: [{ method: "GET", path: "/audit", expected: { status: 200 } }],
  });
  const r = await report({
    baseline,
    current: await scan(
      source +
        "app.get('/audit',(req,res)=>{res.status(200).json({ok:true});});",
    ),
    scenarios: doc,
  });
  assert.equal(r.coverage.routesWithoutReviewedScenario, 0);
  assert.equal(
    r.findings.find((x) => x.scannerCode === "route-added")
      .reviewedExpectations[0].scenarioId,
    "audit.reviewed",
  );
});
test("comment-only change is file-level drift, not proven behavioral regression", async (t) => {
  const { baseline, scan } = await fixture(t);
  const r = await report({
    baseline,
    current: await scan(source + " // comment"),
    scenarios: reviewed,
  });
  const f = r.findings.find((x) => x.scannerCode === "source-changed");
  assert.equal(f.assessment, "unverified-change");
  assert.equal(f.locationPrecision, "route-registration-in-changed-file");
  assert.equal(f.affectedEndpoints[0].source.line, 1);
  assert.equal(r.behavioralValidation, "NOT_EXECUTED");
});
test("missing reviewed scenarios remain visible and require review even with unchanged static source", async (t) => {
  const { baseline } = await fixture(t);
  const r = await report({ baseline, current: baseline });
  assert.equal(r.verdict, "REVIEW_REQUIRED");
  assert.equal(r.coverage.routesWithoutReviewedScenario, 1);
  assert.equal(r.scenarios.length, 0);
});
test("invalid review assertions and malformed/mismatched baseline fail closed", async (t) => {
  const { baseline } = await fixture(t);
  const bad = structuredClone(reviewed);
  bad.scenarios[0].steps[0].expected.status = undefined;
  await assert.rejects(() =>
    report({ baseline, current: baseline, scenarios: bad }),
  );
  const corrupt = structuredClone(baseline);
  corrupt.files[0].sha256 = "0".repeat(64);
  await assert.rejects(() =>
    report({ baseline: corrupt, current: baseline, scenarios: reviewed }),
  );
});

test("reviewed concrete request path parameters are redacted to discovered templates in JSON and Markdown", async (t) => {
  const { scan } = await fixture(t);
  const param = await scan(source.replace("'/tickets'", "'/tickets/:id'"));
  const doc = structuredClone(reviewed);
  doc.scenarios[0].steps[0].path = "/tickets/PRIVATE_PATH_CANARY_7";
  const r = await report({ baseline: param, current: param, scenarios: doc });
  assert.equal(r.routes[0].reviewedExpectations[0].path, "/tickets/:id");
  assert.ok(!JSON.stringify(r).includes("PRIVATE_PATH_CANARY_7"));
  const { pilotMarkdown } = await import("../src/pilot-report.mjs");
  assert.ok(!pilotMarkdown(r).includes("PRIVATE_PATH_CANARY_7"));
});
