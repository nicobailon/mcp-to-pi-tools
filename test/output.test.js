/**
 * Tests for output module
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import { resolvePath } from "../lib/output.js";
import { homedir } from "os";
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
