import { Command } from "commander";
import fs from "node:fs";
import path from "node:path";
import {
  Workspace,
  initWorkspace,
  localInit,
  createProject,
  createChange,
  scaffoldProposal,
  scaffoldExplore,
  importOpenspec,
  archiveChange,
  scaffoldFromIssue,
  scaffoldExtendedRequirements,
  readMeta,
  type DeliveryStage
} from "@harnessx/core";

export const ws = () => Workspace.locate(process.cwd());

function parseStagesCsv(csv?: string): DeliveryStage[] | undefined {
  if (!csv) return undefined;
  const stages = csv.split(",").map((s) => s.trim()).filter(Boolean) as DeliveryStage[];
  return stages.length ? stages : undefined;
}

export function registerFoundationCommands(program: Command): void {
  program
    .command("init")
    .description("Initialize harnessX/ or set local active stages")
    .option("--locale <id>", "scaffold locale: hx-cn for Chinese assets (default: English base)")
    .option("--stages <csv>", "comma-separated active stages (req,arch,dev,test)")
    .option("--profile <name>", "workflow profile (lite|standard|strict|enterprise)")
    .action((opts: { locale?: string; stages?: string; profile?: string }) => {
      const stages = parseStagesCsv(opts.stages);
      const probe = new Workspace(process.cwd());
      const exists = fs.existsSync(probe.harnessFile);

      if (exists && stages?.length) {
        const res = localInit(process.cwd(), { stages });
        console.log(`Updated active stages in ${res.ws.base}`);
        for (const c of res.created) console.log(`  + ${c}`);
        console.log("\nNext steps:");
        for (const s of res.nextSteps) console.log(`  ${s}`);
        return;
      }
      if (exists) {
        throw new Error("harnessX already initialized — pass --stages <csv> to set local active stages");
      }

      const res = initWorkspace(process.cwd(), {
        locale: opts.locale,
        stages,
        profile: opts.profile
      });
      console.log(`Initialized ${res.ws.base}`);
      for (const c of res.created) console.log(`  + ${c}`);
      console.log("\nNext steps:");
      for (const s of res.nextSteps) console.log(`  ${s}`);
    });

  const project = program.command("project").description("Project owner workflows");
  project
    .command("create")
    .description("Scaffold harnessX/ and pull hub assets for a profile")
    .requiredOption("--profile <name>", "workflow profile (lite|standard|strict|enterprise)")
    .requiredOption("--hub <path>", "hub source: local path or GitHub URL")
    .option("--locale <id>", "scaffold locale: hx-cn for Chinese assets")
    .option("--adapter <target>", "adapter target to record in config (cursor, codex, …)")
    .option("--actor <name>", "hub consumer identity (written to config.yaml hub.actor)")
    .option("--stages <csv>", "comma-separated active stages (defaults to all profile stages)")
    .action(
      (opts: {
        profile: string;
        hub: string;
        locale?: string;
        adapter?: string;
        actor?: string;
        stages?: string;
      }) => {
        const stages = parseStagesCsv(opts.stages);
        const res = createProject(process.cwd(), {
          profile: opts.profile,
          hubRoot: opts.hub,
          locale: opts.locale,
          adapter: opts.adapter,
          actor: opts.actor,
          stages
        });
        console.log(`Created project ${res.ws.base} (profile: ${opts.profile})`);
        for (const c of res.created) console.log(`  + ${c}`);
        console.log("\nNext steps:");
        for (const s of res.nextSteps) console.log(`  ${s}`);
      }
    );

  const change = program.command("change").description("Manage change workspaces");
  change
    .command("create <id>")
    .option("--domains <list>", "comma-separated touched domains (FR-011); inferred from issue labels with --from-issue")
    .option("--profile <name>", "workflow profile override")
    .option("--from-issue <url>", "scaffold from a GitHub issue URL (v0.2)")
    .option("--prd <slug>", "link organization PRD slug (docs/prd/)")
    .option("--arch-modules <list>", "comma-separated arch module ids")
    .action(async (id: string, opts: { domains?: string; profile?: string; fromIssue?: string; prd?: string; archModules?: string }) => {
      if (opts.fromIssue) {
        const res = await scaffoldFromIssue(ws(), { issueUrl: opts.fromIssue, id, profile: opts.profile, domains: opts.domains?.split(",").map((s) => s.trim()).filter(Boolean) });
        console.log(`Created change "${res.changeId}" from issue #${res.issue.number}`);
        console.log(`  proposal: ${res.proposalFile}`);
        console.log(`  delta: ${res.deltaFile}`);
        for (const w of res.warnings)
          console.warn(`WARNING: overlaps with active change "${w.otherChange}" on domains: ${w.domains.join(", ")}`);
        return;
      }
      if (!opts.domains) throw new Error("--domains required (or use --from-issue)");
      const domains = opts.domains.split(",").map((s) => s.trim()).filter(Boolean);
      const archModules = opts.archModules?.split(",").map((s) => s.trim()).filter(Boolean);
      const res = createChange(ws(), id, domains, opts.profile, {
        prdRef: opts.prd,
        archModules: archModules?.length ? archModules : undefined
      });
      console.log(`Created change "${id}" (profile: ${res.meta.profile}, domains: ${domains.join(", ")})`);
      for (const w of res.warnings)
        console.warn(`WARNING: overlaps with active change "${w.otherChange}" on domains: ${w.domains.join(", ")}`);
    });
  change.command("list").action(() => {
    const w = ws();
    for (const id of w.listChanges()) {
      const meta = w.readMetaRaw(id);
      console.log(`${id}\t${meta.stage}/${meta.task}\t${meta.profile}\t[${meta.touchedDomains.join(",")}]`);
    }
  });

  program
    .command("propose <change>")
    .description("Scaffold proposal.md and an initial delta spec (FR-003)")
    .option("--title <title>", "proposal title", "Untitled")
    .action((changeId: string, opts: { title: string }) => {
      const w = ws();
      const res = scaffoldProposal(w, changeId, opts.title);
      console.log(`Wrote ${res.proposalFile}`);
      console.log(`Wrote ${res.deltaFile}`);
      try {
        const meta = readMeta(w, changeId);
        if (meta.profile === "enterprise") {
          for (const f of scaffoldExtendedRequirements(w, changeId)) console.log(`Wrote harnessX/changes/${changeId}/${f}`);
        }
      } catch {
        /* ignore */
      }
    });

  program
    .command("explore <change>")
    .description("Read-only exploration notes (FR-002)")
    .option("--topic <topic>", "exploration topic", "unscoped")
    .action((changeId: string, opts: { topic: string }) => {
      console.log(`Wrote ${scaffoldExplore(ws(), changeId, opts.topic)}`);
      console.log("Read-only phase: do not modify code. Gate check will flag staged code edits.");
    });

  program
    .command("archive <change>")
    .description("Merge delta specs into main specs and archive the change (FR-009)")
    .option("--force", "skip verified-state requirement (lite profile)")
    .action((changeId: string, opts: { force?: boolean }) => {
      const res = archiveChange(ws(), changeId, { force: opts.force });
      if (!res.ok) {
        for (const p of res.problems) console.error(`BLOCKED: ${p}`);
        process.exit(1);
      }
      console.log(`Archived to ${res.archivedTo}`);
      console.log(`Merged capabilities: ${res.capabilities.join(", ")}`);
    });

  const openspec = program.command("openspec").description("OpenSpec interoperability (NFR-004)");
  openspec
    .command("import")
    .option("--from <dir>", "openspec directory", "openspec")
    .action((opts: { from: string }) => {
      const w = new Workspace(process.cwd());
      const res = importOpenspec(process.cwd(), path.resolve(process.cwd(), opts.from), w);
      console.log(`Imported specs: ${res.specs.join(", ") || "(none)"}`);
      console.log(`Imported changes: ${res.changes.join(", ") || "(none)"}`);
      for (const n of res.notes) console.log(`  note: ${n}`);
    });
}
