#!/usr/bin/env node
import { Command } from "commander";
import { VERSION } from "@harnessx/core";
import { registerHubCommands } from "./hubCommands.js";
import { EXIT_FAIL, EXIT_USAGE, UsageError } from "./exitCodes.js";

const program = new Command("hxhub")
  .description("Harness Hub operations CLI (maintainer + scaffold + doctor)")
  .helpCommand(false)
  .version(VERSION);

registerHubCommands(program, { mode: "hxhub" });

program.parseAsync(process.argv).catch((e) => {
  if (e instanceof UsageError) {
    console.error(`hxhub: ${e.message}`);
    process.exit(EXIT_USAGE);
  }
  console.error(`hxhub: ${(e as Error).message}`);
  process.exit(EXIT_FAIL);
});
