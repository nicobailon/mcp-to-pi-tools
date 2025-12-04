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
    testDir = join(tmpdir(), `mcp2cli-test-${Date.now()}`);
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
    testDir = join(tmpdir(), `mcp2cli-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it("should create new file if it does not exist", () => {
    const targetPath = join(testDir, "NEW.md");
    const result = registerEntry(targetPath, "# New Content");
    assert.strictEqual(result.success, true);
    assert.ok(existsSync(targetPath));
    const content = readFileSync(targetPath, "utf-8");
    assert.ok(content.includes("# New Content"));
  });

  it("should append to existing file", () => {
    const targetPath = join(testDir, "EXISTING.md");
    writeFileSync(targetPath, "# Existing\n\nSome content");
    const result = registerEntry(targetPath, "# Appended");
    assert.strictEqual(result.success, true);
    const content = readFileSync(targetPath, "utf-8");
    assert.ok(content.includes("# Existing"));
    assert.ok(content.includes("# Appended"));
  });

  it("should create parent directories if needed", () => {
    const targetPath = join(testDir, "nested", "deep", "FILE.md");
    const result = registerEntry(targetPath, "# Nested");
    assert.strictEqual(result.success, true);
    assert.ok(existsSync(targetPath));
  });

  it("should return success false on write error", () => {
    const result = registerEntry("/nonexistent/readonly/path/FILE.md", "# Content");
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

  it("should handle empty registerPaths", () => {
    const config = { registerPaths: [], local: false };
    const paths = resolveAllPaths(config);
    assert.deepStrictEqual(paths, []);
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
