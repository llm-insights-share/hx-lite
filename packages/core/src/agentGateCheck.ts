import fs from "node:fs";
import { Workspace } from "./paths.js";
import { readMeta } from "./metaStore.js";
import { stageGateCheck, type StageGateCheckResult } from "./stageGate.js";
import { orgStageGateCheck, isOrgStage } from "./orgStageGate.js";
import { resolveSuiteName } from "./profileResolve.js";
import { readAgentSession, clearAgentSession, type AgentSessionMark } from "./agentSession.js";
import type { DeliveryStage } from "./stages.js";
import type { RunnerOptions } from "./sensorRunner.js";

export const DEFAULT_GATE_STOP_LOOP_LIMIT = 3;

export interface AgentCheckResult {
  passed: boolean;
  change?: string;
  stage: DeliveryStage;
  task: string;
  blockers: string[];
  warnings: string[];
  fixHints: string[];
  suite?: string;
}

export interface AgentCheckOptions {
  change?: string;
  stage?: DeliveryStage;
  task?: string;
  prd?: string;
  module?: string;
}

function pickActiveChange(ws: Workspace): string | undefined {
  const changes = ws.listChanges();
  if (changes.length === 1) return changes[0];
  // Prefer the most recently modified change dir
  let best: string | undefined;
  let bestMtime = 0;
  for (const id of changes) {
    try {
      const st = fs.statSync(ws.changeDir(id));
      if (st.mtimeMs > bestMtime) {
        bestMtime = st.mtimeMs;
        best = id;
      }
    } catch {
      /* skip */
    }
  }
  return best ?? changes[0];
}

function resolveTargets(ws: Workspace, opts: AgentCheckOptions): {
  stage: DeliveryStage;
  task: string;
  change?: string;
  prd?: string;
  module?: string;
  session: AgentSessionMark | null;
} {
  const session = readAgentSession(ws);
  let stage = opts.stage ?? session?.stage;
  let task = opts.task ?? session?.task;
  let change = opts.change ?? session?.change;
  const prd = opts.prd ?? session?.prd;
  const moduleId = opts.module ?? session?.module;

  if ((!stage || !task) && change) {
    const meta = readMeta(ws, change);
    stage = stage ?? meta.stage;
    task = task ?? meta.task;
  }
  if (!change && stage && (stage === "dev" || stage === "test")) {
    change = pickActiveChange(ws);
    if (change && (!stage || !task)) {
      const meta = readMeta(ws, change);
      stage = stage ?? meta.stage;
      task = task ?? meta.task;
    }
  }
  if (!stage || !task) {
    if (change) {
      const meta = readMeta(ws, change);
      return { stage: meta.stage, task: meta.task, change, prd, module: moduleId, session };
    }
    throw new Error("agent-check requires --stage/--task or an agent-session / active change");
  }
  return { stage, task, change, prd, module: moduleId, session };
}

function toAgentResult(
  ws: Workspace,
  stage: DeliveryStage,
  task: string,
  change: string | undefined,
  res: StageGateCheckResult | Awaited<ReturnType<typeof orgStageGateCheck>>
): AgentCheckResult {
  const harness = ws.readHarness();
  let profile = "standard";
  try {
    profile = change ? readMeta(ws, change).profile : ws.readConfig().profile;
  } catch {
    try {
      profile = ws.readConfig().profile;
    } catch {
      /* default */
    }
  }
  const suite = resolveSuiteName(harness, profile, stage, task);
  const fixHints =
    "suite" in res && res.suite && "fixHints" in res.suite && Array.isArray(res.suite.fixHints)
      ? res.suite.fixHints
      : [];
  return {
    passed: res.passed,
    change,
    stage,
    task,
    blockers: res.blockers,
    warnings: res.warnings,
    fixHints,
    suite
  };
}

/** Run gate check for the current slash session / change; machine-readable for IDE hooks. */
export async function agentGateCheck(
  ws: Workspace,
  runnerOpts: RunnerOptions,
  opts: AgentCheckOptions = {}
): Promise<AgentCheckResult> {
  const { stage, task, change, prd, module: moduleId } = resolveTargets(ws, opts);
  if (isOrgStage(stage)) {
    const res = await orgStageGateCheck(ws, stage, task, runnerOpts, {
      prdSlug: prd,
      moduleId
    });
    return toAgentResult(ws, stage, task, change, res);
  }
  if (!change) throw new Error("agent-check requires a change id for dev/test stages");
  const res = await stageGateCheck(ws, change, stage, task, runnerOpts);
  return toAgentResult(ws, stage, task, change, res);
}

export interface StopHookInput {
  status?: string;
  loop_count?: number;
}

export interface StopHookOutput {
  followup_message?: string;
}

function buildFollowup(result: AgentCheckResult, atLimit: boolean): string {
  const label = `${result.stage}/${result.task}`;
  const changePart = result.change ? ` for change \`${result.change}\`` : "";
  if (atLimit) {
    return [
      `HarnessX GATE BLOCKED (${label})${changePart} — automatic iteration limit reached.`,
      "",
      "Blockers:",
      ...result.blockers.map((b) => `- ${b}`),
      "",
      result.fixHints.length ? "Fix hints:" : "",
      ...result.fixHints.map((h) => `- ${h}`),
      "",
      "Stop auto-follow-up. Summarize remaining issues for the human; do not keep retrying without guidance.",
      "Do not weaken tests or delete assertions."
    ]
      .filter((l) => l !== undefined)
      .join("\n");
  }
  return [
    `HarnessX GATE BLOCKED (${label})${changePart}.`,
    "",
    "Blockers:",
    ...result.blockers.map((b) => `- ${b}`),
    "",
    result.fixHints.length ? "Fix hints:" : "",
    ...result.fixHints.map((h) => `- ${h}`),
    result.warnings.length ? "" : null,
    result.warnings.length ? "Warnings:" : null,
    ...result.warnings.map((w) => `- ${w}`),
    "",
    "Decide: if these are actionable for this task, fix the deliverables and continue; if blocked on human approval or missing inputs, stop and tell the user.",
    "Do not weaken tests or delete assertions.",
    "You may re-run `hx gate check` or MCP `gate_check` after fixes."
  ]
    .filter((l) => l !== null && l !== undefined)
    .join("\n");
}

/**
 * Cursor `stop` hook helper: run agent-check when a slash session is active;
 * emit followup_message on failure (respecting loop_limit).
 */
export async function gateStopHookResponse(
  ws: Workspace,
  runnerOpts: RunnerOptions,
  input: StopHookInput,
  loopLimit = DEFAULT_GATE_STOP_LOOP_LIMIT
): Promise<StopHookOutput> {
  if (input.status && input.status !== "completed") return {};

  const session = readAgentSession(ws);
  const hasChange = ws.listChanges().length > 0;
  if (!session?.slash && !hasChange) return {};

  let result: AgentCheckResult;
  try {
    result = await agentGateCheck(ws, runnerOpts, {});
  } catch {
    return {};
  }

  if (result.passed) {
    clearAgentSession(ws);
    return {};
  }

  const loopCount = input.loop_count ?? 0;
  const atLimit = loopCount >= loopLimit;
  if (atLimit) clearAgentSession(ws);
  return { followup_message: buildFollowup(result, atLimit) };
}
