import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  initWorkspace,
  createChange,
  scaffoldPrd,
  createChangeRequest,
  submitChangeRequest,
  approveChangeRequest,
  attachChangeToCr,
  listChangesFiltered,
  listUnlinkedAppliedCrs,
  inferDeliveryFocus,
  buildDeliveryTracks,
  readMeta,
  readChangeRequest,
  markOrgTaskComplete,
  profileArchTasks
} from "@harnessx/core";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "hx-cr-change-"));

describe("CR → Change delta track", () => {
  it("approveChangeRequest suggests --from-cr when unlinked", () => {
    const { ws } = initWorkspace(tmp());
    scaffoldPrd(ws, "orders", "Orders");
    const cr = createChangeRequest(ws, {
      kind: "requirement-change",
      action: "add",
      target: { prd: "orders" },
      payload: { revised: "Extra AC." },
      createdBy: "pm"
    });
    submitChangeRequest(ws, cr.id, "pm");
    const { suggestedCli, cr: applied } = approveChangeRequest(ws, cr.id, "tm");
    expect(applied.status).toBe("applied");
    expect(suggestedCli).toContain(`--from-cr ${cr.id}`);
    expect(listUnlinkedAppliedCrs(ws).map((c) => c.id)).toContain(cr.id);
  });

  it("createChange --from-cr links CR and sets meta.sourceCr", () => {
    const { ws } = initWorkspace(tmp());
    scaffoldPrd(ws, "orders", "Orders");
    const cr = createChangeRequest(ws, {
      kind: "requirement-change",
      action: "add",
      target: { prd: "orders" },
      payload: { revised: "Extra AC." },
      createdBy: "pm"
    });
    submitChangeRequest(ws, cr.id, "pm");
    approveChangeRequest(ws, cr.id, "tm");

    const { meta } = createChange(ws, "cr-feature", ["api"], "standard", { fromCr: cr.id });
    expect(meta.sourceCr).toBe(cr.id);
    expect(meta.prdRef).toBe("orders");
    expect(readChangeRequest(ws, cr.id).linkedChange).toBe("cr-feature");
    expect(listChangesFiltered(ws, { fromCr: cr.id }).map((r) => r.id)).toEqual(["cr-feature"]);
    expect(listChangesFiltered(ws, { prd: "orders" }).map((r) => r.id)).toEqual(["cr-feature"]);
    expect(listUnlinkedAppliedCrs(ws)).toHaveLength(0);
  });

  it("attachChangeToCr links existing change", () => {
    const { ws } = initWorkspace(tmp());
    scaffoldPrd(ws, "orders", "Orders");
    createChange(ws, "existing", ["api"], "standard", { prdRef: "orders" });
    const cr = createChangeRequest(ws, {
      kind: "requirement-change",
      action: "add",
      target: { prd: "orders" },
      payload: { revised: "Note." },
      createdBy: "pm"
    });
    submitChangeRequest(ws, cr.id, "pm");
    approveChangeRequest(ws, cr.id, "tm");
    attachChangeToCr(ws, cr.id, "existing");
    expect(readMeta(ws, "existing").sourceCr).toBe(cr.id);
    expect(readChangeRequest(ws, cr.id).linkedChange).toBe("existing");
  });

  it("inferDeliveryFocus prefers pending CR after org complete", () => {
    const { ws } = initWorkspace(tmp());
    const harness = ws.readHarness();
    for (const task of ["requirements-analysis", "prototype-design", "prd-writing"]) {
      markOrgTaskComplete(ws, "req", task, { prdSlug: "orders" });
    }
    for (const task of profileArchTasks(harness, "standard")) {
      markOrgTaskComplete(ws, "arch", task);
    }
    scaffoldPrd(ws, "orders", "Orders");
    const cr = createChangeRequest(ws, {
      kind: "requirement-change",
      action: "add",
      target: { prd: "orders" },
      payload: { revised: "X" },
      createdBy: "pm"
    });
    submitChangeRequest(ws, cr.id, "pm");
    approveChangeRequest(ws, cr.id, "tm");

    const focus = inferDeliveryFocus(ws);
    expect(focus.kind).toBe("pending-cr");
    if (focus.kind === "pending-cr") {
      expect(focus.crId).toBe(cr.id);
      expect(focus.suggestedCli).toContain("--from-cr");
    }

    const tracks = buildDeliveryTracks(ws);
    expect(tracks.delta.pendingCrs.some((p) => p.id === cr.id)).toBe(true);
  });
});
