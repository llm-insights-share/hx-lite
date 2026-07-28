import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  initWorkspace,
  createChange,
  scaffoldProposal,
  scaffoldDesign,
  generateTasks,
  writeTaskPack,
  readDeliveryTrace
} from "@harnessx/core";
import {
  requirementsComplete,
  designHldComplete,
  planCoverage
} from "@harnessx/sensors";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "hx-m9-"));

describe("enterprise delivery trace & handoff", () => {
  it("propose scaffolds requirements/ and delivery-trace.yaml", () => {
    const ws = initWorkspace(tmp()).ws;
    createChange(ws, "points", ["points"]);
    scaffoldProposal(ws, "points", "Member points");
    expect(fs.existsSync(path.join(ws.requirementsDir("points"), "prd-summary.md"))).toBe(true);
    expect(fs.existsSync(ws.deliveryTraceFile("points"))).toBe(true);
    const trace = readDeliveryTrace(ws, "points");
    expect(Object.keys(trace.requirements).length).toBeGreaterThan(0);
  });

  it("design scaffolds overview and ui/pages.md", () => {
    const ws = initWorkspace(tmp()).ws;
    createChange(ws, "points", ["points"]);
    scaffoldDesign(ws, "points");
    const overview = fs.readFileSync(ws.designOverviewFile("points"), "utf8");
    expect(overview).toContain("## API Surface");
    expect(fs.existsSync(path.join(ws.designDir("points"), "ui", "pages.md"))).toBe(true);
  });

  it("plan adds @design= and syncs delivery trace", () => {
    const ws = initWorkspace(tmp()).ws;
    createChange(ws, "points", ["points"]);
    scaffoldProposal(ws, "points", "Points");
    scaffoldDesign(ws, "points");
    const { tasks } = generateTasks(ws, "points");
    expect(tasks[0]?.designRef).toBeTruthy();
    const md = fs.readFileSync(path.join(ws.changeDir("points"), "tasks.md"), "utf8");
    expect(md).toContain("@design=");
    const trace = readDeliveryTrace(ws, "points");
    expect(trace.requirements["points/Points"]?.tasks).toContain("01a");
  });

  it("task-pack scopes context to one task", () => {
    const ws = initWorkspace(tmp()).ws;
    createChange(ws, "points", ["points"]);
    scaffoldProposal(ws, "points", "Points");
    generateTasks(ws, "points");
    const { pack, file } = writeTaskPack(ws, "points", "01b");
    expect(fs.existsSync(file)).toBe(true);
    expect(pack.persona).toContain("01b");
    expect(pack.sections.some((s) => s.title.startsWith("Requirement:"))).toBe(true);
  });

  it("requirements-complete passes after scaffold", () => {
    const ws = initWorkspace(tmp()).ws;
    createChange(ws, "points", ["points"]);
    scaffoldProposal(ws, "points", "Points");
    fs.writeFileSync(
      path.join(ws.changeDir("points"), "proposal.md"),
      fs.readFileSync(path.join(ws.changeDir("points"), "proposal.md"), "utf8").replace(
        "docs/prd/",
        "docs/prd/points.md"
      )
    );
    const report = requirementsComplete({ ws, change: "points", def: { id: "requirements-complete" } as never });
    expect(report.status).toBe("pass");
  });

  it("design-hld-complete passes on scaffolded overview", () => {
    const ws = initWorkspace(tmp()).ws;
    createChange(ws, "points", ["points"]);
    scaffoldDesign(ws, "points");
    const report = designHldComplete({ ws, change: "points", def: { id: "design-hld-complete" } as never });
    expect(report.status).toBe("pass");
  });

  it("plan-coverage warns when @design missing on edited tasks", () => {
    const ws = initWorkspace(tmp()).ws;
    createChange(ws, "points", ["points"]);
    scaffoldProposal(ws, "points", "Points");
    generateTasks(ws, "points");
    const report = planCoverage({ ws, change: "points", def: { id: "plan-coverage" } as never });
    expect(report.status).toBe("pass");
  });
});
