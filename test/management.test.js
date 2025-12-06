import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { mkdirSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import {
  deriveHeading,
  getToolHeading,
  formatToolList,
  removeTool,
} from "../lib/management.js";

describe("deriveHeading", () => {
  it("should convert hyphenated name to heading", () => {
    const result = deriveHeading("server-time");
    assert.strictEqual(result, "### Server Time Tools");
  });

  it("should handle single word", () => {
    const result = deriveHeading("fetch");
    assert.strictEqual(result, "### Fetch Tools");
  });

  it("should handle multiple hyphens", () => {
    const result = deriveHeading("chrome-devtools-mcp");
    assert.strictEqual(result, "### Chrome Devtools Mcp Tools");
  });
});

describe("getToolHeading", () => {
  it("should derive heading from name", () => {
    const result = getToolHeading("test-tool");
    assert.strictEqual(result, "### Test Tool Tools");
  });

  it("should be equivalent to deriveHeading", () => {
    assert.strictEqual(getToolHeading("server-time"), deriveHeading("server-time"));
  });
});

describe("formatToolList", () => {
  it("should show message for empty tools list", () => {
    const result = formatToolList([]);
    assert.ok(result.includes("No tools installed"));
  });

  it("should format tools as table", () => {
    const tools = [
      {
        name: "server-time",
        scripts: 1,
        registeredIn: ["pi"],
        symlinks: "1/1",
      },
    ];
    const result = formatToolList(tools);
    assert.ok(result.includes("Installed Tools (1)"));
    assert.ok(result.includes("server-time"));
    assert.ok(result.includes("pi"));
    assert.ok(result.includes("1/1"));
  });

  it("should show (none) for unregistered tools", () => {
    const tools = [
      {
        name: "test-tool",
        scripts: 2,
        registeredIn: [],
        symlinks: "0/2",
      },
    ];
    const result = formatToolList(tools);
    assert.ok(result.includes("(none)"));
  });
});

describe("removeTool", () => {
  let testDir;

  beforeEach(() => {
    testDir = join(tmpdir(), `mcp2cli-remove-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(join(testDir, "agent-tools", "test-tool"), { recursive: true });
    mkdirSync(join(testDir, "agent-tools", "bin"), { recursive: true });
    writeFileSync(join(testDir, "agent-tools", "test-tool", "test-tool.js"), "#!/usr/bin/env node\nconsole.log('test');");
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it("should return error for non-existent tool", () => {
    const result = removeTool("nonexistent-tool", { quiet: true });
    assert.strictEqual(result.success, false);
    assert.ok(result.error.includes("not found"));
  });
});
