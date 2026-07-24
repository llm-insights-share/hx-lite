import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  initWorkspace,
  createChange,
  scaffoldPrd,
  scaffoldArchHld,
  scaffoldArchLld,
  orgStageGateCheck,
  resolveSuiteName,
  scaffoldTestReport,
  writeArchRegistry,
  readArchRegistry
} from "@harnessx/core";
import {
  reqResearchComplete,
  reqAnalysisComplete,
  orgPrototypeComplete,
  archTechSelectionComplete,
  archDatabaseDesignComplete,
  archInterfaceDesignComplete,
  testReportComplete,
  prototypeComplete,
  bugsClosed,
  uatComplete,
  builtinSensors,
  sensorEngines
} from "@harnessx/sensors";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "hx-m29-"));
const opts = { builtins: builtinSensors, engines: sensorEngines };

function fillResearch(ws: ReturnType<typeof initWorkspace>["ws"], slug: string) {
  fs.writeFileSync(
    ws.prdResearchFile(slug),
    `# 需求调研\n\n## 干系人\n产品、研发\n\n## 调研方法\n访谈\n\n## 发现（Findings）\n用户需要徽章展示与领取提醒。\n\n## 待确认问题\n无\n`,
    "utf8"
  );
}

function fillAnalysis(ws: ReturnType<typeof initWorkspace>["ws"], slug: string) {
  fs.writeFileSync(
    ws.prdAnalysisFile(slug),
    `# 需求分析\n\n## 问题与机会\n缺少会员成长可视化。\n\n## 用户与场景\n会员查看徽章。\n\n## 优先级（P0/P1）\nP0 展示；P1 分享。\n\n## 方案要点\n读模型 + 活动开关。\n`,
    "utf8"
  );
}

function fillPrototype(ws: ReturnType<typeof initWorkspace>["ws"], slug: string) {
  fs.writeFileSync(
    ws.prdPrototypePagesFile(slug),
    `# Prototype\n\n| Page | Route | Shell |\n| --- | --- | --- |\n| Home | / | new |\n`,
    "utf8"
  );
}

