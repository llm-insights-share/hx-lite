import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { initWorkspace, createChange, markOrgTaskComplete, profileArchTasks } from "@harnessx/core";
import {
  buildOrgReport,
  buildChangeReport,
  buildWorkspaceReport,
  buildContextReport
} from "../src/contextReport.js";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "hx-ctx-"));

describe("contextReport", () => {
  it("buildOrgReport suggests req init CLI", () => {
    const { ws } = initWorkspace(tmp());
    const report = buildOrgReport("req", { root: ws.root, prdSlug: "badge" });
    expect(report.scope).toBe("org");
    expect(report.stage).toBe("req");
    expect(report.suggestedCli).toContain("hx req analysis init badge");
    expect(report.gateCli).toContain("--prd badge");
    expect(report.guideCli).toBe("hx guide prd-pack badge");
  });

  it("buildOrgReport suggests arch check CLI", () => {
    const { ws } = initWorkspace(tmp());
    const report = buildOrgReport("arch", { root: ws.root, task: "tech-selection" });
    expect(report.suggestedCli).toBe("hx arch check --task tech-selection");
  });

  it("buildChangeReport includes test stage CLI", () => {
    const { ws } = initWorkspace(tmp());
    createChange(ws, "c1", ["api"], "standard");
    const fsPath = path.join(ws.changeDir("c1"), "meta.yaml");
    let raw = fs.readFileSync(fsPath, "utf8");
    raw = raw.replace(/task: propose/, "task: test-case-design").replace(/stage: dev/, "stage: test");
    fs.writeFileSync(fsPath, raw);
    const report = buildChangeReport("c1", ws.root);
    expect(report.scope).toBe("change");
    expect(report.stage).toBe("test");
    expect(report.suggestedCli).toBe("hx test-cases init c1");
  });

  it("buildWorkspaceReport returns workspace scope without change", () => {
    const { ws } = initWorkspace(tmp());
    const report = buildWorkspaceReport(ws.root);
    expect(report.scope).toBe("workspace");
    expect(report.focus?.kind).toBe("org");
    expect(report.suggestedCli).toMatch(/hx req/);
  });

  it("buildContextReport with no args matches workspace", () => {
    const { ws } = initWorkspace(tmp());
    const harness = ws.readHarness();
    for (const task of ["requirements-analysis", "prototype-design", "prd-writing"]) {
      markOrgTaskComplete(ws, "req", task, { prdSlug: "badge" });
    }
    for (const task of profileArchTasks(harness, "standard")) {
      markOrgTaskComplete(ws, "arch", task);
    }
    createChange(ws, "c1", ["api"], "standard");
    const report = buildContextReport({ root: ws.root });
    expect(report.scope).toBe("workspace");
    expect(report.focus?.kind).toBe("change");
  });
});
