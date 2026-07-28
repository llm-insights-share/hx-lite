import type { EngineFn } from "./helpers.js";
import { earsDeltaEngine } from "./earsDelta.js";
import { sectionCompleteEngine } from "./sectionComplete.js";
import { filePresenceEngine } from "./filePresence.js";
import { gateApprovedEngine } from "./gateApproved.js";
import { suiteCmdEngine } from "./suiteCmd.js";
import { ruleListEngine } from "./ruleList.js";
import { inlineEngine } from "./inline.js";
import { rulesLlmEngine } from "./rulesLlm.js";
import {
  rubricEngine,
  constraintLayersEngine,
  driftEngine,
  mutationEngine,
  fixtureHashEngine
} from "./wrappers.js";

export * from "./helpers.js";
export { earsDeltaEngine } from "./earsDelta.js";
export { sectionCompleteEngine } from "./sectionComplete.js";
export { filePresenceEngine } from "./filePresence.js";
export { gateApprovedEngine } from "./gateApproved.js";
export { suiteCmdEngine } from "./suiteCmd.js";
export { ruleListEngine } from "./ruleList.js";
export { inlineEngine, evaluateInlineExpr } from "./inline.js";
export { rulesLlmEngine } from "./rulesLlm.js";
export {
  rubricEngine,
  constraintLayersEngine,
  driftEngine,
  mutationEngine,
  fixtureHashEngine
} from "./wrappers.js";

/** Registry of config-driven sensor engines. */
export const sensorEngines: Record<string, EngineFn> = {
  inline: inlineEngine,
  rules: rulesLlmEngine,
  "ears-delta": earsDeltaEngine,
  "section-complete": sectionCompleteEngine,
  "file-presence": filePresenceEngine,
  "gate-approved": gateApprovedEngine,
  "suite-cmd": suiteCmdEngine,
  "rule-list": ruleListEngine,
  rubric: rubricEngine,
  "constraint-layers": constraintLayersEngine,
  drift: driftEngine,
  "mutation-probe": mutationEngine,
  "fixture-hash": fixtureHashEngine
};

export function registerEngine(name: string, fn: EngineFn): void {
  sensorEngines[name] = fn;
}
