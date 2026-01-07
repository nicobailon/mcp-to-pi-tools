/**
 * Tests for migration module
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import {
  extractMcpCommand,
  extractServerName,
  derivePackageName,
  deriveRunnerType,
  formatMigrationScan,
} from "../lib/migration.js";
import { writeFileSync, mkdirSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

describe("extractMcpCommand", () => {
  const testDir = join(tmpdir(), "mcp2ext-test-" + Date.now());

  it("should extract MCP_CMD from script", () => {
    mkdirSync(testDir, { recursive: true });
    const scriptPath = join(testDir, "test.js");
    writeFileSync(scriptPath, `
const MCP_CMD = "npx -y @anthropic-ai/chrome-devtools-mcp@latest";
const SERVER = "chrome-devtools";
`);
    const result = extractMcpCommand(scriptPath);
    assert.strictEqual(result, "npx -y @anthropic-ai/chrome-devtools-mcp@latest");
    rmSync(testDir, { recursive: true });
  });

  it("should extract from mcporter call pattern", () => {
    mkdirSync(testDir, { recursive: true });
    const scriptPath = join(testDir, "test.js");
    writeFileSync(scriptPath, `
const cmd = \`npx mcporter call --stdio "uvx mcp-server-time" server-time.get_time\`;
`);
    const result = extractMcpCommand(scriptPath);
    assert.strictEqual(result, "uvx mcp-server-time");
    rmSync(testDir, { recursive: true });
  });

  it("should return null for non-existent file", () => {
    const result = extractMcpCommand("/non/existent/path.js");
    assert.strictEqual(result, null);
  });

  it("should return null for file without MCP command", () => {
    mkdirSync(testDir, { recursive: true });
    const scriptPath = join(testDir, "test.js");
    writeFileSync(scriptPath, `
console.log("Hello world");
`);
    const result = extractMcpCommand(scriptPath);
    assert.strictEqual(result, null);
    rmSync(testDir, { recursive: true });
  });
});

describe("extractServerName", () => {
  const testDir = join(tmpdir(), "mcp2ext-test-" + Date.now());

  it("should extract SERVER constant", () => {
    mkdirSync(testDir, { recursive: true });
    const scriptPath = join(testDir, "test.js");
    writeFileSync(scriptPath, `
const MCP_CMD = "npx test";
const SERVER = "my-server";
`);
    const result = extractServerName(scriptPath);
    assert.strictEqual(result, "my-server");
    rmSync(testDir, { recursive: true });
  });

  it("should extract from mcporter call", () => {
    mkdirSync(testDir, { recursive: true });
    const scriptPath = join(testDir, "test.js");
    writeFileSync(scriptPath, `
const cmd = \`npx mcporter call --stdio "uvx test" server-name.tool\`;
`);
    const result = extractServerName(scriptPath);
    assert.strictEqual(result, "server-name");
    rmSync(testDir, { recursive: true });
  });

  it("should return null for non-existent file", () => {
    const result = extractServerName("/non/existent/path.js");
    assert.strictEqual(result, null);
  });
});

describe("derivePackageName", () => {
  it("should extract package from npx command", () => {
    assert.strictEqual(
      derivePackageName("npx -y chrome-devtools-mcp@latest"),
      "chrome-devtools-mcp"
    );
  });

  it("should extract package from npx without -y", () => {
    assert.strictEqual(
      derivePackageName("npx chrome-devtools-mcp"),
      "chrome-devtools-mcp"
    );
  });

  it("should extract package from uvx command", () => {
    assert.strictEqual(
      derivePackageName("uvx mcp-server-time"),
      "mcp-server-time"
    );
  });

  it("should extract image from docker command", () => {
    assert.strictEqual(
      derivePackageName("docker run -i --rm mcp/fetch"),
      "mcp/fetch"
    );
  });

  it("should handle scoped packages", () => {
    assert.strictEqual(
      derivePackageName("npx -y @anthropic-ai/chrome-devtools-mcp@latest"),
      "@anthropic-ai/chrome-devtools-mcp"
    );
  });

  it("should return unknown for null/empty", () => {
    assert.strictEqual(derivePackageName(null), "unknown");
    assert.strictEqual(derivePackageName(""), "unknown");
  });
});

describe("deriveRunnerType", () => {
  it("should detect npx runner", () => {
    assert.strictEqual(deriveRunnerType("npx -y test@latest"), "npx");
  });

  it("should detect uvx runner", () => {
    assert.strictEqual(deriveRunnerType("uvx mcp-server-time"), "uvx");
  });

  it("should detect pip runner", () => {
    assert.strictEqual(deriveRunnerType("pip run mcp-server"), "pip");
  });

  it("should detect docker runner", () => {
    assert.strictEqual(deriveRunnerType("docker run -i mcp/fetch"), "docker");
  });

  it("should return custom for unknown command", () => {
    assert.strictEqual(deriveRunnerType("/usr/local/bin/custom-mcp"), "custom");
  });

  it("should return custom for null", () => {
    assert.strictEqual(deriveRunnerType(null), "custom");
  });
});

describe("formatMigrationScan", () => {
  it("should show message for empty tools list", () => {
    const result = formatMigrationScan([]);
    assert.ok(result.includes("No CLI tools found"));
  });

  it("should format tools as table", () => {
    const tools = [
      {
        name: "chrome-dev-tools",
        mcpCommand: "npx -y chrome-devtools-mcp",
        canMigrate: true,
      },
      {
        name: "custom-tool",
        mcpCommand: null,
        canMigrate: false,
      },
    ];

    const result = formatMigrationScan(tools);

    assert.ok(result.includes("CLI Tools Available for Migration"));
    assert.ok(result.includes("chrome-dev-tools"));
    assert.ok(result.includes("custom-tool"));
    assert.ok(result.includes("ready"));
    assert.ok(result.includes("skip"));
    assert.ok(result.includes("mcp2ext migrate"));
  });

  it("should truncate long MCP commands", () => {
    const tools = [
      {
        name: "test",
        mcpCommand: "npx -y @anthropic-ai/chrome-devtools-mcp@latest with extra long args",
        canMigrate: true,
      },
    ];

    const result = formatMigrationScan(tools);
    assert.ok(result.includes("..."));
  });

  it("should show migration count", () => {
    const tools = [
      { name: "a", mcpCommand: "npx a", canMigrate: true },
      { name: "b", mcpCommand: "npx b", canMigrate: true },
      { name: "c", mcpCommand: null, canMigrate: false },
    ];

    const result = formatMigrationScan(tools);
    assert.ok(result.includes("2 of 3 tools can be migrated"));
  });
});
