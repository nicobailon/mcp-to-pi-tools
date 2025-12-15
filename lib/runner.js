/**
 * Runner Module
 * Handles package runner detection and command building for npm (npx), Python (uvx), pip, and HTTP
 */

/**
 * Check if a string is an HTTP/HTTPS URL
 * @param {string} url - URL to check
 * @returns {boolean}
 */
export function isHttpUrl(url) {
  if (!url || typeof url !== "string") return false;
  return url.startsWith("http://") || url.startsWith("https://");
}

/**
 * Check if URL points to localhost (127.0.0.0/8, ::1, or literal 'localhost')
 * Security: Only exact hostname matches are considered localhost
 * @param {string} url - URL to check
 * @returns {boolean}
 */
export function isLocalhost(url) {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    // URL parser strips brackets from IPv6, so [::1] becomes ::1
    const hostname = parsed.hostname.toLowerCase();

    // Exact localhost matches only (prevents localhost.evil.com attacks)
    if (hostname === "localhost") return true;
    if (hostname === "::1") return true;
    // Some URL parsers may include brackets for IPv6
    if (hostname === "[::1]") return true;

    // IPv4 loopback range: 127.0.0.0/8
    if (/^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)) return true;

    // IPv6-mapped loopback (::ffff:127.x.x.x)
    if (/^::ffff:127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/i.test(hostname)) return true;
    if (/^\[::ffff:127\.\d{1,3}\.\d{1,3}\.\d{1,3}\]$/i.test(hostname)) return true;

    return false;
  } catch {
    return false;
  }
}

/**
 * Normalize HTTP URL (remove trailing slash, validate scheme)
 * @param {string} url - URL to normalize
 * @returns {string} - Normalized URL
 * @throws {Error} - If URL is invalid
 */
export function normalizeHttpUrl(url) {
  if (!isHttpUrl(url)) {
    throw new Error(`Invalid HTTP URL: ${url}`);
  }

  try {
    const parsed = new URL(url);
    // Remove trailing slash from pathname
    if (parsed.pathname.endsWith("/") && parsed.pathname !== "/") {
      parsed.pathname = parsed.pathname.slice(0, -1);
    }
    return parsed.href;
  } catch (error) {
    throw new Error(`Invalid URL format: ${url}`);
  }
}

/**
 * Escape a string for safe use in shell commands
 * Wraps in single quotes and escapes internal single quotes
 * @param {string} str - String to escape
 * @returns {string} - Shell-safe string
 */
