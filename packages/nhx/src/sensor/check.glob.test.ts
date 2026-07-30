import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  checkFileExists,
  checkFileMinBytes,
  listFilesMatching,
  matchGlob,
  pathHasGlob,
  resolveInlinePaths,
} from "./check.js";

test("matchGlob basic", () => {
  assert.equal(matchGlob("docs/req/bizmodel*.md", "docs/req/bizmodel.md"), true);
  assert.equal(matchGlob("docs/req/bizmodel*.md", "docs/req/bizmodel-v2.md"), true);
  assert.equal(matchGlob("docs/req/bizmodel*.md", "docs/req/other.md"), false);
  assert.equal(matchGlob("docs/**/*.md", "docs/a/b/c.md"), true);
});

test("pathHasGlob", () => {
  assert.equal(pathHasGlob("docs/a.md"), false);
  assert.equal(pathHasGlob("docs/*.md"), true);
  assert.equal(pathHasGlob("docs/**/x.md"), true);
});

test("exact path still works", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "nhx-exact-"));
  try {
    fs.mkdirSync(path.join(root, "docs"), { recursive: true });
    fs.writeFileSync(path.join(root, "docs", "a.md"), "hello");
    assert.equal(checkFileExists(root, "docs/a.md").ok, true);
    assert.equal(checkFileExists(root, "docs/missing.md").ok, false);
    assert.equal(checkFileMinBytes(root, "docs/a.md", 3).ok, true);
    assert.equal(checkFileMinBytes(root, "docs/a.md", 100).ok, false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("glob: all match >= n passes; partial fails; zero fails", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "nhx-minb-"));
  try {
    fs.mkdirSync(path.join(root, "docs", "req"), { recursive: true });
    fs.writeFileSync(path.join(root, "docs", "req", "bizmodel-a.md"), "a".repeat(250));
    fs.writeFileSync(path.join(root, "docs", "req", "bizmodel-b.md"), "b".repeat(250));
    fs.writeFileSync(path.join(root, "docs", "req", "other.md"), "z".repeat(10));

    assert.deepEqual(listFilesMatching(root, "docs/req/bizmodel*.md"), [
      "docs/req/bizmodel-a.md",
      "docs/req/bizmodel-b.md",
    ]);

    const ok = checkFileMinBytes(root, "docs/req/bizmodel*.md", 200);
    assert.equal(ok.ok, true);

    fs.writeFileSync(path.join(root, "docs", "req", "bizmodel-b.md"), "tiny");
    const bad = checkFileMinBytes(root, "docs/req/bizmodel*.md", 200);
    assert.equal(bad.ok, false);
    assert.match(bad.message, /bizmodel-b\.md/);

    assert.equal(checkFileMinBytes(root, "docs/req/nomatch*.md", 200).ok, false);
    assert.equal(checkFileExists(root, "docs/req/nomatch*.md").ok, false);
    assert.deepEqual(resolveInlinePaths(root, "docs/req/nomatch*.md"), []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
