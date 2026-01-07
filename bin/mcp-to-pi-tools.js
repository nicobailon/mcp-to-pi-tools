#!/usr/bin/env node

/**
 * mcp-to-pi-tools - Convert MCP servers into tools for AI agents
 *
 * Commands:
 *   mcp2ext <package>  - Generate pi extension (recommended)
 *   mcp2cli <package>  - Generate CLI wrapper scripts (legacy)
 *
 * Powered by mcporter.
 */

import { basename } from "path";
import { checkMcporter, discoverTools, deriveDirName } from "../lib/discovery.js";
import { groupTools, groupToolsForExtension, fallbackGrouping, fallbackGroupingForExtension } from "../lib/grouping.js";
import {
  generateWrapper,
  generatePackageJson,
  generateReadme,
  generateAgentsEntry,
  generateBasicReadme,
  validateParameterCoverage,
} from "../lib/generator.js";
import { generateExtensionFiles } from "../lib/extension-generator.js";
import { writeOutput, outputExists, printSuccess, printExtensionSuccess } from "../lib/output.js";
import { loadConfig, mergeWithCli, getConfigPath } from "../lib/config.js";
import { registerToAll, resolveAllPaths, getSuccessfulPaths } from "../lib/registration.js";
import { createSymlinks, getDefaultSymlinkDir } from "../lib/symlink.js";
import { ensurePathConfigured } from "../lib/shell-config.js";
import { execSync } from "child_process";
import { createInterface } from "readline";
import { homedir } from "os";
import { join } from "path";

// Exit codes per spec
const EXIT_SUCCESS = 0;
const EXIT_ERROR = 1;
const EXIT_INVALID_ARGS = 2;
const EXIT_DISCOVERY_FAILED = 3;
const EXIT_GENERATION_FAILED = 4;
const EXIT_OUTPUT_FAILED = 5;

// Default output directories
const DEFAULT_EXTENSION_DIR = join(homedir(), ".pi", "agent", "extensions");
const DEFAULT_CLI_DIR = join(homedir(), "agent-tools");

/**
 * Detect command mode from script name or first argument
 * @param {string[]} args - process.argv
 * @returns {{ mode: "ext" | "cli", args: string[] }}
 */
function detectMode(args) {
  const scriptName = basename(args[1] || "");

  // Check script name first
  if (scriptName === "mcp2ext" || scriptName.includes("mcp2ext")) {
    return { mode: "ext", args: args.slice(2) };
  }
  if (scriptName === "mcp2cli" || scriptName.includes("mcp2cli")) {
    return { mode: "cli", args: args.slice(2) };
  }

  // Check first argument
  const firstArg = args[2];
  if (firstArg === "ext" || firstArg === "extension") {
    return { mode: "ext", args: args.slice(3) };
  }
  if (firstArg === "cli") {
    return { mode: "cli", args: args.slice(3) };
  }

  // Default to extension mode
  return { mode: "ext", args: args.slice(2) };
}

/**
 * Parse command line arguments
 * @param {string[]} args - Arguments after mode detection
 * @param {"ext" | "cli"} mode - Command mode
 * @returns {object} - Parsed options
 */
