import { describe, it, expect } from "vitest";
import {
  HarnessYaml,
  normalizeProfile,
  normalizeHarnessProfiles,
  resolveSuiteName,
  resolveSuiteSensors,
  profileReqTasks,
  profileDevTasks,
  suiteMapFromTasks,
  bindTaskSensorToSuites,
  defaultSuiteName
} from "@harnessx/core";

describe("normalizeProfile", () => {
  it("maps preferred tasks[].suite into legacy suites map", () => {
    const raw = {
      stages: ["dev" as const],
      tasks: {
        dev: [
          { id: "propose", suite: "fast-lite" },
          { id: "apply", suite: "fast-lite" },
          { id: "archive" }
        ]
      },
      suites: {} as Record<string, string>
    };
    const n = normalizeProfile(raw, "lite");
    expect(n.dev_tasks).toEqual(["propose", "apply", "archive"]);
    expect(n.suites["dev.propose"]).toBe("fast-lite");
    expect(n.suites["dev.apply"]).toBe("fast-lite");
    expect(suiteMapFromTasks(n.tasks)).toMatchObject({
      "dev.propose": "fast-lite",
      "dev.apply": "fast-lite"
    });
  });

  it("accepts legacy *_tasks + suites map", () => {
    const raw = {
      stages: ["req", "dev"] as ("req" | "dev")[],
      req_tasks: ["prd-writing"],
      dev_tasks: ["propose", "apply"],
      suites: {
        "req.prd-writing": "prd-check",
        "dev.propose": "fast"
      }
    };
    const n = normalizeProfile(raw, "standard");
    expect(n.tasks?.req?.map((e) => e.id)).toEqual(["prd-writing"]);
    expect(n.tasks?.req?.[0]?.suite).toBe("prd-check");
    expect(n.suites["dev.propose"]).toBe("fast");
  });

  it("HarnessYaml.parse accepts tasks shape", () => {
    const h = HarnessYaml.parse({
      profiles: {
        lite: {
          stages: ["dev"],
          tasks: {
            dev: [{ id: "apply", suite: "fast" }]
          }
        }
      },
      suites: { fast: ["lint"] }
    });
    expect(h.profiles.lite.tasks?.dev?.[0]?.id).toBe("apply");
    const normalized = normalizeHarnessProfiles(h);
    expect(resolveSuiteName(normalized, "lite", "dev", "apply")).toBe("fast");
    expect(resolveSuiteSensors(normalized, "lite", "dev", "apply")).toEqual(["lint"]);
  });
});

describe("bindTaskSensorToSuites", () => {
  it("uses named suites (not stage.task keys) and updates tasks", () => {
    const harness = HarnessYaml.parse({
      profiles: {
        standard: {
          stages: ["req"],
          tasks: { req: [{ id: "prd-writing", suite: "prd-check" }] }
        }
      },
      suites: { "prd-check": ["prd-complete"] }
    });
    const ok = bindTaskSensorToSuites(
      harness,
      { id: "extra-sensor", stage: "req", task: "prd-writing", trigger: "task" },
      "standard"
    );
    expect(ok).toBe(true);
    expect(harness.suites["prd-check"]).toContain("extra-sensor");
    expect(harness.suites["req.prd-writing"]).toBeUndefined();
    expect(defaultSuiteName("req", "biz-understanding")).toBe("req-biz-understanding");
  });
});

describe("scaffold profile resolve", () => {
  it("enterprise propose binds propose-sdlc via tasks", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const YAML = await import("yaml");
    const root = path.resolve(__dirname, "../../scaffold/base/harness.yaml");
    const harness = HarnessYaml.parse(YAML.parse(fs.readFileSync(root, "utf8")));
    expect(resolveSuiteName(harness, "enterprise", "dev", "propose")).toBe("propose-sdlc");
    expect(resolveSuiteName(harness, "enterprise", "req", "prototype-design")).toBe("req-prototype");
    expect(harness.suites["dev.propose"]).toBeUndefined();
    expect(harness.suites["propose-enterprise"]).toBeUndefined();
    expect(profileReqTasks(harness, "standard")).toEqual([
      "requirements-analysis",
      "prototype-design",
      "prd-writing"
    ]);
    expect(profileDevTasks(harness, "lite")).toEqual(["propose", "apply", "archive"]);
  });

  it("standard profile binds basic suites for plan/propose/design/archive", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const YAML = await import("yaml");
    const root = path.resolve(__dirname, "../../scaffold/base/harness.yaml");
    const harness = HarnessYaml.parse(YAML.parse(fs.readFileSync(root, "utf8")));
    expect(resolveSuiteName(harness, "standard", "dev", "plan")).toBe("plan-basic");
    expect(resolveSuiteName(harness, "standard", "dev", "propose")).toBe("propose-basic");
    expect(resolveSuiteName(harness, "standard", "dev", "design")).toBe("design-basic");
    expect(resolveSuiteName(harness, "standard", "dev", "archive")).toBe("archive-check");
    expect(resolveSuiteSensors(harness, "standard", "dev", "propose")).toEqual([
      "requirements-complete",
      "spec-validate"
    ]);
    expect(harness.suites["prd-check"]).toContain("prd-approved");
    expect(harness.suites["verification"]).toContain("integration-smoke");
    expect(harness.guides.some((g) => g.id === "requirements-analysis")).toBe(true);
    expect(harness.guides.some((g) => g.id === "archive-checklist")).toBe(true);
    expect(harness.guides.some((g) => g.id === "test-execution" && g.kind === "guide.skill")).toBe(true);
  });
});
