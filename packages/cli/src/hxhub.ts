#!/usr/bin/env node
import { Command } from "commander";
import { VERSION } from "@harnessx/core";
import { registerHubCommands } from "./hubCommands.js";

const program = new Command("hxhub")
  .description("Harness Hub operations CLI (maintainer + scaffold + doctor)")
  .helpCommand(false)
  .version(VERSION);

registerHubCommands(program, { mode: "hxhub" });

program.parseAsync(process.argv).catch((e) => {
  console.error(`hxhub: ${(e as Error).message}`);
  process.exit(1);
});