function parseArgs(args, mode) {
  const options = {
    mode,
    package: null,
    name: null,
    output: null,
    dryRun: false,
    quiet: false,
    force: false,
    help: false,
    register: mode === "cli", // Only register for CLI mode
    registerPaths: [],
    presets: [],
    allPresets: false,
    local: false,
    uvx: false,
    pip: false,
    command: null,
    symlink: mode === "cli", // Only symlink for CLI mode
    symlinkDir: null,
    forceSymlink: false,
    agent: null,
    shellConfig: mode === "cli", // Only shell config for CLI mode
    subcommand: null,
    subcommandArg: null,
    yes: false,
    fix: false,
    cleanup: false,
    all: false,
  };

  if (args.length > 0 && !args[0].startsWith("-")) {
    if (args[0] === "list") {
      options.subcommand = "list";
      args = args.slice(1);
    } else if (args[0] === "remove") {
      options.subcommand = "remove";
      if (args[1] && !args[1].startsWith("-")) {
        options.subcommandArg = args[1];
        args = args.slice(2);
      } else {
        args = args.slice(1);
      }
    } else if (args[0] === "refresh") {
      options.subcommand = "refresh";
      if (args[1] && !args[1].startsWith("-")) {
        options.subcommandArg = args[1];
        args = args.slice(2);
      } else {
        args = args.slice(1);
      }
    } else if (args[0] === "migrate") {
      options.subcommand = "migrate";
      if (args[1] && !args[1].startsWith("-")) {
        options.subcommandArg = args[1];
        args = args.slice(2);
      } else {
        args = args.slice(1);
      }
    }
  }

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "--name") {
      const val = args[++i];
      if (val && !val.startsWith("-")) {
        options.name = val;
      }
    } else if (arg === "--output") {
      const val = args[++i];
      if (val && !val.startsWith("-")) {
        options.output = val;
      }
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--quiet" || arg === "-q") {
      options.quiet = true;
    } else if (arg === "--force" || arg === "-f") {
      options.force = true;
    } else if (arg === "--register") {
      options.register = true;
    } else if (arg === "--no-register") {
      options.register = false;
    } else if (arg === "--register-path") {
      const val = args[++i];
      if (val && !val.startsWith("-")) {
        options.registerPaths.push(val);
      }
    } else if (arg === "--preset") {
      const val = args[++i];
      if (val && !val.startsWith("-")) {
        options.presets.push(val);
      }
    } else if (arg === "--local") {
      options.local = true;
    } else if (arg === "--all-presets") {
      options.allPresets = true;
    } else if (arg === "--uvx") {
      options.uvx = true;
    } else if (arg === "--pip") {
      options.pip = true;
    } else if (arg === "--command") {
      const val = args[++i];
      if (val && !val.startsWith("-")) {
        options.command = val;
      }
    } else if (arg === "--symlink") {
      options.symlink = true;
    } else if (arg === "--no-symlink") {
      options.symlink = false;
    } else if (arg === "--symlink-dir") {
      const val = args[++i];
      if (val && !val.startsWith("-")) {
        options.symlinkDir = val;
      }
    } else if (arg === "--force-symlink") {
      options.forceSymlink = true;
    } else if (arg === "--agent") {
      const val = args[++i];
      if (val && !val.startsWith("-")) {
        options.agent = val;
      }
    } else if (arg === "--shell-config") {
      options.shellConfig = true;
    } else if (arg === "--no-shell-config") {
      options.shellConfig = false;
    } else if (arg === "--yes" || arg === "-y") {
      options.yes = true;
    } else if (arg === "--fix") {
      options.fix = true;
    } else if (arg === "--cleanup") {
      options.cleanup = true;
    } else if (arg === "--all") {
      options.all = true;
    } else if (!arg.startsWith("-") && !options.package) {
      options.package = arg;
    }
  }

  return options;
}

/**
 * Show help text for mcp2ext
 */
function showExtHelp() {
  console.log(`Usage: mcp2ext <mcp-package> [options]
       mcp2ext list
       mcp2ext remove <name> [options]
       mcp2ext refresh [name] [options]
       mcp2ext migrate [name] [options]

Generate a pi extension from an MCP server.
Extensions are auto-discovered by pi from ~/.pi/agent/extensions/

Commands:
  list                 List installed MCP extensions
  remove <name>        Remove an extension
  refresh [name]       Regenerate extension(s) from latest MCP schema
  migrate [name]       Migrate CLI tool(s) from ~/agent-tools/ to extension
                       Use --all to migrate all, --cleanup to remove old

Arguments:
  mcp-package          Package name (npm or Python)

Options:
  --name <name>        Extension directory name (default: derived from package)
  --output <path>      Output path (default: ~/.pi/agent/extensions/<name>)
  --dry-run            Preview generated files without writing
  --quiet, -q          Suppress progress output
  --force, -f          Overwrite existing extension
  --yes, -y            Skip confirmation prompts (for remove)
  --help, -h           Show this help message

Python/Runner:
  --uvx                Use uvx runner (Python packages, no install needed)
  --pip                Use pip runner (requires: pip install <package>)
  --command <cmd>      Use explicit command (docker, custom paths, etc.)

AI Agent:
  --agent <name>       Force AI agent for grouping (pi, claude, codex)
                       Default: auto-detect (pi -> claude -> codex)

Examples:
  mcp2ext chrome-devtools-mcp                    # npm package
  mcp2ext mcp-server-fetch --uvx                 # Python via uvx
  mcp2ext --command "uvx mcp-server-time" --name time

Config: ${getConfigPath(true)}

Exit Codes:
  0  Success
  1  General error
  2  Invalid arguments
  3  Discovery failed
  4  Generation failed
  5  Output write failed
`);
}

/**
 * Show help text for mcp2cli (legacy)
 */
