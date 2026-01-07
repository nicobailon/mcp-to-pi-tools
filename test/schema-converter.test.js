/**
 * Tests for schema-converter module
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import {
  schemaToTypeBox,
  snakeToCamel,
  camelToSnake,
  toolSchemaToTypeBox,
  mergeToolSchemas,
  isValidIdentifier,
  isValidToolName,
} from "../lib/schema-converter.js";

describe("schemaToTypeBox", () => {
  it("should convert string type", () => {
    const result = schemaToTypeBox({ type: "string" });
    assert.strictEqual(result, "Type.String()");
  });

  it("should convert string with description", () => {
    const result = schemaToTypeBox({ type: "string", description: "A test" });
    assert.ok(result.includes('description: "A test"'));
  });

  it("should convert number type", () => {
    const result = schemaToTypeBox({ type: "number" });
    assert.strictEqual(result, "Type.Number()");
  });

  it("should convert integer type", () => {
    const result = schemaToTypeBox({ type: "integer" });
    assert.strictEqual(result, "Type.Integer()");
  });

  it("should convert boolean type", () => {
    const result = schemaToTypeBox({ type: "boolean" });
    assert.strictEqual(result, "Type.Boolean()");
  });

  it("should convert null type", () => {
    const result = schemaToTypeBox({ type: "null" });
    assert.strictEqual(result, "Type.Null()");
  });

  it("should convert array type", () => {
    const result = schemaToTypeBox({
      type: "array",
      items: { type: "string" },
    });
    assert.ok(result.includes("Type.Array("));
    assert.ok(result.includes("Type.String()"));
  });

  it("should convert object type with properties", () => {
    const result = schemaToTypeBox({
      type: "object",
      properties: {
        name: { type: "string" },
        age: { type: "number" },
      },
      required: ["name"],
    });
    assert.ok(result.includes("Type.Object({"));
    assert.ok(result.includes("name: Type.String()"));
    assert.ok(result.includes("age: Type.Optional(Type.Number())"));
  });

  it("should convert enum to StringEnum", () => {
    const result = schemaToTypeBox({
      enum: ["a", "b", "c"],
    });
    assert.ok(result.includes("StringEnum(["));
    assert.ok(result.includes('"a"'));
    assert.ok(result.includes('"b"'));
    assert.ok(result.includes('"c"'));
    assert.ok(result.includes("] as const)"));
  });

  it("should escape special characters in enum values", () => {
    const result = schemaToTypeBox({
      enum: ['hello', 'world"s', 'foo\nbar'],
    });
    // Should have escaped quotes and newlines
    assert.ok(result.includes('\\"'), "Should escape quotes");
    assert.ok(result.includes("\\n"), "Should escape newlines");
    assert.ok(!result.includes('world"s'), "Should not have unescaped quote");
  });

  it("should handle optional properties", () => {
    const result = schemaToTypeBox({ type: "string" }, true);
    assert.ok(result.includes("Type.Optional("));
    assert.ok(result.includes("Type.String()"));
  });

  it("should handle nested objects", () => {
    const result = schemaToTypeBox({
      type: "object",
      properties: {
        user: {
          type: "object",
          properties: {
            name: { type: "string" },
          },
        },
      },
    });
    assert.ok(result.includes("Type.Object({"));
    assert.ok(result.includes("user: Type.Optional(Type.Object({"));
    assert.ok(result.includes("name: Type.Optional(Type.String())"));
  });

  it("should handle arrays of objects", () => {
    const result = schemaToTypeBox({
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "number" },
        },
      },
    });
    assert.ok(result.includes("Type.Array("));
    assert.ok(result.includes("Type.Object({"));
    assert.ok(result.includes("id: Type.Optional(Type.Number())"));
  });

  it("should handle union types", () => {
    const result = schemaToTypeBox({
      type: ["string", "null"],
    });
    assert.ok(result.includes("Type.Union(["));
    assert.ok(result.includes("Type.String()"));
    assert.ok(result.includes("Type.Null()"));
  });

  it("should handle oneOf schemas", () => {
    const result = schemaToTypeBox({
      oneOf: [
        { type: "string" },
        { type: "number" },
      ],
    });
    assert.ok(result.includes("Type.Union(["));
  });

  it("should handle allOf schemas", () => {
    const result = schemaToTypeBox({
      allOf: [
        { type: "object", properties: { a: { type: "string" } } },
        { type: "object", properties: { b: { type: "number" } } },
      ],
    });
    assert.ok(result.includes("Type.Intersect(["));
  });

  it("should include min/max constraints", () => {
    const result = schemaToTypeBox({
      type: "number",
      minimum: 0,
      maximum: 100,
    });
    assert.ok(result.includes("minimum: 0"));
    assert.ok(result.includes("maximum: 100"));
  });

  it("should handle empty schema", () => {
    const result = schemaToTypeBox({});
    assert.strictEqual(result, "Type.Unknown()");
  });

  it("should handle null schema", () => {
    const result = schemaToTypeBox(null);
    assert.strictEqual(result, "Type.Unknown()");
  });
});

describe("snakeToCamel", () => {
  it("should convert snake_case to camelCase", () => {
    assert.strictEqual(snakeToCamel("hello_world"), "helloWorld");
  });

  it("should handle single word", () => {
    assert.strictEqual(snakeToCamel("hello"), "hello");
  });

  it("should handle multiple underscores", () => {
    assert.strictEqual(snakeToCamel("foo_bar_baz"), "fooBarBaz");
  });

  it("should handle leading underscore", () => {
    // Leading underscore followed by lowercase becomes uppercase (current behavior)
    assert.strictEqual(snakeToCamel("_private"), "Private");
  });

  it("should convert kebab-case to camelCase", () => {
    assert.strictEqual(snakeToCamel("hello-world"), "helloWorld");
  });

  it("should handle mixed snake_case and kebab-case", () => {
    assert.strictEqual(snakeToCamel("foo_bar-baz"), "fooBarBaz");
  });
});

describe("camelToSnake", () => {
  it("should convert camelCase to snake_case", () => {
    assert.strictEqual(camelToSnake("helloWorld"), "hello_world");
  });

  it("should handle single word", () => {
    assert.strictEqual(camelToSnake("hello"), "hello");
  });

  it("should handle multiple capitals", () => {
    assert.strictEqual(camelToSnake("fooBarBaz"), "foo_bar_baz");
  });
});

describe("toolSchemaToTypeBox", () => {
  it("should convert tool with inputSchema", () => {
    const tool = {
      name: "test",
      inputSchema: {
        type: "object",
        properties: {
          url: { type: "string", description: "The URL" },
        },
        required: ["url"],
      },
    };
    const result = toolSchemaToTypeBox(tool);
    assert.ok(result.includes("Type.Object({"));
    assert.ok(result.includes("url: Type.String("));
    assert.ok(result.includes('description: "The URL"'));
  });

  it("should return empty object for tool without inputSchema", () => {
    const result = toolSchemaToTypeBox({ name: "test" });
    assert.strictEqual(result, "Type.Object({})");
  });

  it("should return empty object for tool with empty properties", () => {
    const result = toolSchemaToTypeBox({
      name: "test",
      inputSchema: { type: "object", properties: {} },
    });
    assert.strictEqual(result, "Type.Object({})");
  });
});

describe("mergeToolSchemas", () => {
  it("should merge multiple tool schemas", () => {
    const tools = [
      {
        name: "click",
        inputSchema: {
          type: "object",
          properties: {
            uid: { type: "string" },
          },
          required: ["uid"],
        },
      },
      {
        name: "hover",
        inputSchema: {
          type: "object",
          properties: {
            uid: { type: "string" },
          },
          required: ["uid"],
        },
      },
    ];

    const result = mergeToolSchemas(tools, "action");
    assert.ok(result.schema.includes("action: StringEnum(["));
    assert.ok(result.schema.includes('"click"'));
    assert.ok(result.schema.includes('"hover"'));
    assert.ok(result.schema.includes("uid:"));
    assert.deepStrictEqual(result.actionValues, ["click", "hover"]);
  });

  it("should handle single tool", () => {
    const tools = [
      {
        name: "test",
        inputSchema: {
          type: "object",
          properties: { url: { type: "string" } },
          required: ["url"],
        },
      },
    ];

    const result = mergeToolSchemas(tools);
    assert.ok(result.schema.includes("url:"));
    assert.ok(!result.schema.includes("action:"));
    assert.deepStrictEqual(result.actionValues, ["test"]);
  });

  it("should handle empty tools array", () => {
    const result = mergeToolSchemas([]);
    assert.strictEqual(result.schema, "Type.Object({})");
    assert.deepStrictEqual(result.actionValues, []);
  });

  it("should mark tool-specific params as optional", () => {
    const tools = [
      {
        name: "click",
        inputSchema: {
          type: "object",
          properties: {
            uid: { type: "string" },
            doubleClick: { type: "boolean" },
          },
          required: ["uid"],
        },
      },
      {
        name: "hover",
        inputSchema: {
          type: "object",
          properties: {
            uid: { type: "string" },
          },
          required: ["uid"],
        },
      },
    ];

    const result = mergeToolSchemas(tools);
    // doubleClick is only on click, so should note "Only for: click"
    assert.ok(result.schema.includes("doubleClick"));
    assert.ok(result.schema.includes("Only for: click"));
  });

  it("should build correct param mapping", () => {
    const tools = [
      {
        name: "test",
        inputSchema: {
          type: "object",
          properties: { user_name: { type: "string" } },
        },
      },
    ];

    const result = mergeToolSchemas(tools);
    assert.strictEqual(result.paramMapping.userName, "user_name");
  });
});

describe("isValidIdentifier", () => {
  it("should validate simple identifiers", () => {
    assert.ok(isValidIdentifier("foo"));
    assert.ok(isValidIdentifier("Foo"));
    assert.ok(isValidIdentifier("_foo"));
    assert.ok(isValidIdentifier("$foo"));
    assert.ok(isValidIdentifier("foo123"));
  });

  it("should reject invalid identifiers", () => {
    assert.ok(!isValidIdentifier("123foo"));
    assert.ok(!isValidIdentifier("foo-bar"));
    assert.ok(!isValidIdentifier("foo bar"));
    assert.ok(!isValidIdentifier(""));
  });
});

describe("isValidToolName", () => {
  it("should validate snake_case tool names", () => {
    assert.ok(isValidToolName("foo"));
    assert.ok(isValidToolName("foo_bar"));
    assert.ok(isValidToolName("foo_bar_baz"));
    assert.ok(isValidToolName("foo123"));
    assert.ok(isValidToolName("foo_123"));
  });

  it("should reject invalid tool names", () => {
    assert.ok(!isValidToolName("Foo"));
    assert.ok(!isValidToolName("fooBar"));
    assert.ok(!isValidToolName("foo-bar"));
    assert.ok(!isValidToolName("123foo"));
    assert.ok(!isValidToolName("_foo"));
    assert.ok(!isValidToolName(""));
  });
});
