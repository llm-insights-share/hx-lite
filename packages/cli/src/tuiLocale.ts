import { Workspace } from "@harnessx/core";

export type TuiLocale = "en" | "zh";

export function resolveTuiLocale(opt?: string): TuiLocale {
  if (opt === "en" || opt === "zh") return opt;
  try {
    const loc = Workspace.locate(process.cwd()).readConfig().locale;
    return loc === "zh-CN" ? "zh" : "en";
  } catch {
    return "en";
  }
}

export interface TuiStrings {
  commandsLabel: string;
  helpTitle: string;
  pressEnter: string;
  unknownCommand: string;
  usageOpen: string;
  runInTerminal: string;
  none: string;
  doctorOk: string;
  doctorIssues: string;
  homeTitle: string;
  orgStageTitle: (stage: string) => string;
  changeTitle: string;
  selectChangeTitle: string;
  selectPrdTitle: string;
  profile: string;
  stages: string;
  changes: string;
  focus: string;
  context: string;
  module: string;
  change: string;
  stageTask: string;
  gate: string;
  suggested: string;
  guide: string;
  hint: string;
  baselineTrack: string;
  deltaTrack: string;
  deltaFromCr: string;
  pendingCrCreate: string;
  noActiveChanges: string;
  prdOnlyReq: string;
  noPrds: string;
  noGateCli: string;
  noGuideCli: string;
  tasksMarkedDone: (stageDisplay: string, count: number) => string;
  tracksHelp: string;
  hubHelp: string;
  prdLine: (slug: string) => string;
  focusOrg: (stage: string, task: string) => string;
  focusPendingCr: (id: string) => string;
  focusChange: (id: string) => string;
  noGateForFocus: string;
  defaultGuidePack: string;
  hubSection: string;
  hubNotConfigured: string;
  hubSuggested: string;
  hubRoot: string;
  hubConnection: (role: string, actor?: string) => string;
  hubSource: string;
  hubError: (msg: string) => string;
  hubNext: string;
  hubNoCache: string;
  hubDoctorOk: string;
  hubDoctorIssues: string;
  hubHints: string;
  hubSeedHint: string;
  hubNoSearch: (q: string) => string;
  hubCatalogEmpty: string;
  hubMoreSearch: (n: number) => string;
  pullIncomingNone: string;
  pullUpdatedNone: string;
  configMerged: string;
  lockAssets: (n: number) => string;
  commandSummaries: Record<string, string>;
  hubCommandSummaries: Record<string, string>;
  menuTitle: string;
  menuRoot: string;
  menuSubmenu: string;
  menuAction: string;
  menuContext: string;
  menuFooter: string;
  menuHelpLines: string;
  resultTitle: string;
  exitCode: string;
  resultOk: string;
  resultFail: string;
  destructiveDetail: string;
  promptRequired: string;
  contextFooter: string;
}