function showCliHelp() {
  console.log(`Usage: mcp2cli <mcp-package> [options]
       mcp2cli list [--fix]
       mcp2cli remove <name> [options]
       mcp2cli refresh [name] [options]

Convert an MCP server into standalone CLI tools for AI agents.
Powered by mcporter. (Legacy mode - consider using mcp2ext instead)

Commands:
  list                 List all installed tools
  list --fix           List and fix missing symlinks/registrations
  remove <name>        Remove an installed tool (prompts for confirmation)
  refresh              Refresh symlinks and registrations for all tools
  refresh <name>       Refresh symlinks and registration for a specific tool

Arguments:
  mcp-package          Package name (npm or Python)

Options:
  --name <name>        Output directory name (default: derived from package)
  --output <path>      Output directory path (default: ~/agent-tools/<name>)
  --dry-run            Preview generated files without writing
  --quiet, -q          Suppress progress output
  --force, -f          Overwrite existing directory
  --yes, -y            Skip confirmation prompts (for remove)
  --help, -h           Show this help message

Python/Runner:
  --uvx                Use uvx runner (Python packages, no install needed)
  --pip                Use pip runner (requires: pip install <package>)
  --command <cmd>      Use explicit command (docker, custom paths, etc.)

AI Agent:
  --agent <name>       Force AI agent for code generation (pi, claude, codex)
                       Default: auto-detect (pi -> claude -> codex)
                       Note: --preset codex implies --agent codex

Registration (default: first existing preset in pi -> claude -> codex -> gemini):
  --register           Auto-register in config files (default: on)
  --no-register        Skip auto-registration
  --register-path <p>  Add registration target path (can repeat)
  --preset <name>      Use preset: pi, claude, gemini, codex (can repeat)
  --all-presets        Register to ALL existing preset files
  --local              Register in cwd (auto-detect CLAUDE.md/AGENTS.md)

Symlinks:
  --symlink              Auto-create symlinks in PATH (default: on)
  --no-symlink           Skip symlink creation
  --symlink-dir <path>   Symlink directory (default: ${getDefaultSymlinkDir()})
  --force-symlink        Overwrite existing files with symlinks
  --shell-config         Auto-add PATH to shell config (default: on)
  --no-shell-config      Skip shell config modification

Examples:
  mcp2cli chrome-devtools-mcp                      # npm package
  mcp2cli mcp-server-fetch --uvx                   # Python via uvx
  mcp2cli mcp-server-fetch --pip                   # Python via pip
  mcp2cli --command "docker run -i --rm mcp/fetch" fetch
  mcp2cli chrome-devtools-mcp --preset claude --local
  mcp2cli @org/mcp@latest --output ./tools --no-register

Note: Without --uvx or --pip, tries npm first then auto-falls back to uvx.

Config: ${getConfigPath(true)}

Exit Codes:
  0  Success
  1  General error
  2  Invalid arguments
  3  Discovery failed
  4  Generation failed
  5  Output write failed
`);
}

/**
 * Check if Pi is available
 * @returns {boolean}
 */
