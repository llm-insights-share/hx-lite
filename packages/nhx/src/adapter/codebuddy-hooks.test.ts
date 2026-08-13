import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import { syncCodeBuddyHooks } from "./codebuddy-hooks.js";

const tmpDirs: string[] = [];

function tmp(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "nhx-codebuddy-hooks-"));
  tmpDirs.push(d);
  return d;
}

after(() => {
  for (const d of tmpDirs) fs.rmSync(d, { recursive: true, force: true });
});

describe("codebuddy hooks sync", () => {
  it("writes project settings and scripts", () => {
    const cwd = tmp();
    const home = tmp();
    const out = syncCodeBuddyHooks(cwd, "codebuddy", home, "project");
    assert.equal(out.settingsJson, true);
    assert.equal(fs.existsSync(path.join(cwd, ".codebuddy", "settings.json")), true);
    const settings = JSON.parse(fs.readFileSync(path.join(cwd, ".codebuddy", "settings.json"), "utf8"));
    assert.ok(Array.isArray(settings.hooks.UserPromptSubmit));
    assert.ok(Array.isArray(settings.hooks.Stop));
    assert.ok(Array.isArray(settings.hooks.PostToolUse));
    assert.equal(settings.hooks.PostToolUse[0].matcher, "Skill|Edit|Write");
  });

  it("keeps user hooks and dedupes nhx hooks on resync", () => {
    const cwd = tmp();
    const home = tmp();
    const settingsPath = path.join(cwd, ".codebuddy", "settings.json");
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
    fs.writeFileSync(
      settingsPath,
      JSON.stringify(
        {
          hooks: {
            UserPromptSubmit: [{ hooks: [{ type: "command", command: "echo user-hook" }] }],
          },
        },
        null,
        2,
      ),
      "utf8",
    );
    syncCodeBuddyHooks(cwd, "workbuddy", home, "project");
    syncCodeBuddyHooks(cwd, "workbuddy", home, "project");
    const settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
    assert.equal(settings.hooks.UserPromptSubmit.length, 2);
    assert.equal(settings.hooks.UserPromptSubmit[0].hooks[0].command, "echo user-hook");
    assert.equal(settings.hooks.Stop.length, 1);
    assert.equal(settings.hooks.PostToolUse.length, 1);
    const prompt = fs.readFileSync(path.join(cwd, ".codebuddy", "hooks", "nhx-codebuddy-prompt.mjs"), "utf8");
    assert.match(prompt, /"--ide", "workbuddy"/);
  });

  it("global scope writes global settings and strips project nhx hooks", () => {
    const cwd = tmp();
    const home = tmp();
    syncCodeBuddyHooks(cwd, "codebuddy", home, "project");
    assert.match(
      fs.readFileSync(path.join(cwd, ".codebuddy", "settings.json"), "utf8"),
      /nhx-codebuddy-prompt/,
    );
    syncCodeBuddyHooks(cwd, "codebuddy", home, "global");
    const globalSettings = path.join(home, ".codebuddy", "settings.json");
    assert.equal(fs.existsSync(globalSettings), true);
    assert.match(fs.readFileSync(globalSettings, "utf8"), /nhx-codebuddy-prompt/);
    const projectDoc = JSON.parse(fs.readFileSync(path.join(cwd, ".codebuddy", "settings.json"), "utf8"));
    const events = Object.values(projectDoc.hooks || {}).flat() as unknown[];
    assert.equal(events.some((g) => JSON.stringify(g).includes("nhx-codebuddy")), false);
  });

  it("workbuddy global writes ~/.workbuddy and does not create ~/.codebuddy", () => {
    const cwd = tmp();
    const home = tmp();
    const out = syncCodeBuddyHooks(cwd, "workbuddy", home, "global");
    assert.match(out.globalDest, /\.workbuddy[/\\]settings\.json$/);
    assert.equal(fs.existsSync(path.join(home, ".workbuddy", "settings.json")), true);
    assert.equal(fs.existsSync(path.join(home, ".workbuddy", "hooks", "nhx-codebuddy-prompt.mjs")), true);
    assert.equal(fs.existsSync(path.join(home, ".codebuddy", "settings.json")), false);
    const prompt = fs.readFileSync(
      path.join(home, ".workbuddy", "hooks", "nhx-codebuddy-prompt.mjs"),
      "utf8",
    );
    assert.match(prompt, /"--ide", "workbuddy"/);
  });

  it("codebuddy and workbuddy global keep separate settings", () => {
    const cwd = tmp();
    const home = tmp();
    syncCodeBuddyHooks(cwd, "codebuddy", home, "global");
    syncCodeBuddyHooks(cwd, "workbuddy", home, "global");
    const cb = JSON.parse(fs.readFileSync(path.join(home, ".codebuddy", "settings.json"), "utf8"));
    const wb = JSON.parse(fs.readFileSync(path.join(home, ".workbuddy", "settings.json"), "utf8"));
    assert.equal(cb._nhx.ide, "codebuddy");
    assert.equal(wb._nhx.ide, "workbuddy");
    assert.ok(Array.isArray(cb.hooks.UserPromptSubmit) && cb.hooks.UserPromptSubmit.length >= 1);
    assert.ok(Array.isArray(wb.hooks.UserPromptSubmit) && wb.hooks.UserPromptSubmit.length >= 1);
  });

  it("workbuddy sync strips legacy workbuddy hooks from ~/.codebuddy only", () => {
    const cwd = tmp();
    const home = tmp();
    const legacyPath = path.join(home, ".codebuddy", "settings.json");
    fs.mkdirSync(path.dirname(legacyPath), { recursive: true });
    fs.writeFileSync(
      legacyPath,
      JSON.stringify(
        {
          hooks: {
            UserPromptSubmit: [
              { hooks: [{ type: "command", command: "node ~/.codebuddy/hooks/nhx-codebuddy-prompt.mjs" }] },
            ],
          },
          _nhx: { generated: "GENERATED by nhx adapter", ide: "workbuddy" },
        },
        null,
        2,
      ),
      "utf8",
    );
    syncCodeBuddyHooks(cwd, "workbuddy", home, "global");
    const legacy = JSON.parse(fs.readFileSync(legacyPath, "utf8"));
    const events = Object.values(legacy.hooks || {}).flat() as unknown[];
    assert.equal(events.some((g) => JSON.stringify(g).includes("nhx-codebuddy")), false);
    assert.equal(legacy._nhx, undefined);

    // codebuddy-owned global settings must not be stripped by workbuddy sync
    const cbPath = path.join(home, ".codebuddy", "settings.json");
    fs.writeFileSync(
      cbPath,
      JSON.stringify(
        {
          hooks: {
            Stop: [{ hooks: [{ type: "command", command: "node ~/.codebuddy/hooks/nhx-codebuddy-stop.mjs" }] }],
          },
          _nhx: { generated: "GENERATED by nhx adapter", ide: "codebuddy" },
        },
        null,
        2,
      ),
      "utf8",
    );
    syncCodeBuddyHooks(cwd, "workbuddy", home, "global");
    const kept = JSON.parse(fs.readFileSync(cbPath, "utf8"));
    assert.equal(kept._nhx.ide, "codebuddy");
    assert.equal(kept.hooks.Stop.length, 1);
  });
});
