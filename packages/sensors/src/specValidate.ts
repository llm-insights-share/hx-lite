import type { SensorReport } from "@harnessx/core/schemas.js";
import type { SensorContext } from "./types.js";
import { earsDeltaEngine } from "./engines/earsDelta.js";

/**
 * FR-022: validates OpenSpec-compatible delta files.
 * Delegates to ears-delta engine (config-driven); checkEars kept for unit tests.
 */

const VAGUE_WORDS = /\b(quickly|user-friendly|appropriately|as needed|robust|seamless|etc\.?)\b/i;

export function checkEars(text: string): string[] {
  const problems: string[] = [];
  const t = text.replace(/\s+/g, " ").trim();
  if (t === "" || /^WHEN <trigger>/.test(t)) {
    problems.push("requirement text is empty or an unfilled placeholder");
    return problems;
  }
  if (!/\bSHALL\b/.test(t)) {
    problems.push("missing SHALL — use an EARS pattern (ubiquitous / WHEN / WHILE / WHERE / IF...THEN)");
    return problems;
  }
  const kw = t.match(/^\s*(WHEN|WHILE|WHERE|IF)\b/i)?.[1]?.toUpperCase();
  if (kw) {
    const [trigger] = t.split(/\bTHE SYSTEM\b|\bTHEN\b/i);
    if (!trigger || trigger.replace(/^(WHEN|WHILE|WHERE|IF)/i, "").trim().length < 3)
      problems.push(`${kw} clause has no trigger/condition content`);
    if (kw === "IF" && !/\bTHEN\b/i.test(t)) problems.push("IF pattern requires THEN before the SHALL response");
  }
  const response = t.split(/\bSHALL\b/i)[1]?.trim() ?? "";
  if (response.length < 3) problems.push("SHALL has no response content");
  const vague = t.match(VAGUE_WORDS);
  if (vague) problems.push(`unmeasurable wording "${vague[0]}" — quantify the behaviour`);
  return problems;
}

export const specValidate = (ctx: SensorContext): SensorReport => earsDeltaEngine(ctx);
