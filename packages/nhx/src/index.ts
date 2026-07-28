import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import fs from "node:fs";
import path from "node:path";
import { Command } from "commander";
import {
  approvalStatus,
  createTicket,
  exportProject,
  health,
  login,
  submitTicket,
} from "./api/client.js";
import { syncAdapters } from "./adapter/cursor.js";
import {
  ensureNhxDir,
  loadConfig,
  loadCredentials,
  lockPath,
  mergeStages,
  nhxRoot,
  resolveApiBase,
  saveConfig,
  saveCredentials,
  type NhxConfig,
} from "./config.js";
import { loginViaBrowser, resolveWebuiBase } from "./browser-login.js";
import { listLocalCommands, materializeExport } from "./sync/materialize.js";
import { runSubmit } from "./submit.js";
import { markSession, parseNhxSlash, runSensorCheck } from "./sensor/check.js";

async function prompt(question: string, fallback = ""): Promise<string> {
  if (!input.isTTY) return fallback;
  const rl = createInterface({ input, output });
  try {
    const ans = await rl.question(question);
    return (ans || fallback).trim();
  } finally {
    rl.close();
  }
}

function requireToken(cwd = process.cwd()): string {
  const creds = loadCredentials(cwd);
  if (!creds?.access_token) {
    throw new Error("未登录。请先执行: nhx login");
  }
  return creds.access_token;
}

async function doSync(opts: {
  stages?: string[];
  prune?: boolean;
  targets?: string[];
  cwd?: string;
}): Promise<void> {
  const cwd = opts.cwd || process.cwd();
  const cfg = loadConfig(cwd);
  if (!cfg?.project_id && !cfg?.project_slug) {
    throw new Error("未初始化项目。请先执行: nhx init --project <id|slug> --stages …");
  }
  const api = resolveApiBase(undefined, cwd);
  const token = requireToken(cwd);
  const stages = opts.stages?.length ? opts.stages : cfg.stages;
  const projectRef = cfg.project_id ?? cfg.project_slug!;
  console.log(`↻ sync project=${projectRef} stages=${stages.join(",") || "(all)"} api=${api}`);
  const payload = await exportProject(api, token, projectRef, stages);
  const stats = materializeExport(payload, { prune: opts.prune, cwd });
  const mergedStages = mergeStages(cfg.stages, payload.stages_filter || stages);
  const targets = opts.targets?.length ? opts.targets : cfg.targets;
  const next: NhxConfig = {
    ...cfg,
    api_base: api,
    project_id: payload.project.id,
    project_slug: payload.project.slug,
    stages: mergedStages,
    targets,
  };
  saveConfig(next, cwd);
  const adapter = syncAdapters(targets, cwd);
  console.log("✓ materialize", stats);
  console.log("✓ adapter", adapter);
}

