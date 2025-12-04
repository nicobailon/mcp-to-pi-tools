/**
 * MCP Server Discovery via mcporter
 * Discovers available tools and their schemas from an MCP server
 */

import { exec, execSync } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

/**
 * Derive server name from package name
 * @param {string} packageName - npm package name
 * @returns {string} - server name for mcporter
 */
export function deriveServerName(packageName) {
  // Remove scope, version, and normalize
  // @anthropic-ai/chrome-devtools-mcp@latest -> chrome-devtools
  // chrome-devtools-mcp -> chrome-devtools
  let name = packageName
    .replace(/^@[^/]+\//, "") // Remove scope
    .replace(/@.*$/, "") // Remove version
    .replace(/-mcp$/, "") // Remove -mcp suffix
    .replace(/^mcp-/, ""); // Remove mcp- prefix

  return name;
}

/**
 * Derive output directory name from package name
 * @param {string} packageName - npm package name
 * @returns {string} - directory name
 */
export function deriveDirName(packageName) {
  return deriveServerName(packageName);
}

/**
 * Build the MCP command for npx execution
 * @param {string} packageName - npm package name
 * @returns {string} - npx command
 */
export function buildMcpCommand(packageName) {
  // Handle various package formats
  // chrome-devtools-mcp -> npx -y chrome-devtools-mcp@latest
  // @anthropic-ai/chrome-devtools-mcp -> npx -y @anthropic-ai/chrome-devtools-mcp@latest
  // @anthropic-ai/chrome-devtools-mcp@1.0.0 -> npx -y @anthropic-ai/chrome-devtools-mcp@1.0.0

  let pkg = packageName;
  if (!pkg.includes("@") || (pkg.startsWith("@") && !pkg.slice(1).includes("@"))) {
    // No version specified, add @latest
    pkg = `${pkg}@latest`;
  }

  return `npx -y ${pkg}`;
}

/**
 * Check if mcporter is available
 * @returns {boolean}
 */
export function checkMcporter() {
  try {
    execSync("npx mcporter --version", {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 30000,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Discover tools from an MCP server
 * @param {string} packageName - npm package name
 * @param {object} options - options
 * @param {boolean} options.quiet - suppress progress output
 * @returns {Promise<{serverName: string, mcpCommand: string, tools: Array}>}
 */
export async function discoverTools(packageName, options = {}) {
  const { quiet = false } = options;

  const serverName = deriveServerName(packageName);
  const mcpCommand = buildMcpCommand(packageName);

  if (!quiet) {
    console.log(`      Server name: ${serverName}`);
    console.log(`      MCP command: ${mcpCommand}`);
  }

  const cmd = `npx mcporter list --stdio "${mcpCommand}" --name ${serverName} --schema --json`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000);

  try {
    const { stdout } = await execAsync(cmd, {
      encoding: "utf-8",
      signal: controller.signal,
      maxBuffer: 10 * 1024 * 1024,
    });

    const data = JSON.parse(stdout);

    if (!data.tools || !Array.isArray(data.tools)) {
      throw new Error("Invalid response from mcporter: missing tools array");
    }

    return {
      serverName,
      mcpCommand,
      tools: data.tools,
    };
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("Discovery timed out after 60 seconds");
    }
    if (error.stderr) {
      throw new Error(`mcporter error: ${error.stderr}`);
    }
    throw new Error(`Discovery failed: ${error.message}`);
  } finally {
    clearTimeout(timeoutId);
  }
}
