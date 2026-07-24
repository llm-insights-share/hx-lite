import type { OrgStage } from "@harnessx/core";
import type { TuiLocale } from "./tuiLocale.js";

export interface TuiContext {
  locale: TuiLocale;
  change?: string;
  orgStage?: OrgStage;
  prdSlug?: string;
  moduleId?: string;
}

export type Localized = { en: string; zh: string };

export function L(en: string, zh: string): Localized {
  return { en, zh };
}

export function labelText(label: Localized, locale: TuiLocale): string {
  return locale === "zh" ? label.zh : label.en;
}

export interface PromptField {
  key: string;
  label: Localized;
  defaultValue?: (ctx: TuiContext) => string | undefined;
  required?: boolean;
}

export type ArgvBuilder = (ctx: TuiContext, answers: Record<string, string>) => string[];

export interface MenuActionNode {
  kind: "action";
  id: string;
  label: Localized;
  program: "hx" | "hxhub";
  buildArgv: ArgvBuilder;
  prompts?: PromptField[];
  destructive?: boolean;
  note?: Localized;
}

export interface MenuSubmenuNode {
  kind: "submenu";
  id: string;
  label: Localized;
  children: MenuNode[];
}

export interface MenuContextNode {
  kind: "context";
  id: string;
  label: Localized;
  screen: "home" | "org" | "change";
}

export type MenuNode = MenuActionNode | MenuSubmenuNode | MenuContextNode;

export function isAction(n: MenuNode): n is MenuActionNode {
  return n.kind === "action";
}

export function isSubmenu(n: MenuNode): n is MenuSubmenuNode {
  return n.kind === "submenu";
}

const changeId: PromptField = {
  key: "change",
  label: L("Change id", "变更 ID"),
  defaultValue: (c) => c.change,
  required: true
};

const stageFlag: PromptField = {
  key: "stage",
  label: L("Stage (req|arch|dev|test)", "阶段 (req|arch|dev|test)"),
  defaultValue: (c) => c.orgStage,
  required: true
};

const taskFlag: PromptField = {
  key: "task",
  label: L("Task id", "任务 ID"),
  required: true
};

function hxAct(
  id: string,
  label: Localized,
  buildArgv: ArgvBuilder,
  opts?: { prompts?: PromptField[]; destructive?: boolean; note?: Localized }
): MenuActionNode {
  return { kind: "action", id, label, program: "hx", buildArgv, ...opts };
}

function hubAct(
  id: string,
  label: Localized,
  buildArgv: ArgvBuilder,
  opts?: { prompts?: PromptField[]; destructive?: boolean; note?: Localized }
): MenuActionNode {
  return { kind: "action", id, label, program: "hxhub", buildArgv, ...opts };
}

function argv(...parts: string[]): ArgvBuilder {
  return () => parts;
}

function sub(id: string, label: Localized, children: MenuNode[]): MenuSubmenuNode {
  return { kind: "submenu", id, label, children };
}

function fixProjectMenu(): MenuSubmenuNode {
  return sub("project", L("project", "项目"), [
    {
      kind: "action",
      id: "project-create",
      label: L("project create", "project create"),
      program: "hx",
      prompts: [
        { key: "profile", label: L("Profile", "配置档"), defaultValue: () => "standard" },
        { key: "hub", label: L("Hub URL (optional)", "Hub 地址（可选）") }
      ],
      buildArgv: (_c, a) => {
        const args = ["project", "create", "--profile", a.profile || "standard"];
        if (a.hub?.trim()) args.push("--hub", a.hub.trim());
        return args;
      }
    },
    hxAct("sync-hub", L("project sync-hub", "project sync-hub"), argv("project", "sync-hub")),
    hxAct("sync-hub-dry", L("project sync-hub --dry-run", "project sync-hub --dry-run"), argv("project", "sync-hub", "--dry-run")),
    hxAct("pull-assets", L("project pull-assets", "project pull-assets"), argv("project", "pull-assets")),
    hxAct("pull-assets-check", L("project pull-assets --check", "project pull-assets --check"), argv("project", "pull-assets", "--check")),
    hxAct("init", L("init", "init"), argv("init"))
  ]);
}

