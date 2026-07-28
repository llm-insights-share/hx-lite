import { createInterface } from "node:readline";
import fs from "node:fs";
import path from "node:path";
import { Workspace } from "./paths.js";
import { stageGateCheck } from "./stageGate.js";
import { buildContextPack, buildTaskPack, renderContextPack, writeTaskPack } from "./guideEngine.js";
import { traceCheck } from "./traceability.js";
import { collectStatus } from "./view.js";
import { readMeta } from "./metaStore.js";
import type { DeliveryStage } from "./stages.js";
import type { RunnerOptions } from "./sensorRunner.js";
import { runSensor } from "./sensorRunner.js";
import { findTask } from "./plan.js";
import { buildFixPack } from "./fix.js";
import { buildApplyTaskEnv, buildFixSessionEnv, L1_AGENT_ENV_SCHEMA_ID } from "./l1Contract.js";
import { VERSION } from "./version.js";
import { validateHarnessCompleteness } from "./harnessCompleteness.js";
import { verifyLock } from "./assets.js";
import { buildNavigationReport } from "./navigationReport.js";

export const MCP_PROTOCOL_VERSION = "2024-11-05";

export interface McpTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export const MCP_TOOLS: McpTool[] = [
  {
    name: "gate_check",
    description: "Run harness gate sensors for a change (equiv: hx gate check)",
    inputSchema: {
      type: "object",
      properties: {
        change: { type: "string", description: "Change id" },
        stage: { type: "string", description: "Delivery stage: req|arch|dev|test" },
        task: { type: "string", description: "Task within stage" }
      },
      required: ["change"]
    }
  },
  {
    name: "guide_pack",
    description: "Assemble the stage/task Context Pack for a change (equiv: hx guide pack)",
    inputSchema: {
      type: "object",
      properties: {
        change: { type: "string" },
        stage: { type: "string", description: "Delivery stage (defaults to meta.stage)" },
        task: { type: "string", description: "Task id (defaults to meta.task)" }
      },
      required: ["change"]
    }
  },
  {
    name: "change_status",
    description: "List active changes with gate/task/traceability summary (equiv: hx change list / status)",
    inputSchema: { type: "object", properties: {} }
  },
  {
    name: "doctor",
    description: "Check harness workspace health (equiv: hx doctor)",
    inputSchema: { type: "object", properties: {} }
  },
  {
    name: "next",
    description: "Suggest next CLI and IDE entry (workspace, org stage, or change; equiv: hx next)",
    inputSchema: {
      type: "object",
      properties: {
        change: { type: "string", description: "Change id (optional)" },
        stage: { type: "string", description: "Org stage: req|arch" },
        prd: { type: "string", description: "PRD slug for req stage" },
        task: { type: "string", description: "Task id override" },
        module: { type: "string", description: "Module id for arch internal-interface" }
      }
    }
  },
  {
    name: "trace_check",
    description: "Verify scenario-to-test traceability for a change (equiv: hx trace check)",
    inputSchema: {
      type: "object",
      properties: { change: { type: "string" } },
      required: ["change"]
    }
  },
  {
    name: "apply_task",
    description: "Build task-scoped apply handoff (context pack + L1 HX_TASK_* env contract)",
    inputSchema: {
      type: "object",
      properties: {
        change: { type: "string" },
        task: { type: "string", description: "Task id (e.g. 01b)" }
      },
      required: ["change", "task"]
    }
  },
  {
    name: "fix_session",
    description: "Build fix-session handoff for a failing sensor (HX_FIX_PACK env contract)",
    inputSchema: {
      type: "object",
      properties: {
        change: { type: "string" },
        sensor: { type: "string", description: "Sensor id" }
      },
      required: ["change", "sensor"]
    }
  },
  {
    name: "drift_check",
    description: "Run unified drift sensor (spec↔code, design↔code, adapter drift)",
    inputSchema: {
      type: "object",
      properties: { change: { type: "string" } },
      required: ["change"]
    }
  }
];

