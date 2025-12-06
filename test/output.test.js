/**
 * Tests for output module
 */

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "fs";
import { resolvePath, readManifest, createManifest, getUserFiles } from "../lib/output.js";
import { homedir, tmpdir } from "os";
import { join } from "path";

describe("resolvePath", () => {
  it("should expand ~ to home directory", () => {
    const result = resolvePath("~/agent-tools/test");
    assert.strictEqual(result, join(homedir(), "agent-tools/test"));
  });

  it("should leave absolute paths unchanged", () => {
    const result = resolvePath("/tmp/test");
    assert.strictEqual(result, "/tmp/test");
  });

  it("should leave relative paths unchanged", () => {
    const result = resolvePath("./my-tools");
    assert.strictEqual(result, "./my-tools");
  });
});

describe("readManifest", () => {
  let testDir;

  beforeEach(() => {
    testDir = join(tmpdir(), `mcp2cli-manifest-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it("should return null if manifest does not exist", () => {
    const result = readManifest(testDir);
    assert.strictEqual(result, null);
  });

  it("should parse valid manifest", () => {
    const manifest = { version: 1, package: "test-pkg", files: ["a.js", "b.js"] };
    writeFileSync(join(testDir, ".mcp2cli-manifest.json"), JSON.stringify(manifest));
    const result = readManifest(testDir);
    assert.deepStrictEqual(result, manifest);
  });

  it("should return null for invalid JSON", () => {
    writeFileSync(join(testDir, ".mcp2cli-manifest.json"), "not json");
    const result = readManifest(testDir);
    assert.strictEqual(result, null);
  });
});

describe("createManifest", () => {
  it("should create valid JSON manifest", () => {
    const result = createManifest("my-package", ["tool.js", "README.md"]);
    const parsed = JSON.parse(result);
    assert.strictEqual(parsed.version, 1);
    assert.strictEqual(parsed.package, "my-package");
    assert.deepStrictEqual(parsed.files, ["tool.js", "README.md"]);
    assert.ok(parsed.generatedAt);
  });

  it("should exclude manifest file from files list", () => {
    const result = createManifest("pkg", [".mcp2cli-manifest.json", "tool.js"]);
    const parsed = JSON.parse(result);
    assert.deepStrictEqual(parsed.files, ["tool.js"]);
  });
});

describe("getUserFiles", () => {
  let testDir;

  beforeEach(() => {
    testDir = join(tmpdir(), `mcp2cli-userfiles-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it("should return empty array if no manifest", () => {
    const result = getUserFiles(testDir, null);
    assert.deepStrictEqual(result, []);
  });

  it("should identify user-added files", () => {
    writeFileSync(join(testDir, "generated.js"), "gen");
    writeFileSync(join(testDir, "user-custom.js"), "custom");
    writeFileSync(join(testDir, ".mcp2cli-manifest.json"), "{}");

    const manifest = { files: ["generated.js"] };
    const result = getUserFiles(testDir, manifest);

    assert.ok(result.includes("user-custom.js"));
    assert.ok(!result.includes("generated.js"));
    assert.ok(!result.includes(".mcp2cli-manifest.json"));
  });

  it("should return empty array if all files are generated", () => {
    writeFileSync(join(testDir, "a.js"), "a");
    writeFileSync(join(testDir, "b.js"), "b");

    const manifest = { files: ["a.js", "b.js"] };
    const result = getUserFiles(testDir, manifest);

    assert.deepStrictEqual(result, []);
  });
});
