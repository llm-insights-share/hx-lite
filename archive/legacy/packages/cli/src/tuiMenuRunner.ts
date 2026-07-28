import type { Interface } from "node:readline/promises";
import { executeCliKind, type CliExecuteResult } from "./cliExecute.js";
import { EXIT_OK } from "./exitCodes.js";
import {
  buildRootMenu,
  isAction,
  isSubmenu,
  labelText,
  listMenuChildren,
  resolveMenuPath,
  type MenuActionNode,
  type MenuNode,
  type MenuSubmenuNode,
  type TuiContext
} from "./tuiMenus.js";
import {
  contextScreenFromCtxNode,
  getChangePickerItems,
  printContextScreen,
  syncCtxFromScreen,
  type ContextScreen
} from "./tuiContextView.js";
import { normalizeCommandToken, tuiStrings, type TuiLocale } from "./tuiLocale.js";
import { listPrdSlugs, Workspace } from "@harnessx/core";

const ws = () => Workspace.locate(process.cwd());

type StackFrame =
  | { kind: "menu"; path: string[] }
  | { kind: "context"; screen: ContextScreen }
  | { kind: "prompt"; action: MenuActionNode; answers: Record<string, string>; fieldIndex: number }
  | { kind: "result"; result: CliExecuteResult; title: string };

function clearScreen(): void {
  process.stdout.write("\x1Bc");
}

function currentMenu(path: string[]): MenuSubmenuNode {
  return path.length === 0 ? buildRootMenu() : resolveMenuPath(path);
}

function parseInput(line: string, locale: TuiLocale): { cmd: string; arg?: string } {
  const trimmed = line.trim();
  if (!trimmed) return { cmd: "" };
  if (/^\d+$/.test(trimmed)) return { cmd: "open", arg: trimmed };
  const parts = trimmed.split(/\s+/);
  const cmd = normalizeCommandToken(locale, parts[0] ?? "");
  const arg = parts.length > 1 ? parts.slice(1).join(" ") : undefined;
  return { cmd, arg };
}

function printMenu(menu: MenuSubmenuNode, path: string[], locale: TuiLocale): void {
  const labels = tuiStrings(locale);
  const breadcrumb = path.length ? path.join(" / ") : labels.menuRoot;
  console.log(`\n${labels.menuTitle}: ${breadcrumb}`);
  const children = listMenuChildren(menu);
  children.forEach((child, i) => {
    const kind =
      child.kind === "submenu" ? labels.menuSubmenu : child.kind === "action" ? labels.menuAction : labels.menuContext;
    console.log(`  ${i + 1}. [${kind}] ${labelText(child.label, locale)}`);
  });
  console.log(`\n${labels.menuFooter}`);
}

function printHelp(locale: TuiLocale): void {
  const labels = tuiStrings(locale);
  console.log(`\n${labels.helpTitle}`);
  console.log(labels.menuHelpLines);
}

async function pause(rl: Interface, locale: TuiLocale): Promise<void> {
  await rl.question(tuiStrings(locale).pressEnter);
}

async function collectPrompts(
  rl: Interface,
  action: MenuActionNode,
  ctx: TuiContext,
  locale: TuiLocale
): Promise<Record<string, string> | null> {
  const answers: Record<string, string> = {};
  const fields = action.prompts ?? [];
  for (const field of fields) {
    const def = field.defaultValue?.(ctx) ?? "";
    const prompt = `${labelText(field.label, locale)}${def ? ` [${def}]` : ""}: `;
    const raw = (await rl.question(prompt)).trim();
    const val = raw || def;
    if (field.required && !val) {
      console.log(tuiStrings(locale).promptRequired);
      return null;
    }
    if (val) answers[field.key] = val;
  }
  return answers;
}

async function runAction(
  rl: Interface,
  action: MenuActionNode,
  ctx: TuiContext,
  locale: TuiLocale,
  stack: StackFrame[]
): Promise<void> {
  if (action.destructive) {
    const answer = (await rl.question(`${labelText(action.label, locale)} — type 'yes': `)).trim().toLowerCase();
    if (answer !== "yes") return;
  }
  if (action.note) {
    console.log(labelText(action.note, locale));
  }

  let answers: Record<string, string> = {};
  if (action.prompts?.length) {
    const collected = await collectPrompts(rl, action, ctx, locale);
    if (!collected) {
      await pause(rl, locale);
      return;
    }
    answers = collected;
  }

  const argv = action.buildArgv(ctx, answers);
  console.log(`\n> ${action.program} ${argv.join(" ")}\n`);
  const result = await executeCliKind(action.program, argv);
  stack.push({ kind: "result", result, title: labelText(action.label, locale) });
}