function changeMenu(): MenuSubmenuNode {
  return sub("change", L("change", "变更"), [
    {
      kind: "action",
      id: "change-create",
      label: L("change create", "change create"),
      program: "hx",
      prompts: [
        { key: "id", label: L("Change id", "变更 ID"), required: true },
        { key: "domains", label: L("Domains (comma-separated)", "域（逗号分隔）"), required: true },
        { key: "prd", label: L("PRD slug (optional)", "PRD slug（可选）") }
      ],
      buildArgv: (_c, a) => {
        const args = ["change", "create", a.id, "--domains", a.domains];
        if (a.prd?.trim()) args.push("--prd", a.prd.trim());
        return args;
      }
    },
    hxAct("change-list", L("change list", "change list"), argv("change", "list")),
    hxAct("propose", L("change propose", "change propose"), (_c, a) => ["change", "propose", a.change], { prompts: [changeId] }),
    hxAct("explore", L("change explore", "change explore"), (_c, a) => ["change", "explore", a.change], { prompts: [changeId] }),
    hxAct("design", L("change design", "change design"), (_c, a) => ["change", "design", a.change], { prompts: [changeId] }),
    hxAct("plan", L("change plan", "change plan"), (_c, a) => ["change", "plan", a.change], { prompts: [changeId] }),
    hxAct("apply", L("change apply", "change apply"), (_c, a) => ["change", "apply", a.change], { prompts: [changeId] }),
    hxAct("verify", L("change verify", "change verify"), (_c, a) => ["change", "verify", a.change], { prompts: [changeId] }),
    hxAct("archive", L("change archive", "change archive"), (_c, a) => ["change", "archive", a.change, "--yes"], {
      prompts: [changeId],
      destructive: true
    })
  ]);
}

function gateMenu(): MenuSubmenuNode {
  return sub("gate", L("gate", "门禁"), [
    {
      kind: "action",
      id: "gate-check",
      label: L("gate check", "gate check"),
      program: "hx",
      prompts: [changeId, stageFlag, taskFlag],
      buildArgv: (_c, a) => ["gate", "check", a.change, "--stage", a.stage, "--task", a.task]
    },
    hxAct("gate-advance", L("gate advance", "gate advance"), (_c, a) => ["gate", "advance", a.change], { prompts: [changeId] }),
    hxAct("gate-approve", L("gate approve", "gate approve"), (_c, a) => ["gate", "approve", a.change], { prompts: [changeId] }),
    hxAct("gate-agent-check", L("gate agent-check", "gate agent-check"), argv("gate", "agent-check")),
    hxAct("gate-hook-check", L("gate hook-check", "gate hook-check"), argv("gate", "hook-check")),
    hxAct("gate-replay", L("gate replay", "gate replay"), argv("gate", "replay"))
  ]);
}

function guideMenu(): MenuSubmenuNode {
  return sub("guide", L("guide", "指南"), [
    {
      kind: "action",
      id: "guide-pack",
      label: L("guide pack", "guide pack"),
      program: "hx",
      prompts: [changeId, stageFlag, taskFlag],
      buildArgv: (_c, a) => ["guide", "pack", a.change, "--stage", a.stage, "--task", a.task]
    },
    hxAct("guide-task-pack", L("guide task-pack", "guide task-pack"), (_c, a) => ["guide", "task-pack", a.change, a.task], {
      prompts: [changeId, { key: "task", label: L("Task id", "任务 ID"), required: true }]
    }),
    hxAct("guide-prd-pack", L("guide prd-pack", "guide prd-pack"), (_c, a) => ["guide", "prd-pack", a.prd], {
      prompts: [{ key: "prd", label: L("PRD slug", "PRD slug"), defaultValue: (c) => c.prdSlug, required: true }]
    }),
    hxAct("guide-arch-pack", L("guide arch-pack", "guide arch-pack"), argv("guide", "arch-pack"))
  ]);
}

function reqMenu(): MenuSubmenuNode {
  return sub("req", L("req", "需求"), [
    hxAct("req-status", L("req status", "req status"), argv("req", "status")),
    hxAct("req-check", L("req check", "req check"), argv("req", "check")),
    hxAct("req-prd-list", L("req prd list", "req prd list"), argv("req", "prd", "list")),
    {
      kind: "action",
      id: "req-prd-init",
      label: L("req prd init", "req prd init"),
      program: "hx",
      prompts: [{ key: "slug", label: L("PRD slug", "PRD slug"), required: true }],
      buildArgv: (_c, a) => ["req", "prd", "init", a.slug]
    },
    hxAct("req-research-init", L("req research init", "req research init"), argv("req", "research", "init")),
    hxAct("req-analysis-init", L("req analysis init", "req analysis init"), argv("req", "analysis", "init")),
    hxAct("req-prototype-init", L("req prototype init", "req prototype init"), argv("req", "prototype", "init"))
  ]);
}