describe("M29 org stage tasks + test-execution", () => {
  it("scaffoldPrd creates org dirs only", () => {
    const { ws } = initWorkspace(tmp());
    scaffoldPrd(ws, "badge", "Badge");
    expect(fs.statSync(ws.prdArtifactDir("badge")).isDirectory()).toBe(true);
    expect(fs.statSync(path.join(ws.prdArtifactDir("badge"), "prototype")).isDirectory()).toBe(true);
    expect(fs.existsSync(ws.prdResearchFile("badge"))).toBe(false);
    expect(fs.existsSync(ws.prdAnalysisFile("badge"))).toBe(false);
    expect(fs.existsSync(ws.prdPrototypePagesFile("badge"))).toBe(false);
  });

  it("org research/analysis/prototype sensors gate content", () => {
    const { ws } = initWorkspace(tmp());
    scaffoldPrd(ws, "badge", "Badge");
    expect(reqResearchComplete({ ws, prdSlug: "badge", def: { id: "req-research-complete" } as never }).status).toBe(
      "fail"
    );
    fillResearch(ws, "badge");
    expect(reqResearchComplete({ ws, prdSlug: "badge", def: { id: "req-research-complete" } as never }).status).toBe(
      "pass"
    );

    expect(reqAnalysisComplete({ ws, prdSlug: "badge", def: { id: "req-analysis-complete" } as never }).status).toBe(
      "fail"
    );
    fillAnalysis(ws, "badge");
    expect(reqAnalysisComplete({ ws, prdSlug: "badge", def: { id: "req-analysis-complete" } as never }).status).toBe(
      "pass"
    );

    expect(orgPrototypeComplete({ ws, prdSlug: "badge", def: { id: "org-prototype-complete" } as never }).status).toBe(
      "fail"
    );
    fillPrototype(ws, "badge");
    expect(orgPrototypeComplete({ ws, prdSlug: "badge", def: { id: "org-prototype-complete" } as never }).status).toBe(
      "pass"
    );
  });

  it("orgStageGateCheck binds req.prototype-design suite and records progress", async () => {
    const { ws } = initWorkspace(tmp());
    const harness = ws.readHarness();
    expect(resolveSuiteName(harness, "enterprise", "req", "prototype-design")).toBe("req-prototype");
    expect(resolveSuiteName(harness, "enterprise", "test", "test-execution")).toBe("test-execution-sdlc");
    expect(resolveSuiteName(harness, "standard", "test", "test-execution")).toBe("test-execution-sdlc");

    scaffoldPrd(ws, "badge", "Badge");
    fillPrototype(ws, "badge");
    const res = await orgStageGateCheck(ws, "req", "prototype-design", opts, { prdSlug: "badge" });
    expect(res.passed).toBe(true);
    const progress = fs.readFileSync(path.join(ws.root, "docs", ".stage-progress.yaml"), "utf8");
    expect(progress).toContain("prototype-design");
  });

  it("arch section sensors require new HLD sections", () => {
    const { ws } = initWorkspace(tmp());
    scaffoldArchHld(ws, "Shop");
    expect(archTechSelectionComplete({ ws, def: { id: "x" } as never }).status).toBe("fail");
    fs.writeFileSync(
      ws.archOverviewFile(),
      `# HLD\n## 技术选型\nNode\n## 数据库设计\nPostgres\n## 接口设计\nREST\n## 关键设计机制\n幂等\n`
    );
    expect(archTechSelectionComplete({ ws, def: { id: "x" } as never }).status).toBe("pass");
    expect(archDatabaseDesignComplete({ ws, def: { id: "x" } as never }).status).toBe("pass");
    expect(archInterfaceDesignComplete({ ws, def: { id: "x" } as never }).status).toBe("pass");
  });

  it("prototype-complete accepts org pages when change UI in scope", () => {
    const { ws } = initWorkspace(tmp());
    scaffoldPrd(ws, "badge", "Badge");
    fillPrototype(ws, "badge");
    createChange(ws, "c1", ["api"], "standard", { prdRef: "badge" });
    const designDir = ws.designDir("c1");
    fs.mkdirSync(designDir, { recursive: true });
    fs.writeFileSync(path.join(designDir, "overview.md"), "# Design\nUI wireframe and pages\n", "utf8");
    fs.writeFileSync(path.join(ws.changeDir("c1"), "proposal.md"), "# P\nfrontend UI pages\n", "utf8");
    const report = prototypeComplete({
      ws,
      change: "c1",
      prdSlug: "badge",
      def: { id: "prototype-complete" } as never
    });
    expect(report.status).toBe("pass");
  });

  it("test-execution sensors: report + uat + bugs", () => {
    const { ws } = initWorkspace(tmp());
    createChange(ws, "c1", ["api"]);
    expect(testReportComplete({ ws, change: "c1", def: { id: "test-report-complete" } as never }).status).toBe("fail");
    const changeDir = scaffoldTestReport(ws, "c1");
    const reportFile = path.join(changeDir, "test-report.md");
    fs.writeFileSync(
      reportFile,
      `# Test Report\n\n## Execution summary\n| Suite | Result |\n| --- | --- |\n| smoke | Pass |\n\n## UAT\nok\n`,
      "utf8"
    );
    expect(testReportComplete({ ws, change: "c1", def: { id: "test-report-complete" } as never }).status).toBe("pass");

    fs.writeFileSync(
      path.join(ws.changeDir("c1"), "uat-checklist.md"),
      `# UAT\n\n| Scenario | Result |\n| --- | --- |\n| s1 | ok |\n\n- [x] Product owner sign-off\n`,
      "utf8"
    );
    expect(uatComplete({ ws, change: "c1", def: { id: "uat-complete" } as never }).status).toBe("pass");
    expect(bugsClosed({ ws, change: "c1", def: { id: "bugs-closed" } as never }).status).toBe("pass");
  });

  it("orgStageGateCheck arch.tech-selection", async () => {
    const { ws } = initWorkspace(tmp());
    scaffoldArchHld(ws, "S");
    fs.writeFileSync(
      ws.archOverviewFile(),
      `# HLD\n## 系统边界与上下游\nb\n## 架构方案与模块划分\na\n### 模块职责\n| m | r | i | o | c |\n| a | a | a | a | a |\n## 技术选型\nnode\n## 数据库设计\npg\n## 接口设计\napi\n## 数据流与关键流程\nf\n## 关键设计机制\nidem\n## 非功能设计\nn\n## ADR\n### ADR-001\n- Decision: x\n- Alternatives: y\n- Consequences: z\n## 风险清单\nr\n`
    );
    const reg = readArchRegistry(ws);
    reg.modules = [{ id: "shop", name: "Shop", capabilities: ["api"], lld: "modules/shop/lld.md", status: "active" }];
    writeArchRegistry(ws, reg);
    scaffoldArchLld(ws, "shop", "Shop");
    const res = await orgStageGateCheck(ws, "arch", "tech-selection", opts);
    expect(res.passed).toBe(true);
  });
});
