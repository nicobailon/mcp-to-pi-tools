import { describe, it } from "node:test";
import assert from "node:assert";
import {
  buildMcpCommand,
  detectRunner,
  toModuleName,
  getRunnerNames,
  RUNNERS,
} from "../lib/runner.js";

describe("toModuleName", () => {
  it("should convert hyphens to underscores", () => {
    assert.strictEqual(toModuleName("mcp-server-fetch"), "mcp_server_fetch");
  });

  it("should handle single hyphen", () => {
    assert.strictEqual(toModuleName("mcp-fetch"), "mcp_fetch");
  });

  it("should handle no hyphens", () => {
    assert.strictEqual(toModuleName("fetch"), "fetch");
  });
});

describe("detectRunner", () => {
  it("should default to npx", () => {
    assert.strictEqual(detectRunner(), "npx");
    assert.strictEqual(detectRunner({}), "npx");
  });

  it("should return uvx when uvx option is set", () => {
    assert.strictEqual(detectRunner({ uvx: true }), "uvx");
  });

  it("should return pip when pip option is set", () => {
    assert.strictEqual(detectRunner({ pip: true }), "pip");
  });

  it("should prioritize uvx over pip", () => {
    assert.strictEqual(detectRunner({ uvx: true, pip: true }), "uvx");
  });
});

describe("buildMcpCommand", () => {
  it("should build npx command by default", () => {
    assert.strictEqual(
      buildMcpCommand("chrome-devtools-mcp"),
      "npx -y chrome-devtools-mcp@latest"
    );
  });

  it("should preserve version if specified", () => {
    assert.strictEqual(
      buildMcpCommand("chrome-devtools-mcp@1.0.0"),
      "npx -y chrome-devtools-mcp@1.0.0"
    );
  });

  it("should build uvx command when uvx option is set", () => {
    assert.strictEqual(
      buildMcpCommand("mcp-server-fetch", { uvx: true }),
      "uvx mcp-server-fetch"
    );
  });

  it("should build pip command with module name conversion", () => {
    assert.strictEqual(
      buildMcpCommand("mcp-server-fetch", { pip: true }),
      "python -m mcp_server_fetch"
    );
  });

  it("should use explicit command when provided", () => {
    assert.strictEqual(
      buildMcpCommand("anything", { command: "docker run -i --rm mcp/fetch" }),
      "docker run -i --rm mcp/fetch"
    );
  });

  it("should use runner option override", () => {
    assert.strictEqual(
      buildMcpCommand("mcp-server-fetch", { runner: "uvx" }),
      "uvx mcp-server-fetch"
    );
  });

  it("should throw for unknown runner", () => {
    assert.throws(
      () => buildMcpCommand("pkg", { runner: "invalid" }),
      /Unknown runner: invalid/
    );
  });
});

describe("getRunnerNames", () => {
  it("should return all runner names", () => {
    const names = getRunnerNames();
    assert.ok(names.includes("npx"));
    assert.ok(names.includes("uvx"));
    assert.ok(names.includes("pip"));
  });
});

describe("RUNNERS", () => {
  it("should have correct npx config", () => {
    assert.strictEqual(RUNNERS.npx.cmd, "npx");
    assert.deepStrictEqual(RUNNERS.npx.args, ["-y"]);
    assert.strictEqual(RUNNERS.npx.suffix, "@latest");
  });

  it("should have correct uvx config", () => {
    assert.strictEqual(RUNNERS.uvx.cmd, "uvx");
    assert.deepStrictEqual(RUNNERS.uvx.args, []);
    assert.strictEqual(RUNNERS.uvx.suffix, "");
  });

  it("should have correct pip config", () => {
    assert.strictEqual(RUNNERS.pip.cmd, "python");
    assert.deepStrictEqual(RUNNERS.pip.args, ["-m"]);
    assert.strictEqual(RUNNERS.pip.suffix, "");
    assert.ok(typeof RUNNERS.pip.transform === "function");
  });
});