function archMenu(): MenuSubmenuNode {
  return sub("arch", L("arch", "架构"), [
    hxAct("arch-init", L("arch init", "arch init"), argv("arch", "init")),
    hxAct("arch-check", L("arch check", "arch check"), argv("arch", "check")),
    hxAct("arch-list", L("arch list", "arch list"), argv("arch", "list")),
    hxAct("arch-align", L("arch align", "arch align"), argv("arch", "align")),
    hxAct("arch-lld-init", L("arch lld init", "arch lld init"), argv("arch", "lld", "init")),
    hxAct("arch-lld-check", L("arch lld check", "arch lld check"), argv("arch", "lld", "check"))
  ]);
}

function stageMenu(): MenuSubmenuNode {
  return sub("stage", L("stage / dev / test", "stage / dev / test"), [
    hxAct("dev-status", L("dev status", "dev status"), (_c, a) => ["dev", "status", a.change], { prompts: [changeId] }),
    hxAct("test-status", L("test status", "test status"), (_c, a) => ["test", "status", a.change], { prompts: [changeId] }),
    {
      kind: "action",
      id: "stage-status",
      label: L("stage status", "stage status"),
      program: "hx",
      prompts: [changeId, stageFlag],
      buildArgv: (_c, a) => (a.change ? ["stage", "status", a.change, "--stage", a.stage] : ["stage", "status", "--stage", a.stage])
    }
  ]);
}

function hubMenu(): MenuSubmenuNode {
  return sub("hub", L("hub (hx hub)", "hub (hx hub)"), [
    hxAct("hub-golden", L("hub golden", "hub golden"), argv("hub", "golden")),
    hxAct("hub-resolve", L("hub resolve", "hub resolve"), argv("hub", "resolve", "--profile", "standard")),
    hxAct("hub-search", L("hub search", "hub search"), (_c, a) => (a.query ? ["hub", "search", a.query] : ["hub", "search"]), {
      prompts: [{ key: "query", label: L("Query (optional)", "关键词（可选）") }]
    }),
    hxAct("hub-catalog-list", L("hub catalog list", "hub catalog list"), argv("hub", "catalog", "list")),
    hxAct("hub-sync", L("hub sync", "hub sync"), argv("hub", "sync")),
    hxAct("hub-sync-apply", L("hub sync --apply", "hub sync --apply"), argv("hub", "sync", "--apply")),
    {
      kind: "action",
      id: "hub-add",
      label: L("hub add", "hub add"),
      program: "hx",
      prompts: [{ key: "pkg", label: L("Package id@version", "包 id@version"), required: true }],
      buildArgv: (_c, a) => ["hub", "add", a.pkg]
    },
    hxAct("hub-seed", L("hub seed", "hub seed"), argv("hub", "seed", "./harness-hub", "--profile", "standard", "--scenario", "core")),
    hxAct("hub-policy-check", L("hub policy check", "hub policy check"), argv("hub", "policy", "check")),
    hxAct("hub-contrib-list", L("hub contributions list", "hub contributions list"), argv("hub", "contributions", "list")),
    hxAct("hub-eval-list", L("hub eval --list", "hub eval --list"), argv("hub", "eval", "--list")),
    hxAct("hub-cache-gc", L("hub cache-gc", "hub cache-gc"), argv("hub", "cache-gc"), { destructive: true })
  ]);
}

function hxhubMenu(): MenuSubmenuNode {
  return sub("hxhub", L("hxhub (maintainer)", "hxhub（维护者）"), [
    hubAct("hxhub-init", L("hxhub init", "hxhub init"), argv("init")),
    hubAct("hxhub-doctor", L("hxhub doctor", "hxhub doctor"), argv("doctor")),
    hubAct("hxhub-fix", L("hxhub fix", "hxhub fix"), argv("fix")),
    hubAct("hxhub-help", L("hxhub help", "hxhub help"), argv("help")),
    hubAct("hxhub-seed", L("hxhub seed", "hxhub seed"), argv("seed", "./harness-hub", "--profile", "standard", "--scenario", "core")),
    hubAct("hxhub-golden", L("hxhub golden", "hxhub golden"), argv("golden")),
    hubAct("hxhub-search", L("hxhub search", "hxhub search"), argv("search")),
    hubAct("hxhub-push", L("hxhub push", "hxhub push"), argv("push", "--yes"), { destructive: true }),
    hubAct("hxhub-policy", L("hxhub policy check", "hxhub policy check"), argv("policy", "check")),
    hubAct("hxhub-contrib-list", L("hxhub contributions list", "hxhub contributions list"), argv("contributions", "list")),
    {
      kind: "action",
      id: "hxhub-asset-create",
      label: L("hxhub asset create --interactive", "hxhub asset create --interactive"),
      program: "hxhub",
      buildArgv: () => ["asset", "create", "--interactive"]
    }
  ]);
}