const EN: TuiStrings = {
  commandsLabel: "commands",
  helpTitle: "— help —",
  pressEnter: "(press Enter)",
  unknownCommand: "unknown command — type help",
  usageOpen: "usage: open <n>  (list number)",
  runInTerminal: "Run in another terminal:",
  none: "(none)",
  doctorOk: "ok",
  doctorIssues: "issues",
  homeTitle: "HarnessX — full TUI (hx tui)",
  orgStageTitle: (stage) => `HarnessX — ${stage} stage`,
  changeTitle: "HarnessX — change",
  selectChangeTitle: "HarnessX — select change",
  selectPrdTitle: "HarnessX — select PRD",
  profile: "profile",
  stages: "stages",
  changes: "changes",
  focus: "focus",
  context: "context",
  module: "module",
  change: "change",
  stageTask: "stage/task",
  gate: "gate",
  suggested: "suggested",
  guide: "guide",
  hint: "hint",
  baselineTrack: "baseline track",
  deltaTrack: "delta track",
  deltaFromCr: "delta (from CR)",
  pendingCrCreate: "→ create change",
  noActiveChanges: "(no active changes — run: hx change create <id> --domains <domain>)",
  prdOnlyReq: "prd is only available on the req stage",
  noPrds: "no PRDs — run: hx req prd init <slug> (dirs only)",
  noGateCli: "(no gate CLI for current focus)",
  noGuideCli: "(no guide CLI for current focus)",
  tasksMarkedDone: (stageDisplay, count) => `${stageDisplay}: ${count} task(s) marked done`,
  tracksHelp: "Tracks: baseline = PRD→many Changes→test; delta = CR→Change→test (same change).",
  hubHelp: "Hub: hub sync-hub pull-assets resolve search hub-sync hub-doctor (type help)",
  prdLine: (slug) => `PRD: ${slug}`,
  focusOrg: (stage, task) => `org ${stage}/${task}`,
  focusPendingCr: (id) => `pending CR ${id}`,
  focusChange: (id) => `change ${id}`,
  noGateForFocus: "(no gate CLI for current focus)",
  defaultGuidePack: "hx guide arch-pack",
  hubSection: "— hub —",
  hubNotConfigured: "hub: (not configured)",
  hubSuggested: "Suggested:",
  hubRoot: "hub root",
  hubConnection: (role, actor) => `connection: role=${role}${actor ? ` actor=${actor}` : ""}`,
  hubSource: "source",
  hubError: (msg) => `hub error: ${msg}`,
  hubNext: "Next:",
  hubNoCache: "(no hub-cache packages — run sync-hub or hx hub add <id>@<ver>)",
  hubDoctorOk: "hub-doctor: ok",
  hubDoctorIssues: "hub-doctor: issues found",
  hubHints: "Hints:",
  hubSeedHint: "Seed: hxhub seed ./harness-hub --profile standard --scenario core",
  hubNoSearch: (q) => `(no matches for "${q}")`,
  hubCatalogEmpty: "(catalog empty)",
  hubMoreSearch: (n) => `… and ${n} more — use: search <query>`,
  pullIncomingNone: "incoming\t(none)",
  pullUpdatedNone: "updated\t(none)",
  configMerged: "config\tmerged hub/adapter",
  lockAssets: (n) => `lock\t${n} asset(s)`,
  commandSummaries: {
    focus: "Enter inferred focus (org / pending CR / change)",
    req: "Requirements (org) context",
    arch: "Architecture (org) context",
    changes: "List changes (grouped by PRD when possible)",
    status: "Print stage status CLI hint",
    doctor: "Workspace health findings",
    suggested: "Print workspace suggested CLI",
    gate: "Print workspace gate CLI if available",
    guide: "Print workspace guide CLI if available",
    help: "Show this help",
    quit: "Quit TUI",
    next: "Print suggested CLI",
    prd: "Pick PRD (req stage; multi-PRD opens picker)",
    back: "Back to workspace home",
    open: "Open listed item: open <n> (or type <n>)"
  },
  hubCommandSummaries: {
    hub: "Hub connection status and suggested CLIs",
    "sync-hub": "Sync org hub into project assets (owner)",
    "pull-assets": "Pull harness assets from project Git (member-safe)",
    resolve: "List hub assets resolved for workspace profile",
    search: "Search hub catalog: search <query>",
    "hub-sync": "Show hub cache sync state",
    "hub-doctor": "Hub repository health findings",
    "hub-golden": "List built-in golden hub seed packages"
  },
  menuTitle: "Menu",
  menuRoot: "root",
  menuSubmenu: "menu",
  menuAction: "run",
  menuContext: "view",
  menuFooter: "open <n> | menu | home | back | help | quit",
  menuHelpLines:
    "  menu       Open full command menu (all hx / hxhub commands)\n" +
    "  open <n>   Select numbered item\n" +
    "  home       Workspace context home\n" +
    "  back       Go back one screen\n" +
    "  focus      Enter inferred focus (context screens)\n" +
    "  doctor     Run hx doctor in-process\n" +
    "  help       This help\n" +
    "  quit       Exit TUI",
  resultTitle: "Result",
  exitCode: "exit code",
  resultOk: "completed successfully",
  resultFail: "completed with errors",
  destructiveDetail: "This action may modify or delete data.",
  promptRequired: "required field missing",
  contextFooter: "focus req arch changes | menu | doctor | gate guide status | help quit"
};

