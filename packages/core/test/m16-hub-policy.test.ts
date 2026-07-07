import { describe, it, expect } from "vitest";
import { checkHubPolicy } from "@harnessx/core";

describe("hub policy", () => {
  it("flags enforced assets without approval", () => {
    const issues = checkHubPolicy([
      {
        id: "pkg-a",
        version: "1.0.0",
        category: "package",
        status: "enforced",
        review: "pending",
        kind: "guide.skill"
      }
    ]);
    expect(issues.some((i) => i.severity === "error")).toBe(true);
  });
});
