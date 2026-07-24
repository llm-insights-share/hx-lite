#!/usr/bin/env node
import { buildHxProgram } from "./cliExecute.js";
import { exitFromError } from "./exitCodes.js";

export { buildHxProgram, executeHx, executeCli, type CliExecuteResult } from "./cliExecute.js";

const program = buildHxProgram();
export { program };

program.parseAsync(process.argv).catch(exitFromError);