const ZH: TuiStrings = {
  commandsLabel: "指令",
  helpTitle: "— 帮助 —",
  pressEnter: "（按 Enter 继续）",
  unknownCommand: "未知指令 — 输入 help 查看帮助",
  usageOpen: "用法：open <n>  （列表序号）",
  runInTerminal: "请在另一终端执行：",
  none: "（无）",
  doctorOk: "正常",
  doctorIssues: "有问题",
  homeTitle: "HarnessX — 完整 TUI（hx tui）",
  orgStageTitle: (stage) => `HarnessX — ${stage} 阶段`,
  changeTitle: "HarnessX — 变更",
  selectChangeTitle: "HarnessX — 选择变更",
  selectPrdTitle: "HarnessX — 选择 PRD",
  profile: "配置档",
  stages: "阶段",
  changes: "变更",
  focus: "焦点",
  context: "上下文",
  module: "模块",
  change: "变更",
  stageTask: "阶段/任务",
  gate: "门禁",
  suggested: "建议",
  guide: "指南",
  hint: "提示",
  baselineTrack: "基线轨道",
  deltaTrack: "增量轨道",
  deltaFromCr: "增量（来自 CR）",
  pendingCrCreate: "→ 创建变更",
  noActiveChanges: "（无活跃变更 — 执行：hx change create <id> --domains <domain>）",
  prdOnlyReq: "prd 仅在 req 阶段可用",
  noPrds: "（无 PRD — 执行：hx req prd init <slug>（仅建目录））",
  noGateCli: "（当前焦点无门禁 CLI）",
  noGuideCli: "（当前焦点无指南 CLI）",
  tasksMarkedDone: (stageDisplay, count) => `${stageDisplay}：已完成 ${count} 项任务`,
  tracksHelp: "轨道：基线 = PRD→多变更→测试；增量 = CR→变更→测试（同一 change）。",
  hubHelp: "Hub：hub sync-hub pull-assets resolve search hub-sync hub-doctor（输入 help）",
  prdLine: (slug) => `PRD：${slug}`,
  focusOrg: (stage, task) => `组织 ${stage}/${task}`,
  focusPendingCr: (id) => `待处理 CR ${id}`,
  focusChange: (id) => `变更 ${id}`,
  noGateForFocus: "（当前焦点无门禁 CLI）",
  defaultGuidePack: "hx guide arch-pack",
  hubSection: "— Hub —",
  hubNotConfigured: "hub：（未配置）",
  hubSuggested: "建议命令：",
  hubRoot: "hub 根目录",
  hubConnection: (role, actor) => `连接：角色=${role}${actor ? ` 操作者=${actor}` : ""}`,
  hubSource: "来源",
  hubError: (msg) => `hub 错误：${msg}`,
  hubNext: "下一步：",
  hubNoCache: "（.hub-cache 无包 — 执行 sync-hub 或 hx hub add <id>@<ver>）",
  hubDoctorOk: "hub-doctor：正常",
  hubDoctorIssues: "hub-doctor：发现问题",
  hubHints: "修复提示：",
  hubSeedHint: "种子化：hxhub seed ./harness-hub --profile standard --scenario core",
  hubNoSearch: (q) => `（未找到 "${q}"）`,
  hubCatalogEmpty: "（catalog 为空）",
  hubMoreSearch: (n) => `… 还有 ${n} 项 — 使用：search <关键词>`,
  pullIncomingNone: "incoming\t（无）",
  pullUpdatedNone: "updated\t（无）",
  configMerged: "config\t已合并 hub/adapter",
  lockAssets: (n) => `lock\t${n} 个资产`,
  commandSummaries: {
    focus: "进入系统推断焦点（组织 / 待处理 CR / 变更）",
    req: "进入需求（组织）上下文",
    arch: "进入架构（组织）上下文",
    changes: "列出变更（尽量按 PRD 分组）",
    status: "打印阶段 status 建议命令",
    doctor: "工作区健康检查",
    suggested: "打印工作区建议 CLI",
    gate: "打印门禁 CLI（若有）",
    guide: "打印指南 CLI（若有）",
    help: "显示本屏完整指令",
    quit: "退出 TUI",
    next: "打印建议 CLI",
    prd: "选择 PRD（req 阶段；多 PRD 进入选择器）",
    back: "返回工作区首页",
    open: "打开列表项：open <n>（或直接输入序号）"
  },
  hubCommandSummaries: {
    hub: "Hub 连接状态与建议 CLI",
    "sync-hub": "同步组织 Hub 到项目资产（负责人）",
    "pull-assets": "从项目 Git 拉取 harness 资产（成员安全）",
    resolve: "按工作区 profile 列出 Hub 解析资产",
    search: "搜索 Hub catalog：search <关键词>",
    "hub-sync": "显示 .hub-cache 同步状态",
    "hub-doctor": "Hub 仓库健康检查",
    "hub-golden": "列出内置 golden 种子包"
  },
  menuTitle: "菜单",
  menuRoot: "根",
  menuSubmenu: "子菜单",
  menuAction: "执行",
  menuContext: "视图",
  menuFooter: "open <n> | menu | home | back | help | quit",
  menuHelpLines:
    "  menu       打开完整命令菜单（全部 hx / hxhub 命令）\n" +
    "  open <n>   选择序号项\n" +
    "  home       工作区首页\n" +
    "  back       返回上一屏\n" +
    "  focus      进入推断焦点（上下文屏）\n" +
    "  doctor     进程内执行 hx doctor\n" +
    "  help       本帮助\n" +
    "  quit       退出 TUI",
  resultTitle: "执行结果",
  exitCode: "退出码",
  resultOk: "执行成功",
  resultFail: "执行有误",
  destructiveDetail: "此操作可能修改或删除数据。",
  promptRequired: "必填项缺失",
  contextFooter: "focus req arch changes | menu | doctor | gate guide status | help quit"
};

export function tuiStrings(locale: TuiLocale): TuiStrings {
  return locale === "zh" ? ZH : EN;
}

/** Chinese aliases for common navigation commands (English names remain canonical). */
export const LOCALE_COMMAND_ALIASES: Partial<Record<TuiLocale, Record<string, string>>> = {
  zh: {
    帮助: "help",
    退出: "quit",
    离开: "quit",
    返回: "back",
    焦点: "focus",
    下一步: "focus",
    需求: "req",
    架构: "arch",
    变更: "changes",
    状态: "status",
    建议: "suggested",
    门禁: "gate",
    指南: "guide",
    打开: "open",
    菜单: "menu"
  }
};

export function normalizeCommandToken(locale: TuiLocale, token: string): string {
  if (locale === "zh") {
    const mapped = LOCALE_COMMAND_ALIASES.zh?.[token];
    if (mapped) return mapped;
  }
  return token.toLowerCase();
}
