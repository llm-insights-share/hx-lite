import type { BuiltinSensor } from "./types.js";
import { specValidate } from "./specValidate.js";
import { specTrace, fixtureHash, approvedTests } from "./builtins.js";

export * from "./types.js";
export { specValidate, checkEars } from "./specValidate.js";
export { specTrace, fixtureHash, approvedTests } from "./builtins.js";

export const builtinSensors: Record<string, BuiltinSensor> = {
  "spec-validate": specValidate,
  "spec-trace": specTrace,
  "fixture-hash": fixtureHash,
  "approved-tests": approvedTests
};

export function registerBuiltin(name: string, sensor: BuiltinSensor): void {
  builtinSensors[name] = sensor;
}
