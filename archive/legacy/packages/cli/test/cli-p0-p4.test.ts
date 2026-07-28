import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const hxBin = path.join(repoRoot, "bin", "hx.js");

function hx(cwd: string, args: string[]): { status: number; out: string } {
  try {
    const out = execFileSync("node", [hxBin, ...args], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    });
    return { status: 0, out };
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string };
    return { status: err.status ?? 1, out: `${err.stdout ?? ""}${err.stderr ?? ""}` };
  }
}

describe("CLI P0–P4 surface", () => {
  it("foundation.ts has no debug sidechannel", () => {
    const src = fs.readFileSync(path.join(repoRoot, "packages/cli/src/foundation.ts"), "utf8");
    expect(src).not.toContain("127.0.0.1:7307");
    expect(src).not.toContain("debug-57a8bf");
  });

  it("hx --help lists doctor, next, tui, change", () => {
    const res = hx(repoRoot, ["--help"]);
    expect(res.status).toBe(0);
    expect(res.out).toMatch(/doctor/);
    expect(res.out).toMatch(/\bnext\b/);
    expect(res.out).toMatch(/\btui\b/);
    expect(res.out).toMatch(/change/);
  });

  it("hx next without change returns workspace/org/change scope", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "hx-cli-next-"));
    try {
      const created = hx(tmp, [
        "project",
        "create",
        "--profile",
        "standard",
        "--hub",
        path.join(repoRoot, "packages/scaffold/base")
      ]);
      expect(created.status).toBe(0);
      const res = hx(tmp, ["next"]);
      expect(res.status).toBe(0);
      expect(res.out).toMatch(/scope\t(workspace|org|change)/);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("project create --overwrite without --yes exits 2 when harness exists", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "hx-cli-p0-"));
    try {
      fs.mkdirSync(path.join(tmp, "harnessX"), { recursive: true });
      fs.writeFileSync(path.join(tmp, "harnessX", "harness.yaml"), "version: \"1.0\"\n");
      const res = hx(tmp, [
        "project",
        "create",
        "--profile",
        "lite",
        "--hub",
        path.join(repoRoot, "packages/scaffold/base"),
        "--overwrite"
      ]);
      expect(res.status).toBe(2);
      expect(res.out.toLowerCase()).toMatch(/--yes|destructive|aborted/);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
