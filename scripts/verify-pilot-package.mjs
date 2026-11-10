import assert from "node:assert/strict";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { commitFixture } from "../packages/specgate/test/fixture-git.mjs";
const root = resolve(import.meta.dirname, ".."),
  work = resolve(process.argv[2] ?? "");
assert.ok(process.argv[2], "Fresh output directory required");
mkdirSync(work, { mode: 0o700 });
const packageRoot = join(root, "packages/specgate");
const [packed] = JSON.parse(
  execFileSync(
    "npm",
    ["pack", "--ignore-scripts", "--json", "--pack-destination", work],
    { cwd: packageRoot, encoding: "utf8" },
  ),
);
assert.ok(packed.files.some((f) => f.path === "bin/specgate-pilot.mjs"));
assert.ok(packed.files.some((f) => f.path === "bin/specgate-observe.mjs"));
assert.ok(packed.files.some((f) => f.path === "LICENSE"));
assert.ok(packed.files.some((f) => f.path === "node_modules/acorn/LICENSE"));
assert.ok(
  packed.files.every(
    (f) =>
      f.path === "package.json" ||
      ["LICENSE", "README.md", "SECURITY.md", "NOTICE.md"].includes(f.path) ||
      f.path.startsWith("bin/") ||
      f.path.startsWith("src/") ||
      f.path.startsWith("node_modules/acorn/"),
  ),
);
const archive = join(work, packed.filename),
  install = join(work, "install");
mkdirSync(install);
execFileSync(
  "npm",
  [
    "install",
    "--prefix",
    install,
    "--cache",
    join(work, "empty-cache"),
    "--offline",
    "--ignore-scripts",
    "--no-audit",
    "--no-fund",
    "--no-package-lock",
    archive,
  ],
  { encoding: "utf8" },
);
const installed = join(install, "node_modules/@qe-atlas/specgate"),
  service = join(work, "service");
mkdirSync(join(service, "src"), { recursive: true });
const base =
  "import express from 'express';export const app=express();app.post('/tickets',(req,res)=>{res.status(201).json({ok:true});});app.get('/health',(req,res)=>{res.status(200).json({ok:true});});";
const doc = {
  schemaVersion: "specgate.scenarios/1",
  review: {
    reference:
      "SYNTHETIC requirements: POST tickets remains 201; health remains 200",
  },
  scenarios: [
    {
      id: "tickets.create",
      classification: "approved_requirement",
      steps: [
        {
          method: "POST",
          path: "/tickets",
          expected: { status: 201, bodyEquals: { ok: true } },
        },
      ],
    },
    {
      id: "health.read",
      classification: "approved_requirement",
      steps: [
        {
          method: "GET",
          path: "/health",
          expected: { status: 200, bodyEquals: { ok: true } },
        },
      ],
    },
  ],
};
const scenarios = join(work, "reviewed-scenarios.json"),
  baseline = join(work, "baseline.json");
writeFileSync(scenarios, JSON.stringify(doc, null, 2) + "\n");
const digest = (f) =>
  createHash("sha256").update(readFileSync(f)).digest("hex");
const reviewedHash = digest(scenarios);
const prepare = (source) => {
  writeFileSync(join(service, "src/app.mjs"), source);
  commitFixture(service);
};
const run = (bin, args) =>
  spawnSync(process.execPath, [join(installed, "bin", bin), ...args], {
    encoding: "utf8",
    timeout: 120000,
    maxBuffer: 16777216,
  });
