import { writeFileSync } from "node:fs";
import { outsideTarget } from "./pilot-paths.mjs";
import { readJson } from "./cli.mjs";
import { scanRepository } from "./scan.mjs";
import { buildPilotReport, pilotMarkdown } from "./pilot-report.mjs";
export async function pilotMain(args) {
  try {
    if (args.length === 1 && args[0] === "--help") {
      process.stdout.write(
        "SpecGate developer pilot (unreleased source candidate, observe-only)\n--root REPO --source SCOPE [--source SCOPE] --baseline TRUSTED_SCAN [--scenarios TRUSTED_SCENARIOS] [--revision HEAD|FULL_SHA] [--format json|markdown] [--output NEW_FILE]\nExit 0 unchanged declared subset; 1 review/incomplete; 2 input/tool error. No target code execution or API compatibility claim.\n",
      );
      return;
    }
    const o = { root: ".", sources: [], format: "json" },
      seen = new Set();
    for (let i = 0; i < args.length; i += 2) {
      const k = args[i],
        v = args[i + 1];
      if (
        ![
          "--root",
          "--source",
          "--baseline",
          "--scenarios",
          "--revision",
          "--format",
          "--output",
        ].includes(k) ||
        typeof v !== "string" ||
        !v ||
        v.startsWith("--") ||
        (k !== "--source" && seen.has(k))
      )
        throw Error("arguments");
      seen.add(k);
      if (k === "--source") o.sources.push(v);
      else o[k.slice(2)] = v;
    }
    if (
      !o.sources.length ||
      !o.baseline ||
      !["json", "markdown"].includes(o.format)
    )
      throw Error("arguments");
    const baseline = readJson(o.baseline),
      scenarios = o.scenarios ? readJson(o.scenarios) : undefined;
    const current = await scanRepository({
      root: o.root,
      sources: o.sources,
      revision: o.revision,
    });
    const report = buildPilotReport({ baseline, current, scenarios });
    const text =
      o.format === "json"
        ? JSON.stringify(report, null, 2) + "\n"
        : pilotMarkdown(report);
    if (o.output)
      writeFileSync(outsideTarget(o.root, o.output), text, {
        flag: "wx",
        mode: 0o600,
      });
    else process.stdout.write(text);
    process.exitCode = report.exitCode;
  } catch {
    process.stderr.write(
      "SpecGate pilot: invalid/unsafe input, existing output, or tool/resource failure. No input contents echoed.\n",
    );
    process.exitCode = 2;
  }
}
