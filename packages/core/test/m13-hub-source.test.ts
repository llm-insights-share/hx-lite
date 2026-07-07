import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { hubRemoteCacheDir, isGitHubHubRef, resolveHubSource, type GitExecResult } from "@harnessx/core";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "hx-m13-"));

describe("hub source resolver", () => {
  it("keeps local path behavior unchanged", () => {
    const root = tmp();
    const localHub = path.join(root, "hub");
    fs.mkdirSync(localHub, { recursive: true });
    expect(resolveHubSource(root, localHub)).toBe(localHub);
  });

  it("detects supported github URL forms", () => {
    expect(isGitHubHubRef("git@github.com:org/private-hub.git")).toBe(true);
    expect(isGitHubHubRef("ssh://git@github.com/org/private-hub.git")).toBe(true);
    expect(isGitHubHubRef("https://github.com/org/private-hub.git")).toBe(true);
    expect(isGitHubHubRef("./local-hub")).toBe(false);
  });

  it("clones remote hub on first use", () => {
    const root = tmp();
    const ref = "git@github.com:org/private-hub.git";
    const calls: string[][] = [];
    const gitExec = (args: string[]): GitExecResult => {
      calls.push(args);
      return { status: 0, stdout: "", stderr: "" };
    };

    const resolved = resolveHubSource(root, ref, { updateRemote: true, gitExec });
    expect(resolved).toBe(hubRemoteCacheDir(root, ref));
    expect(calls[0]).toEqual(["clone", ref, resolved]);
    expect(fs.existsSync(path.join(resolved, ".git"))).toBe(true);
  });

  it("fetches and pulls when cached repo exists", () => {
    const root = tmp();
    const ref = "git@github.com:org/private-hub.git";
    const repo = hubRemoteCacheDir(root, ref);
    fs.mkdirSync(path.join(repo, ".git"), { recursive: true });
    const calls: string[][] = [];
    const gitExec = (args: string[]): GitExecResult => {
      calls.push(args);
      if (args.slice(-3).join(" ") === "rev-parse --abbrev-ref HEAD") return { status: 0, stdout: "main\n", stderr: "" };
      return { status: 0, stdout: "", stderr: "" };
    };

    resolveHubSource(root, ref, { updateRemote: true, gitExec });
    expect(calls[0]).toEqual(["-C", repo, "fetch", "--all", "--prune"]);
    expect(calls[1]).toEqual(["-C", repo, "rev-parse", "--abbrev-ref", "HEAD"]);
    expect(calls[2]).toEqual(["-C", repo, "pull", "--ff-only", "origin", "main"]);
  });

  it("emits actionable auth error", () => {
    const root = tmp();
    const ref = "https://github.com/org/private-hub.git";
    const gitExec = (): GitExecResult => ({
      status: 1,
      stdout: "",
      stderr: "Permission denied (publickey)"
    });

    expect(() => resolveHubSource(root, ref, { updateRemote: true, gitExec })).toThrow(/ssh -T git@github\.com/i);
    expect(() => resolveHubSource(root, ref, { updateRemote: true, gitExec })).toThrow(/prefer SSH URL/i);
  });
});
