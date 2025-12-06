/**
 * Agent Registration
 * Handles auto-registration of tools to agent config files (AGENTS.md, CLAUDE.md)
 * Supports idempotent updates via heading-based detection and registry tracking
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { homedir } from "os";
import { PRESETS, PRESET_PRIORITY } from "./config.js";

const LOCAL_FILE_PRIORITY = ["CLAUDE.md", "AGENTS.md"];
const PRESET_PATHS = new Set(Object.values(PRESETS));
const REGISTRY_DIR = join(homedir(), ".mcp2cli");
const REGISTRY_FILE = join(REGISTRY_DIR, "registry.json");

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
 * Load registry from disk
 * @returns {object} - Registry object with registrations
 */
export function loadRegistry() {
  if (!existsSync(REGISTRY_FILE)) {
    return { registrations: {} };
  }
  try {
    return JSON.parse(readFileSync(REGISTRY_FILE, "utf-8"));
  } catch {
    return { registrations: {} };
  }
}

/**
 * Save registry to disk
 * @param {object} registry - Registry object to save
 */
export function saveRegistry(registry) {
  if (!existsSync(REGISTRY_DIR)) {
    mkdirSync(REGISTRY_DIR, { recursive: true });
  }
  writeFileSync(REGISTRY_FILE, JSON.stringify(registry, null, 2), "utf-8");
}

/**
 * Extract heading from entry content (first ### line)
 * @param {string} content - Entry content
 * @returns {string|null} - Heading line or null
 */
export function extractHeading(content) {
  const match = content.match(/^###\s+.+$/m);
  return match ? match[0] : null;
}

/**
 * Find section by heading in file content
 * Returns boundaries from heading to next ### or EOF
 * @param {string} fileContent - Full file content
 * @param {string} heading - Heading to find (e.g., "### Chrome Devtools Tools")
 * @returns {object|null} - { start, end, content } or null
 */
export function findSectionByHeading(fileContent, heading) {
  const startIndex = fileContent.indexOf(heading);
  if (startIndex === -1) return null;

  const afterHeading = startIndex + heading.length;
  const nextHeadingMatch = fileContent.slice(afterHeading).match(/\n###\s+/);

  let endIndex;
  if (nextHeadingMatch) {
    endIndex = afterHeading + nextHeadingMatch.index;
  } else {
    endIndex = fileContent.length;
  }

  while (endIndex > startIndex && fileContent[endIndex - 1] === "\n") {
    endIndex--;
  }

  return {
    start: startIndex,
    end: endIndex,
    content: fileContent.slice(startIndex, endIndex)
  };
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
 * Register entry to a single target file with idempotent update support
 * @param {string} targetPath - Path to target file (may contain ~)
 * @param {string} entryContent - Content to register
 * @param {string} name - Tool directory name (for registry key)
 * @returns {object} - Result { success, path, action, error? }
 */
export function registerEntry(targetPath, entryContent, name) {
  const resolvedPath = resolvePath(targetPath);
  const heading = extractHeading(entryContent);
  const trimmedContent = entryContent.trim();

  try {
    const dir = dirname(resolvedPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    let existingContent = "";
    if (existsSync(resolvedPath)) {
      existingContent = readFileSync(resolvedPath, "utf-8");
    }

    if (heading) {
      const existing = findSectionByHeading(existingContent, heading);

      if (existing) {
        if (existing.content.trim() === trimmedContent) {
          return { success: true, path: targetPath, action: "unchanged" };
        }

        const newContent =
          existingContent.slice(0, existing.start) +
          trimmedContent +
          existingContent.slice(existing.end);

        writeFileSync(resolvedPath, newContent, "utf-8");
        updateRegistry(name, targetPath);
        return { success: true, path: targetPath, action: "updated" };
      }
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

    const newContent = existingContent + separator + trimmedContent + "\n";
    writeFileSync(resolvedPath, newContent, "utf-8");

    if (heading) {
      updateRegistry(name, targetPath);
    }

    return { success: true, path: targetPath, action: "created" };
  } catch (error) {
    return { success: false, path: targetPath, action: "error", error: error.message };
  }
}

/**
 * Update registry with custom path registration info
 * Only stores non-preset paths (custom --register-path locations)
 * @param {string} name - Tool directory name
 * @param {string} path - Path where registered
 */
function updateRegistry(name, path) {
  if (PRESET_PATHS.has(path)) {
    return;
  }

  const registry = loadRegistry();

  if (!registry.registrations[name]) {
    registry.registrations[name] = {
      customPaths: [],
      lastUpdated: new Date().toISOString()
    };
  }

  const entry = registry.registrations[name];
  if (!entry.customPaths) {
    entry.customPaths = entry.paths || [];
    delete entry.paths;
    delete entry.heading;
  }
  if (!entry.customPaths.includes(path)) {
    entry.customPaths.push(path);
  }
  entry.lastUpdated = new Date().toISOString();

  saveRegistry(registry);
}

/**
 * Register entry to multiple target files
 * @param {string[]} paths - Array of paths to register to
 * @param {string} entryContent - Content to register
 * @param {string} name - Tool directory name (for registry)
 * @param {object} options - Options
 * @param {boolean} options.quiet - Suppress output
 * @returns {object[]} - Array of results
 */
export function registerToAll(paths, entryContent, name, options = {}) {
  const { quiet = false } = options;
  const results = [];

  for (const path of paths) {
    const result = registerEntry(path, entryContent, name);
    results.push(result);

    if (!quiet) {
      const actionLabels = {
        created: "Registered",
        updated: "Updated",
        unchanged: "Already registered",
        error: "Failed"
      };
      const label = actionLabels[result.action] || "Registered";

      if (result.action === "error") {
        console.warn(`      ${label} ${path}: ${result.error}`);
      } else {
        console.log(`      ${label}: ${path}`);
      }
    }
  }

  return results;
}

/**
 * Resolve all registration paths from effective config
 * Uses fallback chain if no explicit paths specified:
 * - First existing preset in priority order (default)
 * - All existing presets (if allPresets is true)
 * @param {object} effectiveConfig - Merged config with CLI options
 * @returns {string[]} - Array of resolved paths
 */
export function resolveAllPaths(effectiveConfig) {
  const paths = new Set();

  if (effectiveConfig.registerPaths && effectiveConfig.registerPaths.length > 0) {
    for (const p of effectiveConfig.registerPaths) {
      paths.add(p);
    }
  } else if (effectiveConfig.allPresets) {
    for (const presetPath of PRESET_PRIORITY) {
      if (existsSync(resolvePath(presetPath))) {
        paths.add(presetPath);
      }
    }
  } else {
    for (const presetPath of PRESET_PRIORITY) {
      if (existsSync(resolvePath(presetPath))) {
        paths.add(presetPath);
        break;
      }
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

export function unregisterEntry(targetPath, heading) {
  const resolvedPath = resolvePath(targetPath);
  if (!existsSync(resolvedPath)) return { success: true, action: "not_found" };

  try {
    const content = readFileSync(resolvedPath, "utf-8");
    const section = findSectionByHeading(content, heading);
    if (!section) return { success: true, action: "not_found" };

    const newContent = (content.slice(0, section.start) + content.slice(section.end))
      .replace(/\n{3,}/g, "\n\n").trim() + "\n";
    writeFileSync(resolvedPath, newContent, "utf-8");
    return { success: true, action: "removed" };
  } catch (error) {
    return { success: false, action: "error", error: error.message };
  }
}

export function removeFromRegistry(name) {
  const registry = loadRegistry();
  if (registry.registrations[name]) {
    delete registry.registrations[name];
    saveRegistry(registry);
  }
}
