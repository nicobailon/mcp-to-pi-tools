/**
 * Output Writer
 * Handles writing generated files to disk or stdout (dry-run)
 * Supports manifest-based tracking for non-destructive updates
 */

import { existsSync, mkdirSync, writeFileSync, chmodSync, rmSync, readFileSync, readdirSync, unlinkSync } from "fs";
import { join, dirname } from "path";
import { homedir } from "os";

const MANIFEST_FILE = ".mcp2cli-manifest.json";

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
 * Read manifest from output directory
 * @param {string} resolvedDir - Resolved output directory path
 * @returns {object|null} - Manifest object or null
 */
export function readManifest(resolvedDir) {
  const manifestPath = join(resolvedDir, MANIFEST_FILE);
  if (!existsSync(manifestPath)) return null;

  try {
    return JSON.parse(readFileSync(manifestPath, "utf-8"));
  } catch {
    return null;
  }
}

/**
 * Create manifest content for generated files
 * @param {string} packageName - Package name
 * @param {string[]} files - List of generated files
 * @returns {string} - JSON manifest content
 */
export function createManifest(packageName, files) {
  return JSON.stringify({
    version: 1,
    package: packageName,
    generatedAt: new Date().toISOString(),
    files: files.filter(f => f !== MANIFEST_FILE)
  }, null, 2);
}

/**
 * Get list of user-added files in directory
 * @param {string} resolvedDir - Resolved output directory
 * @param {object} manifest - Existing manifest
 * @returns {string[]} - List of user-added files
 */
export function getUserFiles(resolvedDir, manifest) {
  if (!manifest || !existsSync(resolvedDir)) return [];

  const allFiles = readdirSync(resolvedDir);
  const generatedFiles = new Set([...manifest.files, MANIFEST_FILE]);

  return allFiles.filter(f => !generatedFiles.has(f));
}

/**
 * Write files to output directory
 * @param {string} outputDir - Output directory path
 * @param {object} files - Map of filename to content
 * @param {object} options - Options
 * @param {boolean} options.dryRun - Preview without writing
 * @param {boolean} options.force - Overwrite existing
 * @param {boolean} options.quiet - Suppress output
 * @param {string} options.packageName - Package name for manifest
 */
export function writeOutput(outputDir, files, options = {}) {
  const { dryRun = false, force = false, quiet = false, packageName = "" } = options;
  const resolvedDir = resolvePath(outputDir);

  if (dryRun) {
    console.log("\n--- DRY RUN: Files that would be generated ---\n");

    for (const [filename, content] of Object.entries(files)) {
      console.log(`=== ${filename} ===`);
      console.log(content);
      console.log("");
    }

    console.log(`--- End of dry run (${Object.keys(files).length} files) ---`);
    return;
  }

  if (existsSync(resolvedDir)) {
    if (!force) {
      throw new Error(
        `Output directory exists: ${outputDir}\nUse --force to overwrite`
      );
    }

    const existingManifest = readManifest(resolvedDir);

    if (existingManifest) {
      const userFiles = getUserFiles(resolvedDir, existingManifest);
      if (userFiles.length > 0 && !quiet) {
        console.log(`      Preserving ${userFiles.length} user file(s): ${userFiles.join(", ")}`);
      }

      for (const file of existingManifest.files) {
        const filePath = join(resolvedDir, file);
        if (existsSync(filePath)) {
          unlinkSync(filePath);
        }
      }

      const manifestPath = join(resolvedDir, MANIFEST_FILE);
      if (existsSync(manifestPath)) {
        unlinkSync(manifestPath);
      }
    } else {
      if (!quiet) {
        console.log(`      Removing existing: ${outputDir}`);
      }
      rmSync(resolvedDir, { recursive: true });
      mkdirSync(resolvedDir, { recursive: true });
    }
  } else {
    mkdirSync(resolvedDir, { recursive: true });
  }

  for (const [filename, content] of Object.entries(files)) {
    const filePath = join(resolvedDir, filename);

    const parentDir = dirname(filePath);
    if (!existsSync(parentDir)) {
      mkdirSync(parentDir, { recursive: true });
    }

    writeFileSync(filePath, content, "utf-8");

    if (filename.endsWith(".js") || filename.endsWith(".sh")) {
      chmodSync(filePath, 0o755);
    }

    if (!quiet) {
      console.log(`      - ${filename}`);
    }
  }

  const manifestContent = createManifest(packageName, Object.keys(files));
  writeFileSync(join(resolvedDir, MANIFEST_FILE), manifestContent, "utf-8");
}

/**
 * Print success message with next steps
 * @param {string} outputDir - Output directory path
 * @param {number} toolCount - Number of tools generated
 * @param {string[]} registeredPaths - Paths where tools were registered
 * @param {string|null} symlinkDir - Directory where symlinks were created
 * @param {object} shellConfigResult - Result from shell config (optional)
 */
export function printSuccess(outputDir, toolCount, registeredPaths = [], symlinkDir = null, shellConfigResult = null) {
  const registrationMsg = registeredPaths.length > 0
    ? `Registered in:\n${registeredPaths.map((p) => `  - ${p}`).join("\n")}`
    : "Use --preset or --register-path to register tools.";

  let symlinkMsg = "";
  if (symlinkDir) {
    symlinkMsg = `\nSymlinks created in: ${symlinkDir}`;
    if (shellConfigResult?.action === "added") {
      symlinkMsg += `\nPATH configured in: ${shellConfigResult.configPath}`;
      symlinkMsg += `\nRun: source ${shellConfigResult.configPath}`;
    } else if (shellConfigResult?.action === "exists") {
      symlinkMsg += "\nPATH already configured.";
    } else {
      symlinkMsg += `\nEnsure ${symlinkDir} is in your PATH.`;
    }
  }

  console.log(`
Done! Generated ${toolCount} wrapper scripts in ${outputDir}

${registrationMsg}${symlinkMsg}
`);
}
