import { submitArtifact } from "./api/client.js";
import { loadConfig, loadCredentials, resolveApiBase } from "./config.js";

export async function runSubmit(opts: {
  path: string;
  name: string;
  stage?: string;
  task?: string;
  note?: string;
  cwd?: string;
}): Promise<unknown> {
  const cwd = opts.cwd || process.cwd();
  const cfg = loadConfig(cwd);
  if (!cfg?.project_id) throw new Error("project_id missing — run `nhx init` first");
  const creds = loadCredentials(cwd);
  if (!creds?.access_token) throw new Error("not logged in — run `nhx login`");
  const api = resolveApiBase(undefined, cwd);
  return submitArtifact(api, creds.access_token, {
    projectId: cfg.project_id,
    name: opts.name,
    filePath: opts.path,
    stage: opts.stage,
    task: opts.task,
    note: opts.note,
  });
}