function checkPi() {
  try {
    execSync("which pi", {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 5000,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if Claude is available
 * @returns {boolean}
 */
function checkClaude() {
  try {
    execSync("which claude", {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 5000,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if Codex is available
 * @returns {boolean}
 */
function checkCodex() {
  try {
    execSync("which codex", {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 5000,
    });
    return true;
  } catch {
    return false;
  }
}

async function promptConfirmation(message) {
  if (!process.stdin.isTTY) {
    console.error("Error: Cannot prompt for confirmation in non-interactive mode. Use -y to skip.");
    return false;
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(`${message} [y/N] `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === "y" || answer.toLowerCase() === "yes");
    });
  });
}

async function handleExtRemove(options) {
  const { listInstalledExtensions, removeExtension } = await import("../lib/management.js");
  const { existsSync, statSync } = await import("fs");
  const name = options.subcommandArg;

  if (!name) {
    console.error("Error: Missing extension name. Usage: mcp2ext remove <name>");
    process.exit(EXIT_INVALID_ARGS);
  }

  // Validate extension exists
  const extPath = join(DEFAULT_EXTENSION_DIR, name);
  if (!existsSync(extPath) || !statSync(extPath).isDirectory()) {
    console.error(`Error: Extension "${name}" not found in ~/.pi/agent/extensions/`);
    process.exit(EXIT_ERROR);
  }

  if (!options.yes && !options.dryRun) {
    const confirmed = await promptConfirmation(`Remove extension "${name}"?`);
    if (!confirmed) {
      console.log("Aborted.");
      process.exit(EXIT_SUCCESS);
    }
  }

  const result = removeExtension(name, { dryRun: options.dryRun, quiet: options.quiet });
  if (!result.success) {
    console.error(`Error: ${result.error}`);
    process.exit(EXIT_ERROR);
  }
}

async function handleExtList(options) {
  const { listInstalledExtensions, formatExtensionList } = await import("../lib/management.js");
  const extensions = listInstalledExtensions();
  console.log(formatExtensionList(extensions));
}

async function handleExtMigrate(options) {
  const { scanCliTools, migrateTool, migrateAll, formatMigrationScan } = await import("../lib/migration.js");

  // Detect AI agent
  let agentType = null;
  const validAgents = ["pi", "claude", "codex"];
  const agentCheckers = { pi: checkPi, claude: checkClaude, codex: checkCodex };

  if (options.agent) {
    if (!validAgents.includes(options.agent)) {
      console.error(`Error: Unknown agent '${options.agent}'. Valid: ${validAgents.join(", ")}`);
      process.exit(EXIT_INVALID_ARGS);
    }
    if (!agentCheckers[options.agent]()) {
      console.error(`Error: Requested agent '${options.agent}' is not available`);
      process.exit(EXIT_ERROR);
    }
    agentType = options.agent;
  } else {
    agentType = checkPi() ? "pi" : checkClaude() ? "claude" : checkCodex() ? "codex" : null;
  }

  // If no name and no --all, show scan results
  if (!options.subcommandArg && !options.all) {
    const tools = scanCliTools();
    console.log(formatMigrationScan(tools));
    process.exit(EXIT_SUCCESS);
  }

  // Migrate all
  if (options.all) {
    if (!options.yes && !options.dryRun) {
      const tools = scanCliTools();
      const migrateable = tools.filter((t) => t.canMigrate);
      if (migrateable.length === 0) {
        console.log("No CLI tools found that can be migrated.");
        process.exit(EXIT_SUCCESS);
      }
      const cleanupNote = options.cleanup ? " and remove old CLI tools" : "";
      const confirmed = await promptConfirmation(`Migrate ${migrateable.length} CLI tools to extensions${cleanupNote}?`);
      if (!confirmed) {
        console.log("Aborted.");
        process.exit(EXIT_SUCCESS);
      }
    }

    const results = await migrateAll({
      dryRun: options.dryRun,
      quiet: options.quiet,
      cleanup: options.cleanup,
      force: options.force,
      agentType,
    });

    if (!options.quiet && !options.dryRun) {
      console.log("\nMigration Summary:");
      console.log(`  Migrated: ${results.migrated.length}`);
      if (results.skipped.length > 0) {
        console.log(`  Skipped:  ${results.skipped.length} (no MCP command found)`);
      }
      if (results.failed.length > 0) {
        console.log(`  Failed:   ${results.failed.length}`);
        for (const f of results.failed) {
          console.log(`    - ${f.name}: ${f.error}`);
        }
      }
    }

    process.exit(results.success ? EXIT_SUCCESS : EXIT_ERROR);
  }

  // Migrate single tool
  const name = options.subcommandArg;

  if (!options.yes && !options.dryRun) {
    const cleanupNote = options.cleanup ? " and remove old CLI tool" : "";
    const confirmed = await promptConfirmation(`Migrate "${name}" to extension${cleanupNote}?`);
    if (!confirmed) {
      console.log("Aborted.");
      process.exit(EXIT_SUCCESS);
    }
  }

  const result = await migrateTool(name, {
    dryRun: options.dryRun,
    quiet: options.quiet,
    cleanup: options.cleanup,
    force: options.force,
    agentType,
  });

  if (!result.success) {
    console.error(`Error: ${result.error}`);
    process.exit(EXIT_ERROR);
  }

  if (!options.dryRun && !options.quiet) {
    console.log(`\nMigration complete!`);
    console.log(`  Extension: ~/.pi/agent/extensions/${name}/`);
    console.log(`  Tools: ${result.groupsCount} grouped tools from ${result.toolsCount} MCP tools`);
    if (result.cleanup) {
      console.log(`  Removed: ~/agent-tools/${name}/`);
    }
  }

  process.exit(EXIT_SUCCESS);
}

async function handleCliRemove(options) {
  const { removeTool } = await import("../lib/management.js");
  const { existsSync, statSync } = await import("fs");
  const name = options.subcommandArg;

  if (!name) {
    console.error("Error: Missing tool name. Usage: mcp2cli remove <name>");
    process.exit(EXIT_INVALID_ARGS);
  }

  // Validate tool exists before prompting for confirmation
  const toolPath = join(DEFAULT_CLI_DIR, name);
  const isValid = name !== "bin" &&
                  toolPath.startsWith(DEFAULT_CLI_DIR + "/") &&
                  existsSync(toolPath) &&
                  statSync(toolPath).isDirectory();

  if (!isValid) {
    console.error(`Error: Tool "${name}" not found in ~/agent-tools/`);
    process.exit(EXIT_ERROR);
  }

  if (!options.yes && !options.dryRun) {
    const confirmed = await promptConfirmation(`Remove tool "${name}"?`);
    if (!confirmed) {
      console.log("Aborted.");
      process.exit(EXIT_SUCCESS);
    }
  }

  const result = removeTool(name, { dryRun: options.dryRun, quiet: options.quiet });
  if (!result.success) {
    console.error(`Error: ${result.error}`);
    process.exit(EXIT_ERROR);
  }
}

async function handleCliRefresh(options) {
  const { refreshTool, refreshAllTools } = await import("../lib/management.js");
  const { existsSync, statSync } = await import("fs");
  const name = options.subcommandArg;
  const dryRun = options.dryRun;

  if (name) {
    const toolPath = join(DEFAULT_CLI_DIR, name);
    if (!existsSync(toolPath) || !statSync(toolPath).isDirectory()) {
      console.error(`Error: Tool "${name}" not found`);
      process.exit(EXIT_ERROR);
    }

    if (dryRun) {
      console.log(`DRY RUN: Would refresh "${name}"...\n`);
    } else {
      console.log(`Refreshing ${name}...\n`);
    }
    const result = refreshTool(name, { dryRun, quiet: options.quiet });
    printRefreshResult(name, result, dryRun);
  } else {
    if (dryRun) {
      console.log("DRY RUN: Would refresh all tools...\n");
    } else {
      console.log("Refreshing all tools...\n");
    }
    const results = refreshAllTools({ dryRun, quiet: options.quiet });
    let totalCreated = 0;
    let totalUpdated = 0;
    let totalAdded = 0;

    for (const r of results) {
      if (r.success) {
        printRefreshResult(r.name, r, dryRun);
        totalCreated += r.symlinks.created;
        if (r.registrationAction === "updated") totalUpdated++;
        if (r.registrationAction === "added") totalAdded++;
      }
    }

    const parts = [];
    if (totalCreated > 0) parts.push(`${totalCreated} symlinks ${dryRun ? "to create" : "created"}`);
    if (totalUpdated > 0) parts.push(`${totalUpdated} registrations ${dryRun ? "to update" : "updated"}`);
    if (totalAdded > 0) parts.push(`${totalAdded} registrations ${dryRun ? "to add" : "added"}`);

    if (parts.length > 0) {
      console.log(`\n${dryRun ? "Would: " : "Done. "}${parts.join(", ")}.`);
    } else {
      console.log("\nNothing to refresh.");
    }
  }
}

function printRefreshResult(name, result, dryRun) {
  const symPart = result.symlinks.created > 0
    ? `${result.symlinks.created} symlink${result.symlinks.created > 1 ? "s" : ""} ${dryRun ? "to create" : "created"}`
    : `${result.symlinks.unchanged || 0} symlink${(result.symlinks.unchanged || 0) !== 1 ? "s" : ""} unchanged`;

  let regPart = "";
  if (result.registrationAction === "added") {
    const target = Array.isArray(result.registrationTargets) ? result.registrationTargets[0] : result.registrationTargets;
    regPart = `registration ${dryRun ? "would be added" : "added"} (${target})`;
  } else if (result.registrationAction === "updated") {
    const target = Array.isArray(result.registrationTargets) ? result.registrationTargets.join(", ") : result.registrationTargets;
    regPart = `registration ${dryRun ? "would be updated" : "updated"} (${target})`;
  } else if (result.registrationTargets && result.registrationTargets.length === 0) {
    regPart = "no preset files found";
  } else {
    regPart = "registration unchanged";
  }

  console.log(`${name}: ${symPart}, ${regPart}`);
}

/**
 * Main entry point for mcp2ext (extension generation)
 */
async function mainExt(options) {
  const { quiet } = options;

  // Handle subcommands
  if (options.subcommand === "list") {
    await handleExtList(options);
    process.exit(EXIT_SUCCESS);
  }

  if (options.subcommand === "remove") {
    await handleExtRemove(options);
    process.exit(EXIT_SUCCESS);
  }

  if (options.subcommand === "refresh") {
    // TODO: Implement extension refresh
    console.error("Error: Extension refresh not yet implemented");
    process.exit(EXIT_ERROR);
  }

  if (options.subcommand === "migrate") {
    await handleExtMigrate(options);
    process.exit(EXIT_SUCCESS);
  }

  // Validate required arguments
  if (!options.package && !options.command) {
    console.error("Error: Missing required argument: mcp-package");
    console.error("Run 'mcp2ext --help' for usage information.");
    process.exit(EXIT_INVALID_ARGS);
  }

  // Auto-derive package name from --command if not provided
  if (!options.package && options.command) {
    const parts = options.command.trim().split(/\s+/);
    const lastPart = parts[parts.length - 1];
    options.package = lastPart.includes("/") ? lastPart.split("/").pop() : lastPart;
  }

  // Check dependencies
  if (!quiet) console.log("\n[1/5] Checking dependencies...");

  if (!checkMcporter()) {
    console.error("Error: mcporter is not available.");
    console.error("Install with: npm install -g mcporter");
    process.exit(EXIT_ERROR);
  }
  if (!quiet) console.log("      mcporter: ✓");

  // Detect AI agent
  let agentType;
  const validAgents = ["pi", "claude", "codex"];
  const agentCheckers = { pi: checkPi, claude: checkClaude, codex: checkCodex };

  if (options.agent) {
    if (!validAgents.includes(options.agent)) {
      console.error(`Error: Unknown agent '${options.agent}'. Valid: ${validAgents.join(", ")}`);
      process.exit(EXIT_INVALID_ARGS);
    }
    if (!agentCheckers[options.agent]()) {
      console.error(`Error: Requested agent '${options.agent}' is not available`);
      process.exit(EXIT_ERROR);
    }
    agentType = options.agent;
    if (!quiet) console.log(`      ${agentType}: ✓ (forced)`);
  } else {
    agentType = checkPi() ? "pi" : checkClaude() ? "claude" : checkCodex() ? "codex" : null;
    if (!agentType) {
      console.warn("      Warning: No AI agent (pi/claude/codex) available, using fallback");
    } else if (!quiet) {
      console.log(`      ${agentType}: ✓`);
    }
  }

  // Derive names
  const dirName = options.name || deriveDirName(options.package);
  const outputDir = options.output || join(DEFAULT_EXTENSION_DIR, dirName);

  if (!quiet) {
    console.log(`      Output: ${outputDir}`);
  }

  // Check if output exists
  if (outputExists(outputDir) && !options.force && !options.dryRun) {
    console.error(`Error: Output directory exists: ${outputDir}`);
    console.error("Use --force to overwrite or --dry-run to preview.");
    process.exit(EXIT_OUTPUT_FAILED);
  }

  // Phase 1: Discovery
  if (!quiet) console.log("\n[2/5] Discovering MCP tools...");

  let discovery;
  try {
    discovery = await discoverTools(options.package, {
      quiet,
      uvx: options.uvx,
      pip: options.pip,
      command: options.command,
    });
    if (!quiet) {
      console.log(`      Found ${discovery.tools.length} tools (via ${discovery.runner})`);
    }
  } catch (error) {
    console.error(`Error: Discovery failed - ${error.message}`);
    process.exit(EXIT_DISCOVERY_FAILED);
  }

  // Phase 2: Grouping
  if (!quiet) console.log("\n[3/5] Analyzing tool groupings...");

  let groups;
  try {
    if (agentType) {
      groups = await groupToolsForExtension(discovery.serverName, discovery.tools, { quiet, agentType });
    } else {
      groups = fallbackGroupingForExtension(discovery.serverName, discovery.tools);
      if (!quiet) {
        console.log(`      Created ${groups.length} groups (fallback mode)`);
      }
    }
  } catch (error) {
    console.error(`Error: Grouping failed - ${error.message}`);
    console.error("      Falling back to 1:1 mapping...");
    groups = fallbackGroupingForExtension(discovery.serverName, discovery.tools);
  }

  // Phase 3: Generate extension
  if (!quiet) console.log("\n[4/5] Generating pi extension...");

  let files;
  try {
    files = generateExtensionFiles({
      name: dirName,
      serverName: discovery.serverName,
      mcpCommand: discovery.mcpCommand,
      packageName: options.package,
      groups,
      tools: discovery.tools,
      description: discovery.description,
    });

    if (!quiet) {
      console.log(`      Generated ${Object.keys(files).length} files`);
    }
  } catch (error) {
    console.error(`Error: Generation failed - ${error.message}`);
    process.exit(EXIT_GENERATION_FAILED);
  }

  // Phase 4: Write output
  if (!quiet) console.log("\n[5/5] Writing output files...");

  try {
    writeOutput(outputDir, files, {
      dryRun: options.dryRun,
      force: options.force,
      quiet,
      packageName: dirName,
      isExtension: true,
    });
  } catch (error) {
    console.error(`Error: Failed to write output - ${error.message}`);
    process.exit(EXIT_OUTPUT_FAILED);
  }

  // Success
  if (!options.dryRun) {
    printExtensionSuccess(outputDir, groups.length);
  }

  process.exit(EXIT_SUCCESS);
}

/**
 * Main entry point for mcp2cli (CLI wrapper generation - legacy)
 */
async function mainCli(options) {
  const { quiet } = options;

  // Handle subcommands
  if (options.subcommand === "list") {
    const { listInstalledTools, formatToolList, refreshAllTools } = await import("../lib/management.js");

    if (options.fix) {
      console.log("Fixing missing symlinks and registrations...\n");
      const results = refreshAllTools({ quiet: options.quiet });
      let totalFixed = 0;
      let totalRegistered = 0;
      for (const r of results) {
        if (r.success) {
          totalFixed += r.symlinks.created;
          if (r.registrationAction === "added" || r.registrationAction === "updated") {
            totalRegistered++;
          }
        }
      }
      const parts = [];
      if (totalFixed > 0) parts.push(`${totalFixed} symlinks created`);
      if (totalRegistered > 0) parts.push(`${totalRegistered} registrations updated`);
      if (parts.length > 0) {
        console.log(`Fixed: ${parts.join(", ")}\n`);
      }
    }

    const tools = listInstalledTools();
    console.log(formatToolList(tools));

    process.exit(EXIT_SUCCESS);
  }

  if (options.subcommand === "remove") {
    await handleCliRemove(options);
    process.exit(EXIT_SUCCESS);
  }

  if (options.subcommand === "refresh") {
    await handleCliRefresh(options);
    process.exit(EXIT_SUCCESS);
  }

  // Validate required arguments
  if (!options.package && !options.command) {
    console.error("Error: Missing required argument: mcp-package");
    console.error("Run 'mcp2cli --help' for usage information.");
    process.exit(EXIT_INVALID_ARGS);
  }

  // Auto-derive package name from --command if not provided
  if (!options.package && options.command) {
    const parts = options.command.trim().split(/\s+/);
    const lastPart = parts[parts.length - 1];
    options.package = lastPart.includes("/") ? lastPart.split("/").pop() : lastPart;
  }

  // Check dependencies
  if (!quiet) console.log("\n[1/6] Checking dependencies...");

  if (!checkMcporter()) {
    console.error("Error: mcporter is not available.");
    console.error("Install with: npm install -g mcporter");
    process.exit(EXIT_ERROR);
  }
  if (!quiet) console.log("      mcporter: ✓");

  let agentType;
  const validAgents = ["pi", "claude", "codex"];
  const agentCheckers = { pi: checkPi, claude: checkClaude, codex: checkCodex };

  let requestedAgent = options.agent;
  if (!requestedAgent && options.presets.includes("codex")) {
    requestedAgent = "codex";
  }

  if (requestedAgent) {
    if (!validAgents.includes(requestedAgent)) {
      console.error(`Error: Unknown agent '${requestedAgent}'. Valid: ${validAgents.join(", ")}`);
      process.exit(EXIT_INVALID_ARGS);
    }
    if (!agentCheckers[requestedAgent]()) {
      console.error(`Error: Requested agent '${requestedAgent}' is not available`);
      process.exit(EXIT_ERROR);
    }
    agentType = requestedAgent;
    const source = options.agent ? "forced" : "from --preset codex";
    if (!quiet) console.log(`      ${agentType}: ✓ (${source})`);
  } else {
    agentType = checkPi() ? "pi" : checkClaude() ? "claude" : checkCodex() ? "codex" : null;
    if (!agentType) {
      console.warn("      Warning: No AI agent (pi/claude/codex) available, using fallback");
    } else if (!quiet) {
      console.log(`      ${agentType}: ✓`);
    }
  }

  // Derive names
  const dirName = options.name || deriveDirName(options.package);
  const outputDir = options.output || `~/agent-tools/${dirName}`;

  if (!quiet) {
    console.log(`      Output: ${outputDir}`);
  }

  // Check if output exists
  if (outputExists(outputDir) && !options.force && !options.dryRun) {
    console.error(`Error: Output directory exists: ${outputDir}`);
    console.error("Use --force to overwrite or --dry-run to preview.");
    process.exit(EXIT_OUTPUT_FAILED);
  }

  // Phase 1: Discovery
  if (!quiet) console.log("\n[2/6] Discovering MCP tools...");

  let discovery;
  try {
    discovery = await discoverTools(options.package, {
      quiet,
      uvx: options.uvx,
      pip: options.pip,
      command: options.command,
    });
    if (!quiet) {
      console.log(`      Found ${discovery.tools.length} tools (via ${discovery.runner})`);
    }
  } catch (error) {
    console.error(`Error: Discovery failed - ${error.message}`);
    process.exit(EXIT_DISCOVERY_FAILED);
  }

  // Phase 2: Grouping
  if (!quiet) console.log("\n[3/6] Analyzing tool groupings...");

  let groups;
  try {
    if (agentType) {
      groups = await groupTools(discovery.serverName, discovery.tools, { quiet, agentType });
    } else {
      groups = fallbackGrouping(discovery.serverName, discovery.tools);
      if (!quiet) {
        console.log(`      Created ${groups.length} groups (fallback mode)`);
      }
    }
  } catch (error) {
    console.error(`Error: Grouping failed - ${error.message}`);
    console.error("      Falling back to 1:1 mapping...");
    groups = fallbackGrouping(discovery.serverName, discovery.tools);
  }

  // Phase 3: Generate wrappers
  if (!quiet) console.log("\n[4/6] Generating wrapper scripts...");

  const files = {};

  try {
    for (let i = 0; i < groups.length; i++) {
      const group = groups[i];
      if (!quiet) {
        console.log(`      [${i + 1}/${groups.length}] ${group.filename}`);
      }

      if (agentType) {
        const code = await generateWrapper(
          group,
          discovery.tools,
          discovery.serverName,
          discovery.mcpCommand,
          { quiet, agentType }
        );
        files[group.filename] = code;
      } else {
        files[group.filename] = generateFallbackWrapper(
          group,
          discovery.tools,
          discovery.serverName,
          discovery.mcpCommand
        );
      }
    }

    if (!quiet) console.log("      Generating supporting files...");

    files["package.json"] = generatePackageJson(
      dirName,
      `${discovery.serverName} automation`
    );

    if (agentType) {
      files["README.md"] = await generateReadme(dirName, groups, discovery.tools, { quiet, agentType });
    } else {
      files["README.md"] = generateBasicReadme(dirName, groups);
    }

    if (!quiet) console.log("      Validating parameter coverage...");
    const allWarnings = [];
    for (const group of groups) {
      const groupTools = discovery.tools.filter((t) => group.mcp_tools.includes(t.name));
      const { warnings } = validateParameterCoverage(files[group.filename], groupTools, group.filename);
      allWarnings.push(...warnings);
    }

    if (allWarnings.length > 0) {
      console.warn("\n      Parameter coverage warnings:");
      for (const warning of allWarnings) {
        console.warn(`        - ${warning}`);
      }
      if (process.env.MCP2CLI_STRICT_PARAMS === "true") {
        throw new Error("Parameter coverage check failed. Set MCP2CLI_STRICT_PARAMS=false to allow.");
      }
    }
  } catch (error) {
    console.error(`Error: Generation failed - ${error.message}`);
    process.exit(EXIT_GENERATION_FAILED);
  }

  // Phase 4: Write output
  if (!quiet) console.log("\n[5/6] Writing output files...");

  try {
    writeOutput(outputDir, files, {
      dryRun: options.dryRun,
      force: options.force,
      quiet,
      packageName: dirName,
    });
  } catch (error) {
    console.error(`Error: Failed to write output - ${error.message}`);
    process.exit(EXIT_OUTPUT_FAILED);
  }

  // Load config for remaining phases
  let registeredPaths = [];
  let symlinkDir = null;
  let shellConfigResult = null;

  if (!options.dryRun) {
    const config = loadConfig();
    const effectiveConfig = mergeWithCli(config, options);

    // Phase 5.5: Create symlinks
    if (effectiveConfig.symlink) {
      if (!quiet) console.log("\n[5.5/6] Creating symlinks...");
      symlinkDir = effectiveConfig.symlinkDir || getDefaultSymlinkDir();
      createSymlinks(outputDir, files, symlinkDir, {
        force: effectiveConfig.forceSymlink,
        quiet,
      });

      if (options.shellConfig) {
        shellConfigResult = ensurePathConfigured();
        if (shellConfigResult.success && shellConfigResult.action === "added" && !quiet) {
          console.log(`      Added PATH to ${shellConfigResult.configPath}`);
        }
      }
    }

    // Phase 6: Register
    if (effectiveConfig.register) {
      const paths = resolveAllPaths(effectiveConfig);
      if (paths.length > 0) {
        if (!quiet) console.log("\n[6/6] Registering tools...");
        const agentsEntry = generateAgentsEntry(dirName, groups, discovery.description);
        const results = registerToAll(paths, agentsEntry, dirName, { quiet });
        registeredPaths = getSuccessfulPaths(results);
      }
    }
  }

  // Success
  if (!options.dryRun) {
    printSuccess(outputDir, groups.length, registeredPaths, symlinkDir, shellConfigResult);
  }

  process.exit(EXIT_SUCCESS);
}

/**
 * Generate a basic wrapper without Pi (fallback)
 */
function generateFallbackWrapper(group, tools, serverName, mcpCommand) {
  const tool = tools.find((t) => t.name === group.mcp_tools[0]);
  const params = tool?.inputSchema?.properties || {};
  const required = tool?.inputSchema?.required || [];

  const paramDocs = Object.entries(params)
    .map(([name, schema]) => {
      const req = required.includes(name) ? " (required)" : "";
      return `  --${name}${req}: ${schema.description || schema.type || "value"}`;
    })
    .join("\n");

  return `#!/usr/bin/env node

import { execSync } from "child_process";

const args = process.argv.slice(2);

if (args.length === 0 || args[0] === "--help") {
  console.log("Usage: ${group.filename} [options]");
  console.log("");
  console.log("${group.description}");
  console.log("");
  console.log("Options:");
  console.log("  --help: Show this help message");
${paramDocs ? `  console.log(\`${paramDocs}\`);` : ""}
  process.exit(0);
}

const MCP_CMD = "${mcpCommand}";
const SERVER = "${serverName}";

function callMcp(tool, params = {}) {
  const paramStr = Object.entries(params)
    .map(([k, v]) => \`\${k}:\${JSON.stringify(v)}\`)
    .join(" ");

  const cmd = \`npx mcporter call --stdio "\${MCP_CMD}" \${SERVER}.\${tool} \${paramStr}\`;

  try {
    return execSync(cmd, { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] });
  } catch (error) {
    throw new Error(error.stderr || error.message);
  }
}

// Parse arguments
const params = {};
for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg.startsWith("--") && i + 1 < args.length) {
    const key = arg.slice(2);
    const value = args[++i];
    try {
      params[key] = JSON.parse(value);
    } catch {
      params[key] = value;
    }
  }
}

try {
  const result = callMcp("${tool?.name || group.mcp_tools[0]}", params);
  console.log(result);
} catch (error) {
  console.error("Error:", error.message);
  process.exit(1);
}
`;
}

/**
 * Main entry point
 */
async function main() {
  const { mode, args } = detectMode(process.argv);
  const options = parseArgs(args, mode);

  // Handle help
  if (options.help) {
    if (mode === "ext") {
      showExtHelp();
    } else {
      showCliHelp();
    }
    process.exit(EXIT_SUCCESS);
  }

  // Route to appropriate main function
  if (mode === "ext") {
    await mainExt(options);
  } else {
    await mainCli(options);
  }
}

// Run main
main().catch((error) => {
  console.error("Fatal error:", error.message);
  process.exit(EXIT_ERROR);
});
