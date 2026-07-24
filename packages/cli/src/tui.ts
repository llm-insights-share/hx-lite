import { Command } from "commander";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { EXIT_USAGE, exitWith } from "./exitCodes.js";
import { resolveTuiLocale, tuiStrings, normalizeCommandToken, type TuiLocale } from "./tuiLocale.js";
import { runFullTui } from "./tuiMenuRunner.js";
import type { ContextScreen } from "./tuiContextView.js";

export type TuiScreenKind = "home" | "org" | "change" | "change-picker" | "prd-picker";

/** @deprecated legacy exports kept for tests. */
export interface ParsedCommand {
  name: string;
  arg?: string;
}

export interface CommandDef {
  name: string;
  synonyms?: string[];
  summary: string;
}

export const COMMANDS_BY_SCREEN: Record<TuiScreenKind, CommandDef[]> = {
  home: [],
  org: [],
  change: [],
  "change-picker": [],
  "prd-picker": []
};

export function parseCommand(line: string, locale: TuiLocale = "en"): ParsedCommand {
  const trimmed = line.trim();
  if (!trimmed) return { name: "" };
  if (/^\d+$/.test(trimmed)) return { name: "open", arg: trimmed };
  const parts = trimmed.split(/\s+/);
  const name = normalizeCommandToken(locale, parts[0] ?? "");
  const arg = parts.length > 1 ? parts.slice(1).join(" ") : undefined;
  return { name, arg };
}

export function resolveCommandName(_screenKind: TuiScreenKind, name: string): string | undefined {
  return name || undefined;
}

export function commandsFooter(_screenKind: TuiScreenKind, locale: TuiLocale = "en"): string {
  return tuiStrings(locale).contextFooter;
}

export function registerTuiCommand(program: Command): void {
  program
    .command("tui [change]")
    .description("Full HarnessX TUI — menu-driven parity with hx / hxhub CLI (requires TTY)")
    .option("--locale <id>", "UI locale: en|zh (default: config locale or en)")
    .action(async (changeArg: string | undefined, opts: { locale?: string }) => {
      const locale = resolveTuiLocale(opts.locale);
      if (!process.stdin.isTTY || !process.stdout.isTTY) {
        const msg =
          locale === "zh"
            ? "hx: tui 需要交互式终端 — 请使用 hx next 或 hx doctor"
            : "hx: tui requires an interactive terminal — use hx next or hx doctor";
        exitWith(EXIT_USAGE, msg);
      }

      const initial: ContextScreen = changeArg ? { kind: "change", change: changeArg } : { kind: "home" };

      const rl = createInterface({ input, output });
      try {
        await runFullTui(initial, rl, locale);
      } finally {
        rl.close();
      }
    });
}

export { resolveTuiLocale, type TuiLocale };
