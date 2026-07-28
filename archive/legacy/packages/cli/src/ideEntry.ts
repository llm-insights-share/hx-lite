import type { DeliveryStage } from "@harnessx/core";

export interface IdeEntryHint {
  adapter: string;
  slash?: string;
  skillPath?: string;
  note?: string;
}

/** Map adapter target to IDE task entry for a stage/task. */
export function ideEntryForTask(adapter: string | undefined, stage: DeliveryStage, task: string): IdeEntryHint {
  const name = `hx-${stage}-${task}`;
  const target = (adapter ?? "cursor").toLowerCase();
  if (target === "trae") {
    return {
      adapter: target,
      skillPath: `.trae/skills/${name}/SKILL.md`,
      note: "Trigger skill or select hx-planner / hx-executor agent"
    };
  }
  if (target === "generic" || target === "codex" || target === "opencode") {
    return {
      adapter: target,
      note: `See AGENTS.md Task entrypoints or run: hx guide pack <change> --stage ${stage} --task ${task}`
    };
  }
  return {
    adapter: target,
    slash: `/${name}`,
    skillPath: target === "qoder" ? `.qoder/skills/${name}.md` : `.cursor/skills/* or .claude/commands/${name}.md`
  };
}
