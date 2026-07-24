import { describe, it, expect, beforeEach } from "vitest";
import { executeHx, resetCliProgramsForTest, CliExitError } from "../src/cliExecute.js";
import { EXIT_CONFIG, EXIT_OK } from "../src/exitCodes.js";

describe("cliExecute", () => {
  beforeEach(() => {
    resetCliProgramsForTest();
  });

  it("executeHx runs doctor without killing the host process", async () => {
    const before = process.exit;
    let exited = false;
    (process as NodeJS.Process & { exit: typeof process.exit }).exit = (() => {
      exited = true;
      throw new CliExitError(EXIT_CONFIG);
    }) as typeof process.exit;
    try {
      const res = await executeHx(["doctor"]);
      expect(exited).toBe(false);
      expect(typeof res.exitCode).toBe("number");
      expect(res.stdout.length + res.stderr.length).toBeGreaterThan(0);
    } finally {
      process.exit = before;
    }
  });

  it("executeHx runs --help and captures output", async () => {
    const res = await executeHx(["--help"]);
    expect(res.stdout.length + res.stderr.length).toBeGreaterThan(10);
  });

  it("executeHx returns usage exit for unknown command", async () => {
    const res = await executeHx(["not-a-real-command-xyz"]);
    expect(res.exitCode).not.toBe(EXIT_OK);
  });
});
