import { Command } from "commander";
import fs from "node:fs";
import path from "node:path";
  import {
  Workspace,
  initWorkspace,
  localInit,
  createProject,
  createChange,
  listChangesFiltered,
  attachChangeToCr,
  scaffoldProposal,
  scaffoldExplore,
  importOpenspec,
  archiveChange,
  scaffoldFromIssue,
  scaffoldExtendedRequirements,
  readMeta,
  resolveHubContext,
  syncProjectFromHub,
  commitProjectHubPaths,
  pullProjectAssets,
  type DeliveryStage
} from "@harnessx/core";
import { compileAdapters } from "@harnessx/adapters";
import { requireDestructiveConfirmation } from "./confirm.js";
import { EXIT_FAIL, UsageError } from "./exitCodes.js";

export const ws = () => Workspace.locate(process.cwd());

function parseStagesCsv(csv?: string): DeliveryStage[] | undefined {
  if (!csv) return undefined;
  const stages = csv.split(",").map((s) => s.trim()).filter(Boolean) as DeliveryStage[];
  return stages.length ? stages : undefined;
}

function parseIdsCsv(csv?: string): string[] | undefined {
  if (!csv) return undefined;
  const ids = csv.split(",").map((s) => s.trim()).filter(Boolean);
  return ids.length ? ids : undefined;
}

function registerProposeAction(cmd: Command): void {
  cmd
    .argument("<change>")
    .description("Scaffold proposal.md and an initial delta spec")
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
}

function registerExploreAction(cmd: Command): void {
  cmd
    .argument("<change>")
    .description("Read-only exploration notes")
    .option("--topic <topic>", "exploration topic", "unscoped")
    .action((changeId: string, opts: { topic: string }) => {
      console.log(`Wrote ${scaffoldExplore(ws(), changeId, opts.topic)}`);
      console.log("Read-only phase: do not modify code. Gate check will flag staged code edits.");
    });
}