function sdlcMenu(): MenuSubmenuNode {
  return sub("sdlc", L("sdlc (wo/cr/bug)", "sdlc（工单/CR/缺陷）"), [
    sub("wo", L("wo", "工单"), [
      hxAct("wo-list", L("wo list", "wo list"), argv("wo", "list")),
      hxAct("wo-inbox", L("wo inbox", "wo inbox"), argv("wo", "inbox")),
      {
        kind: "action",
        id: "wo-show",
        label: L("wo show", "wo show"),
        program: "hx",
        prompts: [{ key: "id", label: L("Work order id", "工单 ID"), required: true }],
        buildArgv: (_c, a) => ["wo", "show", a.id]
      }
    ]),
    sub("cr", L("cr", "变更请求"), [
      hxAct("cr-list", L("cr list", "cr list"), argv("cr", "list")),
      {
        kind: "action",
        id: "cr-show",
        label: L("cr show", "cr show"),
        program: "hx",
        prompts: [{ key: "id", label: L("CR id", "CR ID"), required: true }],
        buildArgv: (_c, a) => ["cr", "show", a.id]
      },
      {
        kind: "action",
        id: "cr-link",
        label: L("cr link", "cr link"),
        program: "hx",
        prompts: [
          { key: "crId", label: L("CR id", "CR ID"), required: true },
          { key: "change", label: L("Change id", "变更 ID"), defaultValue: (c) => c.change, required: true }
        ],
        buildArgv: (_c, a) => ["cr", "link", a.crId, a.change]
      }
    ]),
    sub("bug", L("bug", "缺陷"), [
      hxAct("bug-list", L("bug list", "bug list"), (_c, a) => ["bug", "list", a.change], { prompts: [changeId] })
    ]),
    sub("test-cases", L("test-cases", "测试用例"), [
      hxAct("tc-init", L("test-cases init", "test-cases init"), (_c, a) => ["test-cases", "init", a.change], { prompts: [changeId] }),
      hxAct("tc-check", L("test-cases check", "test-cases check"), (_c, a) => ["test-cases", "check", a.change], { prompts: [changeId] })
    ])
  ]);
}

function adapterMenu(): MenuSubmenuNode {
  return sub("adapter", L("adapter", "适配器"), [
    hxAct("adapter-sync", L("adapter sync", "adapter sync"), argv("adapter", "sync")),
    hxAct("adapter-targets", L("adapter targets", "adapter targets"), argv("adapter", "targets")),
    hxAct("adapter-drift", L("adapter drift", "adapter drift"), argv("adapter", "drift")),
    hxAct("adapter-quest", L("adapter quest", "adapter quest"), (_c, a) => ["adapter", "quest", a.change], { prompts: [changeId] })
  ]);
}

function assetLockMenu(): MenuSubmenuNode {
  return sub("asset-lock", L("asset / lock", "asset / lock"), [
    hxAct("asset-list", L("asset list", "asset list"), argv("asset", "list")),
    hxAct("lock-write", L("lock write", "lock write"), argv("lock", "write")),
    hxAct("lock-verify", L("lock verify", "lock verify"), argv("lock", "verify")),
    hxAct("harness-lint", L("harness lint", "harness lint"), argv("harness", "lint"))
  ]);
}

function behaviourMenu(): MenuSubmenuNode {
  return sub("behaviour", L("behaviour / quality", "行为 / 质量"), [
    hxAct("trace-check", L("trace check", "trace check"), argv("trace", "check")),
    hxAct("status", L("status", "status"), argv("status")),
    hxAct("sync", L("sync", "sync"), argv("sync")),
    hxAct("rebase-check", L("rebase check", "rebase check"), (_c, a) => ["rebase", "check", a.change], { prompts: [changeId] }),
    hxAct("profile-recommend", L("profile recommend", "profile recommend"), (_c, a) => ["profile", "recommend", a.change], { prompts: [changeId] })
  ]);
}

function steeringMenu(): MenuSubmenuNode {
  return sub("steering", L("steering", "steering"), [
    hxAct("steer-report", L("steer report", "steer report"), argv("steer", "report")),
    hxAct("steer-coverage", L("steer coverage", "steer coverage"), argv("steer", "coverage")),
    hxAct("janitor-run", L("janitor run", "janitor run"), argv("janitor", "run"))
  ]);
}

function orchestrationMenu(): MenuSubmenuNode {
  return sub("orchestration", L("orchestration", "编排"), [
    hxAct("runtime-worktree-list", L("runtime worktree list", "runtime worktree list"), argv("runtime", "worktree", "list")),
    hxAct("review-list", L("review list", "review list"), (_c, a) => ["review", "list", a.change], { prompts: [changeId] }),
    hxAct("eval-guides", L("eval guides", "eval guides"), (_c, a) => ["eval", "guides", a.change], { prompts: [changeId] })
  ]);
}

