import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { loadConfig, parseInstallScope, resolveInstallScope } from "./config.js";

describe("install_scope", () => {
  it("parseInstallScope defaults to project", () => {
    assert.equal(parseInstallScope(undefined), "project");
    assert.equal(parseInstallScope("project"), "project");
    assert.equal(parseInstallScope("global"), "global");
    assert.equal(parseInstallScope("other"), "project");
  });

  it("CLI flags override config", () => {
    const cfg = {
      api_base: "http://127.0.0.1:8000",
      stages: [],
      targets: ["cursor"],
      install_scope: "project" as const,
    };
    assert.equal(resolveInstallScope({ global: true, config: cfg }), "global");
    assert.equal(resolveInstallScope({ local: true, config: { ...cfg, install_scope: "global" } }), "project");
    assert.equal(resolveInstallScope({ config: { ...cfg, install_scope: "global" } }), "global");
    assert.equal(resolveInstallScope({}), "project");
  });

  it("rejects --global and --local together", () => {
    assert.throws(() => resolveInstallScope({ global: true, local: true }), /不能同时/);
  });

  it("loads optional approval interval config", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "nhx-cfg-"));
    try {
      fs.mkdirSync(path.join(root, ".nhx"), { recursive: true });
      fs.writeFileSync(
        path.join(root, ".nhx", "config.yaml"),
        [
          "api_base: http://127.0.0.1:8000",
          "stages: [req]",
          "targets: [cursor]",
          "approval_check_interval_minutes: 90",
          "approval_check_mode: hourly_auto",
          "",
        ].join("\n"),
        "utf8",
      );
      const cfg = loadConfig(root);
      assert.equal(cfg?.approval_check_interval_minutes, 90);
      assert.equal(cfg?.approval_check_mode, "hourly_auto");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
