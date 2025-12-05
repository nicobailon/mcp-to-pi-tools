/**
 * Wrapper Script Generator
 * Generates CLI wrapper scripts using Pi
 */

import { exec } from "child_process";
import { promisify } from "util";
import { writeFileSync, unlinkSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const execAsync = promisify(exec);

/**
 * Generate the wrapper generation prompt for Pi
 * @param {object} group - Group object with filename, description, mcp_tools
 * @param {Array} tools - Full tool definitions from MCP
 * @param {string} serverName - MCP server name
 * @param {string} mcpCommand - npx command for MCP server
 * @returns {string} - Prompt for Pi
 */
function generateWrapperPrompt(group, tools, serverName, mcpCommand) {
  // Get full tool definitions for tools in this group
  const groupTools = tools.filter((t) => group.mcp_tools.includes(t.name));

  const toolDefs = groupTools
    .map((t) => {
      const propsStr = t.inputSchema?.properties
        ? JSON.stringify(t.inputSchema.properties, null, 2)
        : "{}";
      const required = t.inputSchema?.required || [];
      return `Tool: ${t.name}
Description: ${t.description || "No description"}
Required params: ${required.join(", ") || "none"}
Parameters: ${propsStr}`;
    })
    .join("\n\n");

  return `Generate a Node.js CLI wrapper script for these MCP tools.

Filename: ${group.filename}
Purpose: ${group.description}
MCP Server Command: ${mcpCommand}
Server Name: ${serverName}

MCP Tools to wrap:
${toolDefs}

Requirements:
1. MUST start with: #!/usr/bin/env node
2. MUST use ES modules (import, not require)
3. MUST implement --help flag showing usage, options, and examples
4. MUST use manual argument parsing (for loop over process.argv, NO yargs/commander)
5. Call MCP via execSync: npx mcporter call --stdio "${mcpCommand}" ${serverName}.<tool_name> param:value
6. Errors to stderr with console.error(), then exit(1)
7. Minimal token-efficient output
8. If multiple tools, use flags or positional args to select action

Key patterns:
- Parameters are passed as: paramName:JSON.stringify(value)
- Boolean flags like --flag set variables
- Required args should error if missing
- Help text should show correct invocation: ${group.filename} <args>

CRITICAL - Complex parameters handling:
- For array/object params (type: "array" or "object"), MUST expose via:
  - --<param> <json> for inline JSON
  - --<param>-file <path> for reading JSON from file
- NEVER skip complex parameters - they are often the most important
- Example: --slices '[{"path":"file.ts","ranges":[{"start_line":10}]}]'
- Example: --edits-file edits.json

Example mcporter call helper:
function callMcp(tool, params = {}) {
  const paramStr = Object.entries(params)
    .map(([k, v]) => \`\${k}:\${JSON.stringify(v)}\`)
    .join(" ");
  const cmd = \`npx mcporter call --stdio "${mcpCommand}" ${serverName}.\${tool} \${paramStr}\`;
  try {
    return execSync(cmd, { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] });
  } catch (error) {
    throw new Error(error.stderr || error.message);
  }
}

Output ONLY the complete JavaScript code, no explanations or markdown fences.`;
}

/**
 * Clean the generated code from Pi
 * @param {string} output - Pi output
 * @returns {string} - Cleaned JavaScript code
 */
function cleanGeneratedCode(output) {
  let code = output.trim();

  // Remove markdown code fences if present
  code = code.replace(/^```(?:javascript|js)?\n?/i, "");
  code = code.replace(/\n?```$/i, "");

  // Ensure shebang is at the start
  if (!code.startsWith("#!/usr/bin/env node")) {
    if (code.includes("#!/usr/bin/env node")) {
      // Remove misplaced shebang and add at start
      code = code.replace(/^#!\/usr\/bin\/env node\n?/gm, "");
    }
    code = "#!/usr/bin/env node\n\n" + code;
  }

  return code;
}

/**
 * Identify complex parameters that need special CLI handling
 * @param {object} inputSchema - Tool input schema
 * @returns {Array} - Array of complex param names
 */
function getComplexParams(inputSchema) {
  if (!inputSchema?.properties) return [];

  const complex = [];
  for (const [name, schema] of Object.entries(inputSchema.properties)) {
    if (schema.type === "array" || schema.type === "object") {
      complex.push(name);
    }
  }
  return complex;
}

/**
 * Validate generated code
 * @param {string} code - Generated JavaScript code
 * @param {string} filename - Expected filename
 * @returns {boolean}
 */
function validateGeneratedCode(code, filename) {
  // Check shebang
  if (!code.startsWith("#!/usr/bin/env node")) {
    throw new Error(`${filename}: Missing shebang`);
  }

  // Check for require() (should use import)
  if (/\brequire\s*\(/.test(code)) {
    throw new Error(`${filename}: Uses require() instead of import`);
  }

  // Check for CLI library imports (not allowed)
  if (/import.*from\s+['"](?:yargs|commander|meow|minimist)['"]/.test(code)) {
    throw new Error(`${filename}: Uses forbidden CLI library`);
  }

  // Check for --help implementation
  if (!code.includes("--help")) {
    throw new Error(`${filename}: Missing --help implementation`);
  }

  // Check for execSync or mcporter call
  if (!code.includes("execSync") && !code.includes("mcporter")) {
    throw new Error(`${filename}: Missing mcporter call`);
  }

  return true;
}

/**
 * Validate parameter coverage in generated code
 * @param {string} code - Generated JavaScript code
 * @param {Array} tools - Tool definitions for this wrapper
 * @param {string} filename - Wrapper filename
 * @returns {object} - Coverage report with warnings
 */
export function validateParameterCoverage(code, tools, filename) {
  const warnings = [];
  const codeLower = code.toLowerCase();

  for (const tool of tools) {
    const complexParams = getComplexParams(tool.inputSchema);

    for (const param of complexParams) {
      const paramLower = param.toLowerCase();
      const paramKebab = paramLower.replace(/_/g, "-");
      // Check if the parameter is referenced in the code (as flag or in help)
      const hasFlag = codeLower.includes(`--${paramKebab}`) || codeLower.includes(`--${paramLower}`);
      const hasFileFlag = codeLower.includes(`--${paramKebab}-file`) || codeLower.includes(`--${paramLower}-file`);

      if (!hasFlag && !hasFileFlag) {
        warnings.push(`${filename}: Complex param '${param}' (${tool.inputSchema.properties[param].type}) from ${tool.name} not exposed in CLI`);
      }
    }
  }

  return { warnings };
}

/**
 * Build command for AI agent invocation
 * @param {string} tempFile - Path to prompt file
 * @param {string} agentType - "pi" or "claude"
 * @returns {string} - Shell command
 */
function buildAgentCommand(tempFile, agentType) {
  if (agentType === "pi") {
    return `pi -p --no-session --tools "" @"${tempFile}"`;
  } else if (agentType === "claude") {
    return `cat "${tempFile}" | claude -p --tools ""`;
  }
  throw new Error(`Unknown agent type: ${agentType}`);
}

/**
 * Generate a wrapper script using AI agent
 * @param {object} group - Group object
 * @param {Array} tools - Full tool definitions
 * @param {string} serverName - MCP server name
 * @param {string} mcpCommand - npx command for MCP server
 * @param {object} options - options
 * @param {boolean} options.quiet - suppress output
 * @param {string} options.agentType - "pi" or "claude"
 * @returns {Promise<string>} - Generated JavaScript code
 */
export async function generateWrapper(group, tools, serverName, mcpCommand, options = {}) {
  const { quiet = false, agentType = "pi" } = options;

  const prompt = generateWrapperPrompt(group, tools, serverName, mcpCommand);
  const tempFile = join(tmpdir(), `mcp2cli-wrapper-${Date.now()}.md`);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000);

  try {
    writeFileSync(tempFile, prompt, "utf-8");

    const cmd = buildAgentCommand(tempFile, agentType);
    const { stdout } = await execAsync(cmd, {
      encoding: "utf-8",
      signal: controller.signal,
      maxBuffer: 10 * 1024 * 1024,
    });

    const code = cleanGeneratedCode(stdout);
    validateGeneratedCode(code, group.filename);

    return code;
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error(`${group.filename}: Generation timed out`);
    }
    throw new Error(`${group.filename}: ${error.message}`);
  } finally {
    clearTimeout(timeoutId);
    try {
      unlinkSync(tempFile);
    } catch {
      // Ignore cleanup errors
    }
  }
}

/**
 * Generate package.json content
 * @param {string} name - Package name
 * @param {string} description - Package description
 * @returns {string} - JSON string
 */
export function generatePackageJson(name, description) {
  return JSON.stringify(
    {
      name,
      version: "1.0.0",
      type: "module",
      description: `Token-efficient ${description} for AI agents via MCP`,
      author: "Generated by mcp2cli",
      license: "MIT",
      dependencies: {},
    },
    null,
    2
  );
}

/**
 * Generate .gitignore content
 * @returns {string}
 */
export function generateGitignore() {
  return `node_modules/
.DS_Store
*.log
`;
}

/**
 * Generate README.md using AI agent
 * @param {string} name - Package name
 * @param {Array} groups - Tool groups
 * @param {Array} tools - Full tool definitions
 * @param {object} options - options
 * @param {string} options.agentType - "pi" or "claude"
 * @returns {Promise<string>} - README content
 */
export async function generateReadme(name, groups, tools, options = {}) {
  const { agentType = "pi" } = options;

  const groupSummary = groups
    .map((g) => `- ${g.filename}: ${g.description} (wraps: ${g.mcp_tools.join(", ")})`)
    .join("\n");

  const prompt = `Generate a README.md for a CLI tool package.

Package name: ${name}
Total MCP tools: ${tools.length}
Total wrapper scripts: ${groups.length}

Wrapper scripts:
${groupSummary}

Requirements:
1. Start with # ${name} heading
2. Brief description mentioning it's for AI agents via MCP
3. ## Usage section showing how to run tools with full path: ~/agent-tools/${name}/<tool>.js
4. ## How to Invoke section explaining CORRECT (full path) vs INCORRECT (node prefix)
5. For each wrapper script, a section with:
   - Usage examples
   - Available options/flags
   - Brief description
6. ## Example Workflow section showing typical usage pattern
7. ## Credits section with this EXACT content:
   ## Credits

   These CLI tools are powered by [mcporter](https://github.com/steipete/mcporter),
   which provides the core MCP-to-CLI bridge functionality.

   Generated by [mcp2cli](https://github.com/nicobailon/mcp2cli) for the Pi coding agent.

Keep it concise and token-efficient. Focus on practical usage.
Output ONLY the markdown content, no explanations.`;

  const tempFile = join(tmpdir(), `mcp2cli-readme-${Date.now()}.md`);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 120000);

  try {
    writeFileSync(tempFile, prompt, "utf-8");

    const cmd = buildAgentCommand(tempFile, agentType);
    const { stdout } = await execAsync(cmd, {
      encoding: "utf-8",
      signal: controller.signal,
      maxBuffer: 10 * 1024 * 1024,
    });

    return stdout.trim();
  } catch (error) {
    return generateBasicReadme(name, groups);
  } finally {
    clearTimeout(timeoutId);
    try {
      unlinkSync(tempFile);
    } catch {
      // Ignore cleanup errors
    }
  }
}

/**
 * Generate basic README (fallback)
 * @param {string} name - Package name
 * @param {Array} groups - Tool groups
 * @returns {string}
 */
export function generateBasicReadme(name, groups) {
  const toolList = groups.map((g) => `- \`${g.filename}\`: ${g.description}`).join("\n");
  const firstTool = groups[0]?.filename || "tool.js";

  return `# ${name}

Token-efficient CLI tools for AI agents via MCP.

## Usage

\`\`\`bash
~/agent-tools/${name}/${firstTool} --help
\`\`\`

## How to Invoke

**CORRECT:**
\`\`\`bash
~/agent-tools/${name}/${firstTool} --help
\`\`\`

**INCORRECT:**
\`\`\`bash
node ~/agent-tools/${name}/${firstTool}  # Don't use 'node' prefix
\`\`\`

## Available Tools

${toolList}

Run any tool with \`--help\` for usage information.

## Credits

These CLI tools are powered by [mcporter](https://github.com/steipete/mcporter),
which provides the core MCP-to-CLI bridge functionality.

Generated by [mcp2cli](https://github.com/nicobailon/mcp2cli) for the Pi coding agent.
`;
}

/**
 * Generate AGENTS.md entry snippet
 * @param {string} name - Package name
 * @param {Array} groups - Tool groups
 * @param {string|undefined} packageDescription - Package description from registry
 * @returns {string}
 */
export function generateAgentsEntry(name, groups, packageDescription) {
  const toolList = groups.map((g) => `\`${g.filename}\``).join(", ");
  const firstTool = groups[0]?.filename || "tool.js";

  const displayName = name
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

  const description = packageDescription || `Tools for ${displayName} operations.`;

  return `### ${displayName} Tools
${description}

**Tools:** ${toolList}

\`\`\`bash
~/agent-tools/${name}/${firstTool} --help
\`\`\`
Full docs: \`~/agent-tools/${name}/README.md\`
`;
}
