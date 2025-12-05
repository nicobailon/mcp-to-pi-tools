/**
 * Tests for discovery module
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import { deriveServerName, deriveDirName, buildMcpCommand } from "../lib/discovery.js";
import { EXAMPLE_PACKAGES } from "./fixtures.js";

describe("deriveServerName", () => {
  it("should handle simple package names", () => {
    assert.strictEqual(deriveServerName(EXAMPLE_PACKAGES.simple), "chrome-devtools");
  });

  it("should handle scoped packages", () => {
    assert.strictEqual(deriveServerName(EXAMPLE_PACKAGES.scoped), "context7");
  });

  it("should handle version suffixes", () => {
    assert.strictEqual(deriveServerName(EXAMPLE_PACKAGES.simpleWithVersion), "chrome-devtools");
    assert.strictEqual(deriveServerName(EXAMPLE_PACKAGES.scopedWithVersion), "context7");
  });

  it("should handle mcp- prefix", () => {
    assert.strictEqual(deriveServerName(EXAMPLE_PACKAGES.python), "server-time");
  });

  it("should handle packages without -mcp suffix", () => {
    assert.strictEqual(deriveServerName("my-tool"), "my-tool");
  });
});

describe("deriveDirName", () => {
  it("should derive directory name from package", () => {
    assert.strictEqual(deriveDirName(EXAMPLE_PACKAGES.simple), "chrome-devtools");
    assert.strictEqual(deriveDirName(EXAMPLE_PACKAGES.scoped), "context7");
  });

  it("should handle python packages", () => {
    assert.strictEqual(deriveDirName(EXAMPLE_PACKAGES.python), "server-time");
  });
});

describe("buildMcpCommand", () => {
  it("should build npx command for simple package", () => {
    assert.strictEqual(
      buildMcpCommand(EXAMPLE_PACKAGES.simple),
      "npx -y chrome-devtools-mcp@latest"
    );
  });

  it("should build npx command for scoped package", () => {
    assert.strictEqual(
      buildMcpCommand(EXAMPLE_PACKAGES.scoped),
      "npx -y @upstash/context7-mcp@latest"
    );
  });

  it("should preserve explicit version", () => {
    assert.strictEqual(
      buildMcpCommand(EXAMPLE_PACKAGES.simpleWithVersion),
      "npx -y chrome-devtools-mcp@latest"
    );
    assert.strictEqual(
      buildMcpCommand(EXAMPLE_PACKAGES.scopedWithVersion),
      "npx -y @upstash/context7-mcp@1.0.0"
    );
  });
});
