import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import YAML from "yaml";
import { canTransitionHubAsset, assertHubAssetTransition, readHubReview, approveHubReview, rejectHubReview } from "@harnessx/core";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "hx-m14-"));

describe("hub lifecycle and review", () => {
  it("enforces hub lifecycle transitions", () => {
    expect(canTransitionHubAsset("trial", "enforced")).toBe(true);
    expect(canTransitionHubAsset("enforced", "trial")).toBe(false);
    expect(() => assertHubAssetTransition("enforced", "trial")).toThrow(/illegal hub asset transition/i);
  });

  it("reads legacy .review and upgrades via structured review file", () => {
    const dir = tmp();
    fs.writeFileSync(path.join(dir, ".review"), YAML.stringify({ status: "pending", publishedBy: "alice", at: "2026-01-01T00:00:00Z" }));
    const legacy = readHubReview(dir);
    expect(legacy.status).toBe("pending");
    expect(legacy.requestedBy).toBe("alice");

    const approved = approveHubReview(dir, "bob");
    expect(approved.status).toBe("approved");
    expect(readHubReview(dir).approvedBy).toContain("bob");

    const rejected = rejectHubReview(dir, "carol", "needs fixes");
    expect(rejected.status).toBe("rejected");
    expect(rejected.rejectedReason).toContain("needs fixes");
  });
});
