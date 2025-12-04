/**
 * MCP Server Discovery via mcporter
 * Discovers available tools and their schemas from an MCP server
 */

import { exec, execSync } from "child_process";
import { promisify } from "util";
import { buildMcpCommand as buildCommand } from "./runner.js";

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
 * Build the MCP command for execution
 * Delegates to runner module for multi-runner support
 * @param {string} packageName - Package name
 * @param {object} options - Options
 * @param {string} options.command - Explicit command override
 * @param {boolean} options.uvx - Use uvx runner
 * @param {boolean} options.pip - Use pip runner
 * @param {string} options.runner - Runner name override
 * @returns {string} - Command string
 */
export function buildMcpCommand(packageName, options = {}) {
  return buildCommand(packageName, options);
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
 * Try to discover tools with a specific runner
 * @param {string} packageName - Package name
 * @param {string} serverName - Server name
 * @param {object} runnerOptions - Runner options
 * @param {boolean} quiet - Suppress output
 * @returns {Promise<{mcpCommand: string, tools: Array} | null>}
 */
async function tryDiscoverWithRunner(packageName, serverName, runnerOptions, quiet) {
  const mcpCommand = buildMcpCommand(packageName, runnerOptions);
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
      return null;
    }

    return { mcpCommand, tools: data.tools };
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("Discovery timed out after 60 seconds");
    }
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Discover tools from an MCP server
 * Supports npm (npx), Python (uvx), and pip runners with auto-fallback
 * @param {string} packageName - Package name
 * @param {object} options - options
 * @param {boolean} options.quiet - suppress progress output
 * @param {boolean} options.uvx - Use uvx runner (Python)
 * @param {boolean} options.pip - Use pip runner (python -m)
 * @param {string} options.command - Explicit command override
 * @returns {Promise<{serverName: string, mcpCommand: string, tools: Array, runner: string}>}
 */
export async function discoverTools(packageName, options = {}) {
  const { quiet = false, uvx, pip, command } = options;

  const serverName = deriveServerName(packageName);

  if (command) {
    const mcpCommand = command;
    if (!quiet) {
      console.log(`      Server name: ${serverName}`);
      console.log(`      MCP command: ${mcpCommand} (custom)`);
    }

    const result = await tryDiscoverWithRunner(packageName, serverName, { command }, quiet);
    if (!result) {
      throw new Error(`Discovery failed with custom command: ${command}`);
    }

    return { serverName, mcpCommand, tools: result.tools, runner: "custom" };
  }

  if (uvx) {
    const mcpCommand = buildMcpCommand(packageName, { uvx: true });
    if (!quiet) {
      console.log(`      Server name: ${serverName}`);
      console.log(`      MCP command: ${mcpCommand}`);
    }

    const result = await tryDiscoverWithRunner(packageName, serverName, { uvx: true }, quiet);
    if (!result) {
      throw new Error(`Discovery failed with uvx. Is the package available on PyPI?`);
    }

    return { serverName, mcpCommand, tools: result.tools, runner: "uvx" };
  }

  if (pip) {
    const mcpCommand = buildMcpCommand(packageName, { pip: true });
    if (!quiet) {
      console.log(`      Server name: ${serverName}`);
      console.log(`      MCP command: ${mcpCommand}`);
    }

    const result = await tryDiscoverWithRunner(packageName, serverName, { pip: true }, quiet);
    if (!result) {
      throw new Error(`Discovery failed with pip. Is the package installed via pip?`);
    }

    return { serverName, mcpCommand, tools: result.tools, runner: "pip" };
  }

  if (!quiet) {
    console.log(`      Server name: ${serverName}`);
  }

  const npxCommand = buildMcpCommand(packageName, { runner: "npx" });
  if (!quiet) {
    console.log(`      Trying npm: ${npxCommand}`);
  }

  const npxResult = await tryDiscoverWithRunner(packageName, serverName, { runner: "npx" }, quiet);
  if (npxResult) {
    return { serverName, mcpCommand: npxCommand, tools: npxResult.tools, runner: "npx" };
  }

  if (!quiet) {
    console.log(`      npm: not found, trying uvx...`);
  }

  const uvxCommand = buildMcpCommand(packageName, { runner: "uvx" });
  const uvxResult = await tryDiscoverWithRunner(packageName, serverName, { runner: "uvx" }, quiet);
  if (uvxResult) {
    if (!quiet) {
      console.log(`      uvx: found ${uvxResult.tools.length} tools`);
    }
    return { serverName, mcpCommand: uvxCommand, tools: uvxResult.tools, runner: "uvx" };
  }

  throw new Error(
    `Package "${packageName}" not found on npm or PyPI.\n` +
    `  For npm packages, check the package name is correct.\n` +
    `  For Python packages, try: mcp2cli ${packageName} --uvx\n` +
    `  For pip-installed packages, try: mcp2cli ${packageName} --pip`
  );
}
