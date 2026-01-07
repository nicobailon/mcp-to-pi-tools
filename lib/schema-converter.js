/**
 * JSON Schema to TypeBox Converter
 * Converts MCP JSON Schema to TypeBox code strings for pi extensions
 */

/**
 * Convert a JSON Schema type to TypeBox code
 * @param {object} schema - JSON Schema object
 * @param {boolean} [isOptional=false] - Whether this property is optional
 * @returns {string} - TypeBox code string
 */
export function schemaToTypeBox(schema, isOptional = false) {
  if (!schema || typeof schema !== "object") {
    const type = "Type.Unknown()";
    return isOptional ? `Type.Optional(${type})` : type;
  }

  const opts = buildOptions(schema);
  let typeBox;

  // Handle enum first (can combine with type)
  if (schema.enum && Array.isArray(schema.enum)) {
    typeBox = buildEnumType(schema.enum, opts);
  } else if (schema.type === "string") {
    typeBox = opts ? `Type.String(${opts})` : "Type.String()";
  } else if (schema.type === "number") {
    typeBox = opts ? `Type.Number(${opts})` : "Type.Number()";
  } else if (schema.type === "integer") {
    typeBox = opts ? `Type.Integer(${opts})` : "Type.Integer()";
  } else if (schema.type === "boolean") {
    typeBox = opts ? `Type.Boolean(${opts})` : "Type.Boolean()";
  } else if (schema.type === "null") {
    typeBox = opts ? `Type.Null(${opts})` : "Type.Null()";
  } else if (schema.type === "array") {
    typeBox = buildArrayType(schema, opts);
  } else if (schema.type === "object" || schema.properties) {
    typeBox = buildObjectType(schema, opts);
  } else if (Array.isArray(schema.type)) {
    // Union type (e.g., ["string", "null"])
    typeBox = buildUnionType(schema, opts);
  } else if (schema.oneOf || schema.anyOf) {
    typeBox = buildUnionFromSchemas(schema.oneOf || schema.anyOf, opts);
  } else if (schema.allOf) {
    typeBox = buildIntersectionType(schema.allOf, opts);
  } else {
    // Fallback for unknown types
    typeBox = opts ? `Type.Unknown(${opts})` : "Type.Unknown()";
  }

  return isOptional ? `Type.Optional(${typeBox})` : typeBox;
}

/**
 * Build TypeBox options object from JSON Schema
 * @param {object} schema - JSON Schema object
 * @returns {string|null} - Options object string or null
 */
function buildOptions(schema) {
  const opts = {};

  if (schema.description) {
    opts.description = schema.description;
  }
  if (schema.default !== undefined) {
    opts.default = schema.default;
  }
  if (schema.minimum !== undefined) {
    opts.minimum = schema.minimum;
  }
  if (schema.maximum !== undefined) {
    opts.maximum = schema.maximum;
  }
  if (schema.minLength !== undefined) {
    opts.minLength = schema.minLength;
  }
  if (schema.maxLength !== undefined) {
    opts.maxLength = schema.maxLength;
  }
  if (schema.pattern !== undefined) {
    opts.pattern = schema.pattern;
  }
  if (schema.minItems !== undefined) {
    opts.minItems = schema.minItems;
  }
  if (schema.maxItems !== undefined) {
    opts.maxItems = schema.maxItems;
  }

  const keys = Object.keys(opts);
  if (keys.length === 0) {
    return null;
  }

  // Build options object string
  const parts = keys.map((key) => {
    const value = opts[key];
    if (typeof value === "string") {
      // Escape quotes and special characters in strings
      return `${key}: "${escapeStringLiteral(value)}"`;
    }
    return `${key}: ${JSON.stringify(value)}`;
  });

  return `{ ${parts.join(", ")} }`;
}

/**
 * Escape a string for use in a TypeScript string literal
 * @param {string} str - String to escape
 * @returns {string} - Escaped string (without surrounding quotes)
 */
function escapeStringLiteral(str) {
  return str
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t");
}

/**
 * Build enum type using StringEnum helper
 * @param {Array} enumValues - Array of enum values
 * @param {string|null} opts - Options string
 * @returns {string} - TypeBox code string
 */