function buildProgram(): Command {
  const program = new Command("nhx");
  program
    .description("nhx — 项目 HX 交付 CLI（从 WebUI 同步资产 / IDE 安装 / 提交产物）")
    .version("0.1.0");

  program
    .command("login")
    .description(
      "登录 WebUI：无参数打开浏览器登录页；-u 提示密码；-u -p 直接登录",
    )
    .option("--api <url>", "覆盖 API 地址（可选）")
    .option("--webui <url>", "覆盖 WebUI 前端地址（浏览器登录时用，默认 :5173）")
    .option("-u, --username <user>", "用户名（终端登录）")
    .option("-p, --password <pass>", "密码（终端登录）")
    .action(
      async (opts: {
        api?: string;
        webui?: string;
        username?: string;
        password?: string;
      }) => {
        const cwd = process.cwd();
        const api = resolveApiBase(opts.api, cwd);

        // Mode A: bare `nhx login` → open WebUI login/register in browser
        if (!opts.username) {
          if (opts.password) {
            console.error("请同时提供 -u/--username，或仅使用 nhx login 打开浏览器");
            process.exitCode = 1;
            return;
          }
          const webui = resolveWebuiBase(opts.webui, api);
          try {
            const result = await loginViaBrowser(webui);
            ensureNhxDir(cwd);
            saveCredentials(
              { access_token: result.access_token, username: result.username },
              cwd,
            );
            const cfg = loadConfig(cwd) || {
              api_base: api,
              stages: [],
              targets: ["cursor", "trae"],
            };
            cfg.api_base = api;
            saveConfig(cfg, cwd);
            console.log(`✓ logged in as ${result.username || "(browser)"} → ${api}`);
          } catch (e: unknown) {
            console.error(e instanceof Error ? e.message : String(e));
            process.exitCode = 1;
          }
          return;
        }

        // Mode B/C: -u [ -p ] → password prompt or direct login
        if (!(await health(api))) {
          console.error(`无法连接 ${api}/api/health`);
          process.exitCode = 1;
          return;
        }
        const username = opts.username;
        const password =
          opts.password ||
          process.env.NHX_PASSWORD ||
          (await prompt("Password: "));
        if (!password) {
          console.error("password required");
          process.exitCode = 1;
          return;
        }
        try {
          const { access_token } = await login(api, username, password);
          ensureNhxDir(cwd);
          saveCredentials({ access_token, username }, cwd);
          const cfg = loadConfig(cwd) || {
            api_base: api,
            stages: [],
            targets: ["cursor", "trae"],
          };
          cfg.api_base = api;
          saveConfig(cfg, cwd);
          console.log(`✓ logged in as ${username} → ${api}`);
        } catch (e: unknown) {
          console.error(e instanceof Error ? e.message : String(e));
          process.exitCode = 1;
        }
      },
    );

  program
    .command("init")
    .description("初始化 .nhx、按 stage 拉取资产并安装到 IDE")
    .requiredOption("--project <idOrSlug>", "项目 ID 或 slug")
    .requiredOption("--stages <list>", "关注的 stage，逗号分隔，如 req,dev")
    .option("--targets <list>", "IDE 目标，逗号分隔", "cursor,trae")
    .option("--api <url>", "覆盖 API（可选）")
    .option("--prune", "清理未包含的本地资产", false)
    .action(
      async (opts: {
        project: string;
        stages: string;
        targets: string;
        api?: string;
        prune?: boolean;
      }) => {
        const cwd = process.cwd();
        const api = resolveApiBase(opts.api, cwd);
        const token = requireToken(cwd);
        const stages = opts.stages.split(",").map((s) => s.trim()).filter(Boolean);
        const targets = opts.targets.split(",").map((s) => s.trim()).filter(Boolean);
        console.log(`↻ init project=${opts.project} stages=${stages.join(",")} api=${api}`);
        const payload = await exportProject(api, token, opts.project, stages);
        materializeExport(payload, { prune: opts.prune, cwd });
        saveConfig(
          {
            api_base: api,
            project_id: payload.project.id,
            project_slug: payload.project.slug,
            stages: payload.stages_filter || stages,
            targets,
          },
          cwd,
        );
        const adapter = syncAdapters(targets, cwd);
        console.log(
          `✓ init done — tasks=${payload.counts.tasks} guides=${payload.counts.guides} sensors=${payload.counts.sensors}`,
        );
        console.log("✓ adapter", adapter);
      },
    );

  program
    .command("sync")
    .description("按配置重新拉取并重装 IDE（可叠加 stages）")
    .option("--stages <list>", "追加/覆盖 stage 列表")
    .option("--targets <list>", "覆盖 IDE 目标")
    .option("--prune", "删除不在本次导出中的本地文件", false)
    .action(async (opts: { stages?: string; targets?: string; prune?: boolean }) => {
      const stages = opts.stages
        ? opts.stages.split(",").map((s) => s.trim()).filter(Boolean)
        : undefined;
      const targets = opts.targets
        ? opts.targets.split(",").map((s) => s.trim()).filter(Boolean)
        : undefined;
      // merge: if stages provided, merge with existing for overlay semantics
      const cfg = loadConfig();
      const merged = stages ? mergeStages(cfg?.stages || [], stages) : undefined;
      if (stages && cfg) {
        // temporarily write merged so doSync uses them; doSync also merges again
        saveConfig({ ...cfg, stages: merged! });
      }
      await doSync({ stages: merged || stages, targets, prune: opts.prune });
    });

  const adapter = program.command("adapter").description("IDE 投影");
  adapter
    .command("sync")
    .description("仅根据本地 .nhx 重投影到 IDE")
    .option("--targets <list>", "覆盖目标")
    .action((opts: { targets?: string }) => {
      const cfg = loadConfig();
      const targets = opts.targets
        ? opts.targets.split(",").map((s) => s.trim()).filter(Boolean)
        : cfg?.targets || ["cursor", "trae"];
      const result = syncAdapters(targets);
      console.log("✓ adapter", result);
    });

  program
    .command("status")
    .description("显示本地 nhx 状态")
    .action(() => {
      const cwd = process.cwd();
      const cfg = loadConfig(cwd);
      const creds = loadCredentials(cwd);
      const lock = fs.existsSync(lockPath(cwd))
        ? JSON.parse(fs.readFileSync(lockPath(cwd), "utf8"))
        : null;
      console.log(
        JSON.stringify(
          {
            root: nhxRoot(cwd),
            api_base: resolveApiBase(undefined, cwd),
            logged_in: Boolean(creds?.access_token),
            username: creds?.username,
            config: cfg,
            lock,
            commands: listLocalCommands(cwd),
          },
          null,
          2,
        ),
      );
    });

  program
    .command("submit")
    .description("提交本地产物到项目 HX 维护系统")
    .argument("<file>", "本地文件路径")
    .requiredOption("--name <name>", "产物名称")
    .option("--stage <stage>", "阶段")
    .option("--task <task>", "任务")
    .option("--note <note>", "备注")
    .action(
      async (
        file: string,
        opts: { name: string; stage?: string; task?: string; note?: string },
      ) => {
        const result = await runSubmit({
          file,
          name: opts.name,
          stage: opts.stage,
          task: opts.task,
          note: opts.note,
        });
        console.log("✓ submitted", result);
      },
    );

  const sensor = program.command("sensor").description("Sensor 检查（任务直接绑定）");
  sensor
    .command("check")
    .description("对当前会话或指定 stage/task 运行绑定的 sensor")
    .option("--stage <stage>")
    .option("--task <task>")
    .option(
      "--channel <channel>",
      "触发通道过滤：cli | hook:stop | hook:beforeSubmit | hook:afterFileEdit | task-shell",
      "cli",
    )
    .option("--paths <paths>", "afterFileEdit 编辑路径，逗号分隔")
    .option("--json", "JSON 输出", false)
    .action(
      async (opts: {
        stage?: string;
        task?: string;
        channel?: string;
        paths?: string;
        json?: boolean;
      }) => {
        const paths = opts.paths
          ? opts.paths.split(",").map((s) => s.trim()).filter(Boolean)
          : undefined;
        const result = await runSensorCheck({
          stage: opts.stage,
          task: opts.task,
          channel: opts.channel || "cli",
          paths,
        });
        if (opts.json) {
          console.log(JSON.stringify(result));
        } else {
          console.log(
            `stage=${result.stage} task=${result.task} channel=${result.channel} ok=${result.ok}`,
          );
          for (const f of result.findings) {
            const tag = f.skipped ? "SKIP" : f.ok ? "PASS" : "FAIL";
            console.log(`  [${tag}] ${f.sensor_id} (${f.check_type}): ${f.message}`);
          }
        }
        if (!result.ok) process.exitCode = 1;
      },
    );

  const session = program.command("session").description("IDE 会话上下文");
  session
    .command("mark")
    .description("记录当前 stage/task（供 hooks 使用）")
    .option("--stage <stage>")
    .option("--task <task>")
    .option("--from-prompt <text>", "从提示词解析 /nhx-stage-task")
    .action((opts: { stage?: string; task?: string; fromPrompt?: string }) => {
      let stage = opts.stage || "";
      let task = opts.task || "";
      if (opts.fromPrompt) {
        const parsed = parseNhxSlash(opts.fromPrompt);
        if (parsed) {
          stage = parsed.stage;
          task = parsed.task;
        }
      }
      if (!stage || !task) {
        console.error("need --stage/--task or --from-prompt with /nhx-…");
        process.exitCode = 1;
        return;
      }
      markSession(stage, task);
      console.log(`✓ session ${stage}/${task}`);
    });

  const approve = program.command("approve").description("人工检查审批");
  approve
    .command("request")
    .description("创建并提交 human-check 工单")
    .requiredOption("--stage <stage>")
    .requiredOption("--task <task>")
    .option("--title <title>")
    .option("--body <body>")
    .option("--artifact <name>")
    .action(
      async (opts: {
        stage: string;
        task: string;
        title?: string;
        body?: string;
        artifact?: string;
      }) => {
        const cwd = process.cwd();
        const cfg = loadConfig(cwd);
        const creds = loadCredentials(cwd);
        if (!cfg?.project_id || !creds?.access_token) throw new Error("请先 nhx login && nhx init");
        const api = resolveApiBase(undefined, cwd);
        const ticket = await createTicket(api, creds.access_token, {
          project_id: cfg.project_id,
          title: opts.title || `人工检查 ${opts.stage}/${opts.task}`,
          ticket_type: "human-check",
          stage: opts.stage,
          task: opts.task,
          artifact_name: opts.artifact || "",
          body: opts.body || `请审批任务 ${opts.stage}/${opts.task}`,
        });
        const submitted = await submitTicket(api, creds.access_token, ticket.id);
        console.log("✓ 已创建并提交工单", submitted.ticket_no || ticket.ticket_no, submitted.id || ticket.id);
        console.log("  请在 WebUI「审批工单」中批准，或等待审批人处理。");
      },
    );
  approve
    .command("status")
    .description("查询 stage/task 人工审批状态")
    .requiredOption("--stage <stage>")
    .requiredOption("--task <task>")
    .action(async (opts: { stage: string; task: string }) => {
      const cwd = process.cwd();
      const cfg = loadConfig(cwd);
      const creds = loadCredentials(cwd);
      if (!cfg?.project_id || !creds?.access_token) throw new Error("请先 nhx login && nhx init");
      const api = resolveApiBase(undefined, cwd);
      const st = await approvalStatus(api, creds.access_token, cfg.project_id, opts.stage, opts.task);
      console.log(JSON.stringify(st, null, 2));
      if (!st.approved) process.exitCode = 1;
    });

  program
    .command("doctor")
    .description("检查 api / token / .nhx / IDE 投影")
    .action(async () => {
      const cwd = process.cwd();
      const api = resolveApiBase(undefined, cwd);
      const okHealth = await health(api);
      const cfg = loadConfig(cwd);
      const creds = loadCredentials(cwd);
      const cmds = listLocalCommands(cwd);
      const cursorCmds = path.join(cwd, ".cursor", "commands");
      const nhxCursor = fs.existsSync(cursorCmds)
        ? fs.readdirSync(cursorCmds).filter((f) => f.startsWith("nhx-")).length
        : 0;
      const traeSkills = path.join(cwd, ".trae", "skills");
      const nhxTrae = fs.existsSync(traeSkills)
        ? fs.readdirSync(traeSkills).filter((d) => d.startsWith("nhx-")).length
        : 0;
      const report = {
        api,
        health: okHealth,
        logged_in: Boolean(creds?.access_token),
        config: Boolean(cfg),
        project_id: cfg?.project_id,
        stages: cfg?.stages,
        local_commands: cmds.length,
        cursor_nhx_commands: nhxCursor,
        trae_nhx_skills: nhxTrae,
        ok: okHealth && Boolean(creds?.access_token) && Boolean(cfg?.project_id),
      };
      console.log(JSON.stringify(report, null, 2));
      if (!report.ok) process.exitCode = 1;
    });

  return program;
}

async function main(): Promise<void> {
  const program = buildProgram();
  try {
    await program.parseAsync(process.argv);
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  }
}

main();
