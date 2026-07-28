import fs from "node:fs";
import path from "node:path";
import { Workspace, ensureDir } from "./paths.js";
import type { DeliveryStage } from "./stages.js";

export interface AgentSessionMark {
  slash: boolean;
  change?: string;
  stage?: DeliveryStage;
  task?: string;
  prd?: string;
  module?: string;
  command?: string;
  at: string;
}

export function agentSessionFile(ws: Workspace): string {
  return path.join(ws.base, ".runtime", "agent-session.json");
}

export function readAgentSession(ws: Workspace): AgentSessionMark | null {
  const f = agentSessionFile(ws);
  if (!fs.existsSync(f)) return null;
  try {
    return JSON.parse(fs.readFileSync(f, "utf8")) as AgentSessionMark;
  } catch {
    return null;
  }
}

export function writeAgentSession(ws: Workspace, mark: AgentSessionMark): void {
  const f = agentSessionFile(ws);
  ensureDir(path.dirname(f));
  fs.writeFileSync(f, JSON.stringify(mark, null, 2) + "\n", "utf8");
}

export function clearAgentSession(ws: Workspace): void {
  const f = agentSessionFile(ws);
  if (fs.existsSync(f)) fs.unlinkSync(f);
}

/** Parse `/hx-dev-design foo` or `hx-dev-design foo` from a prompt string. */
export function parseHxSlashPrompt(prompt: string): {
  command: string;
  stage: DeliveryStage;
  task: string;
  arg?: string;
} | null {
  const m = prompt.match(/(?:^|\s)\/?(hx-(req|arch|dev|test)-([a-z0-9-]+))\b(?:\s+(\S+))?/i);
  if (!m) return null;
  const command = m[1]!.toLowerCase();
  const stage = m[2]!.toLowerCase() as DeliveryStage;
  const task = m[3]!.toLowerCase().replace(/-/g, "-"); // keep kebab
  // task ids use hyphens already (e.g. test-case-design); slashName uses hyphens
  const arg = m[4];
  return { command, stage, task: normalizeSlashTask(stage, task), arg };
}

function normalizeSlashTask(stage: DeliveryStage, dashed: string): string {
  // slashName: hx-${stage}-${task.replace(/_/g, "-")} — task ids are already kebab-case
  return dashed;
}

export function markAgentSessionFromPrompt(ws: Workspace, prompt: string): AgentSessionMark | null {
  const parsed = parseHxSlashPrompt(prompt);
  if (!parsed) return null;
  const mark: AgentSessionMark = {
    slash: true,
    command: parsed.command,
    stage: parsed.stage,
    task: parsed.task,
    at: new Date().toISOString()
  };
  if (parsed.stage === "dev" || parsed.stage === "test") {
    mark.change = parsed.arg;
  } else if (parsed.stage === "req") {
    mark.prd = parsed.arg;
  } else if (parsed.stage === "arch" && parsed.task === "internal-interface") {
    mark.module = parsed.arg;
  }
  writeAgentSession(ws, mark);
  return mark;
}
