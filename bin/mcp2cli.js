#!/usr/bin/env node

/**
 * mcp2cli - Convert MCP servers into standalone CLI tools for AI agents
 *
 * Usage: mcp2cli <mcp-package> [options]
 *
 * Powered by mcporter. Optimized for Pi agent.
 */

import { checkMcporter, discoverTools, deriveDirName } from "../lib/discovery.js";
import { groupTools, fallbackGrouping } from "../lib/grouping.js";
import {
  generateWrapper,
  generatePackageJson,
  generateInstallScript,
  generateGitignore,
  generateReadme,
  generateAgentsEntry,
  generateBasicReadme,
} from "../lib/generator.js";
import { writeOutput, outputExists, printSuccess } from "../lib/output.js";
import { loadConfig, mergeWithCli, getConfigPath } from "../lib/config.js";
import { registerToAll, resolveAllPaths, getSuccessfulPaths } from "../lib/registration.js";
import { execSync } from "child_process";

// Exit codes per spec
const EXIT_SUCCESS = 0;
const EXIT_ERROR = 1;
const EXIT_INVALID_ARGS = 2;
const EXIT_DISCOVERY_FAILED = 3;
const EXIT_GENERATION_FAILED = 4;
const EXIT_OUTPUT_FAILED = 5;

/**
 * Parse command line arguments
 * @param {string[]} args - process.argv.slice(2)
 * @returns {object} - Parsed options
 */
function parseArgs(args) {
  const options = {
    package: null,
    name: null,
    output: null,
    dryRun: false,
    quiet: false,
    force: false,
    help: false,
    register: true,
    registerPaths: [],
    presets: [],
    local: false,
  };

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
    } else if (!arg.startsWith("-") && !options.package) {
      options.package = arg;
    }
  }

  return options;
}

/**
 * Show help text
 */
