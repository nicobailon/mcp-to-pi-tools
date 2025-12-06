/**
 * Configuration Manager
 * Handles loading config from ~/agent-tools/mcp2cli.settings.json and CLI options
 */

import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";

const CONFIG_PATH = join(homedir(), "agent-tools", "mcp2cli.settings.json");

const DEFAULT_CONFIG = {
  register: true,
  registerPaths: [],
  symlink: true,
  symlinkDir: "~/agent-tools/bin",
};

export const PRESETS = {
  pi: "~/.pi/agent/AGENTS.md",
  claude: "~/.claude/CLAUDE.md",
  gemini: "~/.gemini/AGENTS.md",
  codex: "~/.codex/AGENTS.md",
};

export const PRESET_PRIORITY = [
  "~/.pi/agent/AGENTS.md",
  "~/.claude/CLAUDE.md",
  "~/.codex/AGENTS.md",
  "~/.gemini/AGENTS.md",
];

/**
 * Load config from file, merging with defaults
 * @returns {object} - Config object
 */
export function loadConfig() {
  if (!existsSync(CONFIG_PATH)) {
    return { ...DEFAULT_CONFIG };
  }

  try {
    const content = readFileSync(CONFIG_PATH, "utf-8");
    const fileConfig = JSON.parse(content);
    return {
      ...DEFAULT_CONFIG,
      ...fileConfig,
    };
  } catch (error) {
    console.warn(`Warning: Failed to parse config file: ${error.message}`);
    return { ...DEFAULT_CONFIG };
  }
}

/**
 * Resolve preset name to path
 * @param {string} name - Preset name (pi, claude, gemini, codex)
 * @returns {string|null} - Path or null if not found
 */
export function resolvePreset(name) {
  return PRESETS[name.toLowerCase()] || null;
}

/**
 * Get all available preset names
 * @returns {string[]} - Array of preset names
 */
export function getPresetNames() {
  return Object.keys(PRESETS);
}

/**
 * Merge config with CLI options (CLI takes precedence)
 * @param {object} config - Loaded config
 * @param {object} options - CLI options
 * @returns {object} - Merged effective config
 */
export function mergeWithCli(config, options) {
  const effective = { ...config };

  if (options.register === false) {
    effective.register = false;
  }

  const paths = new Set();

  if (options.registerPaths && options.registerPaths.length > 0) {
    options.registerPaths.forEach((p) => paths.add(p));
  }

  if (options.presets && options.presets.length > 0) {
    for (const preset of options.presets) {
      const path = resolvePreset(preset);
      if (path) {
        paths.add(path);
      } else {
        console.warn(`Warning: Unknown preset "${preset}". Available: ${getPresetNames().join(", ")}`);
      }
    }
  }

  if (paths.size > 0) {
    effective.registerPaths = Array.from(paths);
  }

  effective.local = options.local || false;
  effective.allPresets = options.allPresets || false;

  if (options.symlink === false) {
    effective.symlink = false;
  }
  if (options.symlinkDir) {
    effective.symlinkDir = options.symlinkDir;
  }
  if (options.forceSymlink) {
    effective.forceSymlink = true;
  }

  return effective;
}

/**
 * Get config file path (for display/help)
 * @returns {string}
 */
export function getConfigPath() {
  return CONFIG_PATH;
}
