import type { HubCatalogEntry } from "./hubCatalog.js";

export interface HubPolicyIssue {
  asset: string;
  severity: "error" | "warn";
  message: string;
}

export interface HubPolicyOptions {
  minApprovalsForEnforced?: number;
}

export function checkHubPolicy(entries: HubCatalogEntry[], opts: HubPolicyOptions = {}): HubPolicyIssue[] {
  const issues: HubPolicyIssue[] = [];
  const minApprovals = opts.minApprovalsForEnforced ?? 1;
  for (const e of entries) {
    const key = `${e.id}@${e.version}`;
    if (!e.owner) issues.push({ asset: key, severity: "warn", message: "missing owner" });
    if (!e.hash) issues.push({ asset: key, severity: "warn", message: "missing integrity hash" });
    if (e.status === "enforced") {
      if (e.review !== "approved") issues.push({ asset: key, severity: "error", message: "enforced asset is not approved" });
      // approval cardinality is not currently persisted in catalog, keep rule as status gate for now
      if (minApprovals > 1) issues.push({ asset: key, severity: "warn", message: "min approval count policy configured; detailed count unavailable in catalog v1" });
    }
  }
  return issues;
}
