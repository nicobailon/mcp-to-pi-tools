/**
 * Runner Module
 * Handles package runner detection and command building for npm (npx), Python (uvx), and pip
 */

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
