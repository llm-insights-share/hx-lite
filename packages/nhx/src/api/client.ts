import fs from "node:fs";
import path from "node:path";

export type ExportPayload = {
  project: {
    id: number;
    name: string;
    slug: string;
    profile_key: string;
    github_repo?: string;
    github_branch?: string;
    current_stage?: string;
  };
  profile: string;
  stages_filter: string[];
  stages: Array<{ id: string; tasks: TaskExport[] }>;
  tasks: TaskExport[];
  guides: GuideExport[];
  sensors: SensorExport[];
  counts: Record<string, number>;
};

export type TaskExport = {
  stage: string;
  id: string;
  title: string;
  required: boolean;
  custom: boolean;
  guides: string[];
  sensors: string[];
  skill_ids: string[];
  slash_name: string;
  /** @deprecated use shell_body */
  workflow_id?: string;
  /** @deprecated use shell_body */
  workflow_body?: string;
  shell_body?: string;
  shell_appendix?: string;
};

export type GuideExport = {
  asset_id: string;
  kind: string;
  stage: string;
  task: string;
  content: string;
  bound?: boolean;
};

export type SensorExport = {
  asset_id: string;
  kind: string;
  stage: string;
  task: string;
  check_type: string;
  content: string;
  triggers?: string[];
  scope?: string[];
  bound?: boolean;
};

function apiRoot(base: string): string {
  return base.replace(/\/$/, "");
}

export async function login(
  apiBase: string,
  username: string,
  password: string,
): Promise<{ access_token: string }> {
  const body = new URLSearchParams({ username, password });
  const res = await fetch(`${apiRoot(apiBase)}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`login failed (${res.status}): ${text}`);
  }
  return (await res.json()) as { access_token: string };
}

export async function exportProject(
  apiBase: string,
  token: string,
  projectRef: string | number,
  stages?: string[],
): Promise<ExportPayload> {
  const q = stages?.length ? `?stages=${encodeURIComponent(stages.join(","))}` : "";
  const res = await fetch(`${apiRoot(apiBase)}/api/projects/${projectRef}/export${q}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const text = await res.text();
    if (res.status === 403) {
      throw new Error("尚未被项目管理者加入项目，无法获取项目资产");
    }
    throw new Error(`export failed (${res.status}): ${text}`);
  }
  return (await res.json()) as ExportPayload;
}

export async function submitArtifact(
  apiBase: string,
  token: string,
  opts: {
    projectId: number;
    name: string;
    filePath: string;
    stage?: string;
    task?: string;
    note?: string;
  },
): Promise<unknown> {
  const abs = path.resolve(opts.filePath);
  if (!fs.existsSync(abs)) throw new Error(`path not found: ${abs}`);

  const form = new FormData();
  form.set("project_id", String(opts.projectId));
  form.set("name", opts.name);
  form.set("stage", opts.stage || "");
  form.set("task", opts.task || "");
  form.set("note", opts.note || "");

  const skipDir = new Set([".git", "node_modules", ".nhx", "__pycache__", ".DS_Store"]);
  const skipFile = new Set([".DS_Store", "Thumbs.db"]);

  function walk(dir: string, base: string): { abs: string; rel: string }[] {
    const out: { abs: string; rel: string }[] = [];
    for (const name of fs.readdirSync(dir)) {
      if (skipDir.has(name) || skipFile.has(name)) continue;
      const full = path.join(dir, name);
      const st = fs.statSync(full);
      if (st.isDirectory()) {
        if (skipDir.has(name)) continue;
        out.push(...walk(full, base));
      } else if (st.isFile()) {
        const rel = path.relative(base, full).split(path.sep).join("/");
        out.push({ abs: full, rel });
      }
    }
    return out;
  }

  const st = fs.statSync(abs);
  if (st.isDirectory()) {
    const entries = walk(abs, abs);
    if (!entries.length) throw new Error(`directory has no uploadable files: ${abs}`);
    for (const e of entries) {
      const blob = new Blob([fs.readFileSync(e.abs)]);
      form.append("files", blob, path.basename(e.abs));
      form.append("relative_paths", e.rel);
    }
  } else if (st.isFile()) {
    const blob = new Blob([fs.readFileSync(abs)]);
    form.set("file", blob, path.basename(abs));
  } else {
    throw new Error(`unsupported path type: ${abs}`);
  }

  const res = await fetch(`${apiRoot(apiBase)}/api/artifacts`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`submit failed (${res.status}): ${text}`);
  }
  return res.json();
}

export async function listArtifacts(
  apiBase: string,
  token: string,
  params: { project_id: number; stage?: string; task?: string },
): Promise<any[]> {
  const q = new URLSearchParams();
  q.set("project_id", String(params.project_id));
  if (params.stage) q.set("stage", params.stage);
  if (params.task) q.set("task", params.task);
  const res = await fetch(`${apiRoot(apiBase)}/api/artifacts?${q.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`list artifacts failed (${res.status}): ${await res.text()}`);
  return (await res.json()) as any[];
}

export async function createTicket(
  apiBase: string,
  token: string,
  body: {
    project_id: number;
    title: string;
    ticket_type?: string;
    stage?: string;
    task?: string;
    artifact_name?: string;
    body?: string;
  },
): Promise<any> {
  const res = await fetch(`${apiRoot(apiBase)}/api/tickets`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      ticket_type: "human-check",
      assignee_role: "approver",
      ...body,
    }),
  });
  if (!res.ok) throw new Error(`create ticket failed (${res.status}): ${await res.text()}`);
  return res.json();
}

export async function submitTicket(apiBase: string, token: string, ticketId: number): Promise<any> {
  const res = await fetch(`${apiRoot(apiBase)}/api/tickets/${ticketId}/submit`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`submit ticket failed (${res.status}): ${await res.text()}`);
  return res.json();
}

export async function approvalStatus(
  apiBase: string,
  token: string,
  projectId: number,
  stage: string,
  task: string,
): Promise<{ approved: boolean; pending: boolean; approved_tickets: any[]; pending_tickets: any[] }> {
  const url = `${apiRoot(apiBase)}/api/tickets/approval-status?project_id=${projectId}&stage=${encodeURIComponent(stage)}&task=${encodeURIComponent(task)}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`approval-status failed (${res.status}): ${await res.text()}`);
  return (await res.json()) as { approved: boolean; pending: boolean; approved_tickets: any[]; pending_tickets: any[] };
}

export async function health(apiBase: string): Promise<boolean> {
  try {
    const res = await fetch(`${apiRoot(apiBase)}/api/health`);
    return res.ok;
  } catch {
    return false;
  }
}
