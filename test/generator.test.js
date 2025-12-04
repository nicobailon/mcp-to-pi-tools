/**
 * Tests for generator module
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import {
  generatePackageJson,
  generateInstallScript,
  generateGitignore,
  generateAgentsEntry,
} from "../lib/generator.js";

describe("generatePackageJson", () => {
  it("should generate valid package.json", () => {
    const result = generatePackageJson("my-tools", "browser automation");
    const parsed = JSON.parse(result);

    assert.strictEqual(parsed.name, "my-tools");
    assert.strictEqual(parsed.version, "1.0.0");
    assert.strictEqual(parsed.type, "module");
    assert.ok(parsed.description.includes("browser automation"));
    assert.ok(parsed.description.includes("AI agents"));
    assert.deepStrictEqual(parsed.dependencies, {});
  });
});

describe("generateInstallScript", () => {
  it("should generate install script with correct name", () => {
    const result = generateInstallScript("my-tools");

    assert.ok(result.startsWith("#!/bin/bash"));
    assert.ok(result.includes("my-tools"));
    assert.ok(result.includes("$HOME/.local/bin"));
    assert.ok(result.includes("chmod +x"));
    assert.ok(result.includes("ln -sf"));
  });
});

describe("generateGitignore", () => {
  it("should include node_modules", () => {
    const result = generateGitignore();
    assert.ok(result.includes("node_modules/"));
  });
});

describe("generateAgentsEntry", () => {
  it("should generate markdown table", () => {
    const groups = [
      { filename: "tool-a.js", description: "Does A" },
      { filename: "tool-b.js", description: "Does B" },
    ];

    const result = generateAgentsEntry("my-tools", groups);

    assert.ok(result.includes("| Tool | Purpose |"));
    assert.ok(result.includes("| `tool-a.js` | Does A |"));
    assert.ok(result.includes("| `tool-b.js` | Does B |"));
    assert.ok(result.includes("~/agent-tools/my-tools/README.md"));
  });
});
