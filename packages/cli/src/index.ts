#!/usr/bin/env node
import { Command } from "commander";
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
import { registerReqCommands, registerDevCommands, registerTestCommands, registerStageStatusCommand } from "./stages.js";
import { registerDoctorCommand } from "./doctor.js";
import { registerNextCommand } from "./next.js";
import { registerTuiCommand } from "./tui.js";
import { exitFromError } from "./exitCodes.js";
import { VERSION } from "@harnessx/core";

export const program = new Command("hx")
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

program.parseAsync(process.argv).catch(exitFromError);
