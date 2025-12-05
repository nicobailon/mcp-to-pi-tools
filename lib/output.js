/**
 * Output Writer
 * Handles writing generated files to disk or stdout (dry-run)
 */

import { existsSync, mkdirSync, writeFileSync, chmodSync, rmSync } from "fs";
import { join, dirname } from "path";
import { homedir } from "os";

/**
 * Resolve output path, expanding ~ to home directory
 * @param {string} path - Path that may contain ~
 * @returns {string} - Resolved absolute path
 */
export function resolvePath(path) {
  if (path.startsWith("~/")) {
    return join(homedir(), path.slice(2));
  }
  return path;
}

/**
 * Check if output directory exists
 * @param {string} outputDir - Output directory path
 * @returns {boolean}
 */
export function outputExists(outputDir) {
  return existsSync(resolvePath(outputDir));
}

/**
 * Write files to output directory
 * @param {string} outputDir - Output directory path
 * @param {object} files - Map of filename to content
 * @param {object} options - Options
 * @param {boolean} options.dryRun - Preview without writing
 * @param {boolean} options.force - Overwrite existing
 * @param {boolean} options.quiet - Suppress output
 */
export function writeOutput(outputDir, files, options = {}) {
  const { dryRun = false, force = false, quiet = false } = options;
  const resolvedDir = resolvePath(outputDir);

  if (dryRun) {
    // Print files to stdout
    console.log("\n--- DRY RUN: Files that would be generated ---\n");

    for (const [filename, content] of Object.entries(files)) {
      console.log(`=== ${filename} ===`);
      console.log(content);
      console.log("");
    }

    console.log(`--- End of dry run (${Object.keys(files).length} files) ---`);
    return;
  }

  // Check if directory exists
  if (existsSync(resolvedDir)) {
    if (!force) {
      throw new Error(
        `Output directory exists: ${outputDir}\nUse --force to overwrite`
      );
    }
    // Remove existing directory
    if (!quiet) {
      console.log(`      Removing existing: ${outputDir}`);
    }
    rmSync(resolvedDir, { recursive: true });
  }

  // Create output directory
  mkdirSync(resolvedDir, { recursive: true });

  // Write each file
  for (const [filename, content] of Object.entries(files)) {
    const filePath = join(resolvedDir, filename);

    // Ensure parent directory exists (for nested files)
    const parentDir = dirname(filePath);
    if (!existsSync(parentDir)) {
      mkdirSync(parentDir, { recursive: true });
    }

    writeFileSync(filePath, content, "utf-8");

    // Make .js and .sh files executable
    if (filename.endsWith(".js") || filename.endsWith(".sh")) {
      chmodSync(filePath, 0o755);
    }

    if (!quiet) {
      console.log(`      - ${filename}`);
    }
  }
}

/**
 * Print success message with next steps
 * @param {string} outputDir - Output directory path
 * @param {number} toolCount - Number of tools generated
 * @param {string[]} registeredPaths - Paths where tools were registered
 * @param {string|null} symlinkDir - Directory where symlinks were created
 */
export function printSuccess(outputDir, toolCount, registeredPaths = [], symlinkDir = null) {
  const registrationMsg = registeredPaths.length > 0
    ? `Registered in:\n${registeredPaths.map((p) => `  - ${p}`).join("\n")}`
    : "Copy AGENTS-ENTRY.md content to your agent config file to register.";

  const symlinkMsg = symlinkDir
    ? `\nSymlinks created in: ${symlinkDir}\nEnsure ${symlinkDir} is in your PATH.`
    : "";

  console.log(`
Done! Generated ${toolCount} wrapper scripts in ${outputDir}

${registrationMsg}${symlinkMsg}
`);
}
