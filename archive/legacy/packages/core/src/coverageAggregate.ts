import fs from "node:fs";
import path from "node:path";
import { Workspace } from "./paths.js";
import { coverageReport, type CoverageReport } from "./steering.js";
import { readRuns } from "./telemetry.js";

/**
 * Cross-project Harness Coverage aggregation (v0.4).
 */

export interface RepoCoverageSnapshot {
  repo: string;
  report: CoverageReport;
  assetCount: number;
}

export interface AggregatedCoverage {
  generatedAt: string;
  repos: RepoCoverageSnapshot[];
  totals: {
    repos: number;
    sensorRuns: number;
    avgFirstAttemptPassRate: number;
    totalRecurrentPatterns: number;
    totalUncoveredPatterns: number;
  };
}

function findHarnessRoot(repoRoot: string): Workspace | null {
  const ws = new Workspace(repoRoot);
  return fs.existsSync(ws.harnessFile) ? ws : null;
}

export function aggregateCoverage(repoRoots: string[]): AggregatedCoverage {
  const repos: RepoCoverageSnapshot[] = [];
  for (const root of repoRoots) {
    const abs = path.resolve(root);
    const ws = findHarnessRoot(abs);
    if (!ws) continue;
    const harness = ws.readHarness();
    repos.push({
      repo: path.basename(abs),
      report: coverageReport(ws),
      assetCount: harness.guides.length + harness.sensors.length
    });
  }

  const passRates = repos.map((r) => r.report.metrics.firstAttemptPassRate);
  return {
    generatedAt: new Date().toISOString(),
    repos,
    totals: {
      repos: repos.length,
      sensorRuns: repos.reduce((n, r) => n + r.report.metrics.totalSensorRuns, 0),
      avgFirstAttemptPassRate: passRates.length ? passRates.reduce((a, b) => a + b, 0) / passRates.length : 1,
      totalRecurrentPatterns: repos.reduce((n, r) => n + r.report.metrics.recurrentPatterns, 0),
      totalUncoveredPatterns: repos.reduce((n, r) => n + r.report.uncoveredPatterns, 0)
    }
  };
}

export function writeCoverageIndex(ws: Workspace, agg: AggregatedCoverage): string {
  const file = path.join(ws.base, "coverage-index.json");
  fs.writeFileSync(file, JSON.stringify(agg, null, 2), "utf8");
  return file;
}

export function aggregateFromParent(parentDir: string): AggregatedCoverage {
  const roots = fs
    .readdirSync(parentDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => path.join(parentDir, d.name));
  return aggregateCoverage(roots);
}

export function telemetrySummary(ws: Workspace): { sensorRuns: number; suiteRuns: number; failures: number } {
  const runs = readRuns(ws);
  return {
    sensorRuns: runs.filter((r) => r.kind === "sensor").length,
    suiteRuns: runs.filter((r) => r.kind === "suite").length,
    failures: runs.filter((r) => r.status === "fail" || r.status === "error").length
  };
}
