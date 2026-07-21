import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  initWorkspace,
  createChange,
  scaffoldPrd,
  markOrgTaskComplete,
  nextOrgTask,
  inferDeliveryFocus,
  profileArchTasks,
  orgCompletedTasks
} from "@harnessx/core";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "hx-org-nav-"));

describe("orgNavigation", () => {
  it("nextOrgTask returns first incomplete req task for standard profile", () => {
    const { ws } = initWorkspace(tmp());
    const next = nextOrgTask(ws, "req", "standard");
    expect(next).toEqual({ stage: "req", task: "requirements-analysis" });
  });

  it("nextOrgTask skips completed req tasks and returns prdSlug from progress", () => {
    const { ws } = initWorkspace(tmp());
    markOrgTaskComplete(ws, "req", "requirements-analysis", { prdSlug: "badge" });
    markOrgTaskComplete(ws, "req", "prototype-design", { prdSlug: "badge" });
    const next = nextOrgTask(ws, "req", "standard");
    expect(next).toEqual({ stage: "req", task: "prd-writing", prdSlug: "badge" });
  });

  it("inferDeliveryFocus returns org when req incomplete", () => {
    const { ws } = initWorkspace(tmp());
    const focus = inferDeliveryFocus(ws);
    expect(focus.kind).toBe("org");
    if (focus.kind === "org") {
      expect(focus.stage).toBe("req");
      expect(focus.task).toBe("requirements-analysis");
    }
  });

  it("nextOrgTask returns null when all arch tasks complete", () => {
    const { ws } = initWorkspace(tmp());
    const harness = ws.readHarness();
    const archTasks = profileArchTasks(harness, "standard");
    expect(archTasks.length).toBeGreaterThan(0);
    for (const task of archTasks) markOrgTaskComplete(ws, "arch", task);
    expect(orgCompletedTasks(ws, "arch")).toEqual(expect.arrayContaining(archTasks));
    expect(nextOrgTask(ws, "arch", "standard")).toBeNull();
  });

  it("inferDeliveryFocus returns change when org complete and single change exists", () => {
    const { ws } = initWorkspace(tmp());
    const harness = ws.readHarness();
    const reqTasks = ["requirements-analysis", "prototype-design", "prd-writing"];
    for (const task of reqTasks) markOrgTaskComplete(ws, "req", task, { prdSlug: "badge" });
    for (const task of profileArchTasks(harness, "standard")) markOrgTaskComplete(ws, "arch", task);
    scaffoldPrd(ws, "badge", "Badge");
    createChange(ws, "c1", ["api"], "standard");
    const focus = inferDeliveryFocus(ws);
    expect(focus).toEqual({ kind: "change", change: "c1" });
  });

  it("inferDeliveryFocus returns workspace for lite with no changes", () => {
    const { ws } = initWorkspace(tmp(), { profile: "lite" });
    const focus = inferDeliveryFocus(ws);
    expect(focus).toEqual({ kind: "workspace" });
  });

  it("inferDeliveryFocus returns workspace when multiple changes and org complete", () => {
    const { ws } = initWorkspace(tmp());
    const harness = ws.readHarness();
    for (const task of ["requirements-analysis", "prototype-design", "prd-writing"]) {
      markOrgTaskComplete(ws, "req", task, { prdSlug: "badge" });
    }
    for (const task of profileArchTasks(harness, "standard")) {
      markOrgTaskComplete(ws, "arch", task);
    }
    createChange(ws, "c1", ["api"], "standard");
    createChange(ws, "c2", ["billing"], "standard");
    expect(inferDeliveryFocus(ws)).toEqual({ kind: "workspace" });
  });
});
