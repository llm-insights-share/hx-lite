import type { BuiltinSensor } from "./types.js";
import { specValidate } from "./specValidate.js";

export * from "./types.js";
export { specValidate, checkEars } from "./specValidate.js";

export const builtinSensors: Record<string, BuiltinSensor> = {
  "spec-validate": specValidate
};

export function registerBuiltin(name: string, sensor: BuiltinSensor): void {
  builtinSensors[name] = sensor;
}
