import fs from "node:fs";
import path from "node:path";
import { interpolateSensorTemplate } from "@harnessx/core/sensorConfig.js";
import type { SensorReport } from "@harnessx/core/schemas.js";
import type { SensorContext } from "../types.js";
import { block, cfg } from "./helpers.js";

/** File existence / min-size checks. */
export const filePresenceEngine = (ctx: SensorContext): SensorReport => {
  const c = cfg(ctx);
  const paths = (c.paths as string[] | undefined) ?? (c.path ? [String(c.path)] : []);
  const minBytes = typeof c.min_bytes === "number" ? c.min_bytes : 0;
  const findings: SensorReport["findings"] = [];

  for (const p of paths) {
    const filled = interpolateSensorTemplate(p, {
      change: ctx.change,
      slug: ctx.prdSlug,
      module: ctx.archModule,
      root: ctx.ws.root,
      base: ctx.ws.base
    });
    const abs = path.isAbsolute(filled) ? filled : path.join(ctx.ws.root, filled);
    if (!fs.existsSync(abs)) {
      findings.push({ severity: "block", message: `missing file: ${filled}` });
      continue;
    }
    const size = fs.statSync(abs).size;
    if (size < minBytes) {
      findings.push({ severity: "block", message: `${filled} too small (${size} < ${minBytes} bytes)` });
    }
  }
  return block(findings, ctx, findings.length ? `${findings.length} presence issue(s)` : "files present");
};
