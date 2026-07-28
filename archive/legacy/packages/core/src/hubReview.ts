import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { HubReviewRecord, type HubReviewStatus } from "./hubAssetSchema.js";

const REVIEW_FILE = ".hub-review.yaml";
const LEGACY_REVIEW_FILE = ".review";

export function hubReviewFile(assetDir: string): string {
  return path.join(assetDir, REVIEW_FILE);
}

export function readHubReview(assetDir: string): HubReviewRecord {
  const f = hubReviewFile(assetDir);
  if (fs.existsSync(f)) {
    return HubReviewRecord.parse(YAML.parse(fs.readFileSync(f, "utf8")));
  }
  const legacy = path.join(assetDir, LEGACY_REVIEW_FILE);
  if (fs.existsSync(legacy)) {
    const y = (YAML.parse(fs.readFileSync(legacy, "utf8")) ?? {}) as { status?: HubReviewStatus; reviewer?: string; publishedBy?: string; at?: string };
    return HubReviewRecord.parse({
      status: y.status ?? "pending",
      requestedBy: y.publishedBy,
      requestedAt: y.at,
      approvedBy: y.status === "approved" && y.reviewer ? [y.reviewer] : [],
      updatedAt: y.at
    });
  }
  return HubReviewRecord.parse({});
}

export function writeHubReview(assetDir: string, review: HubReviewRecord): void {
  fs.writeFileSync(hubReviewFile(assetDir), YAML.stringify(HubReviewRecord.parse(review)), "utf8");
}

export function requestHubReview(assetDir: string, requestedBy: string): HubReviewRecord {
  const rec = HubReviewRecord.parse({
    ...readHubReview(assetDir),
    status: "pending",
    requestedBy,
    requestedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    rejectedBy: undefined,
    rejectedReason: undefined
  });
  writeHubReview(assetDir, rec);
  return rec;
}

export function approveHubReview(assetDir: string, reviewer: string): HubReviewRecord {
  const prior = readHubReview(assetDir);
  const approvedBy = [...new Set([...(prior.approvedBy ?? []), reviewer])];
  const rec = HubReviewRecord.parse({ ...prior, status: "approved", approvedBy, updatedAt: new Date().toISOString() });
  writeHubReview(assetDir, rec);
  return rec;
}

export function rejectHubReview(assetDir: string, reviewer: string, reason: string): HubReviewRecord {
  const prior = readHubReview(assetDir);
  const rec = HubReviewRecord.parse({
    ...prior,
    status: "rejected",
    rejectedBy: reviewer,
    rejectedReason: reason,
    updatedAt: new Date().toISOString()
  });
  writeHubReview(assetDir, rec);
  return rec;
}
