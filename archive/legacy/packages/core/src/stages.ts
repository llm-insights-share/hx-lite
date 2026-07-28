/**
 * Four-stage delivery model (req → arch → dev → test).
 * Authoritative stage/task registry.
 */

export const DELIVERY_STAGES = ["req", "arch", "dev", "test"] as const;
export type DeliveryStage = (typeof DELIVERY_STAGES)[number];

export interface StageTaskDef {
  id: string;
  title: { zh: string; en: string };
  required: boolean;
  guides?: string[];
  sensors?: string[];
}

export interface StageInfo {
  id: DeliveryStage;
  display: { zh: string; en: string };
  output: { zh: string; en: string };
  scope: "org" | "change";
}

export const STAGE_INFO: Record<DeliveryStage, StageInfo> = {
  req: {
    id: "req",
    display: { zh: "需求", en: "Requirements" },
    output: { zh: "产品需求文档", en: "Product requirements document" },
    scope: "org"
  },
  arch: {
    id: "arch",
    display: { zh: "设计", en: "Architecture" },
    output: { zh: "概要设计文档 + 子系统详细设计文档", en: "HLD + module LLD" },
    scope: "org"
  },
  dev: {
    id: "dev",
    display: { zh: "开发", en: "Development" },
    output: { zh: "可运行代码", en: "Runnable code" },
    scope: "change"
  },
  test: {
    id: "test",
    display: { zh: "测试", en: "Testing" },
    output: { zh: "测试用例 + 测试报告", en: "Test cases + test report" },
    scope: "change"
  }
};

export const STAGE_TASKS: Record<DeliveryStage, StageTaskDef[]> = {
  req: [
    {
      id: "biz-understanding",
      title: { zh: "业务理解", en: "Business understanding" },
      required: false,
      guides: ["biz-understanding-outline", "requirements-research-outline"],
      sensors: ["req-biz-understanding"]
    },
    {
      id: "requirements-research",
      title: { zh: "需求调研", en: "Requirements research" },
      required: false,
      guides: ["requirements-research-outline"],
      sensors: ["req-research-complete"]
    },
    {
      id: "requirements-analysis",
      title: { zh: "需求分析", en: "Requirements analysis" },
      required: true,
      guides: ["requirements-analysis"],
      sensors: ["req-analysis-complete"]
    },
    {
      id: "prototype-design",
      title: { zh: "产品原型设计", en: "Prototype design" },
      required: true,
      guides: ["prototype-wireframe"],
      sensors: ["org-prototype-complete"]
    },
    {
      id: "prd-writing",
      title: { zh: "产品需求文档编写", en: "PRD writing" },
      required: true,
      guides: ["prd-template", "prd-authoring"],
      sensors: ["prd-complete", "prd-approved"]
    }
  ],
  arch: [
    {
      id: "subsystem-division",
      title: { zh: "子系统划分", en: "Subsystem division" },
      required: true,
      guides: ["arch-hld-template", "arch-authoring"],
      sensors: ["arch-hld-complete", "arch-registry-complete"]
    },
    {
      id: "tech-selection",
      title: { zh: "技术选型", en: "Technology selection" },
      required: true,
      guides: ["tech-selection"],
      sensors: ["arch-tech-selection-complete"]
    },
    {
      id: "database-design",
      title: { zh: "数据库设计", en: "Database design" },
      required: true,
      guides: ["database-design", "db-migration-template"],
      sensors: ["arch-database-design-complete"]
    },
    {
      id: "interface-design",
      title: { zh: "接口设计", en: "Interface design" },
      required: true,
      guides: ["interface-design", "api-contract-template"],
      sensors: ["arch-interface-design-complete"]
    },
    {
      id: "key-mechanisms",
      title: { zh: "关键设计机制", en: "Key design mechanisms" },
      required: false,
      guides: ["key-mechanisms"],
      sensors: ["arch-key-mechanisms-complete"]
    },
    {
      id: "internal-interface",
      title: { zh: "内部接口设计", en: "Internal interface design" },
      required: true,
      guides: ["arch-lld-template", "arch-module-boundary"],
      sensors: ["arch-lld-complete", "arch-lld-approved"]
    }
  ],
  dev: [
    {
      id: "plan",
      title: { zh: "开发计划", en: "Development plan" },
      required: true,
      guides: ["change-planning", "rollback-template"],
      sensors: ["plan-coverage"]
    },
    {
      id: "propose",
      title: { zh: "change:propose", en: "change:propose" },
      required: true,
      guides: ["proposal-template", "requirements-template", "prd-writing", "spec-writing"],
      sensors: ["requirements-complete", "spec-validate"]
    },
    {
      id: "design",
      title: { zh: "change:design", en: "change:design" },
      required: true,
      guides: ["design-template", "ui-pages-template", "fe-layout", "design-tokens"],
      sensors: ["design-hld-complete", "design-lld-complete"]
    },
    {
      id: "apply",
      title: { zh: "change:apply", en: "change:apply" },
      required: true,
      guides: ["coding-conventions"],
      sensors: ["spec-validate", "typecheck", "lint", "unit-changed"]
    },
    {
      id: "verify",
      title: { zh: "change:verify", en: "change:verify" },
      required: true,
      guides: ["release-readiness-checklist"],
      sensors: ["spec-validate", "spec-trace", "drift", "integration-smoke"]
    },
    {
      id: "archive",
      title: { zh: "change:archive", en: "change:archive" },
      required: true,
      guides: ["archive-checklist"],
      sensors: ["spec-validate"]
    }
  ],
  test: [
    {
      id: "test-case-design",
      title: { zh: "测试用例设计", en: "Test case design" },
      required: true,
      guides: ["test-case-authoring", "test-cases-template"],
      sensors: ["test-cases-complete", "test-cases-approved"]
    },
    {
      id: "test-execution",
      title: { zh: "测试任务执行", en: "Test execution" },
      required: true,
      guides: ["test-execution", "uat-checklist"],
      sensors: ["uat-complete", "bugs-closed", "test-report-complete"]
    }
  ]
};

