/** Shared placeholder detection for pre-phase content validation. */

const PLACEHOLDER_PATTERNS = /<\w+>|TODO|TBD|待填写|占位|\{\{[^}]+\}\}/i;

export function isPlaceholderLine(line: string): boolean {
  const t = line.trim();
  if (!t) return true;
  if (/^[-|:\s]*$/.test(t)) return true;
  return PLACEHOLDER_PATTERNS.test(t);
}

/** True when a markdown table row is entirely placeholder cells. */
export function isPlaceholderTableRow(line: string): boolean {
  if (!line.trim().startsWith("|")) return false;
  if (/^\|\s*---/.test(line)) return false;
  const cells = line
    .split("|")
    .map((c) => c.trim())
    .filter((_, i, arr) => i > 0 && i < arr.length - 1);
  return cells.length > 0 && cells.every(isPlaceholderLine);
}

/** Count substantive (non-placeholder) lines in a section body. */
export function substantiveLineCount(text: string): number {
  return text.split("\n").filter((l) => !isPlaceholderLine(l) && !isPlaceholderTableRow(l)).length;
}

export function hasPlaceholderContent(text: string): boolean {
  const lines = text.split("\n");
  let tableRows = 0;
  let placeholderRows = 0;
  for (const line of lines) {
    if (!line.trim().startsWith("|")) continue;
    if (/^\|\s*---/.test(line)) continue;
    tableRows++;
    if (isPlaceholderTableRow(line)) placeholderRows++;
  }
  if (tableRows >= 2 && placeholderRows >= tableRows - 1) return true;
  return substantiveLineCount(text) < 3;
}