function approveMenu(): MenuSubmenuNode {
  return sub("approve", L("approve", "审批"), [
    hxAct("approve-prd", L("approve prd", "approve prd"), argv("approve", "prd")),
    hxAct("approve-arch", L("approve arch", "approve arch"), argv("approve", "arch")),
    hxAct("approve-arch-lld", L("approve arch-lld", "approve arch-lld"), argv("approve", "arch-lld"))
  ]);
}

function hooksCiMenu(): MenuSubmenuNode {
  return sub("hooks-ci", L("hooks / ci / meta", "hooks / ci / meta"), [
    hxAct("hooks-install", L("hooks install", "hooks install"), argv("hooks", "install")),
    hxAct("ci-init", L("ci init", "ci init"), argv("ci", "init")),
    hxAct(
      "meta-verify",
      L("meta verify", "meta verify"),
      (_c, a) => (a.change?.trim() ? ["meta", "verify", a.change.trim()] : ["meta", "verify"]),
      {
        prompts: [{ key: "change", label: L("Change id (optional)", "变更 ID（可选）"), defaultValue: (c) => c.change }]
      }
    )
  ]);
}

function openspecMenu(): MenuSubmenuNode {
  return sub("openspec", L("openspec", "openspec"), [
    hxAct("openspec-import", L("openspec import", "openspec import"), argv("openspec", "import"))
  ]);
}

function mcpMenu(): MenuSubmenuNode {
  return sub("mcp", L("mcp", "mcp"), [
    {
      kind: "action",
      id: "mcp-start",
      label: L("mcp (stdio server — blocks)", "mcp（stdio 服务 — 阻塞）"),
      program: "hx",
      buildArgv: () => ["mcp"],
      note: L("Starts MCP stdio server; press Ctrl+C to return.", "启动 MCP stdio 服务；Ctrl+C 返回。")
    }
  ]);
}

function quickMenu(): MenuSubmenuNode {
  return sub("quick", L("quick", "快捷"), [
    hxAct("doctor", L("doctor", "doctor"), argv("doctor")),
    hxAct("next", L("next", "next"), argv("next")),
    {
      kind: "action",
      id: "next-change",
      label: L("next <change>", "next <change>"),
      program: "hx",
      prompts: [changeId],
      buildArgv: (_c, a) => ["next", a.change]
    }
  ]);
}

function workspaceContextMenu(): MenuSubmenuNode {
  return sub("workspace", L("workspace context", "工作区上下文"), [
    { kind: "context", id: "ctx-home", label: L("workspace home", "工作区首页"), screen: "home" },
    { kind: "context", id: "ctx-req", label: L("req context", "需求上下文"), screen: "org" },
    { kind: "context", id: "ctx-arch", label: L("arch context", "架构上下文"), screen: "org" },
    { kind: "context", id: "ctx-change", label: L("change context", "变更上下文"), screen: "change" }
  ]);
}

/** Root menu — parity with hx + hxhub CLI namespaces. */
export function buildRootMenu(): MenuSubmenuNode {
  return sub("root", L("HarnessX menu", "HarnessX 菜单"), [
    workspaceContextMenu(),
    quickMenu(),
    fixProjectMenu(),
    changeMenu(),
    gateMenu(),
    guideMenu(),
    reqMenu(),
    archMenu(),
    stageMenu(),
    hubMenu(),
    hxhubMenu(),
    sdlcMenu(),
    adapterMenu(),
    assetLockMenu(),
    behaviourMenu(),
    steeringMenu(),
    orchestrationMenu(),
    approveMenu(),
    hooksCiMenu(),
    openspecMenu(),
    mcpMenu()
  ]);
}

/** List selectable children for a submenu (flatten one level for numbering). */
export function listMenuChildren(node: MenuSubmenuNode): MenuNode[] {
  return node.children;
}

/** Find submenu by path of ids from root. */
export function resolveMenuPath(path: string[]): MenuSubmenuNode {
  let current: MenuSubmenuNode = buildRootMenu();
  for (const id of path) {
    const child = current.children.find((c) => c.id === id);
    if (!child || !isSubmenu(child)) throw new Error(`unknown menu path: ${path.join("/")}`);
    current = child;
  }
  return current;
}

export function countActions(node: MenuNode): number {
  if (isAction(node)) return 1;
  if (node.kind === "context") return 1;
  return node.children.reduce((n, c) => n + countActions(c), 0);
}
