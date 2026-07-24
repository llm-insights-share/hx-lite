import { isArchLldApproved, isStageApproved, resolvePrdSlug } from "@harnessx/core";
import type { SensorReport } from "@harnessx/core/schemas.js";
import type { SensorContext } from "../types.js";
import { archLldApproved } from "../sdlc.js";
import { block, cfg } from "./helpers.js";

/** Gate / stage approval checks. */
export const gateApprovedEngine = (ctx: SensorContext): SensorReport => {
  const c = cfg(ctx);
  const gate = String(c.gate ?? c.stage ?? "");
  if (!gate) {
    // Fall back to sensor id heuristics
    if (ctx.def.id.includes("prd")) return gateApprovedEngine({ ...ctx, config: { ...c, gate: "prd" } });
    if (ctx.def.id.includes("arch-lld")) return archLldApproved(ctx);
    if (ctx.def.id.includes("arch")) return gateApprovedEngine({ ...ctx, config: { ...c, gate: "arch" } });
    return block([{ severity: "block", message: "gate-approved config missing gate/stage" }], ctx, "misconfigured");
  }

  if (gate === "prd" || gate === "req") {
    const slug = ctx.prdSlug ?? (ctx.change ? resolvePrdSlug(ctx.ws, ctx.change) : undefined) ?? (c.prd_slug as string | undefined);
    if (!slug) {
      return block([{ severity: "block", message: "PRD slug unknown for approval check" }], ctx, "PRD not linked");
    }
    if (!isStageApproved(ctx.ws, "req", slug)) {
      return block(
        [
          {
            severity: "block",
            message: `PRD "${slug}" not approved — run: hx gate approve --gate prd --prd ${slug} --approver <name>`
          }
        ],
        ctx,
        "PRD not approved"
      );
    }
    return block([], ctx, `PRD "${slug}" approved`);
  }

  if (gate === "arch") {
    if (!isStageApproved(ctx.ws, "arch")) {
      return block(
        [{ severity: "block", message: "global architecture not approved — run: hx gate approve --gate arch --approver <name>" }],
        ctx,
        "arch not approved"
      );
    }
    return block([], ctx, "global architecture approved");
  }

  if (gate === "arch-lld") {
    const moduleId = ctx.archModule ?? (c.module as string | undefined);
    if (moduleId) {
      if (!isArchLldApproved(ctx.ws, moduleId)) {
        return block(
          [
            {
              severity: "block",
              message: `module LLD "${moduleId}" not approved — run: hx approve arch-lld ${moduleId} --approver <name>`
            }
          ],
          ctx,
          "LLD not approved"
        );
      }
      return block([], ctx, `module LLD "${moduleId}" approved`);
    }
    return archLldApproved(ctx);
  }

  return block([{ severity: "block", message: `unknown gate: ${gate}` }], ctx, "unknown gate");
};
