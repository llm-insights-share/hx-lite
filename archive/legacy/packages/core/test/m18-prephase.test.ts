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
  resolvePrdSlug,
  readArchRegistry,
  buildPrdPack,
  buildArchPack,
  writeArchRegistry,
  STAGE_TASKS,
  DELIVERY_STAGES
} from "@harnessx/core";
import { prdComplete, archHldComplete, archLldComplete, archChangeAlign } from "@harnessx/sensors";
import { collectCommands } from "@harnessx/adapters";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "hx-m18-"));

describe("M18 pre-phase PRD and arch", () => {
  it("scaffolds PRD dirs and passes prd-complete when filled via skill content", () => {
    const { ws } = initWorkspace(tmp());
    const dir = scaffoldPrd(ws, "member-badge", "Member badge");
    expect(fs.statSync(dir).isDirectory()).toBe(true);
    expect(fs.existsSync(ws.prdFile("member-badge"))).toBe(false);
    const file = ws.prdFile("member-badge");
    fs.writeFileSync(
      file,
      `# PRD: Member badge
## 用户故事
| US-001 | user | see badge | motivation | P0 |
## 验收标准
| AC-001 | GIVEN logged in | WHEN open profile | THEN badge shows | US-001 |
### In Scope
- badge display
## Out of Scope
- none
## 非功能需求
### 性能
p99 < 200ms
## 评审结论
- 评审结果：通过
`
    );
    const report = prdComplete({ ws, prdSlug: "member-badge", def: { id: "prd-complete" } as never });
    expect(report.status).toBe("pass");
  });

  it("scaffolds global arch dirs and registry", () => {
    const { ws } = initWorkspace(tmp());
    const res = scaffoldArchHld(ws, "Shop");
    expect(fs.statSync(res.overview).isDirectory()).toBe(true);
    expect(fs.existsSync(res.registry)).toBe(true);
    expect(fs.existsSync(ws.archOverviewFile())).toBe(false);
    fs.writeFileSync(
      ws.archOverviewFile(),
      `# HLD
## 系统边界与上下游
boundary
## 架构方案与模块划分
arch
### 模块职责
| m | r | i | o | c |
| shop | shop | api | db | none |
## 数据流与关键流程
flow
## 非功能设计
nfr
## ADR
### ADR-001
- Decision: modular
- Alternatives: none
- Consequences: ok
## 风险清单
low
`
    );
    const report = archHldComplete({ ws, def: { id: "arch-hld-complete" } as never });
    expect(report.status).toBe("pass");
  });

  it("scaffolds module LLD dirs and resolves for change domains", () => {
    const { ws } = initWorkspace(tmp());
    scaffoldArchHld(ws, "Shop");
    const reg = readArchRegistry(ws);
    reg.modules = [{ id: "order", lld: "modules/order/lld.md", capabilities: ["order-refund"], status: "active" }];
    writeArchRegistry(ws, reg);
    const moduleDir = scaffoldArchLld(ws, "order", "Order");
    expect(fs.statSync(moduleDir).isDirectory()).toBe(true);
    expect(fs.existsSync(path.join(moduleDir, "api"))).toBe(true);
    const lld = ws.archModuleLld("order");
    fs.writeFileSync(
      lld,
      `# LLD
## 组件与职责
| c | r | i | d |
## 接口契约
| IF-001 | API | in | out | E1 | yes |
## 数据模型与存储
x
## 核心流程与状态机
x
## 异常处理与降级
x
## 安全与权限控制
x
`
    );
    const lldReport = archLldComplete({ ws, archModule: "order", def: { id: "arch-lld-complete" } as never });
    expect(lldReport.status).toBe("pass");
    createChange(ws, "partial-refund", ["order-refund"], "enterprise", { archModules: ["order"] });
    const align = archChangeAlign({ ws, change: "partial-refund", def: { id: "arch-change-align" } as never });
    expect(align.status).toBe("pass");
  });

  it("resolvePrdSlug uses meta.prdRef", () => {
    const { ws } = initWorkspace(tmp());
    createChange(ws, "feat-a", ["core"], "standard", { prdRef: "my-prd" });
    expect(resolvePrdSlug(ws, "feat-a")).toBe("my-prd");
  });

  it("collectCommands includes prompt for every STAGE_TASK", () => {
    const { ws } = initWorkspace(tmp());
    const cmds = collectCommands(ws);
    for (const stage of DELIVERY_STAGES) {
      for (const t of STAGE_TASKS[stage]) {
        const name = `hx-${stage}-${t.id}`;
        const cmd = cmds.find((c) => c.name === name);
        expect(cmd, `missing command ${name}`).toBeDefined();
        expect(cmd!.prompt?.trim().length, `empty prompt for ${name}`).toBeGreaterThan(0);
      }
    }
    expect(cmds.some((c) => c.name === "hx-req-prd-writing")).toBe(true);
    expect(cmds.some((c) => c.name === "hx-arch-subsystem-division")).toBe(true);
    expect(cmds.some((c) => c.name === "hx-arch-internal-interface")).toBe(true);
    expect(cmds.some((c) => c.name === "hx-test-test-execution")).toBe(true);
    const tech = cmds.find((c) => c.name === "hx-arch-tech-selection");
    expect(tech?.appendix).toContain("arch-tech");
    expect(tech?.appendix).toContain("arch-tech-selection-complete");
    expect(tech?.prompt).toContain("## Input");
    expect(tech?.prompt).toContain("## Done when");
    expect(tech?.appendix).toContain("tech-selection");
    const plan = cmds.find((c) => c.name === "hx-dev-plan");
    expect(plan?.appendix).toContain("change-planning");
  });

  it("buildPrdPack and buildArchPack assemble guides", () => {
    const { ws } = initWorkspace(tmp());
    scaffoldPrd(ws, "x", "X");
    const prdPack = buildPrdPack(ws, "x");
    expect(prdPack.sections.some((s) => s.title.includes("prd-authoring"))).toBe(true);
    scaffoldArchHld(ws, "Sys");
    const archPack = buildArchPack(ws);
    expect(archPack.stage).toBe("arch");
  });
});