function showHelp() {
  console.log(`Usage: mcp2cli <mcp-package> [options]

Convert an MCP server into standalone CLI tools for AI agents.
Powered by mcporter. Optimized for Pi agent.

Arguments:
  mcp-package          npm package name (e.g., "chrome-devtools-mcp" or "@org/mcp@latest")

Options:
  --name <name>        Output directory name (default: derived from package)
  --output <path>      Output directory path (default: ~/agent-tools/<name>)
  --dry-run            Preview generated files without writing
  --quiet, -q          Suppress progress output
  --force, -f          Overwrite existing directory
  --help, -h           Show this help message

Registration:
  --register           Auto-register in config files (default: on)
  --no-register        Skip auto-registration
  --register-path <p>  Add registration target path (can repeat)
  --preset <name>      Use preset: pi, claude, gemini, codex (can repeat)
  --local              Register in cwd (auto-detect CLAUDE.md/AGENTS.md)

Examples:
  mcp2cli chrome-devtools-mcp
  mcp2cli chrome-devtools-mcp --preset claude
  mcp2cli chrome-devtools-mcp --preset claude --local
  mcp2cli chrome-devtools-mcp --register-path ~/.custom/AGENTS.md
  mcp2cli @org/mcp@latest --output ./tools --no-register

Config: ${getConfigPath()}

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
    execSync("pi --version", {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 10000,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Main entry point
 */
async function main() {
  const args = process.argv.slice(2);
  const options = parseArgs(args);

  // Handle help
  if (options.help) {
    showHelp();
    process.exit(EXIT_SUCCESS);
  }

  // Validate required arguments
  if (!options.package) {
    console.error("Error: Missing required argument: mcp-package");
    console.error("Run 'mcp2cli --help' for usage information.");
    process.exit(EXIT_INVALID_ARGS);
  }

  const { quiet } = options;

  // Check dependencies
  if (!quiet) console.log("\n[1/6] Checking dependencies...");

  if (!checkMcporter()) {
    console.error("Error: mcporter is not available.");
    console.error("Install with: npm install -g mcporter");
    process.exit(EXIT_ERROR);
  }
  if (!quiet) console.log("      mcporter: ✓");

  const hasPi = checkPi();
  if (!hasPi) {
    console.warn("      Warning: Pi not available, using fallback grouping");
  } else if (!quiet) {
    console.log("      pi: ✓");
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
    discovery = await discoverTools(options.package, { quiet });
    if (!quiet) {
      console.log(`      Found ${discovery.tools.length} tools`);
    }
  } catch (error) {
    console.error(`Error: Discovery failed - ${error.message}`);
    process.exit(EXIT_DISCOVERY_FAILED);
  }

  // Phase 2: Grouping
  if (!quiet) console.log("\n[3/6] Analyzing tool groupings...");

  let groups;
  try {
    if (hasPi) {
      groups = await groupTools(discovery.serverName, discovery.tools, { quiet });
    } else {
      groups = fallbackGrouping(discovery.serverName, discovery.tools);
      if (!quiet) {
        console.log(`      Created ${groups.length} groups (fallback mode)`);
      }
    }
  } catch (error) {
    console.error(`Error: Grouping failed - ${error.message}`);
    // Try fallback
    console.error("      Falling back to 1:1 mapping...");
    groups = fallbackGrouping(discovery.serverName, discovery.tools);
  }

  // Phase 3: Generate wrappers
  if (!quiet) console.log("\n[4/6] Generating wrapper scripts...");

  const files = {};

  try {
    // Generate each wrapper
    for (let i = 0; i < groups.length; i++) {
      const group = groups[i];
      if (!quiet) {
        console.log(`      [${i + 1}/${groups.length}] ${group.filename}`);
      }

      if (hasPi) {
        const code = await generateWrapper(
          group,
          discovery.tools,
          discovery.serverName,
          discovery.mcpCommand,
          { quiet }
        );
        files[group.filename] = code;
      } else {
        // Fallback: generate basic wrapper without Pi
        files[group.filename] = generateFallbackWrapper(
          group,
          discovery.tools,
          discovery.serverName,
          discovery.mcpCommand
        );
      }
    }

    // Generate supporting files
    if (!quiet) console.log("      Generating supporting files...");

    files["package.json"] = generatePackageJson(
      dirName,
      `${discovery.serverName} automation`
    );
    files["install.sh"] = generateInstallScript(dirName);
    files[".gitignore"] = generateGitignore();

    // Generate README (uses Pi if available)
    if (hasPi) {
      files["README.md"] = await generateReadme(dirName, groups, discovery.tools, { quiet });
    } else {
      files["README.md"] = generateBasicReadme(dirName, groups);
    }

    // Generate AGENTS.md entry
    files["AGENTS-ENTRY.md"] = generateAgentsEntry(dirName, groups);
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
    });
  } catch (error) {
    console.error(`Error: Failed to write output - ${error.message}`);
    process.exit(EXIT_OUTPUT_FAILED);
  }

  // Phase 5: Register
  let registeredPaths = [];
  if (!options.dryRun) {
    const config = loadConfig();
    const effectiveConfig = mergeWithCli(config, options);

    if (effectiveConfig.register) {
      const paths = resolveAllPaths(effectiveConfig);
      if (paths.length > 0) {
        if (!quiet) console.log("\n[6/6] Registering tools...");
        const agentsEntry = files["AGENTS-ENTRY.md"];
        const results = registerToAll(paths, agentsEntry, { quiet });
        registeredPaths = getSuccessfulPaths(results);
      }
    }
  }

  // Success
  if (!options.dryRun) {
    printSuccess(outputDir, groups.length, registeredPaths);
  }

  process.exit(EXIT_SUCCESS);
}

/**
 * Generate a basic wrapper without Pi (fallback)
 * @param {object} group - Group object
 * @param {Array} tools - Full tool definitions
 * @param {string} serverName - Server name
 * @param {string} mcpCommand - MCP command
 * @returns {string} - Generated code
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
    // Try to parse as JSON, otherwise use as string
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

// Run main
main().catch((error) => {
  console.error("Fatal error:", error.message);
  process.exit(EXIT_ERROR);
});