export async function callMcpTool(
  ws: Workspace,
  name: string,
  args: Record<string, unknown>,
  runnerOpts: RunnerOptions
): Promise<unknown> {
  switch (name) {
    case "gate_check": {
      const change = String(args.change ?? "");
      if (!change) throw new Error("gate_check requires change");
      const meta = readMeta(ws, change);
      const stage = (args.stage ? String(args.stage) : meta.stage) as DeliveryStage;
      const task = args.task ? String(args.task) : meta.task;
      return stageGateCheck(ws, change, stage, task, runnerOpts);
    }
    case "guide_pack": {
      const change = String(args.change ?? "");
      if (!change) throw new Error("guide_pack requires change");
      const meta = readMeta(ws, change);
      const stage = (args.stage ? String(args.stage) : meta.stage) as DeliveryStage;
      const task = args.task ? String(args.task) : meta.task;
      const pack = buildContextPack(ws, change, stage, task);
      return { stage, task, markdown: renderContextPack(pack), sections: pack.sections.map((s) => s.title) };
    }
    case "change_status":
      return collectStatus(ws);
    case "doctor": {
      const findings: { level: string; code: string; message: string; suggestion?: string }[] = [];
      try {
        const completeness = validateHarnessCompleteness(ws);
        for (const f of completeness.findings) findings.push(f);
      } catch (e) {
        findings.push({ level: "warn", code: "COMPLETENESS", message: (e as Error).message });
      }
      if (fs.existsSync(ws.lockFile)) {
        const lock = verifyLock(ws);
        if (!lock.ok) for (const p of lock.problems) findings.push({ level: "error", code: "LOCK", message: p });
        else findings.push({ level: "info", code: "LOCK", message: "harness.lock verified" });
      } else {
        findings.push({ level: "warn", code: "LOCK", message: "harness.lock missing", suggestion: "hx lock write" });
      }
      const tierFile = path.join(ws.root, ".harnessx-adapter-tier");
      if (!fs.existsSync(tierFile)) findings.push({ level: "warn", code: "ADAPTER_TIER", message: "adapter not synced", suggestion: "hx adapter sync" });
      return { ok: !findings.some((f) => f.level === "error"), findings };
    }
    case "next": {
      const stageArg = args.stage ? String(args.stage) : undefined;
      const report = buildNavigationReport(ws, {
        change: args.change ? String(args.change) : undefined,
        stage: stageArg === "req" || stageArg === "arch" ? stageArg : undefined,
        prdSlug: args.prd ? String(args.prd) : undefined,
        task: args.task ? String(args.task) : undefined,
        moduleId: args.module ? String(args.module) : undefined
      });
      const cfg = ws.readConfig();
      const adapter = (cfg.adapter?.target ?? "cursor").toLowerCase();
      let ide: { slash?: string; skillPath?: string; note?: string } | undefined;
      const ideStage = report.scope === "org" || report.scope === "change" ? report.stage : undefined;
      const ideTask = report.scope === "org" || report.scope === "change" ? report.task : undefined;
      if (ideStage && ideTask) {
        const name = `hx-${ideStage}-${ideTask}`;
        if (adapter === "trae") {
          ide = { skillPath: `.trae/skills/${name}/SKILL.md`, note: "Trigger skill or select hx-planner / hx-executor agent" };
        } else if (adapter === "generic" || adapter === "codex" || adapter === "opencode") {
          ide = { note: "See AGENTS.md Task entrypoints or run hx guide pack" };
        } else {
          ide = {
            slash: `/${name}`,
            skillPath: adapter === "qoder" ? `.qoder/skills/${name}.md` : `.cursor/skills/* or .claude/commands/${name}.md`
          };
        }
      }
      return { ...report, ide };
    }
    case "trace_check": {
      const change = String(args.change ?? "");
      if (!change) throw new Error("trace_check requires change");
      return traceCheck(ws, change);
    }
    case "apply_task": {
      const change = String(args.change ?? "");
      const taskId = String(args.task ?? "");
      if (!change || !taskId) throw new Error("apply_task requires change and task");
      const task = findTask(ws, change, taskId);
      if (!task) throw new Error(`task ${taskId} not found in change ${change}`);
      const { file, pack } = writeTaskPack(ws, change, taskId);
      const env = buildApplyTaskEnv(change, task, file);
      return {
        task: taskId,
        markdown: renderContextPack(pack),
        packFile: file,
        env,
        contractSchema: L1_AGENT_ENV_SCHEMA_ID
      };
    }
    case "fix_session": {
      const change = String(args.change ?? "");
      const sensor = String(args.sensor ?? "");
      if (!change || !sensor) throw new Error("fix_session requires change and sensor");
      const fixPack = buildFixPack(ws, change, sensor);
      const env = buildFixSessionEnv(change, sensor, fixPack.file);
      return {
        sensor,
        packFile: fixPack.file,
        findings: fixPack.findings,
        env,
        contractSchema: L1_AGENT_ENV_SCHEMA_ID
      };
    }
    case "drift_check": {
      const change = String(args.change ?? "");
      if (!change) throw new Error("drift_check requires change");
      const harness = ws.readHarness();
      const def = harness.sensors.find((s) => s.id === "drift") ?? {
        id: "drift",
        kind: "sensor.drift" as const,
        execution: "computational" as const,
        trigger: "task" as const,
        check: "inline" as const,
        expr: "drift.ok == true",
        on_fail: "block" as const,
        max_retries: 0,
        timeout_ms: 120000
      };
      return runSensor(ws, def, change, runnerOpts);
    }
    default:
      throw new Error(`unknown tool: ${name}`);
  }
}