prepare(base);
const scan = run("specgate.mjs", [
  "scan",
  "--root",
  service,
  "--source",
  "src",
]);
assert.equal(scan.status, 0, scan.stderr);
writeFileSync(baseline, scan.stdout);
const baselineHash = digest(baseline);
const original = run("specgate.mjs", [
  "generate",
  "--root",
  service,
  "--source",
  "src",
  "--scenarios",
  scenarios,
  "--output",
  join(work, "original.spec.mjs"),
]);
assert.equal(original.status, 0, original.stderr);
const cases = [
  ["clean", base, "UNCHANGED_DECLARED_SUBSET", 0],
  [
    "seeded-status-defect",
    base.replace("status(201)", "status(200)"),
    "REVIEW_REQUIRED",
    1,
  ],
  ["comment-only", base + " // nonbehavioral comment", "REVIEW_REQUIRED", 1],
  [
    "added-unreviewed-route",
    base + "app.get('/audit',(req,res)=>{res.status(200).json({ok:true});});",
    "REVIEW_REQUIRED",
    1,
  ],
  [
    "removed-route",
    "import express from 'express';export const app=express();app.get('/health',(req,res)=>{res.status(200).json({ok:true});});",
    "REVIEW_REQUIRED",
    1,
  ],
  [
    "unsupported-async",
    base.replace(
      "app.post('/tickets',(req,res)=>",
      "app.post('/tickets',async (req,res)=>",
    ),
    "INCOMPLETE",
    1,
  ],
  [
    "unsupported-hidden-registration",
    base
      .replace("app.post(", "function register(){app.post(")
      .replace(";app.get('/health'", "}register();app.get('/health'"),
    "INCOMPLETE",
    1,
  ],
  [
    "unsupported-dynamic",
    base +
      "const verb='get';app[verb]('/dynamic',(req,res)=>{res.status(200).json({ok:true});});",
    "INCOMPLETE",
    1,
  ],
];
const receipts = [];
for (const [name, source, verdict, exit] of cases) {
  prepare(source);
  const output = join(work, name);
  const collected = run("specgate-observe.mjs", [
    service,
    "src",
    baseline,
    scenarios,
    output,
  ]);
  assert.equal(collected.status, 0, collected.stderr);
  const native = JSON.parse(readFileSync(join(output, "native.json"))),
    op = JSON.parse(readFileSync(join(output, "operational.json")));
  assert.equal(native.verdict, verdict, name);
  assert.equal(native.exitCode, exit);
  assert.equal(op.analysisExitCode, exit);
  assert.equal(native.coverage.executedScenarios, 0);
  assert.equal(native.compatibility, "NOT_ASSESSED");
  assert.equal(digest(scenarios), reviewedHash);
  assert.equal(digest(baseline), baselineHash);
  if (name === "seeded-status-defect") {
    const f = native.findings.find(
      (x) => x.scannerCode === "route-observation-changed",
    );
    assert.equal(
      f.reviewedExpectations.find((x) => x.scenarioId === "tickets.create")
        .expectedStatus,
      201,
    );
    assert.deepEqual(f.observationDelta.responseStatuses, {
      before: [201],
      after: [200],
    });
    const generated = run("specgate.mjs", [
      "generate",
      "--root",
      service,
      "--source",
      "src",
      "--scenarios",
      scenarios,
      "--output",
      join(work, "seeded.spec.mjs"),
    ]);
    assert.equal(generated.status, 0);
    assert.equal(
      readFileSync(join(work, "seeded.spec.mjs"), "utf8"),
      readFileSync(join(work, "original.spec.mjs"), "utf8"),
      "Expected assertions must remain byte-identical",
    );
  }
  if (name === "comment-only")
    assert.ok(
      native.findings.every((f) => f.assessment === "unverified-change"),
    );
  if (name === "unsupported-async") {
    // The async inline handler is discovered (route still observed), but its
    // contract is outside the model: an unknown analysis gap, not a removal.
    assert.equal(native.coverage.observedRoutes, 2, name);
    assert.ok(native.findings.every((f) => f.code !== "route-not-observed"));
    assert.ok(
      native.findings.some(
        (f) =>
          f.code === "analysis-gap" &&
          f.assessment === "unknown" &&
          f.affectedEndpoints.some(
            (e) => e.method === "POST" && e.path === "/tickets",
          ),
      ),
      name,
    );
    assert.ok(
      native.coverage.unsupportedConstructs.some(
        (u) => u.code === "unsupported-handler-kind-or-bindings",
      ),
    );
  }
  if (name === "unsupported-hidden-registration")
    // Registration inside a function the scanner does not evaluate: the route
    // is not observed, and that must never become a confirmed removal.
    assert.ok(
      native.findings.some(
        (f) => f.code === "route-not-observed" && f.assessment === "unknown",
      ),
      name,
    );
  if (name === "unsupported-dynamic")
    // app[verb](...) must be reported, never silently dropped from inventory.
    assert.ok(
      native.coverage.unsupportedConstructs.some(
        (u) => u.code === "computed-method",
      ),
      name,
    );
  if (name === "added-unreviewed-route")
    assert.equal(native.coverage.routesWithoutReviewedScenario, 1);
  if (name.startsWith("unsupported")) {
    assert.ok(native.coverage.unsupportedConstructs.length > 0, name);
    assert.ok(
      native.findings.every((f) => f.assessment !== "confirmed-defect"),
      name,
    );
  }
  receipts.push({
    name,
    verdict,
    analysisExitCode: exit,
    collectorExitCode: collected.status,
    sourceSha256: createHash("sha256").update(source).digest("hex"),
    sourceCommit: native.source.headCommit,
    findings: native.findings.length,
    unsupportedConstructs: native.coverage.unsupportedConstructs.length,
  });
}
writeFileSync(
  join(work, "source-variants.json"),
  JSON.stringify(
    cases.map(([name, source]) => ({ name, source })),
    null,
    2,
  ) + "\n",
);
const bad = join(work, "invalid-review.json");
writeFileSync(bad, "{");
const invalid = run("specgate-observe.mjs", [
  service,
  "src",
  baseline,
  bad,
  join(work, "malformed"),
]);
assert.equal(invalid.status, 2);
const receipt = {
  schemaVersion: 1,
  syntheticOnly: true,
  toolSourceCommit: execFileSync("git", ["rev-parse", "HEAD"], {cwd:root,encoding:"utf8"}).trim(),
  runtimeUncommitted: Boolean(execFileSync("git", ["status", "--porcelain", "--", "packages/specgate/src", "packages/specgate/bin"], {cwd:root,encoding:"utf8"}).trim()),
  scope:
    "Static mechanics, not customer validation, runtime defect execution, or API compatibility",
  package: packed.name,
  version: packed.version,
  archive: packed.filename,
  archiveSha256: digest(archive),
  node: process.version,
  emptyCacheOfflineInstall: true,
  lifecycleScriptsDisabled: true,
  baselineSha256: baselineHash,
  reviewedScenarioSha256: reviewedHash,
  assertionsUnchanged: true,
  sourceCodeExecuted: false,
  behavioralValidation: "NOT_EXECUTED",
  malformedCollectorExit: invalid.status,
  cases: receipts,
};
writeFileSync(
  join(work, "receipt.json"),
  JSON.stringify(receipt, null, 2) + "\n",
);
console.log(JSON.stringify(receipt, null, 2));
