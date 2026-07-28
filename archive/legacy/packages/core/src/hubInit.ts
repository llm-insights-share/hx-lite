import fs from "node:fs";
import path from "node:path";
import { ensureDir, writeYaml } from "./paths.js";
import { ConfigYaml, RolesYaml } from "./schemas.js";

export interface HubOpsInitOptions {
  targetDir?: string;
  hubSource?: string;
  actor?: string;
  role?: "consumer" | "maintainer";
}

export interface HubOpsInitResult {
  root: string;
  created: string[];
}

const MIN_ROLES: RolesYaml = RolesYaml.parse({
  version: "1.0",
  workflow: { workorders: "optional" },
  roles: {
    "chief-architect": { can: ["hub.*"], approves: [] }
  },
  members: {}
});

function writeFileIfMissing(file: string, content: string): boolean {
  if (fs.existsSync(file)) return false;
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, content, "utf8");
  return true;
}

/** Lightweight init for hxhub ops project. */
export function initHubOpsProject(opts: HubOpsInitOptions = {}): HubOpsInitResult {
  const root = path.resolve(opts.targetDir ?? process.cwd());
  const base = path.join(root, "harnessX");
  ensureDir(base);
  const created: string[] = [];

  const configFile = path.join(base, "config.yaml");
  if (!fs.existsSync(configFile)) {
    const cfg = ConfigYaml.parse({
      profile: "standard",
      ...(opts.hubSource
        ? {
            hub: {
              source: opts.hubSource,
              role: opts.role ?? "maintainer",
              ...(opts.actor ? { actor: opts.actor } : {})
            }
          }
        : {})
    });
    writeYaml(configFile, cfg);
    created.push("harnessX/config.yaml");
  }

  const rolesFile = path.join(base, "roles.yaml");
  if (!fs.existsSync(rolesFile)) {
    const roles = { ...MIN_ROLES, members: opts.actor ? { [opts.actor]: "chief-architect" } : {} };
    writeYaml(rolesFile, roles);
    created.push("harnessX/roles.yaml");
  }

  if (
    writeFileIfMissing(
      path.join(root, ".gitignore"),
      ["harnessX/.hub-remotes/", "harnessX/.hub-cache/", ""].join("\n")
    )
  ) {
    created.push(".gitignore");
  }

  if (
    writeFileIfMissing(
      path.join(root, "README.hxhub.md"),
      [
        "# hxhub ops workspace",
        "",
        "This repository is initialized for Hub operations only.",
        "",
        "Typical commands:",
        "- hxhub doctor",
        "- hxhub search",
        "- hxhub promote <dir> --by <name>",
        "- hxhub contributions list",
        "- hxhub push --message \"chore: hub update\"",
        ""
      ].join("\n")
    )
  ) {
    created.push("README.hxhub.md");
  }

  return { root, created };
}
