import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { buildSkillMarkdown, materializeExport, splitSkillFrontmatter } from "./materialize.js";

describe("materializeExport package blobs", () => {
  it("writes docx package under guides/{asset_id}/ and hints docx deliverable", () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "nhx-mat-"));
    const docxB64 = Buffer.from("PK\x03\x04docx-bytes").toString("base64");
    materializeExport(
      {
        project: {
          id: 4,
          name: "demo2",
          slug: "demo2",
          profile_key: "simple-sdlc",
        },
        profile: "simple-sdlc",
        stages_filter: ["arch"],
        stages: [],
        tasks: [
          {
            stage: "arch",
            id: "database-design",
            title: "数据库设计",
            required: true,
            custom: false,
            guides: ["database-design", "arch-db-design-template"],
            sensors: ["arch-database-design-complete"],
            skill_ids: ["database-design"],
            slash_name: "nhx-arch-database-design",
            shell_body: "# /nhx-arch-database-design\n\n## Steps\n1. design\n",
            shell_appendix: "",
          },
        ],
        guides: [
          {
            asset_id: "database-design",
            kind: "guide.skill",
            stage: "",
            task: "",
            content: "# skill\n",
            content_mode: "markdown",
          },
          {
            asset_id: "arch-db-design-template",
            kind: "guide.template",
            stage: "",
            task: "",
            content: "# stub\n",
            content_mode: "package",
            package_files: ["4-数据库设计文档示例.docx"],
            primary_file: "4-数据库设计文档示例.docx",
            package_blobs: [
              { path: "4-数据库设计文档示例.docx", content_base64: docxB64 },
            ],
          },
        ],
        sensors: [
          {
            asset_id: "arch-database-design-complete",
            kind: "sensor.rule",
            stage: "arch",
            task: "database-design",
            check_type: "inline",
            content:
              '---\ncheck_type: inline\nexpr: "file.exists(path=docs/architecture/database-design.docx)"\n---\n',
          },
        ],
        counts: {},
      },
      { cwd, prune: true },
    );

    const pkgFile = path.join(
      cwd,
      ".nhx/guides/arch-db-design-template/4-数据库设计文档示例.docx",
    );
    assert.ok(fs.existsSync(pkgFile));
    assert.equal(fs.readFileSync(pkgFile).toString("binary").slice(0, 4), "PK\x03\x04");

    const cmd = fs.readFileSync(
      path.join(cwd, ".nhx/commands/nhx-arch-database-design.md"),
      "utf8",
    );
    assert.match(cmd, /database-design\.docx/);
    assert.match(cmd, /4-数据库设计文档示例\.docx/);
    assert.match(cmd, /extension `\.docx` must match/);
  });
});

describe("buildSkillMarkdown frontmatter", () => {
  it("does not double-wrap when content already has YAML frontmatter", () => {
    const content = [
      "---",
      "name: subsystem-partitioning",
      "description: >",
      "  DDD 子系统划分",
      "---",
      "",
      "# 子系统划分分析",
      "",
    ].join("\n");
    const out = buildSkillMarkdown("arch_subsystem", "nhx skill arch_subsystem", content);
    assert.equal((out.match(/^---$/gm) || []).length, 2, `expected one FM block, got:\n${out}`);
    assert.match(out, /^---\nname: arch_subsystem\ndescription: >\n/);
    assert.match(out, /description: >\n  DDD 子系统划分\n---/);
    assert.doesNotMatch(out, /nhx skill arch_subsystem/);
    assert.match(out, /# 子系统划分分析/);
    const { data, body } = splitSkillFrontmatter(out);
    assert.equal(data?.name, "arch_subsystem");
    assert.match(String(data?.description), /DDD/);
    assert.match(body, /# 子系统划分分析/);
  });

  it("always uses description: > folded block scalar", () => {
    const out = buildSkillMarkdown("demo", "a demo skill", "# Hello\n");
    assert.match(
      out,
      /^---\nname: demo\ndescription: >\n  a demo skill\n---\n\n# Hello\n/,
    );
  });

  it("folds multiline description under description: >", () => {
    const out = buildSkillMarkdown("x", "line1\nline2", "body");
    assert.match(out, /^---\nname: x\ndescription: >\n  line1\n  line2\n---\n/);
  });
});
