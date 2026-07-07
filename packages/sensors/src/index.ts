import type { BuiltinSensor } from "./types.js";
import { specValidate } from "./specValidate.js";
import { specTrace, fixtureHash, approvedTests } from "./builtins.js";
import { archBoundary } from "./archBoundary.js";
import { budget } from "./budget.js";
import { rubricSensor } from "./rubricSensor.js";
import { typecheck, lint, unitChanged } from "./fastSuite.js";
import { mutationProbe, analyzeTestStrength } from "./mutation.js";
import {
  requirementsComplete,
  designHldComplete,
  designLldComplete,
  designSpecAlign,
  planCoverage,
  designDrift
} from "./delivery.js";

export * from "./delivery.js";

export * from "./types.js";
export { specValidate, checkEars } from "./specValidate.js";
export { specTrace, fixtureHash, approvedTests } from "./builtins.js";
export {
  archBoundary,
  checkArchBoundaries,
  collectSources,
  loadLayerRules,
  loadLayerRulesFromFile,
  resolveLayerRules,
  constraintSources,
  sourceRoots
} from "./archBoundary.js";
export type { LayerRules, ResolvedLayerRules } from "./archBoundary.js";
export { budget } from "./budget.js";
export { rubricSensor } from "./rubricSensor.js";
export { typecheck, lint, unitChanged } from "./fastSuite.js";
export { mutationProbe, analyzeTestStrength } from "./mutation.js";

export const builtinSensors: Record<string, BuiltinSensor> = {
  "spec-validate": specValidate,
  "spec-trace": specTrace,
  "fixture-hash": fixtureHash,
  "approved-tests": approvedTests,
  "arch-boundary": archBoundary,
  budget: budget,
  rubric: rubricSensor,
  typecheck,
  lint,
  "unit-changed": unitChanged,
  "mutation-probe": mutationProbe,
  "requirements-complete": requirementsComplete,
  "design-hld-complete": designHldComplete,
  "design-lld-complete": designLldComplete,
  "design-spec-align": designSpecAlign,
  "plan-coverage": planCoverage,
  "design-drift": designDrift
};

export function registerBuiltin(name: string, sensor: BuiltinSensor): void {
  builtinSensors[name] = sensor;
}
