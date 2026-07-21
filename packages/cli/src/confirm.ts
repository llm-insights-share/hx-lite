import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { UsageError } from "./exitCodes.js";

/** Require explicit --yes or interactive confirmation for destructive actions. */
export async function requireDestructiveConfirmation(opts: {
  yes?: boolean;
  action: string;
  detail?: string;
}): Promise<void> {
  if (opts.yes) return;
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new UsageError(`destructive action requires --yes (non-interactive): ${opts.action}`);
  }
  const rl = createInterface({ input, output });
  try {
    const prompt = opts.detail ? `${opts.action}\n${opts.detail}\nType 'yes' to continue: ` : `${opts.action} Type 'yes' to continue: `;
    const answer = (await rl.question(prompt)).trim().toLowerCase();
    if (answer !== "yes") throw new UsageError("aborted");
  } finally {
    rl.close();
  }
}
