import { describe, it } from "node:test";
import assert from "node:assert";
import {
  buildMcpCommand,
  detectRunner,
  toModuleName,
  getRunnerNames,
  RUNNERS,
  stripVersion,
  extractFirstParagraph,
  fetchPackageDescription,
  isHttpUrl,
  isLocalhost,
  normalizeHttpUrl,
  shellEscape,
  isValidServerName,
  escapeTemplateLiteral,
  escapeDoubleQuotedString,
} from "../lib/runner.js";
import { EXAMPLE_PACKAGES } from "./fixtures.js";

describe("toModuleName", () => {
  it("should convert hyphens to underscores", () => {
    assert.strictEqual(toModuleName(EXAMPLE_PACKAGES.python), "mcp_server_time");
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
      buildMcpCommand(EXAMPLE_PACKAGES.simple),
      "npx -y chrome-devtools-mcp@latest"
    );
  });

  it("should preserve version if specified", () => {
    assert.strictEqual(
      buildMcpCommand(EXAMPLE_PACKAGES.scopedWithVersion),
      "npx -y @upstash/context7-mcp@1.0.0"
    );
  });

  it("should build uvx command when uvx option is set", () => {
    assert.strictEqual(
      buildMcpCommand(EXAMPLE_PACKAGES.python, { uvx: true }),
      "uvx mcp-server-time"
    );
  });

  it("should build pip command with module name conversion", () => {
    assert.strictEqual(
      buildMcpCommand(EXAMPLE_PACKAGES.python, { pip: true }),
      "python -m mcp_server_time"
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
      buildMcpCommand(EXAMPLE_PACKAGES.python, { runner: "uvx" }),
      "uvx mcp-server-time"
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

describe("stripVersion", () => {
  it("should strip version from simple package", () => {
    assert.strictEqual(stripVersion(EXAMPLE_PACKAGES.simpleWithVersion), "chrome-devtools-mcp");
  });

  it("should keep scoped package without version", () => {
    assert.strictEqual(stripVersion(EXAMPLE_PACKAGES.scoped), "@upstash/context7-mcp");
  });

  it("should strip version from scoped package", () => {
    assert.strictEqual(stripVersion(EXAMPLE_PACKAGES.scopedWithVersion), "@upstash/context7-mcp");
  });

  it("should handle plain package name", () => {
    assert.strictEqual(stripVersion("fetch"), "fetch");
  });

  it("should handle @latest suffix", () => {
    assert.strictEqual(stripVersion(EXAMPLE_PACKAGES.simpleWithVersion), "chrome-devtools-mcp");
  });
});

describe("extractFirstParagraph", () => {
  it("should extract first paragraph after title", () => {
    const readme = `# My Package

This is the first paragraph of the README.

## Features
- Feature 1`;
    assert.strictEqual(extractFirstParagraph(readme), "This is the first paragraph of the README.");
  });

  it("should skip badges", () => {
    const readme = `# My Package

[![Build Status](https://img.shields.io/badge/build-passing.svg)](https://example.com)
![Coverage](https://img.shields.io/badge/coverage-100.svg)

This is the actual first paragraph.`;
    assert.strictEqual(extractFirstParagraph(readme), "This is the actual first paragraph.");
  });

  it("should handle multi-line paragraphs", () => {
    const readme = `# Title

This is a paragraph that
spans multiple lines
in the source.

## Next section`;
    assert.strictEqual(extractFirstParagraph(readme), "This is a paragraph that spans multiple lines in the source.");
  });

  it("should return undefined for empty readme", () => {
    assert.strictEqual(extractFirstParagraph(""), undefined);
    assert.strictEqual(extractFirstParagraph(null), undefined);
  });

  it("should return undefined for readme with only headings", () => {
    const readme = `# Title

## Section 1

## Section 2`;
    assert.strictEqual(extractFirstParagraph(readme), undefined);
  });
});

describe("fetchPackageDescription", () => {
  it("should return undefined for custom runner", async () => {
    const result = await fetchPackageDescription("anything", "custom");
    assert.strictEqual(result, undefined);
  });

  it("should return undefined for unknown runner", async () => {
    const result = await fetchPackageDescription("anything", "unknown");
    assert.strictEqual(result, undefined);
  });
});

describe("isHttpUrl", () => {
  it("should return true for http URLs", () => {
    assert.strictEqual(isHttpUrl("http://localhost:3000"), true);
    assert.strictEqual(isHttpUrl("http://127.0.0.1:8080/mcp"), true);
  });

  it("should return true for https URLs", () => {
    assert.strictEqual(isHttpUrl("https://example.com/mcp"), true);
    assert.strictEqual(isHttpUrl("https://api.figma.com:443/mcp"), true);
  });

  it("should return false for non-http schemes", () => {
    assert.strictEqual(isHttpUrl("ftp://example.com"), false);
    assert.strictEqual(isHttpUrl("file:///path/to/file"), false);
    assert.strictEqual(isHttpUrl("ws://localhost:3000"), false);
  });

  it("should return false for invalid URLs", () => {
    assert.strictEqual(isHttpUrl("not a url"), false);
    assert.strictEqual(isHttpUrl(""), false);
    assert.strictEqual(isHttpUrl(null), false);
    assert.strictEqual(isHttpUrl(undefined), false);
  });
});

describe("isLocalhost", () => {
  it("should return true for localhost", () => {
    assert.strictEqual(isLocalhost("http://localhost:3000"), true);
    assert.strictEqual(isLocalhost("https://localhost/mcp"), true);
  });

  it("should return true for 127.x.x.x addresses", () => {
    assert.strictEqual(isLocalhost("http://127.0.0.1:8080"), true);
    assert.strictEqual(isLocalhost("http://127.0.0.2:3000"), true);
    assert.strictEqual(isLocalhost("http://127.255.255.255:80"), true);
  });

  it("should return true for IPv6 localhost", () => {
    assert.strictEqual(isLocalhost("http://[::1]:3000"), true);
    assert.strictEqual(isLocalhost("http://[::1]:8080"), true);
  });

  it("should reject spoofed localhost hostnames", () => {
    assert.strictEqual(isLocalhost("http://localhost.evil.com"), false);
    assert.strictEqual(isLocalhost("http://localhost.attacker.net:3000"), false);
    assert.strictEqual(isLocalhost("http://notlocalhost:3000"), false);
  });

  it("should return false for non-localhost addresses", () => {
    assert.strictEqual(isLocalhost("http://192.168.1.1:3000"), false);
    assert.strictEqual(isLocalhost("https://example.com"), false);
    assert.strictEqual(isLocalhost("http://10.0.0.1:8080"), false);
  });

  it("should return false for invalid input", () => {
    assert.strictEqual(isLocalhost("not a url"), false);
    assert.strictEqual(isLocalhost(""), false);
    assert.strictEqual(isLocalhost(null), false);
    assert.strictEqual(isLocalhost(undefined), false);
  });
});

describe("normalizeHttpUrl", () => {
  it("should remove trailing slashes", () => {
    assert.strictEqual(normalizeHttpUrl("http://localhost:3000/"), "http://localhost:3000");
    assert.strictEqual(normalizeHttpUrl("https://example.com/mcp/"), "https://example.com/mcp");
    assert.strictEqual(normalizeHttpUrl("http://127.0.0.1:8080///"), "http://127.0.0.1:8080");
  });

  it("should not modify URLs without trailing slashes", () => {
    assert.strictEqual(normalizeHttpUrl("http://localhost:3000"), "http://localhost:3000");
    assert.strictEqual(normalizeHttpUrl("https://example.com/mcp"), "https://example.com/mcp");
  });

  it("should throw for non-HTTP URLs", () => {
    assert.throws(() => normalizeHttpUrl("ftp://example.com"), /Invalid HTTP URL/);
    assert.throws(() => normalizeHttpUrl("not a url"), /Invalid HTTP URL/);
    assert.throws(() => normalizeHttpUrl(""), /Invalid HTTP URL/);
  });
});

describe("shellEscape", () => {
  it("should wrap simple strings in single quotes", () => {
    assert.strictEqual(shellEscape("hello"), "'hello'");
    assert.strictEqual(shellEscape("simple string"), "'simple string'");
  });

  it("should escape internal single quotes", () => {
    assert.strictEqual(shellEscape("it's"), "'it'\\''s'");
    assert.strictEqual(shellEscape("test'quote"), "'test'\\''quote'");
  });

  it("should handle command injection attempts", () => {
    assert.strictEqual(shellEscape("; rm -rf /"), "'; rm -rf /'");
    assert.strictEqual(shellEscape("$(whoami)"), "'$(whoami)'");
    assert.strictEqual(shellEscape("`id`"), "'`id`'");
    assert.strictEqual(shellEscape("foo && bar"), "'foo && bar'");
  });

  it("should handle null and undefined", () => {
    assert.strictEqual(shellEscape(null), "''");
    assert.strictEqual(shellEscape(undefined), "''");
  });

  it("should handle empty string", () => {
    assert.strictEqual(shellEscape(""), "''");
  });
});

describe("isValidServerName", () => {
  it("should accept valid server names", () => {
    assert.strictEqual(isValidServerName("figma"), true);
    assert.strictEqual(isValidServerName("my-server"), true);
    assert.strictEqual(isValidServerName("server_name"), true);
    assert.strictEqual(isValidServerName("Server123"), true);
  });

  it("should reject shell metacharacters", () => {
    assert.strictEqual(isValidServerName("server;rm"), false);
    assert.strictEqual(isValidServerName("$(whoami)"), false);
    assert.strictEqual(isValidServerName("foo && bar"), false);
    assert.strictEqual(isValidServerName("test`id`"), false);
    assert.strictEqual(isValidServerName("name|cat"), false);
  });

  it("should reject special characters", () => {
    assert.strictEqual(isValidServerName("server.name"), false);
    assert.strictEqual(isValidServerName("server/name"), false);
    assert.strictEqual(isValidServerName("server name"), false);
    assert.strictEqual(isValidServerName("server@name"), false);
  });

  it("should reject empty or invalid input", () => {
    assert.strictEqual(isValidServerName(""), false);
    assert.strictEqual(isValidServerName(null), false);
    assert.strictEqual(isValidServerName(undefined), false);
  });

  it("should reject overly long names", () => {
    assert.strictEqual(isValidServerName("a".repeat(129)), false);
    assert.strictEqual(isValidServerName("a".repeat(128)), true);
  });
});

describe("escapeTemplateLiteral", () => {
  it("should escape backticks", () => {
    assert.strictEqual(escapeTemplateLiteral("hello`world"), "hello\\`world");
    assert.strictEqual(escapeTemplateLiteral("`test`"), "\\`test\\`");
  });

  it("should escape template interpolation", () => {
    assert.strictEqual(escapeTemplateLiteral("${foo}"), "\\${foo}");
    assert.strictEqual(escapeTemplateLiteral("value: ${x}"), "value: \\${x}");
  });

  it("should escape backslashes", () => {
    assert.strictEqual(escapeTemplateLiteral("path\\to\\file"), "path\\\\to\\\\file");
  });

  it("should handle combined escaping", () => {
    assert.strictEqual(escapeTemplateLiteral("\\`${x}`"), "\\\\\\`\\${x}\\`");
  });

  it("should handle null and undefined", () => {
    assert.strictEqual(escapeTemplateLiteral(null), "");
    assert.strictEqual(escapeTemplateLiteral(undefined), "");
  });
});

describe("escapeDoubleQuotedString", () => {
  it("should escape double quotes", () => {
    assert.strictEqual(escapeDoubleQuotedString('hello "world"'), 'hello \\"world\\"');
  });

  it("should escape backslashes", () => {
    assert.strictEqual(escapeDoubleQuotedString("path\\to\\file"), "path\\\\to\\\\file");
  });

  it("should escape newlines", () => {
    assert.strictEqual(escapeDoubleQuotedString("line1\nline2"), "line1\\nline2");
    assert.strictEqual(escapeDoubleQuotedString("line1\r\nline2"), "line1\\r\\nline2");
  });

  it("should handle combined escaping", () => {
    assert.strictEqual(escapeDoubleQuotedString('test\n"value"\\path'), 'test\\n\\"value\\"\\\\path');
  });

  it("should handle null and undefined", () => {
    assert.strictEqual(escapeDoubleQuotedString(null), "");
    assert.strictEqual(escapeDoubleQuotedString(undefined), "");
  });
});
