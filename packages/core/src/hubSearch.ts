import { buildHubCatalog, queryHubCatalog, writeHubCatalog, type HubCatalogEntry as CatalogEntry } from "./hubCatalog.js";

/**
 * Hub asset search & catalog index.
 */

export interface HubSearchOptions {
  kind?: string;
  phase?: string;
  stage?: string;
  category?: "package";
  query?: string;
}

/** Indexes all hub packages. */
export function indexHubCatalog(hubRoot: string): CatalogEntry[] {
  return buildHubCatalog(hubRoot);
}

export function searchHubCatalog(hubRoot: string, opts: HubSearchOptions = {}): CatalogEntry[] {
  return queryHubCatalog(hubRoot, {
    kind: opts.kind,
    category: opts.category,
    stage: opts.stage ?? opts.phase,
    query: opts.query
  });
}

/** Writes a searchable JSON index beside the hub root. */
export function writeHubIndex(hubRoot: string): string {
  return writeHubCatalog(hubRoot);
}