function registerArchiveAction(cmd: Command): void {
  cmd
    .argument("<change>")
    .description("Merge delta specs into main specs and archive the change")
    .option("--force", "skip verified-state requirement (lite profile)")
    .option("--yes", "confirm destructive archive without prompt")
    .option("--dry-run", "preview archive without writing")
    .action(async (changeId: string, opts: { force?: boolean; yes?: boolean; dryRun?: boolean }) => {
      if (opts.dryRun) {
        console.log(`dry-run: would archive change "${changeId}"${opts.force ? " (force)" : ""}`);
        return;
      }
      await requireDestructiveConfirmation({
        yes: opts.yes,
        action: `Archive change "${changeId}"`,
        detail: "Merges delta specs into main specs and moves the change to archive/."
      });
      const res = archiveChange(ws(), changeId, { force: opts.force });
      if (!res.ok) {
        for (const p of res.problems) console.error(`BLOCKED: ${p}`);
        process.exit(EXIT_FAIL);
      }
      console.log(`Archived to ${res.archivedTo}`);
      console.log(`Merged capabilities: ${res.capabilities.join(", ")}`);
    });
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
        throw new UsageError("harnessX already initialized — pass --stages <csv> to set local active stages");
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

  const project = program.command("project").description("Project owner / member workflows");
  project
    .command("create")
    .description("Scaffold harnessX/ and pull hub assets for a profile")
    .requiredOption("--profile <name>", "workflow profile (lite|standard|strict|enterprise)")
    .requiredOption("--hub <path>", "hub source: local path or GitHub URL")
    .option("--locale <id>", "scaffold locale: hx-cn for Chinese assets")
    .option("--adapter <target>", "adapter target to record in config (cursor, codex, …)")
    .option("--actor <name>", "hub consumer identity (written to config.yaml hub.actor)")
    .option("--stages <csv>", "comma-separated active stages (defaults to all profile stages)")
    .option("--overwrite", "replace existing harnessX/ (destructive: deletes changes/specs/assets)")
    .option("--yes", "confirm --overwrite without prompt")
    .action(
      async (opts: {
        profile: string;
        hub: string;
        locale?: string;
        adapter?: string;
        actor?: string;
        stages?: string;
        overwrite?: boolean;
        yes?: boolean;
      }) => {
        if (opts.overwrite) {
          await requireDestructiveConfirmation({
            yes: opts.yes,
            action: "Overwrite existing harnessX/",
            detail: "Deletes changes/, specs/, and assets/ under harnessX/."
          });
        }
        const stages = parseStagesCsv(opts.stages);
        const res = createProject(process.cwd(), {
          profile: opts.profile,
          hubRoot: opts.hub,
          locale: opts.locale,
          adapter: opts.adapter,
          actor: opts.actor,
          stages,
          overwrite: opts.overwrite
        });
        if (opts.overwrite) console.log("Overwrote existing harnessX/");
        console.log(`Created project ${res.ws.base} (profile: ${opts.profile})`);
        for (const c of res.created) console.log(`  + ${c}`);
        console.log("\nNext steps:");
        for (const s of res.nextSteps) console.log(`  ${s}`);
      }
    );

  project
    .command("sync-hub")
    .description("Owner: sync org hxhub into project assets/harness/lock (then commit to project GitHub)")
    .option("--hub <path>", "hub source (defaults to config.yaml hub)")
    .option("--dry-run", "preview hub sync state without applying")
    .option("--json", "print machine-readable JSON summary")
    .option("--no-apply", "skip hubSyncApply; only land cache → assets + lock")
    .option("--force", "apply merges even when conflicts occur")
    .option("--only <ids>", "comma-separated package ids")
    .option("--install-available", "install all available (not only profile-matched) hub packages")
    .option("--offline", "use local hub cache without remote fetch")
    .option("--refresh", "force refresh remote hub cache")
    .option("--adapter-sync", "also run adapter sync after landing")
    .option("--commit", "git commit allowlisted harness asset paths")
    .option("--push", "git push after --commit")
    .option("--message <text>", "commit message", "chore: sync hub assets into project")
    .action(
      (opts: {
        hub?: string;
        dryRun?: boolean;
        json?: boolean;
        apply?: boolean;
        force?: boolean;
        only?: string;
        installAvailable?: boolean;
        offline?: boolean;
        refresh?: boolean;
        adapterSync?: boolean;
        commit?: boolean;
        push?: boolean;
        message?: string;
      }) => {
        const workspace = ws();
        const { hubRoot } = resolveHubContext(workspace, {
          hubRef: opts.hub,
          offline: opts.offline,
          refresh: opts.refresh,
          action: "hub.sync"
        });
        const res = syncProjectFromHub(workspace, hubRoot, {
          dryRun: opts.dryRun,
          apply: opts.apply,
          force: opts.force,
          only: parseIdsCsv(opts.only),
          installAvailable: opts.installAvailable
        });

        if (opts.json) {
          console.log(
            JSON.stringify(
              {
                ok: true,
                dryRun: !!opts.dryRun,
                syncResults: res.syncResults,
                installedAvailable: res.installedAvailable,
                landed: res.landed.map((a) => ({ id: a.id, version: a.version })),
                lockAssets: res.lock ? Object.keys(res.lock.assets).length : 0
              },
              null,
              2
            )
          );
          return;
        }

        for (const r of res.syncResults) {
          console.log(`sync\t${r.id}\t${r.action}\t${r.detail ?? ""}${r.toVersion ? ` → ${r.toVersion}` : ""}`);
        }
        for (const id of res.installedAvailable) console.log(`installed\t${id}`);
        for (const a of res.landed) console.log(`landed\t${a.id}@${a.version}\t${path.relative(workspace.root, a.localDir)}`);
        if (res.lock) console.log(`lock\twrote ${path.relative(workspace.root, workspace.lockFile)} (${Object.keys(res.lock.assets).length} assets)`);

        if (opts.adapterSync && !opts.dryRun) {
          const cfg = workspace.readConfig();
          const target = cfg.adapter?.target ?? "cursor";
          const results = compileAdapters(workspace, [target]);
          for (const r of results) {
            console.log(`adapter\t${r.target}\t${r.files.length} file(s)`);
          }
        }

        if (opts.commit && !opts.dryRun) {
          const git = commitProjectHubPaths(workspace.root, {
            message: opts.message,
            push: opts.push
          });
          console.log(`git\tcommitted=${git.committed}\tpushed=${git.pushed}`);
        } else if (!opts.dryRun) {
          console.log("\nNext steps:");
          for (const s of res.nextSteps) console.log(`  ${s}`);
        }
      }
    );

  project
    .command("pull-assets")
    .description("Member-safe: update harness assets from project GitHub only (does not overwrite changes/docs/code)")
    .option("--check", "preview incoming asset paths without applying")
    .option("--remote <name>", "git remote", "origin")
    .option("--branch <name>", "remote branch (defaults to current)")
    .option("--adapter-sync", "run adapter sync after pull")
    .action((opts: { check?: boolean; remote?: string; branch?: string; adapterSync?: boolean }) => {
      const root = process.cwd();
      const res = pullProjectAssets(root, {
        check: opts.check,
        remote: opts.remote,
        branch: opts.branch
      });
      console.log(`remote\t${res.remoteRef}`);
      if (opts.check) {
        for (const p of res.incoming) console.log(`incoming\t${p}`);
        if (!res.incoming.length) console.log("incoming\t(none)");
      } else {
        for (const p of res.updated) console.log(`updated\t${p}`);
        for (const p of res.removed) console.log(`removed\t${p}`);
        if (!res.updated.length && !res.removed.length) console.log("updated\t(none)");
        if (res.configMerged) console.log(`config\tmerged hub/adapter (active_stages preserved=${res.activeStagesPreserved})`);
      }

      if (opts.adapterSync && !opts.check) {
        const workspace = ws();
        const cfg = workspace.readConfig();
        const target = cfg.adapter?.target ?? "cursor";
        const results = compileAdapters(workspace, [target]);
        for (const r of results) {
          console.log(`adapter\t${r.target}\t${r.files.length} file(s)`);
        }
      }

      console.log("\nNext steps:");
      for (const s of res.nextSteps) console.log(`  ${s}`);
    });

  const change = program.command("change").description("Manage change workspaces and delivery verbs");
  change
    .command("create <id>")
    .description("Create a change workspace")
    .option("--domains <list>", "comma-separated touched domains; inferred from issue labels with --from-issue")
    .option("--profile <name>", "workflow profile override")
    .option("--from-issue <url>", "scaffold from a GitHub issue URL")
    .option("--prd <slug>", "link organization PRD slug (docs/prd/)")
    .option("--from-cr <id>", "link from approved/applied change request (delta track)")
    .option("--arch-modules <list>", "comma-separated arch module ids")
    .action(async (id: string, opts: { domains?: string; profile?: string; fromIssue?: string; prd?: string; fromCr?: string; archModules?: string }) => {
      if (opts.fromIssue) {
        const res = await scaffoldFromIssue(ws(), {
          issueUrl: opts.fromIssue,
          id,
          profile: opts.profile,
          domains: opts.domains?.split(",").map((s) => s.trim()).filter(Boolean)
        });
        console.log(`Created change "${res.changeId}" from issue #${res.issue.number}`);
        console.log(`  proposal: ${res.proposalFile}`);
        console.log(`  delta: ${res.deltaFile}`);
        for (const w of res.warnings)
          console.warn(`WARNING: overlaps with active change "${w.otherChange}" on domains: ${w.domains.join(", ")}`);
        return;
      }
      if (!opts.domains) throw new UsageError("--domains required (or use --from-issue)");
      const domains = opts.domains.split(",").map((s) => s.trim()).filter(Boolean);
      const archModules = opts.archModules?.split(",").map((s) => s.trim()).filter(Boolean);
      const res = createChange(ws(), id, domains, opts.profile, {
        prdRef: opts.prd,
        fromCr: opts.fromCr,
        archModules: archModules?.length ? archModules : undefined
      });
      console.log(`Created change "${id}" (profile: ${res.meta.profile}, domains: ${domains.join(", ")})`);
      if (res.meta.sourceCr) console.log(`  sourceCr: ${res.meta.sourceCr}`);
      if (res.meta.prdRef) console.log(`  prd: ${res.meta.prdRef}`);
      for (const w of res.warnings)
        console.warn(`WARNING: overlaps with active change "${w.otherChange}" on domains: ${w.domains.join(", ")}`);
    });
  change
    .command("list")
    .description("List active changes")
    .option("--prd <slug>", "filter by PRD ref")
    .option("--from-cr <id>", "filter by source change request")
    .action((opts: { prd?: string; fromCr?: string }) => {
      const rows = listChangesFiltered(ws(), { prd: opts.prd, fromCr: opts.fromCr });
      for (const { id, meta } of rows) {
        const extra = [
          meta.prdRef ? `prd=${meta.prdRef}` : "",
          meta.sourceCr ? `cr=${meta.sourceCr}` : ""
        ]
          .filter(Boolean)
          .join(" ");
        console.log(
          `${id}\t${meta.stage}/${meta.task}\t${meta.profile}\t[${meta.touchedDomains.join(",")}]${extra ? `\t${extra}` : ""}`
        );
      }
    });

  registerProposeAction(change.command("propose"));
  registerExploreAction(change.command("explore"));
  registerArchiveAction(change.command("archive"));

  // Top-level aliases (compat)
  registerProposeAction(program.command("propose").description("Alias of hx change propose"));
  registerExploreAction(program.command("explore").description("Alias of hx change explore"));
  registerArchiveAction(program.command("archive").description("Alias of hx change archive"));

  const openspec = program.command("openspec").description("OpenSpec interoperability");
  openspec
    .command("import")
    .description("Import OpenSpec directory into harnessX")
    .option("--from <dir>", "openspec directory", "openspec")
    .action((opts: { from: string }) => {
      const w = new Workspace(process.cwd());
      const res = importOpenspec(process.cwd(), path.resolve(process.cwd(), opts.from), w);
      console.log(`Imported specs: ${res.specs.join(", ") || "(none)"}`);
      console.log(`Imported changes: ${res.changes.join(", ") || "(none)"}`);
      for (const n of res.notes) console.log(`  note: ${n}`);
    });
}
