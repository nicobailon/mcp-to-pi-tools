/**
 * MCP Server Discovery via mcporter
 * Discovers available tools and their schemas from an MCP server
 */

import { exec, execSync } from "child_process";
import { promisify } from "util";
import { buildMcpCommand as buildCommand, fetchPackageDescription, isLocalhost, normalizeHttpUrl, shellEscape } from "./runner.js";

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
  // Shell-escape serverName for security (defense in depth)
  const cmd = `npx mcporter list --stdio "${mcpCommand}" --name ${shellEscape(serverName)} --schema --json`;
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
 * Try to discover tools from an HTTP endpoint
 * @param {string} httpUrl - HTTP URL to MCP server
 * @param {string} serverName - Server name for mcporter
 * @param {boolean} allowHttp - Allow non-localhost HTTP
 * @param {boolean} quiet - Suppress output
 * @returns {Promise<{tools: Array} | null>}
 */
async function tryDiscoverWithHttp(httpUrl, serverName, allowHttp, quiet) {
  // Normalize URL
  const normalizedUrl = normalizeHttpUrl(httpUrl);

  // Security: non-localhost HTTP requires user's --allow-http consent
  const isLocal = isLocalhost(normalizedUrl);
  const isHttps = normalizedUrl.startsWith("https://");

  if (!isLocal && !isHttps && !allowHttp) {
    throw new Error(
      `Non-localhost HTTP URL requires --allow-http flag for security.\n` +
      `  URL: ${normalizedUrl}\n` +
      `  Use HTTPS or --allow-http to proceed.`
    );
  }

  // mcporter requires --allow-http for ANY http:// URL (even localhost)
  // Only HTTPS doesn't need it
  const needsAllowHttp = !isHttps;
  const allowHttpFlag = needsAllowHttp ? " --allow-http" : "";
  const cmd = `npx mcporter list${allowHttpFlag} --http-url ${shellEscape(normalizedUrl)} --name ${shellEscape(serverName)} --schema --json`;

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

    return { tools: data.tools };
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("HTTP discovery timed out after 60 seconds");
    }
    // Provide clear error messages for common failures
    if (error.message?.includes("ECONNREFUSED")) {
      throw new Error(`Connection refused to ${normalizedUrl}. Is the MCP server running?`);
    }
    if (error.message?.includes("ETIMEDOUT") || error.message?.includes("ENOTFOUND")) {
      throw new Error(`Could not reach ${normalizedUrl}. Check the URL and network connection.`);
    }
    if (error.stderr?.includes("HTTP") && error.stderr?.includes("rejected")) {
      throw new Error(`HTTP request rejected by server at ${normalizedUrl}`);
    }
    // Re-throw with context if it's an unexpected error
    if (error.stderr) {
      throw new Error(`HTTP discovery failed: ${error.stderr.trim()}`);
    }
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Discover tools from an MCP server
 * Supports npm (npx), Python (uvx), pip runners, and HTTP endpoints
 * Fetches package description in parallel with discovery (zero added latency)
 * @param {string} packageName - Package name (or server name for HTTP mode)
 * @param {object} options - options
 * @param {boolean} options.quiet - suppress progress output
 * @param {boolean} options.uvx - Use uvx runner (Python)
 * @param {boolean} options.pip - Use pip runner (python -m)
 * @param {string} options.command - Explicit command override
 * @param {string} options.httpUrl - HTTP URL for MCP endpoint
 * @param {string} options.description - User-provided description (for HTTP mode)
 * @param {boolean} options.allowHttp - Allow non-localhost HTTP URLs
 * @returns {Promise<{serverName: string, mcpCommand?: string, httpUrl?: string, allowHttp?: boolean, tools: Array<{name: string, description?: string, inputSchema?: object}>, runner: string, description: string|undefined}>}
 */
export async function discoverTools(packageName, options = {}) {
  const { quiet = false, uvx, pip, command, httpUrl, description, allowHttp } = options;

  // HTTP mode
  if (httpUrl) {
    const serverName = deriveServerName(packageName);
    const normalizedUrl = normalizeHttpUrl(httpUrl);
    const isHttps = normalizedUrl.startsWith("https://");

    if (!quiet) {
      console.log(`      Server name: ${serverName}`);
      console.log(`      HTTP URL: ${normalizedUrl}`);
    }

    const result = await tryDiscoverWithHttp(normalizedUrl, serverName, allowHttp, quiet);
    if (!result) {
      throw new Error(`HTTP discovery failed for ${normalizedUrl}`);
    }

    // allowHttp in return = whether generated code needs --allow-http flag
    // mcporter needs it for any http:// URL (not https://)
    return {
      serverName,
      httpUrl: normalizedUrl,
      allowHttp: !isHttps,
      tools: result.tools,
      runner: "http",
      description,
    };
  }

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

    return { serverName, mcpCommand, tools: result.tools, runner: "custom", description: undefined };
  }

  if (uvx) {
    const mcpCommand = buildMcpCommand(packageName, { uvx: true });
    if (!quiet) {
      console.log(`      Server name: ${serverName}`);
      console.log(`      MCP command: ${mcpCommand}`);
    }

    const [result, description] = await Promise.all([
      tryDiscoverWithRunner(packageName, serverName, { uvx: true }, quiet),
      fetchPackageDescription(packageName, "uvx"),
    ]);
    if (!result) {
      throw new Error(`Discovery failed with uvx. Is the package available on PyPI?`);
    }

    return { serverName, mcpCommand, tools: result.tools, runner: "uvx", description };
  }

  if (pip) {
    const mcpCommand = buildMcpCommand(packageName, { pip: true });
    if (!quiet) {
      console.log(`      Server name: ${serverName}`);
      console.log(`      MCP command: ${mcpCommand}`);
    }

    const [result, description] = await Promise.all([
      tryDiscoverWithRunner(packageName, serverName, { pip: true }, quiet),
      fetchPackageDescription(packageName, "pip"),
    ]);
    if (!result) {
      throw new Error(`Discovery failed with pip. Is the package installed via pip?`);
    }

    return { serverName, mcpCommand, tools: result.tools, runner: "pip", description };
  }

  if (!quiet) {
    console.log(`      Server name: ${serverName}`);
  }

  const npxCommand = buildMcpCommand(packageName, { runner: "npx" });
  if (!quiet) {
    console.log(`      Trying npm: ${npxCommand}`);
  }

  const [npxResult, npmDescription] = await Promise.all([
    tryDiscoverWithRunner(packageName, serverName, { runner: "npx" }, quiet),
    fetchPackageDescription(packageName, "npx"),
  ]);
  if (npxResult) {
    return { serverName, mcpCommand: npxCommand, tools: npxResult.tools, runner: "npx", description: npmDescription };
  }

  if (!quiet) {
    console.log(`      npm: not found, trying uvx...`);
  }

  const uvxCommand = buildMcpCommand(packageName, { runner: "uvx" });
  const [uvxResult, pypiDescription] = await Promise.all([
    tryDiscoverWithRunner(packageName, serverName, { runner: "uvx" }, quiet),
    fetchPackageDescription(packageName, "uvx"),
  ]);
  if (uvxResult) {
    if (!quiet) {
      console.log(`      uvx: found ${uvxResult.tools.length} tools`);
    }
    return { serverName, mcpCommand: uvxCommand, tools: uvxResult.tools, runner: "uvx", description: pypiDescription };
  }

  throw new Error(
    `Package "${packageName}" not found on npm or PyPI.\n` +
    `  For npm packages, check the package name is correct.\n` +
    `  For Python packages, use: --uvx flag\n` +
    `  For pip-installed packages, use: --pip flag`
  );
}
