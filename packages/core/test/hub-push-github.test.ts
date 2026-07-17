import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pushLocalHubToRemote, type GitExec } from "@harnessx/core";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "hx-hub-push-"));

describe("pushLocalHubToRemote", () => {
  it("initializes git, commits, and pushes a local hub directory", () => {
    const hubDir = path.join(tmp(), "harness-hub");
    fs.mkdirSync(hubDir, { recursive: true });
    fs.writeFileSync(path.join(hubDir, "hub-policy.yaml"), "version: 1\n", "utf8");

    const calls: string[][] = [];
    const gitExec: GitExec = (args, cwd) => {
      calls.push([cwd ?? ".", ...args]);
      const joined = args.join(" ");
      if (joined === "init") return { status: 0, stdout: "", stderr: "" };
      if (joined.startsWith("remote get-url")) return { status: 1, stdout: "", stderr: "" };
      if (joined.startsWith("remote add")) return { status: 0, stdout: "", stderr: "" };
      if (joined === "status --porcelain") return { status: 0, stdout: " M hub-policy.yaml\n", stderr: "" };
      if (joined === "add .") return { status: 0, stdout: "", stderr: "" };
      if (joined.includes("commit")) return { status: 0, stdout: "", stderr: "" };
      if (joined.startsWith("branch -M")) return { status: 0, stdout: "", stderr: "" };
      if (joined.startsWith("fetch origin")) return { status: 0, stdout: "", stderr: "" };
      if (joined.startsWith("rev-parse origin/")) return { status: 1, stdout: "", stderr: "" };
      if (joined === "rev-parse HEAD") return { status: 0, stdout: "abc\n", stderr: "" };
      if (joined.startsWith("push -u")) return { status: 0, stdout: "", stderr: "" };
      return { status: 1, stdout: "", stderr: `unexpected: ${joined}` };
    };

    const result = pushLocalHubToRemote(hubDir, {
      remote: "git@github.com:org/hx-hub.git",
      branch: "main",
      message: "seed hub",
      gitExec
    });

    expect(result.committed).toBe(true);
    expect(result.pushed).toBe(true);
    expect(result.remote).toBe("git@github.com:org/hx-hub.git");
    expect(calls.some((c) => c.includes("init"))).toBe(true);
    expect(calls.some((c) => c.includes("push") && c.includes("origin"))).toBe(true);
  });

  it("rebases onto origin when local is behind before push", () => {
    const hubDir = path.join(tmp(), "harness-hub");
    fs.mkdirSync(hubDir, { recursive: true });
    fs.writeFileSync(path.join(hubDir, "hub-policy.yaml"), "version: 1\n", "utf8");
    fs.mkdirSync(path.join(hubDir, ".git"));

    const calls: string[] = [];
    const gitExec: GitExec = (args) => {
      const joined = args.join(" ");
      calls.push(joined);
      if (joined.startsWith("remote get-url")) return { status: 0, stdout: "git@github.com:org/hx-hub.git\n", stderr: "" };
      if (joined === "status --porcelain") return { status: 0, stdout: "", stderr: "" };
      if (joined.startsWith("branch -M")) return { status: 0, stdout: "", stderr: "" };
      if (joined.startsWith("fetch origin")) return { status: 0, stdout: "", stderr: "" };
      if (joined === "rev-parse HEAD") return { status: 0, stdout: "local1\n", stderr: "" };
      if (joined.startsWith("rev-parse origin/")) return { status: 0, stdout: "remote1\n", stderr: "" };
      if (joined.startsWith("merge-base")) return { status: 0, stdout: "base\n", stderr: "" };
      if (joined.startsWith("rebase origin/")) return { status: 0, stdout: "", stderr: "" };
      if (joined.startsWith("push -u")) return { status: 0, stdout: "", stderr: "" };
      return { status: 1, stdout: "", stderr: `unexpected: ${joined}` };
    };

    const result = pushLocalHubToRemote(hubDir, {
      remote: "git@github.com:org/hx-hub.git",
      branch: "main",
      gitExec
    });
    expect(result.pushed).toBe(true);
    expect(calls.some((c) => c.startsWith("rebase origin/"))).toBe(true);
    expect(calls.some((c) => c.startsWith("push -u"))).toBe(true);
  });

  it("requires --remote", () => {
    const hubDir = path.join(tmp(), "harness-hub");
    fs.mkdirSync(hubDir, { recursive: true });
    expect(() => pushLocalHubToRemote(hubDir, { remote: "" })).toThrow(/--remote/);
  });
});
