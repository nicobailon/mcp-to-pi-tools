/**
 * Tests for config module
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import { resolvePreset, getPresetNames, mergeWithCli, PRESETS } from "../lib/config.js";

describe("resolvePreset", () => {
  it("should resolve pi preset", () => {
    assert.strictEqual(resolvePreset("pi"), "~/.pi/agent/AGENTS.md");
  });

  it("should resolve claude preset", () => {
    assert.strictEqual(resolvePreset("claude"), "~/.claude/CLAUDE.md");
  });

  it("should resolve gemini preset", () => {
    assert.strictEqual(resolvePreset("gemini"), "~/.gemini/AGENTS.md");
  });

  it("should resolve codex preset", () => {
    assert.strictEqual(resolvePreset("codex"), "~/.codex/AGENTS.md");
  });

  it("should be case-insensitive", () => {
    assert.strictEqual(resolvePreset("CLAUDE"), "~/.claude/CLAUDE.md");
    assert.strictEqual(resolvePreset("Pi"), "~/.pi/agent/AGENTS.md");
  });

  it("should return null for unknown preset", () => {
    assert.strictEqual(resolvePreset("unknown"), null);
    assert.strictEqual(resolvePreset("notreal"), null);
  });
});

describe("getPresetNames", () => {
  it("should return all preset names", () => {
    const names = getPresetNames();
    assert.ok(names.includes("pi"));
    assert.ok(names.includes("claude"));
    assert.ok(names.includes("gemini"));
    assert.ok(names.includes("codex"));
  });
});

describe("mergeWithCli", () => {
  it("should use config defaults when no CLI options provided", () => {
    const config = { register: true, registerPaths: ["~/.pi/agent/AGENTS.md"] };
    const options = { register: true, registerPaths: [], presets: [], local: false };
    const result = mergeWithCli(config, options);
    assert.strictEqual(result.register, true);
    assert.deepStrictEqual(result.registerPaths, ["~/.pi/agent/AGENTS.md"]);
  });

  it("should override register with --no-register", () => {
    const config = { register: true, registerPaths: ["~/.pi/agent/AGENTS.md"] };
    const options = { register: false, registerPaths: [], presets: [], local: false };
    const result = mergeWithCli(config, options);
    assert.strictEqual(result.register, false);
  });

  it("should add paths from --register-path", () => {
    const config = { register: true, registerPaths: ["~/.pi/agent/AGENTS.md"] };
    const options = { register: true, registerPaths: ["~/.custom/AGENTS.md"], presets: [], local: false };
    const result = mergeWithCli(config, options);
    assert.deepStrictEqual(result.registerPaths, ["~/.custom/AGENTS.md"]);
  });

  it("should resolve presets to paths", () => {
    const config = { register: true, registerPaths: [] };
    const options = { register: true, registerPaths: [], presets: ["claude", "gemini"], local: false };
    const result = mergeWithCli(config, options);
    assert.ok(result.registerPaths.includes("~/.claude/CLAUDE.md"));
    assert.ok(result.registerPaths.includes("~/.gemini/AGENTS.md"));
  });

  it("should combine register-path and presets", () => {
    const config = { register: true, registerPaths: [] };
    const options = {
      register: true,
      registerPaths: ["~/.custom/MY.md"],
      presets: ["claude"],
      local: false,
    };
    const result = mergeWithCli(config, options);
    assert.ok(result.registerPaths.includes("~/.custom/MY.md"));
    assert.ok(result.registerPaths.includes("~/.claude/CLAUDE.md"));
  });

  it("should set local flag", () => {
    const config = { register: true, registerPaths: [] };
    const options = { register: true, registerPaths: [], presets: [], local: true };
    const result = mergeWithCli(config, options);
    assert.strictEqual(result.local, true);
  });

  it("should deduplicate paths", () => {
    const config = { register: true, registerPaths: [] };
    const options = {
      register: true,
      registerPaths: ["~/.claude/CLAUDE.md"],
      presets: ["claude"],
      local: false,
    };
    const result = mergeWithCli(config, options);
    const claudeCount = result.registerPaths.filter((p) => p === "~/.claude/CLAUDE.md").length;
    assert.strictEqual(claudeCount, 1);
  });
});

describe("PRESETS", () => {
  it("should have all expected presets", () => {
    assert.strictEqual(PRESETS.pi, "~/.pi/agent/AGENTS.md");
    assert.strictEqual(PRESETS.claude, "~/.claude/CLAUDE.md");
    assert.strictEqual(PRESETS.gemini, "~/.gemini/AGENTS.md");
    assert.strictEqual(PRESETS.codex, "~/.codex/AGENTS.md");
  });
});
