/**
 * Agent Registration
 * Handles auto-registration of tools to agent config files (AGENTS.md, CLAUDE.md)
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { homedir } from "os";

const LOCAL_FILE_PRIORITY = ["CLAUDE.md", "AGENTS.md"];

/**
 * Resolve path, expanding ~ to home directory
 * @param {string} path - Path that may contain ~
 * @returns {string} - Resolved absolute path
 */
export function resolvePath(path) {
  if (path.startsWith("~/")) {
    return join(homedir(), path.slice(2));
  }
  return path;
}

/**
 * Detect which agent file to use in local directory
 * Checks for existing CLAUDE.md or AGENTS.md, defaults to AGENTS.md
 * @param {string} cwd - Current working directory
 * @returns {string} - Full path to local agent file
 */
export function detectLocalFile(cwd = process.cwd()) {
  for (const filename of LOCAL_FILE_PRIORITY) {
    const fullPath = join(cwd, filename);
    if (existsSync(fullPath)) {
      return fullPath;
    }
  }
  return join(cwd, "AGENTS.md");
}

/**
 * Register entry to a single target file
 * Appends content to the file, creating it if necessary
 * @param {string} targetPath - Path to target file (may contain ~)
 * @param {string} entryContent - Content to append
 * @returns {object} - Result { success, path, error? }
 */
export function registerEntry(targetPath, entryContent) {
  const resolvedPath = resolvePath(targetPath);

  try {
    const dir = dirname(resolvedPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    let existingContent = "";
    if (existsSync(resolvedPath)) {
      existingContent = readFileSync(resolvedPath, "utf-8");
    }

    let separator = "";
    if (existingContent.length > 0) {
      if (existingContent.endsWith("\n\n")) {
        separator = "";
      } else if (existingContent.endsWith("\n")) {
        separator = "\n";
      } else {
        separator = "\n\n";
      }
    }

    const newContent = existingContent + separator + entryContent.trim() + "\n";
    writeFileSync(resolvedPath, newContent, "utf-8");

    return { success: true, path: targetPath };
  } catch (error) {
    return { success: false, path: targetPath, error: error.message };
  }
}

/**
 * Register entry to multiple target files
 * @param {string[]} paths - Array of paths to register to
 * @param {string} entryContent - Content to append
 * @param {object} options - Options
 * @param {boolean} options.quiet - Suppress output
 * @returns {object[]} - Array of results
 */
export function registerToAll(paths, entryContent, options = {}) {
  const { quiet = false } = options;
  const results = [];

  for (const path of paths) {
    const result = registerEntry(path, entryContent);
    results.push(result);

    if (!quiet) {
      if (result.success) {
        console.log(`      Registered: ${path}`);
      } else {
        console.warn(`      Failed to register ${path}: ${result.error}`);
      }
    }
  }

  return results;
}

/**
 * Resolve all registration paths from effective config
 * @param {object} effectiveConfig - Merged config with CLI options
 * @returns {string[]} - Array of resolved paths
 */
export function resolveAllPaths(effectiveConfig) {
  const paths = new Set();

  if (effectiveConfig.registerPaths) {
    for (const p of effectiveConfig.registerPaths) {
      paths.add(p);
    }
  }

  if (effectiveConfig.local) {
    const localPath = detectLocalFile();
    paths.add(localPath);
  }

  return Array.from(paths);
}

/**
 * Get successful registration paths for display
 * @param {object[]} results - Results from registerToAll
 * @returns {string[]} - Array of successfully registered paths
 */
export function getSuccessfulPaths(results) {
  return results.filter((r) => r.success).map((r) => r.path);
}