type JsonRpcRequest = {
  jsonrpc?: string;
  id?: number | string;
  method?: string;
  params?: Record<string, unknown> & { name?: string; arguments?: Record<string, unknown> };
};

/** Stdio MCP server (2024-11-05 subset) for Trae/Qoder/Cursor MCP bridges. */
export function runMcpStdioServer(ws: Workspace, runnerOpts: RunnerOptions): void {
  const rl = createInterface({ input: process.stdin, terminal: false });

  const reply = (id: number | string | undefined, result: unknown) => {
    if (id === undefined) return;
    process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, result }) + "\n");
  };

  const replyError = (id: number | string | undefined, code: number, message: string) => {
    if (id === undefined) return;
    process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } }) + "\n");
  };

  rl.on("line", (line) => {
    void (async () => {
      let req: JsonRpcRequest;
      try {
        req = JSON.parse(line) as JsonRpcRequest;
      } catch {
        return;
      }

      const { id, method, params } = req;

      if (method === "initialize") {
        reply(id, {
          protocolVersion: MCP_PROTOCOL_VERSION,
          capabilities: { tools: {} },
          serverInfo: { name: "harnessx", version: VERSION }
        });
        return;
      }

      if (method === "notifications/initialized" || method === "initialized") return;

      if (method === "tools/list") {
        reply(id, {
          tools: MCP_TOOLS.map((t) => ({
            name: t.name,
            description: t.description,
            inputSchema: t.inputSchema
          }))
        });
        return;
      }

      if (method === "tools/call") {
        const tool = params?.name;
        const toolArgs = (params?.arguments ?? {}) as Record<string, unknown>;
        try {
          const data = await callMcpTool(ws, String(tool), toolArgs, runnerOpts);
          reply(id, {
            content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
            isError: false
          });
        } catch (e) {
          reply(id, {
            content: [{ type: "text", text: (e as Error).message }],
            isError: true
          });
        }
        return;
      }

      if (method === "ping") {
        reply(id, {});
        return;
      }

      replyError(id, -32601, `Method not found: ${method}`);
    })();
  });
}
