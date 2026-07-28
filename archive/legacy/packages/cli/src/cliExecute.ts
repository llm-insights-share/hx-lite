import { Command } from "commander";
import { VERSION } from "@harnessx/core";
import { registerFoundationCommands } from "./foundation.js";
import { registerGateCommands } from "./gates.js";
import { registerBehaviourCommands } from "./behaviour.js";
import { registerSteeringCommands } from "./steering.js";
import { registerAssetCommands } from "./assets.js";
import { registerOrchestrationCommands } from "./orchestration.js";
import { registerMcpCommand } from "./mcp.js";
import { registerArchCommands } from "./arch.js";
import { registerApproveAliases } from "./approve.js";
import { registerSdlcCommands } from "./sdlc.js";
import {
  registerReqCommands,
  registerDevCommands,
  registerTestCommands,
  registerStageStatusCommand
} from "./stages.js";
import { registerDoctorCommand } from "./doctor.js";
import { registerNextCommand } from "./next.js";
import { registerTuiCommand } from "./tui.js";
import { registerHubCommands } from "./hubCommands.js";
import { ConfigError, EXIT_FAIL, EXIT_OK, EXIT_USAGE, UsageError } from "./exitCodes.js";

/** Thrown when CLI handlers call process.exit during in-process execution. */
export class CliExitError extends Error {
  readonly exitCode: number;
  constructor(exitCode: number) {
    super(`CLI exited with code ${exitCode}`);
    this.name = "CliExitError";
    this.exitCode = exitCode;
  }
}

export interface CliExecuteResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export type CliProgramKind = "hx" | "hxhub";

function formatArgs(args: unknown[]): string {
  return args
    .map((a) => (typeof a === "string" ? a : typeof a === "object" ? JSON.stringify(a) : String(a)))
    .join(" ");
}

export function buildHxProgram(): Command {
  const program = new Command("hx")
    .description("HarnessX — outer harness for AI coding agents")
    .version(VERSION);
  registerFoundationCommands(program);
  registerGateCommands(program);
  registerBehaviourCommands(program);
  registerSteeringCommands(program);
  registerAssetCommands(program);
  registerOrchestrationCommands(program);
  registerArchCommands(program);
  registerApproveAliases(program);
  registerSdlcCommands(program);
  registerReqCommands(program);
  registerDevCommands(program);
  registerTestCommands(program);
  registerStageStatusCommand(program);
  registerDoctorCommand(program);
  registerNextCommand(program);
  registerTuiCommand(program);
  registerMcpCommand(program);
  return program;
}

export function buildHxhubProgram(): Command {
  const program = new Command("hxhub")
    .description("Harness Hub operations CLI (maintainer + scaffold + doctor)")
    .helpCommand(false)
    .version(VERSION);
  registerHubCommands(program, { mode: "hxhub" });
  return program;
}

export function buildCliProgram(kind: CliProgramKind): Command {
  return kind === "hxhub" ? buildHxhubProgram() : buildHxProgram();
}

export async function executeCli(program: Command, argv: string[]): Promise<CliExecuteResult> {
  const stdoutLines: string[] = [];
  const stderrLines: string[] = [];
  let exitCode = EXIT_OK;

  const origExit = process.exit;
  const origLog = console.log;
  const origError = console.error;
  const origWarn = console.warn;
  const origStdoutWrite = process.stdout.write.bind(process.stdout);
  const origStderrWrite = process.stderr.write.bind(process.stderr);

  const captureWrite =
    (buf: string | Uint8Array, sink: string[]) =>
    (chunk: string | Uint8Array, _enc?: BufferEncoding, cb?: (err?: Error) => void): boolean => {
      sink.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8"));
      if (typeof cb === "function") cb();
      return true;
    };

  (process as NodeJS.Process & { exit: typeof process.exit }).exit = ((code?: number | string | null) => {
    const n = typeof code === "number" ? code : code ? Number(code) : EXIT_OK;
    exitCode = Number.isFinite(n) ? n : EXIT_FAIL;
    throw new CliExitError(exitCode);
  }) as typeof process.exit;

  console.log = (...args: unknown[]) => {
    stdoutLines.push(formatArgs(args));
  };
  console.error = (...args: unknown[]) => {
    stderrLines.push(formatArgs(args));
  };
  console.warn = (...args: unknown[]) => {
    stderrLines.push(formatArgs(args));
  };
  process.stdout.write = captureWrite("", stdoutLines) as typeof process.stdout.write;
  process.stderr.write = captureWrite("", stderrLines) as typeof process.stderr.write;

  try {
    await program.parseAsync(argv, { from: "user" });
  } catch (e) {
    if (e instanceof CliExitError) {
      exitCode = e.exitCode;
    } else if (e instanceof UsageError) {
      exitCode = EXIT_USAGE;
      stderrLines.push(e.message);
    } else if (e instanceof ConfigError) {
      exitCode = e.exitCode;
      stderrLines.push(e.message);
    } else if (e instanceof Error) {
      exitCode = EXIT_FAIL;
      stderrLines.push(e.message);
    } else {
      exitCode = EXIT_FAIL;
      stderrLines.push(String(e));
    }
  } finally {
    process.exit = origExit;
    console.log = origLog;
    console.error = origError;
    console.warn = origWarn;
    process.stdout.write = origStdoutWrite;
    process.stderr.write = origStderrWrite;
  }

  return {
    exitCode,
    stdout: stdoutLines.join("\n"),
    stderr: stderrLines.join("\n")
  };
}

let hxProgramSingleton: Command | undefined;
let hxhubProgramSingleton: Command | undefined;

function getHxProgram(): Command {
  if (!hxProgramSingleton) hxProgramSingleton = buildHxProgram();
  return hxProgramSingleton;
}

function getHxhubProgram(): Command {
  if (!hxhubProgramSingleton) hxhubProgramSingleton = buildHxhubProgram();
  return hxhubProgramSingleton;
}

export async function executeHx(argv: string[]): Promise<CliExecuteResult> {
  return executeCli(getHxProgram(), argv);
}

export async function executeHxhub(argv: string[]): Promise<CliExecuteResult> {
  return executeCli(getHxhubProgram(), argv);
}

export async function executeCliKind(kind: CliProgramKind, argv: string[]): Promise<CliExecuteResult> {
  return kind === "hxhub" ? executeHxhub(argv) : executeHx(argv);
}

/** Reset cached programs (tests). */
export function resetCliProgramsForTest(): void {
  hxProgramSingleton = undefined;
  hxhubProgramSingleton = undefined;
}
