/**
 * Tests for registration module
 */

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import {
  resolvePath,
  detectLocalFile,
  registerEntry,
  resolveAllPaths,
  getSuccessfulPaths,
  extractHeading,
  findSectionByHeading,
} from "../lib/registration.js";

describe("resolvePath", () => {
  it("should expand ~ to home directory", () => {
    const result = resolvePath("~/test/path");
    assert.ok(!result.includes("~"));
    assert.ok(result.includes("test/path"));
  });

  it("should leave absolute paths unchanged", () => {
    const result = resolvePath("/absolute/path");
    assert.strictEqual(result, "/absolute/path");
  });

  it("should leave relative paths unchanged", () => {
    const result = resolvePath("relative/path");
    assert.strictEqual(result, "relative/path");
  });
});

describe("detectLocalFile", () => {
  let testDir;

  beforeEach(() => {
    testDir = join(tmpdir(), `mcp2cli-local-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it("should detect CLAUDE.md if it exists", () => {
    writeFileSync(join(testDir, "CLAUDE.md"), "# Claude");
    const result = detectLocalFile(testDir);
    assert.strictEqual(result, join(testDir, "CLAUDE.md"));
  });

  it("should detect AGENTS.md if it exists and no CLAUDE.md", () => {
    writeFileSync(join(testDir, "AGENTS.md"), "# Agents");
    const result = detectLocalFile(testDir);
    assert.strictEqual(result, join(testDir, "AGENTS.md"));
  });

  it("should prefer CLAUDE.md over AGENTS.md", () => {
    writeFileSync(join(testDir, "CLAUDE.md"), "# Claude");
    writeFileSync(join(testDir, "AGENTS.md"), "# Agents");
    const result = detectLocalFile(testDir);
    assert.strictEqual(result, join(testDir, "CLAUDE.md"));
  });

  it("should default to AGENTS.md if neither exists", () => {
    const result = detectLocalFile(testDir);
    assert.strictEqual(result, join(testDir, "AGENTS.md"));
  });
});

describe("registerEntry", () => {
  let testDir;

  beforeEach(() => {
    testDir = join(tmpdir(), `mcp2cli-reg-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it("should create new file if it does not exist", () => {
    const targetPath = join(testDir, "NEW.md");
    const result = registerEntry(targetPath, "# New Content", "test-pkg");
    assert.strictEqual(result.success, true);
    assert.ok(existsSync(targetPath));
    const content = readFileSync(targetPath, "utf-8");
    assert.ok(content.includes("# New Content"));
  });

  it("should append to existing file", () => {
    const targetPath = join(testDir, "EXISTING.md");
    writeFileSync(targetPath, "# Existing\n\nSome content");
    const result = registerEntry(targetPath, "# Appended", "test-pkg");
    assert.strictEqual(result.success, true);
    const content = readFileSync(targetPath, "utf-8");
    assert.ok(content.includes("# Existing"));
    assert.ok(content.includes("# Appended"));
  });

  it("should create parent directories if needed", () => {
    const targetPath = join(testDir, "nested", "deep", "FILE.md");
    const result = registerEntry(targetPath, "# Nested", "test-pkg");
    assert.strictEqual(result.success, true);
    assert.ok(existsSync(targetPath));
  });

  it("should return success false on write error", () => {
    const result = registerEntry("/nonexistent/readonly/path/FILE.md", "# Content", "test-pkg");
    assert.strictEqual(result.success, false);
    assert.ok(result.error);
  });
});

describe("resolveAllPaths", () => {
  it("should return registerPaths from config", () => {
    const config = { registerPaths: ["~/.pi/agent/AGENTS.md", "~/.claude/CLAUDE.md"], local: false };
    const paths = resolveAllPaths(config);
    assert.ok(paths.includes("~/.pi/agent/AGENTS.md"));
    assert.ok(paths.includes("~/.claude/CLAUDE.md"));
  });

  it("should add local path when local is true", () => {
    const config = { registerPaths: ["~/.pi/agent/AGENTS.md"], local: true };
    const paths = resolveAllPaths(config);
    assert.ok(paths.includes("~/.pi/agent/AGENTS.md"));
    assert.ok(paths.length >= 2);
  });

  it("should use fallback chain when registerPaths is empty", () => {
    const config = { registerPaths: [], local: false };
    const paths = resolveAllPaths(config);
    // With empty registerPaths, uses fallback chain (first existing preset)
    // Result depends on which preset files exist on the system
    assert.ok(Array.isArray(paths));
    assert.ok(paths.length <= 1); // At most one from fallback chain
  });
});

describe("getSuccessfulPaths", () => {
  it("should filter to successful results", () => {
    const results = [
      { success: true, path: "~/.pi/agent/AGENTS.md" },
      { success: false, path: "~/.bad/PATH.md", error: "error" },
      { success: true, path: "~/.claude/CLAUDE.md" },
    ];
    const paths = getSuccessfulPaths(results);
    assert.deepStrictEqual(paths, ["~/.pi/agent/AGENTS.md", "~/.claude/CLAUDE.md"]);
  });

  it("should return empty array if all failed", () => {
    const results = [
      { success: false, path: "~/.bad/PATH.md", error: "error" },
    ];
    const paths = getSuccessfulPaths(results);
    assert.deepStrictEqual(paths, []);
  });

  it("should return empty array for empty input", () => {
    const paths = getSuccessfulPaths([]);
    assert.deepStrictEqual(paths, []);
  });
});

describe("extractHeading", () => {
  it("should extract ### heading from content", () => {
    const content = "### My Tools\n\nSome description";
    const result = extractHeading(content);
    assert.strictEqual(result, "### My Tools");
  });

  it("should return null if no heading found", () => {
    const content = "No heading here";
    const result = extractHeading(content);
    assert.strictEqual(result, null);
  });

  it("should find heading in middle of content", () => {
    const content = "Preamble\n\n### Tools Section\n\nContent";
    const result = extractHeading(content);
    assert.strictEqual(result, "### Tools Section");
  });
});

describe("findSectionByHeading", () => {
  it("should find section from heading to next heading", () => {
    const content = "# File\n\n### Section A\nContent A\n\n### Section B\nContent B";
    const result = findSectionByHeading(content, "### Section A");
    assert.ok(result);
    assert.ok(result.content.includes("### Section A"));
    assert.ok(result.content.includes("Content A"));
    assert.ok(!result.content.includes("### Section B"));
  });

  it("should find section from heading to EOF", () => {
    const content = "# File\n\n### Only Section\nContent here";
    const result = findSectionByHeading(content, "### Only Section");
    assert.ok(result);
    assert.ok(result.content.includes("### Only Section"));
    assert.ok(result.content.includes("Content here"));
  });

  it("should return null if heading not found", () => {
    const content = "# File\n\n### Other Section\nContent";
    const result = findSectionByHeading(content, "### Missing Section");
    assert.strictEqual(result, null);
  });
});

describe("registerEntry idempotent behavior", () => {
  let testDir;

  beforeEach(() => {
    testDir = join(tmpdir(), `mcp2cli-idem-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it("should return unchanged if same content exists", () => {
    const targetPath = join(testDir, "TEST.md");
    const entry = "### Test Tools\n\nSome content";

    registerEntry(targetPath, entry, "test-tools");
    const result = registerEntry(targetPath, entry, "test-tools");

    assert.strictEqual(result.action, "unchanged");
  });

  it("should return updated if content differs", () => {
    const targetPath = join(testDir, "TEST.md");
    const entry1 = "### Test Tools\n\nOriginal content";
    const entry2 = "### Test Tools\n\nUpdated content";

    registerEntry(targetPath, entry1, "test-tools");
    const result = registerEntry(targetPath, entry2, "test-tools");

    assert.strictEqual(result.action, "updated");
    const content = readFileSync(targetPath, "utf-8");
    assert.ok(content.includes("Updated content"));
    assert.ok(!content.includes("Original content"));
  });

  it("should return created for new entry", () => {
    const targetPath = join(testDir, "TEST.md");
    const entry = "### Test Tools\n\nSome content";

    const result = registerEntry(targetPath, entry, "test-tools");

    assert.strictEqual(result.action, "created");
  });

  it("should not create duplicates on re-run", () => {
    const targetPath = join(testDir, "TEST.md");
    const entry = "### Test Tools\n\nContent";

    registerEntry(targetPath, entry, "test-tools");
    registerEntry(targetPath, entry, "test-tools");
    registerEntry(targetPath, entry, "test-tools");

    const content = readFileSync(targetPath, "utf-8");
    const matches = content.match(/### Test Tools/g);
    assert.strictEqual(matches.length, 1);
  });
});
