/**
 * Test fixtures - validated MCP packages for testing
 *
 * These packages have been verified to work with mcp2cli.
 * Use these in tests and for manual testing.
 */

export const TEST_PACKAGES = {
  // Python package via uvx - fast, 2 tools
  uvx: "mcp-server-time",

  // npm package - Chrome DevTools automation
  npm: "chrome-devtools-mcp@latest",

  // Scoped npm package
  scoped: "@upstash/context7-mcp",
};

// Example package names for unit tests (string parsing)
export const EXAMPLE_PACKAGES = {
  simple: "chrome-devtools-mcp",
  simpleWithVersion: "chrome-devtools-mcp@latest",
  scoped: "@upstash/context7-mcp",
  scopedWithVersion: "@upstash/context7-mcp@1.0.0",
  python: "mcp-server-time",
};
