import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseInstallScope, resolveInstallScope } from "./config.js";

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
});
