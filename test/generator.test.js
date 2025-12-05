/**
 * Tests for generator module
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import {
  generatePackageJson,
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

describe("generateGitignore", () => {
  it("should include node_modules", () => {
    const result = generateGitignore();
    assert.ok(result.includes("node_modules/"));
  });
});

describe("generateAgentsEntry", () => {
  it("should generate tool entry with description", () => {
    const groups = [
      { filename: "tool-a.js", description: "Does A" },
      { filename: "tool-b.js", description: "Does B" },
    ];

    const result = generateAgentsEntry("my-tools", groups);

    assert.ok(result.includes("### My Tools Tools"));
    assert.ok(result.includes("**Tools:** `tool-a.js`, `tool-b.js`"));
    assert.ok(result.includes("~/agent-tools/my-tools/README.md"));
    assert.ok(result.includes("Tools for My Tools operations."));
  });

  it("should use package description when provided", () => {
    const groups = [{ filename: "fetch.js", description: "Fetch URL" }];
    const packageDescription = "A powerful web fetching tool.";

    const result = generateAgentsEntry("fetch", groups, packageDescription);

    assert.ok(result.includes("A powerful web fetching tool."));
    assert.ok(!result.includes("Tools for Fetch operations."));
  });
});