function printResult(frame: Extract<StackFrame, { kind: "result" }>, locale: TuiLocale): void {
  const labels = tuiStrings(locale);
  console.log(`\n${labels.resultTitle}: ${frame.title}`);
  console.log(`${labels.exitCode}: ${frame.result.exitCode}`);
  if (frame.result.stdout) {
    console.log(`\n--- stdout ---\n${frame.result.stdout}`);
  }
  if (frame.result.stderr) {
    console.log(`\n--- stderr ---\n${frame.result.stderr}`);
  }
  const ok = frame.result.exitCode === EXIT_OK;
  console.log(`\n${ok ? labels.resultOk : labels.resultFail}`);
}

async function handleContextInput(
  rl: Interface,
  screen: ContextScreen,
  cmd: string,
  arg: string | undefined,
  ctx: TuiContext,
  locale: TuiLocale,
  stack: StackFrame[]
): Promise<{ ctx: TuiContext; screen: ContextScreen } | "quit"> {
  const labels = tuiStrings(locale);

  if (cmd === "menu") {
    stack.push({ kind: "menu", path: [] });
    return { ctx, screen };
  }
  if ((cmd === "focus" || cmd === "next") && screen.kind === "home") {
    const { buildWorkspaceReport } = await import("./contextReport.js");
    const report = buildWorkspaceReport();
    if (report.focus?.kind === "org") {
      return {
        ctx: { ...ctx, orgStage: report.focus.stage, prdSlug: report.focus.prdSlug },
        screen: { kind: "org", stage: report.focus.stage, prdSlug: report.focus.prdSlug, moduleId: report.focus.moduleId }
      };
    }
    if (report.focus?.kind === "change") {
      return { ctx: { ...ctx, change: report.focus.change }, screen: { kind: "change", change: report.focus.change } };
    }
    if (report.changes.length > 1) {
      return { ctx, screen: { kind: "change-picker" } };
    }
    if (report.focus?.kind === "pending-cr") {
      const parts = report.focus.suggestedCli.replace(/^hx\s+/, "").split(/\s+/).filter(Boolean);
      const result = await executeCliKind("hx", parts);
      stack.push({ kind: "result", result, title: "focus" });
    }
    return { ctx, screen };
  }
  if (cmd === "req") {
    const slugs = listPrdSlugs(ws());
    if (slugs.length > 1) return { ctx: { ...ctx, orgStage: "req" }, screen: { kind: "prd-picker", stage: "req" } };
    return { ctx: { ...ctx, orgStage: "req", prdSlug: slugs[0] }, screen: { kind: "org", stage: "req", prdSlug: slugs[0] } };
  }
  if (cmd === "arch") {
    return { ctx: { ...ctx, orgStage: "arch" }, screen: { kind: "org", stage: "arch" } };
  }
  if (cmd === "changes") {
    return { ctx, screen: { kind: "change-picker" } };
  }
  if (cmd === "back" || cmd === "home") {
    return { ctx, screen: { kind: "home" } };
  }
  if (cmd === "open" && screen.kind === "change-picker") {
    const items = getChangePickerItems().length ? getChangePickerItems() : ws().listChanges();
    const idx = parseInt(arg ?? "", 10);
    if (idx >= 1 && idx <= items.length) {
      const change = items[idx - 1]!;
      return { ctx: { ...ctx, change }, screen: { kind: "change", change } };
    }
    console.log(labels.usageOpen);
    await pause(rl, locale);
    return { ctx, screen };
  }
  if (cmd === "open" && screen.kind === "prd-picker") {
    const slugs = listPrdSlugs(ws());
    const idx = parseInt(arg ?? "", 10);
    if (idx >= 1 && idx <= slugs.length) {
      const prdSlug = slugs[idx - 1]!;
      return { ctx: { ...ctx, orgStage: "req", prdSlug }, screen: { kind: "org", stage: "req", prdSlug } };
    }
    console.log(labels.usageOpen);
    await pause(rl, locale);
    return { ctx, screen };
  }
  if (cmd === "doctor") {
    const result = await executeCliKind("hx", ["doctor"]);
    stack.push({ kind: "result", result, title: "doctor" });
    return { ctx, screen };
  }
  if ((cmd === "next" || cmd === "suggested") && screen.kind !== "home") {
    const argv = ctx.change ? ["next", ctx.change] : ["next"];
    const result = await executeCliKind("hx", argv);
    stack.push({ kind: "result", result, title: "next" });
    return { ctx, screen };
  }
  if (cmd === "gate") {
    stack.push({ kind: "menu", path: ["gate"] });
    return { ctx, screen };
  }
  if (cmd === "guide") {
    stack.push({ kind: "menu", path: ["guide"] });
    return { ctx, screen };
  }
  if (cmd === "status") {
    stack.push({ kind: "menu", path: ["stage"] });
    return { ctx, screen };
  }

  console.log(labels.unknownCommand);
  await pause(rl, locale);
  return { ctx, screen };
}

