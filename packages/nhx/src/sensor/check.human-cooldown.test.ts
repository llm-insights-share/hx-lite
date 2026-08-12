import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { runSensorCheck } from "./check.js";

function setupProject(intervalMinutes = 120): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "nhx-human-cooldown-"));
  const nhx = path.join(root, ".nhx");
  fs.mkdirSync(path.join(nhx, "sensors"), { recursive: true });
  fs.writeFileSync(path.join(nhx, "lock.json"), JSON.stringify({ ok: true }), "utf8");
  fs.writeFileSync(
    path.join(nhx, "tasks.json"),
    JSON.stringify([{ stage: "req", id: "prd-writing", sensors: ["prd-approved"] }], null, 2),
    "utf8",
  );
  fs.writeFileSync(path.join(nhx, "sensors", "prd-approved.md"), "---\ncheck_type: human\n---\n", "utf8");
  fs.writeFileSync(
    path.join(nhx, "sensors", "prd-approved.meta.json"),
    JSON.stringify({ check_type: "human", triggers: ["cli"] }, null, 2),
    "utf8",
  );
  fs.writeFileSync(
    path.join(nhx, "config.yaml"),
    [
      "api_base: http://127.0.0.1:8000",
      "project_id: 4",
      "stages:",
      "  - req",
      "targets:",
      "  - cursor",
      `approval_check_interval_minutes: ${intervalMinutes}`,
      "",
    ].join("\n"),
    "utf8",
  );
  fs.writeFileSync(
    path.join(nhx, "credentials"),
    JSON.stringify({ access_token: "t", username: "u" }),
    "utf8",
  );
  return root;
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

test("pending status uses cooldown cache between checks", async () => {
  const root = setupProject(120);
  const calls: string[] = [];
  const oldFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    if (url.includes("/api/tickets/approval-status")) {
      return jsonResponse({ approved: false, pending: true, cutoff_at: "2026-08-12T08:00:00Z" });
    }
    throw new Error(`unexpected fetch: ${url}`);
  }) as typeof fetch;
  try {
    const first = await runSensorCheck({ cwd: root, stage: "req", task: "prd-writing", channel: "cli" });
    assert.equal(first.ok, false);
    assert.equal(calls.length, 1);

    const second = await runSensorCheck({
      cwd: root,
      stage: "req",
      task: "prd-writing",
      channel: "cli",
    });
    assert.equal(second.ok, false);
    assert.equal(calls.length, 1);
    assert.match(second.findings[0]?.message || "", /冷却至/);
  } finally {
    globalThis.fetch = oldFetch;
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("approval-refresh bypasses cooldown cache", async () => {
  const root = setupProject(120);
  let statusChecks = 0;
  const oldFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/api/tickets/approval-status")) {
      statusChecks += 1;
      return jsonResponse({ approved: false, pending: true, cutoff_at: "2026-08-12T08:00:00Z" });
    }
    throw new Error(`unexpected fetch: ${url}`);
  }) as typeof fetch;
  try {
    await runSensorCheck({ cwd: root, stage: "req", task: "prd-writing", channel: "cli" });
    await runSensorCheck({
      cwd: root,
      stage: "req",
      task: "prd-writing",
      channel: "cli",
      approvalRefresh: true,
    });
    assert.equal(statusChecks, 2);
  } finally {
    globalThis.fetch = oldFetch;
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("new cutoff after approved triggers fresh ticket creation", async () => {
  const root = setupProject(1);
  const oldFetch = globalThis.fetch;
  let approvalChecks = 0;
  let createTicketCalls = 0;
  let submitTicketCalls = 0;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/api/tickets/approval-status")) {
      approvalChecks += 1;
      if (approvalChecks === 1) {
        return jsonResponse({ approved: true, pending: false, cutoff_at: "2026-08-12T08:00:00Z" });
      }
      return jsonResponse({
        approved: false,
        pending: false,
        cutoff_at: "2026-08-12T10:00:00Z",
        latest_artifact: { name: "prd" },
      });
    }
    if (url.includes("/api/artifacts?")) {
      return jsonResponse([{ name: "prd", updated_at: "2026-08-12T10:00:00Z" }]);
    }
    if (url.endsWith("/api/tickets") && init?.method === "POST") {
      createTicketCalls += 1;
      return jsonResponse({ id: 99, ticket_no: "TK-99" });
    }
    if (url.includes("/api/tickets/99/submit") && init?.method === "POST") {
      submitTicketCalls += 1;
      return jsonResponse({ id: 99, ticket_no: "TK-99", status: "submitted" });
    }
    throw new Error(`unexpected fetch: ${url}`);
  }) as typeof fetch;

  try {
    const first = await runSensorCheck({ cwd: root, stage: "req", task: "prd-writing", channel: "cli" });
    assert.equal(first.ok, true);
    const second = await runSensorCheck({ cwd: root, stage: "req", task: "prd-writing", channel: "cli" });
    assert.equal(second.ok, false);
    assert.equal(createTicketCalls, 1);
    assert.equal(submitTicketCalls, 1);
  } finally {
    globalThis.fetch = oldFetch;
    fs.rmSync(root, { recursive: true, force: true });
  }
});
