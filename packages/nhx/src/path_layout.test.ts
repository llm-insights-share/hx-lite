import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_PATH_LAYOUT,
  resolveDeliverablePath,
  formatPathLayoutSection,
} from "./path_layout.js";

describe("path_layout", () => {
  it("remaps docs/req alias to docs/requirements", () => {
    assert.equal(
      resolveDeliverablePath("docs/req/bizmodel.md", "req", DEFAULT_PATH_LAYOUT),
      "docs/requirements/bizmodel.md",
    );
  });

  it("joins relative filenames under stage root", () => {
    assert.equal(
      resolveDeliverablePath("biz-understanding.md", "req", DEFAULT_PATH_LAYOUT),
      "docs/requirements/biz-understanding.md",
    );
  });

  it("keeps named / docs/prd paths", () => {
    assert.equal(
      resolveDeliverablePath("docs/prd/PRD.md", "req", DEFAULT_PATH_LAYOUT),
      "docs/prd/PRD.md",
    );
    assert.equal(
      resolveDeliverablePath("@named:prd", "req", DEFAULT_PATH_LAYOUT),
      "docs/prd/PRD.md",
    );
  });

  it("formats appendix section", () => {
    const md = formatPathLayoutSection("req", "biz-understanding", DEFAULT_PATH_LAYOUT);
    assert.match(md, /docs\/requirements/);
    assert.match(md, /docs\/req/);
  });
});