/** Default task sequences per profile. */
export const DEFAULT_PROFILE_STAGES: Record<
  string,
  { stages: DeliveryStage[]; dev_tasks?: string[]; test_tasks?: string[]; req_tasks?: string[]; arch_tasks?: string[] }
> = {
  lite: { stages: ["dev"], dev_tasks: ["propose", "apply", "archive"] },
  standard: {
    stages: ["req", "arch", "dev", "test"],
    req_tasks: ["requirements-analysis", "prototype-design", "prd-writing"],
    arch_tasks: [
      "subsystem-division",
      "tech-selection",
      "database-design",
      "interface-design",
      "internal-interface"
    ],
    dev_tasks: ["plan", "propose", "design", "apply", "verify", "archive"],
    test_tasks: ["test-case-design", "test-execution"]
  },
  strict: {
    stages: ["req", "arch", "dev", "test"],
    req_tasks: ["requirements-analysis", "prototype-design", "prd-writing"],
    arch_tasks: [
      "subsystem-division",
      "tech-selection",
      "database-design",
      "interface-design",
      "internal-interface"
    ],
    dev_tasks: ["plan", "propose", "design", "apply", "verify", "archive"],
    test_tasks: ["test-case-design", "test-execution"]
  },
  enterprise: {
    stages: ["req", "arch", "dev", "test"],
    req_tasks: ["requirements-analysis", "prototype-design", "prd-writing"],
    arch_tasks: [
      "subsystem-division",
      "tech-selection",
      "database-design",
      "interface-design",
      "internal-interface"
    ],
    dev_tasks: ["plan", "propose", "design", "apply", "verify", "archive"],
    test_tasks: ["test-case-design", "test-execution"]
  }
};

export function taskById(stage: DeliveryStage, taskId: string): StageTaskDef | undefined {
  return STAGE_TASKS[stage].find((t) => t.id === taskId);
}

export function stageTaskIds(stage: DeliveryStage, onlyRequired = false): string[] {
  return STAGE_TASKS[stage].filter((t) => !onlyRequired || t.required).map((t) => t.id);
}

export function suiteKey(stage: DeliveryStage, taskId: string): string {
  return `${stage}.${taskId}`;
}
