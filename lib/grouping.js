/**
 * Tool Grouping via Pi
 * Uses Pi's non-interactive mode to intelligently group MCP tools
 */

import { exec } from "child_process";
import { promisify } from "util";
import { writeFileSync, unlinkSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const execAsync = promisify(exec);

/**
 * Generate the grouping prompt for Pi
 * @param {string} serverName - MCP server name
 * @param {Array} tools - Array of tool objects with name, description, inputSchema
 * @returns {string} - Prompt for Pi
 */
function generateGroupingPrompt(serverName, tools) {
  const toolList = tools
    .map((t) => {
      const params = t.inputSchema?.properties
        ? Object.entries(t.inputSchema.properties)
            .map(([name, schema]) => {
              const required = t.inputSchema.required?.includes(name) ? " (required)" : "";
              return `      - ${name}: ${schema.type || "any"}${required} - ${schema.description || ""}`;
            })
            .join("\n")
        : "      (no parameters)";

      return `  - ${t.name}: ${t.description || "No description"}\n    Parameters:\n${params}`;
    })
    .join("\n\n");

  return `You are grouping MCP tools into CLI wrapper scripts for the Pi coding agent.

MCP Server: ${serverName}
Total Tools: ${tools.length}

MCP Tools:
${toolList}

Group these tools into logical CLI commands. Guidelines:
- Group related actions (e.g., all navigation under ${serverName}-navigate.js)
- Create dedicated tools for high-frequency operations (e.g., snapshot gets its own tool)
- Keep groups cohesive (max 5-6 MCP tools per wrapper, fewer for complex tools)
- Name wrappers: ${serverName}-<action>.js (lowercase, hyphenated)
- Maximum 20 wrapper scripts total
- Single-tool wrappers are fine for important/complex tools

Output ONLY valid JSON (no markdown, no explanation):
{
  "groups": [
    {
      "filename": "${serverName}-example.js",
      "description": "One-line description of what this wrapper does",
      "mcp_tools": ["tool_name_1", "tool_name_2"],
      "rationale": "Brief explanation of why these are grouped"
    }
  ]
}`;
}

/**
 * Parse Pi's response to extract JSON
 * @param {string} output - Pi output
 * @returns {object} - Parsed JSON
 */
function parseGroupingResponse(output) {
  // Try to find JSON in the output
  const jsonMatch = output.match(/\{[\s\S]*"groups"[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("No valid JSON found in Pi response");
  }

  try {
    return JSON.parse(jsonMatch[0]);
  } catch (e) {
    throw new Error(`Failed to parse grouping JSON: ${e.message}`);
  }
}

/**
 * Validate the grouping response
 * @param {object} response - Parsed response
 * @param {Array} tools - Original tools array
 * @returns {object} - Validated response
 */
function validateGrouping(response, tools) {
  if (!response.groups || !Array.isArray(response.groups)) {
    throw new Error("Invalid grouping response: missing groups array");
  }

  if (response.groups.length > 20) {
    throw new Error(`Too many groups (${response.groups.length}), maximum is 20`);
  }

  const toolNames = new Set(tools.map((t) => t.name));
  const usedTools = new Set();

  for (const group of response.groups) {
    if (!group.filename || !group.mcp_tools || !Array.isArray(group.mcp_tools)) {
      throw new Error(`Invalid group: ${JSON.stringify(group)}`);
    }

    // Verify all referenced tools exist
    for (const toolName of group.mcp_tools) {
      if (!toolNames.has(toolName)) {
        throw new Error(`Unknown tool referenced: ${toolName}`);
      }
      usedTools.add(toolName);
    }
  }

  // Check for unused tools - FAIL by default, warn with flag
  const unusedTools = [...toolNames].filter((t) => !usedTools.has(t));
  if (unusedTools.length > 0) {
    const message = `${unusedTools.length} MCP tools not assigned to any group: ${unusedTools.join(", ")}`;
    if (process.env.MCP2CLI_ALLOW_UNUSED === "true") {
      console.warn(`      Warning: ${message}`);
    } else {
      throw new Error(`${message}\n      Set MCP2CLI_ALLOW_UNUSED=true to allow unused tools, or ensure all tools are grouped.`);
    }
  }

  return response;
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
 * Group tools using AI agent's non-interactive mode
 * @param {string} serverName - MCP server name
 * @param {Array} tools - Array of tool objects
 * @param {object} options - options
 * @param {boolean} options.quiet - suppress progress output
 * @param {string} options.agentType - "pi" or "claude"
 * @returns {Promise<Array>} - Array of group objects
 */
export async function groupTools(serverName, tools, options = {}) {
  const { quiet = false, agentType = "pi" } = options;

  const prompt = generateGroupingPrompt(serverName, tools);
  const tempFile = join(tmpdir(), `mcp2cli-grouping-${Date.now()}.md`);
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

    const response = parseGroupingResponse(stdout);
    const validated = validateGrouping(response, tools);

    if (!quiet) {
      console.log(`      Created ${validated.groups.length} tool groups`);
    }

    return validated.groups;
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("Grouping timed out after 2 minutes");
    }
    if (error.stderr && (error.stderr.includes("pi") || error.stderr.includes("claude"))) {
      throw new Error(`Agent error: ${error.stderr}`);
    }
    throw new Error(`Grouping failed: ${error.message}`);
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
 * Fallback grouping when no AI agent (Pi/Claude) is available
 * Creates one wrapper per tool (simple but works)
 * @param {string} serverName - MCP server name
 * @param {Array} tools - Array of tool objects
 * @returns {Array} - Array of group objects
 */
export function fallbackGrouping(serverName, tools) {
  return tools.map((tool) => ({
    filename: `${serverName}-${tool.name.replace(/_/g, "-")}.js`,
    description: tool.description || `Wrapper for ${tool.name}`,
    mcp_tools: [tool.name],
    rationale: "Direct 1:1 mapping (fallback mode)",
  }));
}
