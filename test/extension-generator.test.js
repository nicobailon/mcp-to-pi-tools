/**
 * Tests for extension-generator module
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import {
  generateExtension,
  generateExtensionPackageJson,
  generateExtensionReadme,
  generateExtensionFiles,
} from "../lib/extension-generator.js";

const sampleTools = [
  {
    name: "get_time",
    description: "Get current time in a timezone",
    inputSchema: {
      type: "object",
      properties: {
        timezone: { type: "string", description: "IANA timezone name" },
      },
      required: ["timezone"],
    },
  },
  {
    name: "convert_time",
    description: "Convert time between timezones",
    inputSchema: {
      type: "object",
      properties: {
        time: { type: "string", description: "Time to convert (HH:MM)" },
        source_timezone: { type: "string", description: "Source timezone" },
        target_timezone: { type: "string", description: "Target timezone" },
      },
      required: ["time", "source_timezone", "target_timezone"],
    },
  },
];

const singleToolGroup = [
  {
    toolName: "get_time",
    label: "Get Time",
    description: "Get current time in a timezone",
    mcpTools: ["get_time"],
    rationale: "Single tool for time retrieval",
  },
];

const multiToolGroup = [
  {
    toolName: "time_ops",
    label: "Time Operations",
    description: "Time operations including get and convert",
    mcpTools: ["get_time", "convert_time"],
    rationale: "Related time operations",
  },
];

describe("generateExtension", () => {
  it("should generate valid TypeScript code for single-tool group", () => {
    const result = generateExtension({
      serverName: "time-server",
      mcpCommand: "uvx mcp-server-time",
      packageName: "mcp-server-time",
      groups: singleToolGroup,
      tools: sampleTools.slice(0, 1),
    });

    // Check header
    assert.ok(result.includes("time-server MCP Extension"));
    assert.ok(result.includes("mcp-server-time"));

    // Check imports
    assert.ok(result.includes('import type { ExtensionAPI } from "@mariozechner/pi-coding-agent"'));
    assert.ok(result.includes('import { Type } from "@sinclair/typebox"'));
    assert.ok(result.includes('import { StringEnum } from "@mariozechner/pi-ai"'));

    // Check constants
    assert.ok(result.includes('MCP_COMMAND = "uvx mcp-server-time"'));
    assert.ok(result.includes('SERVER_NAME = "time-server"'));

    // Check callMcp helper
    assert.ok(result.includes("function callMcp("));
    assert.ok(result.includes("execSync(cmd,"));

    // Check extension function
    assert.ok(result.includes("export default function timeServerExtension(pi: ExtensionAPI)"));

    // Check tool registration
    assert.ok(result.includes('name: "get_time"'));
    assert.ok(result.includes('label: "Get Time"'));
    assert.ok(result.includes("pi.registerTool({"));
  });

  it("should generate valid TypeScript code for multi-tool group", () => {
    const result = generateExtension({
      serverName: "time-server",
      mcpCommand: "uvx mcp-server-time",
      packageName: "mcp-server-time",
      groups: multiToolGroup,
      tools: sampleTools,
    });

    // Check action parameter is added
    assert.ok(result.includes("action: StringEnum(["));
    assert.ok(result.includes('"get_time"'));
    assert.ok(result.includes('"convert_time"'));

    // Check switch statement for dispatch
    assert.ok(result.includes("switch (params.action)"));
    assert.ok(result.includes('case "get_time":'));
    assert.ok(result.includes('case "convert_time":'));
  });

  it("should include rationale comment", () => {
    const result = generateExtension({
      serverName: "time-server",
      mcpCommand: "uvx mcp-server-time",
      packageName: "mcp-server-time",
      groups: singleToolGroup,
      tools: sampleTools.slice(0, 1),
    });

    assert.ok(result.includes("AI rationale:"));
  });

  it("should handle signal abort check", () => {
    const result = generateExtension({
      serverName: "time-server",
      mcpCommand: "uvx mcp-server-time",
      packageName: "mcp-server-time",
      groups: singleToolGroup,
      tools: sampleTools.slice(0, 1),
    });

    assert.ok(result.includes("signal?.aborted"));
    assert.ok(result.includes('text: "Aborted"'));
  });

  it("should properly escape string values", () => {
    const groups = [
      {
        toolName: "test_tool",
        label: 'Test "Tool"',
        description: "A tool with\nnewlines",
        mcpTools: ["test"],
        rationale: "Testing",
      },
    ];
    const tools = [
      {
        name: "test",
        inputSchema: { type: "object", properties: {} },
      },
    ];

    const result = generateExtension({
      serverName: "test",
      mcpCommand: "test",
      packageName: "test",
      groups,
      tools,
    });

    // Should escape quotes and newlines
    assert.ok(result.includes('\\"Tool\\"') || result.includes("Test \\\"Tool\\\""));
    assert.ok(result.includes("\\n"));
  });
});

describe("generateExtensionPackageJson", () => {
  it("should generate valid package.json", () => {
    const result = generateExtensionPackageJson({
      name: "time-server",
      packageName: "mcp-server-time",
      mcpCommand: "uvx mcp-server-time",
      description: "Time utilities",
    });

    const parsed = JSON.parse(result);

    assert.strictEqual(parsed.name, "time-server-mcp-extension");
    assert.strictEqual(parsed.version, "1.0.0");
    assert.strictEqual(parsed.type, "module");
    assert.strictEqual(parsed.mcp.package, "mcp-server-time");
    assert.strictEqual(parsed.mcp.command, "uvx mcp-server-time");
    assert.strictEqual(parsed.description, "Time utilities");
    assert.deepStrictEqual(parsed.dependencies, {});
  });

  it("should use default description if not provided", () => {
    const result = generateExtensionPackageJson({
      name: "time-server",
      packageName: "mcp-server-time",
      mcpCommand: "uvx mcp-server-time",
    });

    const parsed = JSON.parse(result);
    assert.ok(parsed.description.includes("time-server"));
  });
});

describe("generateExtensionReadme", () => {
  it("should generate README with all sections", () => {
    const result = generateExtensionReadme({
      name: "time-server",
      serverName: "time-server",
      packageName: "mcp-server-time",
      groups: singleToolGroup,
      tools: sampleTools.slice(0, 1),
      description: "Time utilities",
    });

    // Check header
    assert.ok(result.includes("# time-server"));

    // Check overview
    assert.ok(result.includes("## Overview"));
    assert.ok(result.includes("mcp-server-time"));

    // Check installation
    assert.ok(result.includes("## Installation"));
    assert.ok(result.includes("~/.pi/agent/extensions/time-server/"));

    // Check tools section
    assert.ok(result.includes("## Tools"));
    assert.ok(result.includes("### Get Time"));
    assert.ok(result.includes("`get_time`"));

    // Check regeneration
    assert.ok(result.includes("mcp2ext refresh time-server"));
  });

  it("should show actions for multi-tool groups", () => {
    const result = generateExtensionReadme({
      name: "time-server",
      serverName: "time-server",
      packageName: "mcp-server-time",
      groups: multiToolGroup,
      tools: sampleTools,
    });

    assert.ok(result.includes("**Actions:**"));
    assert.ok(result.includes("`get_time`"));
    assert.ok(result.includes("`convert_time`"));
  });

  it("should show wrapped MCP tools", () => {
    const result = generateExtensionReadme({
      name: "time-server",
      serverName: "time-server",
      packageName: "mcp-server-time",
      groups: multiToolGroup,
      tools: sampleTools,
    });

    assert.ok(result.includes("*Wraps MCP tools:*"));
  });
});

describe("generateExtensionFiles", () => {
  it("should return all required files", () => {
    const result = generateExtensionFiles({
      name: "time-server",
      serverName: "time-server",
      mcpCommand: "uvx mcp-server-time",
      packageName: "mcp-server-time",
      groups: singleToolGroup,
      tools: sampleTools.slice(0, 1),
    });

    assert.ok("index.ts" in result);
    assert.ok("package.json" in result);
    assert.ok("README.md" in result);
  });

  it("should generate valid TypeScript in index.ts", () => {
    const result = generateExtensionFiles({
      name: "time-server",
      serverName: "time-server",
      mcpCommand: "uvx mcp-server-time",
      packageName: "mcp-server-time",
      groups: singleToolGroup,
      tools: sampleTools.slice(0, 1),
    });

    // Check it's TypeScript (has types)
    assert.ok(result["index.ts"].includes("ExtensionAPI"));
    assert.ok(result["index.ts"].includes("Record<string, unknown>"));
    assert.ok(result["index.ts"].includes("error: any"));
  });

  it("should generate valid JSON in package.json", () => {
    const result = generateExtensionFiles({
      name: "time-server",
      serverName: "time-server",
      mcpCommand: "uvx mcp-server-time",
      packageName: "mcp-server-time",
      groups: singleToolGroup,
      tools: sampleTools.slice(0, 1),
    });

    // Should not throw
    JSON.parse(result["package.json"]);
  });

  it("should handle complex nested schemas", () => {
    const complexTools = [
      {
        name: "complex",
        inputSchema: {
          type: "object",
          properties: {
            messages: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  role: { type: "string" },
                  content: { type: "string" },
                },
                required: ["role", "content"],
              },
            },
          },
          required: ["messages"],
        },
      },
    ];

    const groups = [
      {
        toolName: "complex_tool",
        label: "Complex Tool",
        description: "A complex tool",
        mcpTools: ["complex"],
      },
    ];

    const result = generateExtensionFiles({
      name: "test",
      serverName: "test",
      mcpCommand: "test",
      packageName: "test",
      groups,
      tools: complexTools,
    });

    // Should have nested Type.Array and Type.Object
    assert.ok(result["index.ts"].includes("Type.Array("));
    assert.ok(result["index.ts"].includes("Type.Object({"));
    assert.ok(result["index.ts"].includes("role:"));
    assert.ok(result["index.ts"].includes("content:"));
  });
});

describe("generated TypeScript validity", () => {
  it("should generate syntactically valid TypeScript", () => {
    const result = generateExtension({
      serverName: "test-server",
      mcpCommand: "npx test",
      packageName: "test",
      groups: multiToolGroup,
      tools: sampleTools,
    });

    // Check for balanced braces (simple validity check)
    const openBraces = (result.match(/{/g) || []).length;
    const closeBraces = (result.match(/}/g) || []).length;
    assert.strictEqual(openBraces, closeBraces, "Braces should be balanced");

    const openParens = (result.match(/\(/g) || []).length;
    const closeParens = (result.match(/\)/g) || []).length;
    assert.strictEqual(openParens, closeParens, "Parentheses should be balanced");

    const openBrackets = (result.match(/\[/g) || []).length;
    const closeBrackets = (result.match(/\]/g) || []).length;
    assert.strictEqual(openBrackets, closeBrackets, "Brackets should be balanced");
  });

  it("should use proper async/await syntax", () => {
    const result = generateExtension({
      serverName: "test",
      mcpCommand: "test",
      packageName: "test",
      groups: singleToolGroup,
      tools: sampleTools.slice(0, 1),
    });

    assert.ok(result.includes("async execute("));
    // execute function should have proper signature
    assert.ok(result.includes("toolCallId, params, onUpdate, ctx, signal"));
  });

  it("should have proper return statements", () => {
    const result = generateExtension({
      serverName: "test",
      mcpCommand: "test",
      packageName: "test",
      groups: singleToolGroup,
      tools: sampleTools.slice(0, 1),
    });

    assert.ok(result.includes("return {"));
    assert.ok(result.includes("content: ["));
    assert.ok(result.includes('type: "text"'));
  });

  it("should use bracket notation for hyphenated property names", () => {
    const groups = [{
      toolName: "test_tool",
      label: "Test Tool",
      description: "A test",
      mcpTools: ["test_action"],
    }];
    const tools = [{
      name: "test_action",
      inputSchema: {
        type: "object",
        properties: {
          "weird-param": { type: "string" },
          normal_param: { type: "string" },
        },
      },
    }];

    const result = generateExtension({
      serverName: "test",
      mcpCommand: "test",
      packageName: "test",
      groups,
      tools,
    });

    // Should use bracket notation for weird-param (which becomes weirdParam in camelCase)
    // The MCP param name "weird-param" should use bracket notation
    assert.ok(result.includes('mcpParams["weird-param"]'), "Should use bracket notation for hyphenated MCP params");
    // Normal params should use dot notation
    assert.ok(result.includes("params.normalParam") || result.includes("params.weirdParam"), "Should use dot notation for valid identifiers");
  });

  it("should handle server names starting with numbers", () => {
    const result = generateExtension({
      serverName: "123-server",
      mcpCommand: "test",
      packageName: "test",
      groups: singleToolGroup,
      tools: sampleTools.slice(0, 1),
    });

    // Function name should be valid (prefixed with underscore)
    assert.ok(result.includes("export default function _123Server"), "Should prefix with underscore for numeric start");
  });
});