function buildEnumType(enumValues, opts) {
  // Check if all values are strings
  const allStrings = enumValues.every((v) => typeof v === "string");

  if (allStrings) {
    const values = enumValues.map((v) => `"${escapeStringLiteral(v)}"`).join(", ");
    if (opts) {
      return `StringEnum([${values}] as const, ${opts})`;
    }
    return `StringEnum([${values}] as const)`;
  }

  // Mixed types - use Type.Union with Type.Literal
  const literals = enumValues.map((v) => {
    if (typeof v === "string") {
      return `Type.Literal("${escapeStringLiteral(v)}")`;
    }
    return `Type.Literal(${JSON.stringify(v)})`;
  });

  const union = `Type.Union([${literals.join(", ")}])`;
  // Note: Union doesn't take options directly
  return union;
}

/**
 * Build array type
 * @param {object} schema - JSON Schema with type: "array"
 * @param {string|null} opts - Options string
 * @returns {string} - TypeBox code string
 */
function buildArrayType(schema, opts) {
  let itemsType;

  if (schema.items) {
    itemsType = schemaToTypeBox(schema.items, false);
  } else {
    itemsType = "Type.Unknown()";
  }

  if (opts) {
    return `Type.Array(${itemsType}, ${opts})`;
  }
  return `Type.Array(${itemsType})`;
}

/**
 * Build object type
 * @param {object} schema - JSON Schema with type: "object" or properties
 * @param {string|null} opts - Options string
 * @returns {string} - TypeBox code string
 */
function buildObjectType(schema, opts) {
  if (!schema.properties || Object.keys(schema.properties).length === 0) {
    // Empty object or additionalProperties only
    if (schema.additionalProperties) {
      const valueType = schemaToTypeBox(schema.additionalProperties, false);
      if (opts) {
        return `Type.Record(Type.String(), ${valueType}, ${opts})`;
      }
      return `Type.Record(Type.String(), ${valueType})`;
    }
    if (opts) {
      return `Type.Object({}, ${opts})`;
    }
    return "Type.Object({})";
  }

  const required = new Set(schema.required || []);
  const props = [];

  for (const [propName, propSchema] of Object.entries(schema.properties)) {
    const isOptional = !required.has(propName);
    const propType = schemaToTypeBox(propSchema, isOptional);
    // Use computed property name if propName has special characters
    if (/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(propName)) {
      props.push(`${propName}: ${propType}`);
    } else {
      props.push(`"${escapeStringLiteral(propName)}": ${propType}`);
    }
  }

  const propsStr = props.join(",\n    ");

  if (opts) {
    return `Type.Object({\n    ${propsStr},\n  }, ${opts})`;
  }
  return `Type.Object({\n    ${propsStr},\n  })`;
}

/**
 * Build union type from array of type names
 * @param {object} schema - Schema with array type field
 * @param {string|null} opts - Options string
 * @returns {string} - TypeBox code string
 */
function buildUnionType(schema, opts) {
  const types = schema.type.map((t) => {
    if (t === "string") return "Type.String()";
    if (t === "number") return "Type.Number()";
    if (t === "integer") return "Type.Integer()";
    if (t === "boolean") return "Type.Boolean()";
    if (t === "null") return "Type.Null()";
    if (t === "array") return buildArrayType(schema);
    if (t === "object") return buildObjectType(schema);
    return "Type.Unknown()";
  });

  return `Type.Union([${types.join(", ")}])`;
}

/**
 * Build union from oneOf/anyOf schemas
 * @param {Array} schemas - Array of schemas
 * @param {string|null} opts - Options string
 * @returns {string} - TypeBox code string
 */
function buildUnionFromSchemas(schemas, opts) {
  const types = schemas.map((s) => schemaToTypeBox(s, false));
  return `Type.Union([${types.join(", ")}])`;
}

/**
 * Build intersection from allOf schemas
 * @param {Array} schemas - Array of schemas
 * @param {string|null} opts - Options string
 * @returns {string} - TypeBox code string
 */
function buildIntersectionType(schemas, opts) {
  const types = schemas.map((s) => schemaToTypeBox(s, false));
  return `Type.Intersect([${types.join(", ")}])`;
}

/**
 * Convert parameter name from snake_case or kebab-case to camelCase
 * @param {string} name - Parameter name in snake_case or kebab-case
 * @returns {string} - Parameter name in camelCase
 */
export function snakeToCamel(name) {
  return name.replace(/[-_]([a-z])/g, (_, letter) => letter.toUpperCase());
}

/**
 * Convert parameter name from camelCase to snake_case
 * @param {string} name - Parameter name in camelCase
 * @returns {string} - Parameter name in snake_case
 */