export async function runFullTui(
  initialScreen: ContextScreen,
  rl: Interface,
  locale: TuiLocale
): Promise<void> {
  let ctx: TuiContext = { locale, change: initialScreen.kind === "change" ? initialScreen.change : undefined };
  let contextScreen: ContextScreen = initialScreen;
  const stack: StackFrame[] = [{ kind: "context", screen: initialScreen }];
  let running = true;

  while (running) {
    clearScreen();
    const top = stack[stack.length - 1]!;

    if (top.kind === "result") {
      printResult(top, locale);
      console.log(`\n${tuiStrings(locale).menuFooter}`);
    } else if (top.kind === "menu") {
      printMenu(currentMenu(top.path), top.path, locale);
    } else if (top.kind === "context") {
      contextScreen = top.screen;
      ctx = syncCtxFromScreen(ctx, contextScreen);
      printContextScreen(contextScreen, locale, ctx);
      console.log(`\n${tuiStrings(locale).contextFooter}`);
    }

    const line = await rl.question("\n> ");
    const { cmd, arg } = parseInput(line, locale);

    if (!cmd) continue;
    if (cmd === "quit" || cmd === "exit") {
      running = false;
      continue;
    }
    if (cmd === "help") {
      printHelp(locale);
      await pause(rl, locale);
      continue;
    }

    if (top.kind === "result") {
      stack.pop();
      continue;
    }

    if (top.kind === "menu") {
      const menu = currentMenu(top.path);
      const children = listMenuChildren(menu);

      if (cmd === "back") {
        if (top.path.length) stack.pop();
        else stack[stack.length - 1] = { kind: "context", screen: contextScreen };
        continue;
      }
      if (cmd === "home") {
        while (stack.length > 1) stack.pop();
        stack[stack.length - 1] = { kind: "context", screen: { kind: "home" } };
        continue;
      }
      if (cmd === "menu") {
        stack[stack.length - 1] = { kind: "menu", path: [] };
        continue;
      }

      if (cmd === "open") {
        const idx = parseInt(arg ?? "", 10);
        if (idx < 1 || idx > children.length) {
          console.log(tuiStrings(locale).usageOpen);
          await pause(rl, locale);
          continue;
        }
        const selected = children[idx - 1]!;
        if (isSubmenu(selected)) {
          stack.push({ kind: "menu", path: [...top.path, selected.id] });
        } else if (isAction(selected)) {
          await runAction(rl, selected, ctx, locale, stack);
        } else if (selected.kind === "context") {
          const screen = contextScreenFromCtxNode(selected.id, ctx);
          if (screen) {
            stack.push({ kind: "context", screen });
          } else if (selected.id === "ctx-change") {
            stack.push({ kind: "context", screen: { kind: "change-picker" } });
          }
        }
        continue;
      }

      console.log(tuiStrings(locale).unknownCommand);
      await pause(rl, locale);
      continue;
    }

    if (top.kind === "context") {
      if (cmd === "menu") {
        stack.push({ kind: "menu", path: [] });
        continue;
      }
      const handled = await handleContextInput(rl, contextScreen, cmd, arg, ctx, locale, stack);
      if (handled === "quit") {
        running = false;
        continue;
      }
      ctx = handled.ctx;
      stack[stack.length - 1] = { kind: "context", screen: handled.screen };
      continue;
    }
  }
}
