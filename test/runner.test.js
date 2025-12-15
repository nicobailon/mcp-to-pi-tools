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
  it("should return true for http:// URLs", () => {
    assert.strictEqual(isHttpUrl("http://example.com"), true);
    assert.strictEqual(isHttpUrl("http://127.0.0.1:3845/mcp"), true);
    assert.strictEqual(isHttpUrl("http://localhost:8080"), true);
  });

  it("should return true for https:// URLs", () => {
    assert.strictEqual(isHttpUrl("https://example.com"), true);
    assert.strictEqual(isHttpUrl("https://api.example.com/mcp"), true);
  });

  it("should return false for non-HTTP URLs", () => {
    assert.strictEqual(isHttpUrl("ftp://example.com"), false);
    assert.strictEqual(isHttpUrl("ws://example.com"), false);
    assert.strictEqual(isHttpUrl("file:///path/to/file"), false);
  });

  it("should return false for non-URL strings", () => {
    assert.strictEqual(isHttpUrl("chrome-devtools-mcp"), false);
    assert.strictEqual(isHttpUrl("@scope/package"), false);
    assert.strictEqual(isHttpUrl("example.com"), false);
  });

  it("should return false for null/undefined", () => {
    assert.strictEqual(isHttpUrl(null), false);
    assert.strictEqual(isHttpUrl(undefined), false);
    assert.strictEqual(isHttpUrl(""), false);
  });
});

describe("isLocalhost", () => {
  it("should return true for localhost", () => {
    assert.strictEqual(isLocalhost("http://localhost:3845/mcp"), true);
    assert.strictEqual(isLocalhost("https://localhost/api"), true);
    assert.strictEqual(isLocalhost("http://localhost"), true);
  });

  it("should return true for 127.0.0.1", () => {
    assert.strictEqual(isLocalhost("http://127.0.0.1:3845/mcp"), true);
    assert.strictEqual(isLocalhost("https://127.0.0.1/api"), true);
    assert.strictEqual(isLocalhost("http://127.0.0.1"), true);
  });

  it("should return true for IPv4 loopback range (127.x.x.x)", () => {
    assert.strictEqual(isLocalhost("http://127.0.0.2:8080"), true);
    assert.strictEqual(isLocalhost("http://127.255.255.255"), true);
    assert.strictEqual(isLocalhost("http://127.1.2.3:3000/api"), true);
  });

  it("should return true for IPv6 loopback", () => {
    assert.strictEqual(isLocalhost("http://[::1]:8080"), true);
  });

  it("should return false for external hosts", () => {
    assert.strictEqual(isLocalhost("http://example.com"), false);
    assert.strictEqual(isLocalhost("https://api.example.com/mcp"), false);
    assert.strictEqual(isLocalhost("http://192.168.1.1:8080"), false);
  });

  it("should return false for localhost-like malicious URLs", () => {
    // Security: prevent localhost.evil.com attacks
    assert.strictEqual(isLocalhost("http://localhost.evil.com"), false);
    assert.strictEqual(isLocalhost("http://localhost.attacker.com/mcp"), false);
    assert.strictEqual(isLocalhost("http://127.0.0.1.evil.com"), false);
  });

  it("should return false for null/undefined/invalid", () => {
    assert.strictEqual(isLocalhost(null), false);
    assert.strictEqual(isLocalhost(undefined), false);
    assert.strictEqual(isLocalhost(""), false);
    assert.strictEqual(isLocalhost("not-a-url"), false);
  });
});

describe("normalizeHttpUrl", () => {
  it("should normalize URLs with trailing slashes", () => {
    assert.strictEqual(
      normalizeHttpUrl("http://127.0.0.1:3845/mcp/"),
      "http://127.0.0.1:3845/mcp"
    );
    assert.strictEqual(
      normalizeHttpUrl("https://api.example.com/api/"),
      "https://api.example.com/api"
    );
  });

  it("should preserve root path slash", () => {
    const result = normalizeHttpUrl("http://127.0.0.1:3845/");
    assert.ok(result.endsWith("/") || result === "http://127.0.0.1:3845/");
  });

  it("should preserve URLs without trailing slash", () => {
    assert.strictEqual(
      normalizeHttpUrl("http://127.0.0.1:3845/mcp"),
      "http://127.0.0.1:3845/mcp"
    );
  });

  it("should throw for non-HTTP URLs", () => {
    assert.throws(
      () => normalizeHttpUrl("ftp://example.com"),
      /Invalid HTTP URL/
    );
    assert.throws(
      () => normalizeHttpUrl("chrome-devtools-mcp"),
      /Invalid HTTP URL/
    );
  });

  it("should throw for null/undefined", () => {
    assert.throws(() => normalizeHttpUrl(null), /Invalid HTTP URL/);
    assert.throws(() => normalizeHttpUrl(undefined), /Invalid HTTP URL/);
  });
});

describe("shellEscape", () => {
  it("should wrap simple strings in single quotes", () => {
    assert.strictEqual(shellEscape("hello"), "'hello'");
    assert.strictEqual(shellEscape("http://localhost:3845/mcp"), "'http://localhost:3845/mcp'");
  });

  it("should escape internal single quotes", () => {
    assert.strictEqual(shellEscape("it's"), "'it'\\''s'");
    assert.strictEqual(shellEscape("foo'bar"), "'foo'\\''bar'");
  });

  it("should handle empty/null values", () => {
    assert.strictEqual(shellEscape(""), "''");
    assert.strictEqual(shellEscape(null), "''");
    assert.strictEqual(shellEscape(undefined), "''");
  });

  it("should prevent command injection", () => {
    // These should be safely escaped
    const malicious1 = "$(whoami)";
    const malicious2 = "`id`";
    const malicious3 = "test; rm -rf /";

    assert.strictEqual(shellEscape(malicious1), "'$(whoami)'");
    assert.strictEqual(shellEscape(malicious2), "'`id`'");
    assert.strictEqual(shellEscape(malicious3), "'test; rm -rf /'");
  });
});

