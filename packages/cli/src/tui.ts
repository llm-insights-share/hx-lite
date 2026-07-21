import { Command } from "commander";
import { createInterface, type Interface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import {
  Workspace,
  listPrdSlugs,
  orgCompletedTasks,
  STAGE_INFO,
  readMeta,
  type OrgStage
} from "@harnessx/core";
import { runDoctor } from "./doctor.js";
import {
  buildWorkspaceReport,
  buildOrgReport,
  buildChangeReport,
  resolvePrdSlugForReq,
  type ContextReport
} from "./contextReport.js";
import { EXIT_USAGE, exitWith } from "./exitCodes.js";

const ws = () => Workspace.locate(process.cwd());

export type TuiScreenKind = "home" | "org" | "change" | "change-picker" | "prd-picker";

type TuiScreen =
  | { kind: "home" }
  | { kind: "org"; stage: OrgStage; prdSlug?: string; moduleId?: string }
  | { kind: "change"; change: string }
  | { kind: "change-picker" }
  | { kind: "prd-picker"; stage: OrgStage };

export interface ParsedCommand {
  name: string;
  arg?: string;
}

export interface CommandDef {
  name: string;
  synonyms?: string[];
  summary: string;
}

/** Canonical word commands per screen (help + footer source of truth). */
export const COMMANDS_BY_SCREEN: Record<TuiScreenKind, CommandDef[]> = {
  home: [
    { name: "focus", synonyms: ["next"], summary: "Enter inferred focus (org / pending CR / change)" },
    { name: "req", summary: "Requirements (org) context" },
    { name: "arch", summary: "Architecture (org) context" },
    { name: "changes", summary: "List changes (grouped by PRD when possible)" },
    { name: "status", summary: "Print stage status CLI hint" },
    { name: "doctor", summary: "Workspace health findings" },
    { name: "suggested", summary: "Print workspace suggested CLI" },
    { name: "gate", summary: "Print workspace gate CLI if available" },
    { name: "guide", summary: "Print workspace guide CLI if available" },
    { name: "help", summary: "Show this help" },
    { name: "quit", synonyms: ["exit"], summary: "Quit TUI" }
  ],
  org: [
    { name: "next", synonyms: ["suggested"], summary: "Print suggested CLI" },
    { name: "gate", summary: "Print gate check CLI" },
    { name: "guide", synonyms: ["pack"], summary: "Print guide pack CLI" },
    { name: "status", summary: "Print status CLI" },
    { name: "doctor", summary: "Workspace health findings" },
    { name: "prd", summary: "Pick PRD (req stage; multi-PRD opens picker)" },
    { name: "back", summary: "Back to workspace home" },
    { name: "help", summary: "Show this help" },
    { name: "quit", synonyms: ["exit"], summary: "Quit TUI" }
  ],
  change: [
    { name: "next", synonyms: ["suggested"], summary: "Print suggested CLI" },
    { name: "gate", summary: "Print gate check CLI" },
    { name: "guide", synonyms: ["pack"], summary: "Print guide pack CLI" },
    { name: "status", summary: "Print status CLI" },
    { name: "doctor", summary: "Workspace health findings" },
    { name: "changes", summary: "Switch change (open picker)" },
    { name: "back", summary: "Back to workspace home" },
    { name: "help", summary: "Show this help" },
    { name: "quit", synonyms: ["exit"], summary: "Quit TUI" }
  ],
  "change-picker": [
    { name: "open", summary: "Open listed item: open <n> (or type <n>)" },
    { name: "back", summary: "Back to workspace home" },
    { name: "help", summary: "Show this help" },
    { name: "quit", synonyms: ["exit"], summary: "Quit TUI" }
  ],
  "prd-picker": [
    { name: "open", summary: "Select PRD: open <n> (or type <n>)" },
    { name: "back", summary: "Back to workspace home" },
    { name: "help", summary: "Show this help" },
    { name: "quit", synonyms: ["exit"], summary: "Quit TUI" }
  ]
};

/** Parse a line into a word command. Bare digits become open <n>. Single-letter tokens stay as-is (handlers reject them unless listed). */
export function parseCommand(line: string): ParsedCommand {
  const trimmed = line.trim().toLowerCase();
  if (!trimmed) return { name: "" };
  if (/^\d+$/.test(trimmed)) return { name: "open", arg: trimmed };
  const parts = trimmed.split(/\s+/);
  const name = parts[0] ?? "";
  const arg = parts.length > 1 ? parts.slice(1).join(" ") : undefined;
  return { name, arg };
}

export function resolveCommandName(screenKind: TuiScreenKind, name: string): string | undefined {
  if (!name) return undefined;
  for (const def of COMMANDS_BY_SCREEN[screenKind]) {
    if (def.name === name) return def.name;
    if (def.synonyms?.includes(name)) return def.name;
  }
  return undefined;
}

export function commandsFooter(screenKind: TuiScreenKind): string {
  const names = COMMANDS_BY_SCREEN[screenKind].flatMap((d) => [d.name, ...(d.synonyms ?? [])]);
  const unique = [...new Set(names)];
  return `commands: ${unique.join(" ")}`;
}

function clearScreen(): void {
  process.stdout.write("\x1Bc");
}

function orgProgressSummary(stage: OrgStage): string {
  const completed = orgCompletedTasks(ws(), stage);
  const total = completed.length;
  return `${STAGE_INFO[stage].display.en}: ${total} task(s) marked done`;
}

function printHelp(screen: TuiScreen): void {
  const kind = screen.kind;
  console.log("\n— help —");
  for (const def of COMMANDS_BY_SCREEN[kind]) {
    const syn = def.synonyms?.length ? ` (${def.synonyms.join(", ")})` : "";
    console.log(`  ${def.name}${syn}  ${def.summary}`);
  }
  if (kind === "home") {
    console.log("\nTracks: baseline = PRD→many Changes→test; delta = CR→Change→test (same change).");
  }
}

function printReport(report: ContextReport, title: string): void {
  console.log(title);
  console.log(`profile: ${report.profile}  stages: ${report.activeStages.join(", ")}`);
  if (report.scope === "workspace") {
    console.log(`changes: ${report.changes.join(", ") || "(none)"}`);
    if (report.focus) console.log(`focus: ${report.focus.kind}`);
  }
  if (report.scope === "org") {
    console.log(`context: ${report.stage}/${report.task}`);
    if (report.prdSlug) console.log(`PRD: ${report.prdSlug}`);
    if (report.moduleId) console.log(`module: ${report.moduleId}`);
  }
  if (report.scope === "change") {
    console.log(`change: ${report.change}  stage/task: ${report.stage}/${report.task}`);
  }
  if (report.gateCli) console.log(`gate: ${report.gateCli}`);
  console.log(`suggested: ${report.suggestedCli}`);
  if (report.guideCli) console.log(`guide: ${report.guideCli}`);
  if (report.ide?.slash) console.log(`IDE: ${report.ide.slash}`);
  else if (report.ide?.skillPath) console.log(`IDE: ${report.ide.skillPath}`);
  if (report.hint) console.log(`hint: ${report.hint}`);
}

function printTracks(report: ReturnType<typeof buildWorkspaceReport>): void {
  if (!report.tracks) return;
  const { baseline, delta } = report.tracks;
  if (baseline.length) {
    console.log("baseline track:");
    for (const g of baseline) {
      console.log(`  PRD ${g.prd}: ${g.changes.join(", ") || "(none)"}`);
    }
  }
  if (delta.pendingCrs.length || delta.linkedChanges.length) {
    console.log("delta track:");
    for (const p of delta.pendingCrs) {
      console.log(`  pending CR ${p.id}${p.prd ? ` (prd=${p.prd})` : ""} → create change`);
    }
    for (const l of delta.linkedChanges) {
      console.log(`  ${l.crId} → ${l.change}${l.prd ? ` (prd=${l.prd})` : ""}`);
    }
  }
}

function printHome(): void {
  const report = buildWorkspaceReport();
  const doctor = runDoctor();
  console.log("HarnessX — workspace (hx tui)");
  console.log(`profile: ${report.profile}  stages: ${report.activeStages.join(", ")}`);
  console.log(`changes: ${report.changes.join(", ") || "(none)"}`);
  if (report.focus?.kind === "org") {
    console.log(`focus: org ${report.focus.stage}/${report.focus.task}`);
  } else if (report.focus?.kind === "pending-cr") {
    console.log(`focus: pending CR ${report.focus.crId}`);
  } else if (report.focus?.kind === "change") {
    console.log(`focus: change ${report.focus.change}`);
  }
  console.log(`doctor: ${doctor.ok ? "ok" : "issues"}`);
  if (report.activeStages.includes("req")) console.log(orgProgressSummary("req"));
  if (report.activeStages.includes("arch")) console.log(orgProgressSummary("arch"));
  printTracks(report);
  if (report.hint) console.log(`hint: ${report.hint}`);
  console.log(`\n${commandsFooter("home")}`);
}

function printOrg(screen: Extract<TuiScreen, { kind: "org" }>): void {
  const prdSlug = screen.stage === "req" ? resolvePrdSlugForReq(ws(), screen.prdSlug) : screen.prdSlug;
  const report = buildOrgReport(screen.stage, {
    prdSlug,
    moduleId: screen.moduleId
  });
  const doctor = runDoctor();
  printReport(report, `HarnessX — ${screen.stage} stage`);
  console.log(`doctor: ${doctor.ok ? "ok" : "issues"}`);
  console.log(`\n${commandsFooter("org")}`);
}

function printChange(screen: Extract<TuiScreen, { kind: "change" }>): void {
  const report = buildChangeReport(screen.change);
  const doctor = runDoctor();
  printReport(report, "HarnessX — change");
  console.log(`doctor: ${doctor.ok ? "ok" : "issues"}`);
  console.log(`\n${commandsFooter("change")}`);
}

let changePickerItems: string[] = [];

function printChangePicker(): void {
  const report = buildWorkspaceReport();
  console.log("HarnessX — select change");
  const flat: string[] = [];
  if (report.tracks?.baseline.length) {
    for (const g of report.tracks.baseline) {
      console.log(`  PRD ${g.prd}:`);
      for (const id of g.changes) {
        flat.push(id);
        console.log(`    ${flat.length}. ${id}`);
      }
    }
  }
  if (report.tracks?.delta.linkedChanges.length) {
    console.log("  delta (from CR):");
    for (const l of report.tracks.delta.linkedChanges) {
      flat.push(l.change);
      console.log(`    ${flat.length}. ${l.change} ← ${l.crId}`);
    }
  }
  if (!flat.length) {
    const changes = ws().listChanges();
    if (!changes.length) {
      console.log("(no active changes — run: hx change create <id> --domains <domain>)");
    } else {
      changes.forEach((id, i) => {
        flat.push(id);
        let tag = "";
        try {
          const meta = readMeta(ws(), id);
          if (meta.prdRef) tag = ` prd=${meta.prdRef}`;
          if (meta.sourceCr) tag += ` cr=${meta.sourceCr}`;
        } catch {
          /* ignore */
        }
        console.log(`  ${i + 1}. ${id}${tag}`);
      });
    }
  }
  changePickerItems = flat;
  console.log(`\n${commandsFooter("change-picker")}`);
}

function printPrdPicker(slugs: string[]): void {
  console.log("HarnessX — select PRD");
  slugs.forEach((slug, i) => console.log(`  ${i + 1}. ${slug}`));
  console.log(`\n${commandsFooter("prd-picker")}`);
}

async function pause(rl: Interface): Promise<void> {
  await rl.question("(press Enter)");
}

async function showDoctor(rl: Interface): Promise<void> {
  const d = runDoctor();
  for (const f of d.findings) console.log(`${f.level}\t${f.code}\t${f.message}`);
  await pause(rl);
}

async function showHelp(rl: Interface, screen: TuiScreen): Promise<void> {
  printHelp(screen);
  await pause(rl);
}

function statusCliForScreen(screen: TuiScreen): string {
  if (screen.kind === "change") return `hx stage status ${screen.change} --stage ${buildChangeReport(screen.change).stage}`;
  if (screen.kind === "org") return `hx stage status --stage ${screen.stage}`;
  return "hx stage status --stage req";
}

async function unknownCommand(rl: Interface): Promise<void> {
  console.log("unknown command — type help");
  await pause(rl);
}

async function enterFocus(rl: Interface): Promise<TuiScreen | null> {
  const report = buildWorkspaceReport();
  if (report.focus?.kind === "org") {
    return {
      kind: "org",
      stage: report.focus.stage,
      prdSlug: report.focus.prdSlug,
      moduleId: report.focus.moduleId
    };
  }
  if (report.focus?.kind === "pending-cr") {
    console.log(`\n${report.focus.suggestedCli}`);
    await pause(rl);
    return null;
  }
  if (report.focus?.kind === "change") {
    return { kind: "change", change: report.focus.change };
  }
  if (report.changes.length > 1) {
    return { kind: "change-picker" };
  }
  console.log(`\n${report.suggestedCli}`);
  await pause(rl);
  return null;
}

export async function runTuiLoop(initial: TuiScreen, rl: Interface): Promise<void> {
  let screen = initial;
  let running = true;

  while (running) {
    clearScreen();
    if (screen.kind === "home") printHome();
    else if (screen.kind === "org") printOrg(screen);
    else if (screen.kind === "change") printChange(screen);
    else if (screen.kind === "change-picker") printChangePicker();
    else if (screen.kind === "prd-picker") printPrdPicker(listPrdSlugs(ws()));

    const line = await rl.question("\n> ");
    const parsed = parseCommand(line);
    const resolved = resolveCommandName(screen.kind, parsed.name);

    if (!resolved) {
      await unknownCommand(rl);
      continue;
    }

    if (resolved === "quit") {
      running = false;
      continue;
    }
    if (resolved === "help") {
      await showHelp(rl, screen);
      continue;
    }

    if (screen.kind === "home") {
      if (resolved === "focus") {
        const next = await enterFocus(rl);
        if (next) screen = next;
      } else if (resolved === "req") {
        const slugs = listPrdSlugs(ws());
        if (slugs.length > 1) screen = { kind: "prd-picker", stage: "req" };
        else screen = { kind: "org", stage: "req", prdSlug: slugs[0] };
      } else if (resolved === "arch") {
        screen = { kind: "org", stage: "arch" };
      } else if (resolved === "changes") {
        screen = { kind: "change-picker" };
      } else if (resolved === "status") {
        console.log(`\n${statusCliForScreen(screen)}`);
        await pause(rl);
      } else if (resolved === "doctor") {
        await showDoctor(rl);
      } else if (resolved === "suggested") {
        console.log(`\n${buildWorkspaceReport().suggestedCli}`);
        await pause(rl);
      } else if (resolved === "gate") {
        const r = buildWorkspaceReport();
        console.log(`\n${r.gateCli ?? "(no gate CLI for current focus)"}`);
        await pause(rl);
      } else if (resolved === "guide") {
        const r = buildWorkspaceReport();
        console.log(`\n${r.guideCli ?? "(no guide CLI for current focus)"}`);
        await pause(rl);
      } else {
        await unknownCommand(rl);
      }
      continue;
    }

    if (screen.kind === "change-picker") {
      if (resolved === "back") {
        screen = { kind: "home" };
        continue;
      }
      if (resolved === "open") {
        const items = changePickerItems.length ? changePickerItems : ws().listChanges();
        const idx = parseInt(parsed.arg ?? "", 10);
        if (idx >= 1 && idx <= items.length) {
          screen = { kind: "change", change: items[idx - 1]! };
        } else {
          console.log("usage: open <n>  (list number)");
          await pause(rl);
        }
        continue;
      }
      await unknownCommand(rl);
      continue;
    }

    if (screen.kind === "prd-picker") {
      if (resolved === "back") {
        screen = { kind: "home" };
        continue;
      }
      if (resolved === "open") {
        const slugs = listPrdSlugs(ws());
        const idx = parseInt(parsed.arg ?? "", 10);
        if (idx >= 1 && idx <= slugs.length) {
          screen = { kind: "org", stage: screen.stage, prdSlug: slugs[idx - 1] };
        } else {
          console.log("usage: open <n>  (list number)");
          await pause(rl);
        }
        continue;
      }
      await unknownCommand(rl);
      continue;
    }

    if (screen.kind === "org") {
      const prdSlug = screen.stage === "req" ? resolvePrdSlugForReq(ws(), screen.prdSlug) : screen.prdSlug;
      const report = buildOrgReport(screen.stage, { prdSlug, moduleId: screen.moduleId });

      if (resolved === "back") {
        screen = { kind: "home" };
      } else if (resolved === "prd") {
        if (screen.stage !== "req") {
          console.log("prd is only available on the req stage");
          await pause(rl);
        } else {
          const slugs = listPrdSlugs(ws());
          if (slugs.length > 1) screen = { kind: "prd-picker", stage: "req" };
          else if (slugs.length === 1) {
            screen = { ...screen, prdSlug: slugs[0] };
            console.log(`\nPRD: ${slugs[0]}`);
            await pause(rl);
          } else {
            console.log("\nno PRDs — run: hx req prd init <slug> --title \"...\"");
            await pause(rl);
          }
        }
      } else if (resolved === "next") {
        console.log(`\n${report.suggestedCli}`);
        await pause(rl);
      } else if (resolved === "gate") {
        console.log(`\nRun in another terminal:\n  ${report.gateCli ?? report.suggestedCli}`);
        await pause(rl);
      } else if (resolved === "guide") {
        console.log(`\n  ${report.guideCli ?? "hx guide arch-pack"}`);
        await pause(rl);
      } else if (resolved === "status") {
        console.log(`\n  ${report.statusCli}`);
        await pause(rl);
      } else if (resolved === "doctor") {
        await showDoctor(rl);
      } else {
        await unknownCommand(rl);
      }
      continue;
    }

    if (screen.kind === "change") {
      const report = buildChangeReport(screen.change);
      if (resolved === "back") {
        screen = { kind: "home" };
      } else if (resolved === "changes") {
        screen = { kind: "change-picker" };
      } else if (resolved === "next") {
        console.log(`\n${report.suggestedCli}`);
        await pause(rl);
      } else if (resolved === "gate") {
        console.log(`\nRun in another terminal:\n  ${report.gateCli}`);
        await pause(rl);
      } else if (resolved === "guide") {
        console.log(`\n  ${report.guideCli}`);
        await pause(rl);
      } else if (resolved === "status") {
        console.log(`\n  ${report.statusCli}`);
        await pause(rl);
      } else if (resolved === "doctor") {
        await showDoctor(rl);
      } else {
        await unknownCommand(rl);
      }
    }
  }
}

export function registerTuiCommand(program: Command): void {
  program
    .command("tui [change]")
    .description("Workspace-driven interactive shell (word commands; requires TTY)")
    .action(async (changeArg: string | undefined) => {
      if (!process.stdin.isTTY || !process.stdout.isTTY) {
        exitWith(EXIT_USAGE, "hx: tui requires an interactive terminal — use hx next or hx doctor");
      }

      const initial: TuiScreen = changeArg
        ? { kind: "change", change: changeArg }
        : { kind: "home" };

      const rl = createInterface({ input, output });
      try {
        await runTuiLoop(initial, rl);
      } finally {
        rl.close();
      }
    });
}
