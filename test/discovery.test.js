/**
 * Tests for discovery module
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import { deriveServerName, deriveDirName, buildMcpCommand } from "../lib/discovery.js";

describe("deriveServerName", () => {
  it("should handle simple package names", () => {
    assert.strictEqual(deriveServerName("chrome-devtools-mcp"), "chrome-devtools");
  });

  it("should handle scoped packages", () => {
    assert.strictEqual(deriveServerName("@org/chrome-devtools-mcp"), "chrome-devtools");
  });

  it("should handle version suffixes", () => {
    assert.strictEqual(deriveServerName("chrome-devtools-mcp@latest"), "chrome-devtools");
    assert.strictEqual(deriveServerName("@org/chrome-devtools-mcp@1.0.0"), "chrome-devtools");
  });

  it("should handle mcp- prefix", () => {
    assert.strictEqual(deriveServerName("mcp-github"), "github");
  });

  it("should handle packages without -mcp suffix", () => {
    assert.strictEqual(deriveServerName("my-tool"), "my-tool");
  });
});

describe("deriveDirName", () => {
  it("should derive directory name from package", () => {
    assert.strictEqual(deriveDirName("chrome-devtools-mcp"), "chrome-devtools");
    assert.strictEqual(deriveDirName("@org/my-mcp-server-mcp"), "my-mcp-server");
  });
});

describe("buildMcpCommand", () => {
  it("should build npx command for simple package", () => {
    assert.strictEqual(buildMcpCommand("chrome-devtools-mcp"), "npx -y chrome-devtools-mcp@latest");
  });

  it("should build npx command for scoped package", () => {
    assert.strictEqual(
      buildMcpCommand("@org/chrome-devtools-mcp"),
      "npx -y @org/chrome-devtools-mcp@latest"
    );
  });

  it("should preserve explicit version", () => {
    assert.strictEqual(buildMcpCommand("my-mcp@1.2.3"), "npx -y my-mcp@1.2.3");
    assert.strictEqual(
      buildMcpCommand("@org/my-mcp@2.0.0"),
      "npx -y @org/my-mcp@2.0.0"
    );
  });
});