describe("isValidServerName", () => {
  it("should return true for valid names", () => {
    assert.strictEqual(isValidServerName("figma"), true);
    assert.strictEqual(isValidServerName("chrome-devtools"), true);
    assert.strictEqual(isValidServerName("my_server"), true);
    assert.strictEqual(isValidServerName("api.example"), true);
    assert.strictEqual(isValidServerName("Server123"), true);
  });

  it("should return false for names with shell metacharacters", () => {
    assert.strictEqual(isValidServerName("test;rm"), false);
    assert.strictEqual(isValidServerName("$(whoami)"), false);
    assert.strictEqual(isValidServerName("`id`"), false);
    assert.strictEqual(isValidServerName("foo bar"), false);
    assert.strictEqual(isValidServerName("test|cat"), false);
    assert.strictEqual(isValidServerName("test&bg"), false);
  });

  it("should return false for null/undefined/empty", () => {
    assert.strictEqual(isValidServerName(null), false);
    assert.strictEqual(isValidServerName(undefined), false);
    assert.strictEqual(isValidServerName(""), false);
  });
});

describe("escapeTemplateLiteral", () => {
  it("should escape backticks", () => {
    assert.strictEqual(escapeTemplateLiteral("hello`world"), "hello\\`world");
    assert.strictEqual(escapeTemplateLiteral("`test`"), "\\`test\\`");
  });

  it("should escape template interpolation sequences", () => {
    assert.strictEqual(escapeTemplateLiteral("${whoami}"), "\\${whoami}");
    assert.strictEqual(escapeTemplateLiteral("hello${name}world"), "hello\\${name}world");
    assert.strictEqual(escapeTemplateLiteral("${a}${b}"), "\\${a}\\${b}");
  });

  it("should escape backslashes", () => {
    assert.strictEqual(escapeTemplateLiteral("path\\to\\file"), "path\\\\to\\\\file");
    assert.strictEqual(escapeTemplateLiteral("\\n"), "\\\\n");
  });

  it("should handle combined metacharacters", () => {
    // URL with backticks and ${} should be fully escaped
    const malicious = "http://evil.com/`${process.env.SECRET}`";
    const escaped = escapeTemplateLiteral(malicious);
    assert.strictEqual(escaped, "http://evil.com/\\`\\${process.env.SECRET}\\`");
  });

  it("should handle empty/null values", () => {
    assert.strictEqual(escapeTemplateLiteral(""), "");
    assert.strictEqual(escapeTemplateLiteral(null), "");
    assert.strictEqual(escapeTemplateLiteral(undefined), "");
  });

  it("should preserve normal URLs", () => {
    const url = "http://127.0.0.1:3845/mcp";
    assert.strictEqual(escapeTemplateLiteral(url), url);

    const httpsUrl = "https://api.example.com/path?query=value";
    assert.strictEqual(escapeTemplateLiteral(httpsUrl), httpsUrl);
  });

  it("should produce valid JavaScript when embedded in template literal", () => {
    const maliciousUrl = "http://evil.com/`${process.exit(1)}`";
    const escaped = escapeTemplateLiteral(maliciousUrl);

    // The escaped string should be safe to embed in a template literal
    // When evaluated, it should produce the original string, not execute code
    const code = `\`${escaped}\``;
    const result = eval(code);
    assert.strictEqual(result, maliciousUrl);
  });
});

describe("escapeDoubleQuotedString", () => {
  it("should escape double quotes", () => {
    assert.strictEqual(escapeDoubleQuotedString('hello"world'), 'hello\\"world');
    assert.strictEqual(escapeDoubleQuotedString('"test"'), '\\"test\\"');
  });

  it("should escape backslashes", () => {
    assert.strictEqual(escapeDoubleQuotedString("path\\to\\file"), "path\\\\to\\\\file");
  });

  it("should escape newlines", () => {
    assert.strictEqual(escapeDoubleQuotedString("line1\nline2"), "line1\\nline2");
    assert.strictEqual(escapeDoubleQuotedString("a\r\nb"), "a\\r\\nb");
  });

  it("should handle empty/null values", () => {
    assert.strictEqual(escapeDoubleQuotedString(""), "");
    assert.strictEqual(escapeDoubleQuotedString(null), "");
    assert.strictEqual(escapeDoubleQuotedString(undefined), "");
  });

  it("should preserve normal commands", () => {
    const cmd = "npx -y chrome-devtools-mcp@latest";
    assert.strictEqual(escapeDoubleQuotedString(cmd), cmd);
  });

  it("should produce valid JavaScript when embedded in double-quoted string", () => {
    const maliciousCmd = 'npx test "$(whoami)"';
    const escaped = escapeDoubleQuotedString(maliciousCmd);

    // The escaped string should be safe to embed in a double-quoted string
    const code = `"${escaped}"`;
    const result = eval(code);
    assert.strictEqual(result, maliciousCmd);
  });
});