export function camelToSnake(name) {
  return name.replace(/([A-Z])/g, "_$1").toLowerCase();
}

/**
 * Generate TypeBox schema for a complete MCP tool
 * @param {object} tool - MCP tool with inputSchema
 * @returns {string} - TypeBox Type.Object code string
 */
export function toolSchemaToTypeBox(tool) {
  if (!tool.inputSchema || !tool.inputSchema.properties) {
    return "Type.Object({})";
  }

  return schemaToTypeBox(tool.inputSchema, false);
}

/**
 * Merge multiple MCP tool schemas into a single grouped schema
 * @param {Array} tools - Array of MCP tools with inputSchema
 * @param {string} actionParamName - Name for the action discriminator param (default: "action")
 * @returns {object} - { schema: string, actionValues: string[], paramMapping: object }
 */
export function mergeToolSchemas(tools, actionParamName = "action") {
  if (tools.length === 0) {
    return {
      schema: "Type.Object({})",
      actionValues: [],
      paramMapping: {},
    };
  }

  if (tools.length === 1) {
    const tool = tools[0];
    return {
      schema: toolSchemaToTypeBox(tool),
      actionValues: [tool.name],
      paramMapping: buildParamMapping(tool),
    };
  }

  const actionValues = tools.map((t) => t.name);

  // Collect all parameters from all tools
  const allParams = new Map(); // camelName -> { schema, tools: Set, required: Set }

  for (const tool of tools) {
    const props = tool.inputSchema?.properties || {};
    const required = new Set(tool.inputSchema?.required || []);

    for (const [snakeName, paramSchema] of Object.entries(props)) {
      const camelName = snakeToCamel(snakeName);

      if (!allParams.has(camelName)) {
        allParams.set(camelName, {
          snakeName,
          schema: paramSchema,
          tools: new Set(),
          required: new Set(),
        });
      }

      const entry = allParams.get(camelName);
      entry.tools.add(tool.name);
      if (required.has(snakeName)) {
        entry.required.add(tool.name);
      }
    }
  }

  // Build merged schema
  const props = [];
  const paramMapping = {};

  // Add action parameter first
  const actionEnumValues = actionValues.map((v) => `"${escapeStringLiteral(v)}"`).join(", ");
  props.push(
    `${actionParamName}: StringEnum([${actionEnumValues}] as const, { description: "Action to perform" })`
  );

  // Add merged parameters
  for (const [camelName, entry] of allParams) {
    paramMapping[camelName] = entry.snakeName;

    // Parameter is required only if it's required in ALL tools that use it
    // and ALL tools use this parameter
    const isRequiredInAll =
      entry.required.size === tools.length &&
      entry.tools.size === tools.length;

    // Build description noting which actions use this param
    let description = entry.schema.description || "";
    if (entry.tools.size < tools.length) {
      const toolList = Array.from(entry.tools).join(", ");
      const actionNote = `Only for: ${toolList}`;
      description = description ? `${description}. ${actionNote}` : actionNote;
    }

    // Clone schema with updated description
    const enhancedSchema = {
      ...entry.schema,
      description: description || undefined,
    };

    const typeBoxCode = schemaToTypeBox(enhancedSchema, !isRequiredInAll);
    props.push(`${camelName}: ${typeBoxCode}`);
  }

  const propsStr = props.join(",\n    ");
  const schema = `Type.Object({\n    ${propsStr},\n  })`;

  return {
    schema,
    actionValues,
    paramMapping,
  };
}

/**
 * Build parameter name mapping for a single tool
 * @param {object} tool - MCP tool
 * @returns {object} - Map of camelCase to snake_case names
 */
function buildParamMapping(tool) {
  const mapping = {};
  const props = tool.inputSchema?.properties || {};

  for (const snakeName of Object.keys(props)) {
    const camelName = snakeToCamel(snakeName);
    mapping[camelName] = snakeName;
  }

  return mapping;
}

/**
 * Check if a parameter name is a valid TypeScript identifier
 * @param {string} name - Parameter name
 * @returns {boolean}
 */
export function isValidIdentifier(name) {
  return /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(name);
}

/**
 * Check if a name is a valid tool name (snake_case)
 * @param {string} name - Tool name
 * @returns {boolean}
 */
export function isValidToolName(name) {
  return /^[a-z][a-z0-9_]*$/.test(name);
}