export function shellEscape(str) {
  if (!str) return "''";
  // Wrap in single quotes and escape any internal single quotes
  // 'foo'bar' becomes 'foo'\''bar'
  return "'" + str.replace(/'/g, "'\\''") + "'";
}

/**
 * Escape a string for safe embedding in JavaScript template literals
 * Escapes backticks, backslashes, and ${} sequences
 * @param {string} str - String to escape
 * @returns {string} - Template literal safe string
 */
export function escapeTemplateLiteral(str) {
  if (!str) return "";
  return str
    .replace(/\\/g, "\\\\")     // Escape backslashes first
    .replace(/`/g, "\\`")        // Escape backticks
    .replace(/\$\{/g, "\\${");   // Escape template interpolation
}

/**
 * Escape a string for safe embedding in JavaScript double-quoted strings
 * Escapes backslashes, double quotes, and newlines
 * @param {string} str - String to escape
 * @returns {string} - Double-quoted string safe content
 */
export function escapeDoubleQuotedString(str) {
  if (!str) return "";
  return str
    .replace(/\\/g, "\\\\")     // Escape backslashes first
    .replace(/"/g, '\\"')        // Escape double quotes
    .replace(/\n/g, "\\n")       // Escape newlines
    .replace(/\r/g, "\\r");      // Escape carriage returns
}

/**
 * Validate server name for safe use in commands
 * Only allows alphanumeric, hyphen, underscore, and dot
 * @param {string} name - Server name to validate
 * @returns {boolean} - True if safe
 */
export function isValidServerName(name) {
  if (!name || typeof name !== "string") return false;
  // Allow alphanumeric, hyphen, underscore, dot (for subdomains)
  return /^[a-zA-Z0-9_.-]+$/.test(name);
}

/**
 * Convert package name to Python module name
 * mcp-server-fetch -> mcp_server_fetch
 * @param {string} pkg - Package name
 * @returns {string} - Module name
 */
export function toModuleName(pkg) {
  return pkg.replace(/-/g, "_");
}

/**
 * Runner configurations
 */
export const RUNNERS = {
  npx: {
    cmd: "npx",
    args: ["-y"],
    suffix: "@latest",
    transform: null,
  },
  uvx: {
    cmd: "uvx",
    args: [],
    suffix: "",
    transform: null,
  },
  pip: {
    cmd: "python",
    args: ["-m"],
    suffix: "",
    transform: toModuleName,
  },
};

/**
 * Determine runner based on options
 * @param {object} options - Options
 * @param {boolean} options.uvx - Use uvx runner
 * @param {boolean} options.pip - Use pip runner (python -m)
 * @returns {string} - Runner name
 */
export function detectRunner(options = {}) {
  if (options.uvx) return "uvx";
  if (options.pip) return "pip";
  return "npx";
}

/**
 * Build the MCP command for execution
 * @param {string} packageName - Package name
 * @param {object} options - Options
 * @param {string} options.command - Explicit command override (bypasses everything)
 * @param {boolean} options.uvx - Use uvx runner
 * @param {boolean} options.pip - Use pip runner (python -m)
 * @param {string} options.runner - Runner name override (internal use)
 * @returns {string} - Full command string
 */
export function buildMcpCommand(packageName, options = {}) {
  if (options.command) {
    return options.command;
  }

  const runnerName = options.runner || detectRunner(options);
  const runner = RUNNERS[runnerName];

  if (!runner) {
    throw new Error(`Unknown runner: ${runnerName}`);
  }

  let pkg = packageName;

  if (runner.transform) {
    pkg = runner.transform(pkg);
  }

  if (runner.suffix) {
    const hasVersion = pkg.includes("@") && (!pkg.startsWith("@") || pkg.slice(1).includes("@"));
    if (!hasVersion) {
      pkg = `${pkg}${runner.suffix}`;
    }
  }

  const parts = [runner.cmd, ...runner.args, pkg];
  return parts.join(" ");
}

/**
 * Get list of available runner names
 * @returns {string[]}
 */
export function getRunnerNames() {
  return Object.keys(RUNNERS);
}

/**
 * Extract package name without version suffix
 * Keeps scope for npm packages: @scope/pkg@1.0.0 -> @scope/pkg
 * @param {string} packageName - Package name with optional version
 * @returns {string} - Package name without version
 */
export function stripVersion(packageName) {
  if (packageName.startsWith("@")) {
    const slashIndex = packageName.indexOf("/");
    if (slashIndex !== -1) {
      const afterSlash = packageName.slice(slashIndex + 1);
      const versionIndex = afterSlash.indexOf("@");
      if (versionIndex !== -1) {
        return packageName.slice(0, slashIndex + 1 + versionIndex);
      }
    }
    return packageName;
  }
  return packageName.replace(/@.*$/, "");
}

/**
 * Extract the first paragraph from a README (after the title)
 * Skips headings, badges, and empty lines
 * @param {string} readme - README content
 * @returns {string|undefined} - First paragraph or undefined
 */
export function extractFirstParagraph(readme) {
  if (!readme) return undefined;
  const lines = readme.split("\n");
  let inParagraph = false;
  let paragraph = "";

  for (const line of lines) {
    const trimmed = line.trim();

    if (!inParagraph) {
      if (trimmed === "" || trimmed.startsWith("#") || trimmed.startsWith("[![") || trimmed.startsWith("![")) {
        continue;
      }
      inParagraph = true;
    }

    if (inParagraph && (trimmed === "" || trimmed.startsWith("#"))) {
      break;
    }

    paragraph += (paragraph ? " " : "") + trimmed;
  }

  return paragraph || undefined;
}

/**
 * Fetch package description from npm registry
 * Prefers first README paragraph over short description field
 * @param {string} packageName - Package name
 * @returns {Promise<string|undefined>}
 */
async function fetchNpmDescription(packageName) {
  try {
    const pkgName = stripVersion(packageName);
    const encodedName = pkgName.replace("/", "%2f");
    const response = await fetch(`https://registry.npmjs.org/${encodedName}`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return undefined;
    const data = await response.json();

    if (data.readme) {
      const paragraph = extractFirstParagraph(data.readme);
      if (paragraph && paragraph.length > 20) {
        return paragraph;
      }
    }

    return data.description;
  } catch {
    return undefined;
  }
}

/**
 * Fetch package description from PyPI
 * Prefers first README paragraph over short summary field
 * @param {string} packageName - Package name
 * @returns {Promise<string|undefined>}
 */
async function fetchPyPIDescription(packageName) {
  try {
    const pkgName = stripVersion(packageName);
    const response = await fetch(`https://pypi.org/pypi/${pkgName}/json`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return undefined;
    const data = await response.json();

    if (data.info?.description) {
      const paragraph = extractFirstParagraph(data.info.description);
      if (paragraph && paragraph.length > 20) {
        return paragraph;
      }
    }

    return data.info?.summary;
  } catch {
    return undefined;
  }
}

/**
 * Fetch package description from the appropriate registry
 * @param {string} packageName - Package name
 * @param {string} runner - Runner type: "npx", "uvx", "pip", or "custom"
 * @returns {Promise<string|undefined>}
 */
export async function fetchPackageDescription(packageName, runner) {
  switch (runner) {
    case "npx":
      return fetchNpmDescription(packageName);
    case "uvx":
    case "pip":
      return fetchPyPIDescription(packageName);
    default:
      return undefined;
  }
}
