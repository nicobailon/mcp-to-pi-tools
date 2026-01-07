/**
 * Migration Tooling
 * Migrates existing ~/agent-tools/ CLI tools to pi extensions
 */

import { readdirSync, statSync, existsSync, readFileSync, rmSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { generateExtensionFiles } from "./extension-generator.js";
import { discoverTools } from "./discovery.js";
import { groupToolsForExtension, fallbackGroupingForExtension } from "./grouping.js";
import { writeOutput } from "./output.js";
import { removeTool } from "./management.js";

const AGENT_TOOLS_DIR = join(homedir(), "agent-tools");
const EXTENSIONS_DIR = join(homedir(), ".pi", "agent", "extensions");

/**
 * Pattern to extract MCP command from CLI scripts
 * Looks for: const MCP_CMD = "..." or MCP_CMD = "..."
 */
const MCP_CMD_PATTERN = /(?:const\s+)?MCP_CMD\s*=\s*["'`]([^"'`]+)["'`]/;

/**
 * Pattern to extract mcporter call command
 * Looks for: mcporter call --stdio "..." server.tool
 */
const MCPORTER_CALL_PATTERN = /mcporter\s+call\s+--stdio\s+["'`]([^"'`]+)["'`]\s+([a-zA-Z0-9_-]+)\./;

/**
 * Scan a CLI script and extract MCP command
 * @param {string} scriptPath - Path to the script file
 * @returns {string|null} - MCP command or null if not found
 */
export function extractMcpCommand(scriptPath) {
  if (!existsSync(scriptPath)) return null;

  try {
    const content = readFileSync(scriptPath, "utf-8");

    // Try MCP_CMD pattern first
    const mcpCmdMatch = content.match(MCP_CMD_PATTERN);
    if (mcpCmdMatch) {
      return mcpCmdMatch[1];
    }

    // Try mcporter call pattern
    const mcporterMatch = content.match(MCPORTER_CALL_PATTERN);
    if (mcporterMatch) {
      return mcporterMatch[1];
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Extract server name from CLI scripts
 * Looks for: const SERVER = "..."
 * @param {string} scriptPath - Path to the script file
 * @returns {string|null} - Server name or null
 */
export function extractServerName(scriptPath) {
  if (!existsSync(scriptPath)) return null;

  try {
    const content = readFileSync(scriptPath, "utf-8");

    // Look for SERVER constant
    const serverMatch = content.match(/(?:const\s+)?SERVER\s*=\s*["'`]([^"'`]+)["'`]/);
    if (serverMatch) {
      return serverMatch[1];
    }

    // Try to extract from mcporter call
    const mcporterMatch = content.match(MCPORTER_CALL_PATTERN);
    if (mcporterMatch) {
      return mcporterMatch[2];
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Scan ~/agent-tools/ for migrateable CLI tools
 * @returns {Array} - Array of tool info objects
 */
export function scanCliTools() {
  if (!existsSync(AGENT_TOOLS_DIR)) {
    return [];
  }

  const entries = readdirSync(AGENT_TOOLS_DIR);
  const tools = [];

  for (const entry of entries) {
    if (entry === "bin") continue;

    const toolPath = join(AGENT_TOOLS_DIR, entry);

    try {
      if (!statSync(toolPath).isDirectory()) continue;

      // Find JS scripts
      const scripts = readdirSync(toolPath)
        .filter((f) => f.endsWith(".js") && !f.startsWith("."));

      if (scripts.length === 0) continue;

      // Try to extract MCP command from first script
      let mcpCommand = null;
      let serverName = null;

      for (const script of scripts) {
        const scriptPath = join(toolPath, script);
        mcpCommand = extractMcpCommand(scriptPath);
        serverName = extractServerName(scriptPath);
        if (mcpCommand) break;
      }

      // Read package.json for description
      let description = null;
      const pkgPath = join(toolPath, "package.json");
      if (existsSync(pkgPath)) {
        try {
          const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
          description = pkg.description;
        } catch {
          // Ignore parse errors
        }
      }

      tools.push({
        name: entry,
        path: toolPath,
        scripts,
        mcpCommand,
        serverName,
        description,
        canMigrate: !!mcpCommand,
      });
    } catch {
      continue;
    }
  }

  return tools;
}

/**
 * Derive package name from MCP command
 * @param {string} mcpCommand - MCP command string
 * @returns {string} - Package name
 */
export function derivePackageName(mcpCommand) {
  if (!mcpCommand) return "unknown";

  // Extract package from npx command: npx -y <package>@latest
  // Handle scoped packages like @anthropic-ai/chrome-devtools-mcp@latest
  const npxScopedMatch = mcpCommand.match(/npx\s+(?:-y\s+)?(@[^@\s]+\/[^@\s]+)(?:@[^\s]+)?/);
  if (npxScopedMatch) {
    return npxScopedMatch[1];
  }

  // Handle unscoped packages
  const npxMatch = mcpCommand.match(/npx\s+(?:-y\s+)?([^@\s]+)(?:@[^\s]+)?/);
  if (npxMatch) {
    return npxMatch[1];
  }

  // Extract package from uvx command: uvx <package>
  const uvxMatch = mcpCommand.match(/uvx\s+([^\s]+)/);
  if (uvxMatch) {
    return uvxMatch[1];
  }

  // Extract package from docker command: docker run ... <image>
  const dockerMatch = mcpCommand.match(/docker\s+run\s+.*?\s+([^\s]+)$/);
  if (dockerMatch) {
    return dockerMatch[1];
  }

  // Return last word as fallback
  const parts = mcpCommand.trim().split(/\s+/);
  return parts[parts.length - 1];
}

/**
 * Determine runner type from MCP command
 * @param {string} mcpCommand - MCP command string
 * @returns {"npx" | "uvx" | "pip" | "docker" | "custom"} - Runner type
 */
export function deriveRunnerType(mcpCommand) {
  if (!mcpCommand) return "custom";

  if (mcpCommand.startsWith("npx ")) return "npx";
  if (mcpCommand.startsWith("uvx ")) return "uvx";
  if (mcpCommand.includes("pip ")) return "pip";
  if (mcpCommand.includes("docker ")) return "docker";

  return "custom";
}

/**
 * Migrate a single CLI tool to pi extension
 * @param {string} name - Tool name
 * @param {object} options - Options
 * @param {boolean} options.dryRun - Preview without writing
 * @param {boolean} options.quiet - Suppress output
 * @param {boolean} options.cleanup - Remove old CLI tool after migration
 * @param {boolean} options.force - Overwrite existing extension
 * @param {string} options.agentType - AI agent type for grouping
 * @returns {object} - Result object
 */
export async function migrateTool(name, options = {}) {
  const { dryRun = false, quiet = false, cleanup = false, force = false, agentType = null } = options;

  // Find the tool
  const toolPath = join(AGENT_TOOLS_DIR, name);
  if (!existsSync(toolPath) || !statSync(toolPath).isDirectory()) {
    return { success: false, error: `Tool "${name}" not found in ~/agent-tools/` };
  }

  // Extract MCP command from scripts
  const scripts = readdirSync(toolPath).filter((f) => f.endsWith(".js") && !f.startsWith("."));
  if (scripts.length === 0) {
    return { success: false, error: `No scripts found in ~/agent-tools/${name}/` };
  }

  let mcpCommand = null;
  let serverName = null;
  for (const script of scripts) {
    const scriptPath = join(toolPath, script);
    mcpCommand = extractMcpCommand(scriptPath);
    serverName = extractServerName(scriptPath);
    if (mcpCommand) break;
  }

  if (!mcpCommand) {
    return { success: false, error: `Could not extract MCP command from scripts in ~/agent-tools/${name}/` };
  }

  // Check if extension already exists
  const extPath = join(EXTENSIONS_DIR, name);
  if (existsSync(extPath) && !force && !dryRun) {
    return { success: false, error: `Extension "${name}" already exists. Use --force to overwrite.` };
  }

  // Derive package name and runner type
  const packageName = derivePackageName(mcpCommand);
  const runnerType = deriveRunnerType(mcpCommand);

  if (!quiet) {
    console.log(`Migrating: ${name}`);
    console.log(`  MCP command: ${mcpCommand}`);
    console.log(`  Package: ${packageName}`);
    console.log(`  Runner: ${runnerType}`);
  }

  // Discover tools from MCP server
  if (!quiet) console.log(`  Discovering tools...`);

  let discovery;
  try {
    discovery = await discoverTools(packageName, {
      quiet: true,
      uvx: runnerType === "uvx",
      pip: runnerType === "pip",
      command: runnerType === "custom" || runnerType === "docker" ? mcpCommand : null,
    });
  } catch (error) {
    return { success: false, error: `Discovery failed: ${error.message}` };
  }

  if (!quiet) {
    console.log(`  Found ${discovery.tools.length} tools`);
  }

  // Group tools
  if (!quiet) console.log(`  Grouping tools...`);

  let groups;
  try {
    if (agentType) {
      groups = await groupToolsForExtension(discovery.serverName, discovery.tools, { quiet: true, agentType });
    } else {
      groups = fallbackGroupingForExtension(discovery.serverName, discovery.tools);
    }
  } catch (error) {
    if (!quiet) console.log(`  Grouping failed, using fallback...`);
    groups = fallbackGroupingForExtension(discovery.serverName, discovery.tools);
  }

  if (!quiet) {
    console.log(`  Created ${groups.length} groups`);
  }

  // Generate extension files
  if (!quiet) console.log(`  Generating extension...`);

  let files;
  try {
    files = generateExtensionFiles({
      name,
      serverName: discovery.serverName,
      mcpCommand: discovery.mcpCommand,
      packageName,
      groups,
      tools: discovery.tools,
      description: discovery.description,
    });
  } catch (error) {
    return { success: false, error: `Generation failed: ${error.message}` };
  }

  // Dry run output
  if (dryRun) {
    console.log(`\nDRY RUN: Would migrate "${name}" to extension`);
    console.log(`  Output: ~/.pi/agent/extensions/${name}/`);
    console.log(`  Files: ${Object.keys(files).join(", ")}`);
    if (cleanup) {
      console.log(`  Would remove: ~/agent-tools/${name}/`);
    }
    console.log("\nNo changes made.");
    return { success: true, dryRun: true };
  }

  // Write extension files
  if (!quiet) console.log(`  Writing extension...`);

  try {
    writeOutput(extPath, files, {
      dryRun: false,
      force,
      quiet: true,
      packageName: name,
      isExtension: true,
    });
  } catch (error) {
    return { success: false, error: `Failed to write extension: ${error.message}` };
  }

  // Cleanup old CLI tool if requested
  if (cleanup) {
    if (!quiet) console.log(`  Removing old CLI tool...`);
    removeTool(name, { dryRun: false, quiet: true });
  }

  if (!quiet) {
    console.log(`  Done!`);
  }

  return {
    success: true,
    extensionPath: extPath,
    toolsCount: discovery.tools.length,
    groupsCount: groups.length,
    cleanup,
  };
}

/**
 * Migrate all CLI tools to pi extensions
 * @param {object} options - Options
 * @param {boolean} options.dryRun - Preview without writing
 * @param {boolean} options.quiet - Suppress output
 * @param {boolean} options.cleanup - Remove old CLI tools after migration
 * @param {boolean} options.force - Overwrite existing extensions
 * @param {string} options.agentType - AI agent type for grouping
 * @returns {object} - Results object
 */
export async function migrateAll(options = {}) {
  const { dryRun = false, quiet = false, cleanup = false, force = false, agentType = null } = options;

  const tools = scanCliTools();

  if (tools.length === 0) {
    return {
      success: true,
      migrated: [],
      skipped: [],
      failed: [],
      message: "No CLI tools found in ~/agent-tools/",
    };
  }

  const migrateable = tools.filter((t) => t.canMigrate);
  const notMigrateable = tools.filter((t) => !t.canMigrate);

  if (!quiet) {
    console.log(`Found ${tools.length} CLI tools (${migrateable.length} migrateable)`);
    if (notMigrateable.length > 0) {
      console.log(`Skipping (no MCP command found): ${notMigrateable.map((t) => t.name).join(", ")}`);
    }
    console.log("");
  }

  const results = {
    success: true,
    migrated: [],
    skipped: notMigrateable.map((t) => t.name),
    failed: [],
  };

  for (const tool of migrateable) {
    const result = await migrateTool(tool.name, { dryRun, quiet, cleanup, force, agentType });

    if (result.success) {
      results.migrated.push(tool.name);
    } else {
      results.failed.push({ name: tool.name, error: result.error });
      results.success = false;
    }

    if (!quiet && !dryRun) {
      console.log("");
    }
  }

  return results;
}

/**
 * Format migration scan results for display
 * @param {Array} tools - Array of tool info objects
 * @returns {string} - Formatted string
 */
export function formatMigrationScan(tools) {
  if (tools.length === 0) {
    return `No CLI tools found in ~/agent-tools/`;
  }

  const lines = [];
  lines.push(`CLI Tools Available for Migration (${tools.length})`);
  lines.push("-".repeat(70));
  lines.push(`${"NAME".padEnd(20)}${"MCP COMMAND".padEnd(40)}STATUS`);

  for (const tool of tools) {
    const cmd = tool.mcpCommand
      ? tool.mcpCommand.length > 37
        ? tool.mcpCommand.slice(0, 34) + "..."
        : tool.mcpCommand
      : "(not found)";
    const status = tool.canMigrate ? "ready" : "skip";
    lines.push(`${tool.name.padEnd(20)}${cmd.padEnd(40)}${status}`);
  }

  lines.push("");
  const migrateable = tools.filter((t) => t.canMigrate).length;
  lines.push(`${migrateable} of ${tools.length} tools can be migrated`);
  lines.push("");
  lines.push(`To migrate: mcp2ext migrate [name] [--cleanup]`);
  lines.push(`            mcp2ext migrate --all [--cleanup]`);

  return lines.join("\n");
}
