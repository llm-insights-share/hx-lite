#!/usr/bin/env node
import { buildHxhubProgram } from "./cliExecute.js";
import { EXIT_FAIL, EXIT_USAGE, UsageError } from "./exitCodes.js";

export { buildHxhubProgram, executeHxhub } from "./cliExecute.js";

const program = buildHxhubProgram();

program.parseAsync(process.argv).catch((e) => {
  if (e instanceof UsageError) {
    console.error(`hxhub: ${e.message}`);
    process.exit(EXIT_USAGE);
  }
  console.error(`hxhub: ${(e as Error).message}`);
  process.exit(EXIT_FAIL);
});
