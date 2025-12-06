/**
 * Shell Config Manager
 * Handles auto-configuration of PATH in shell config files (.zshrc, .bashrc)
 */

import { existsSync, readFileSync, appendFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";

const PATH_EXPORT = 'export PATH="$HOME/agent-tools/bin:$PATH"';
const COMMENT = "# Agent tools (mcp-to-pi-tools generated commands)";

/**
 * Detect current shell from environment
 * @returns {string} - "zsh", "bash", or "unknown"
 */
export function detectShell() {
  const shell = process.env.SHELL || "";
  if (shell.includes("zsh")) return "zsh";
  if (shell.includes("bash")) return "bash";
  return "unknown";
}

/**
 * Get path to shell config file based on detected shell
 * @returns {string|null} - Path to config file or null if unknown shell
 */
export function getShellConfigPath() {
  const shell = detectShell();
  if (shell === "zsh") return join(homedir(), ".zshrc");
  if (shell === "bash") return join(homedir(), ".bashrc");
  return null;
}

/**
 * Check if PATH is already configured in shell config
 * @param {string} configPath - Path to shell config file
 * @returns {boolean}
 */
export function isPathConfigured(configPath) {
  if (!configPath || !existsSync(configPath)) return false;
  const content = readFileSync(configPath, "utf-8");
  return content.includes("agent-tools/bin");
}

/**
 * Add PATH export to shell config file
 * @param {string} configPath - Path to shell config file
 * @returns {object} - Result with success, action, and optional error
 */
export function addPathToShellConfig(configPath) {
  if (!configPath) {
    return { success: false, error: "Unknown shell - cannot configure PATH" };
  }

  if (isPathConfigured(configPath)) {
    return { success: true, action: "exists", configPath };
  }

  try {
    appendFileSync(configPath, `\n${COMMENT}\n${PATH_EXPORT}\n`);
    return { success: true, action: "added", configPath };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Configure shell PATH if needed
 * @returns {object} - Result with success, action, configPath, and optional error
 */
export function ensurePathConfigured() {
  const configPath = getShellConfigPath();
  return addPathToShellConfig(configPath);
}
