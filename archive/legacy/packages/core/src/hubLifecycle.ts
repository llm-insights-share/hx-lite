import { HubAssetStatus } from "./hubAssetSchema.js";

export const HUB_LIFECYCLE: Record<HubAssetStatus, HubAssetStatus[]> = {
  draft: ["trial", "deprecated"],
  trial: ["enforced", "deprecated", "draft"],
  enforced: ["deprecated"],
  deprecated: ["archived"],
  archived: []
};

export function canTransitionHubAsset(from: HubAssetStatus, to: HubAssetStatus): boolean {
  return HUB_LIFECYCLE[from].includes(to);
}

export function assertHubAssetTransition(from: HubAssetStatus, to: HubAssetStatus): void {
  if (!canTransitionHubAsset(from, to)) {
    throw new Error(`illegal hub asset transition ${from} -> ${to}`);
  }
}
