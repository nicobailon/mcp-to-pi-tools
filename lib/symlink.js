/**
 * Symlink Manager
 * Handles auto-creation of symlinks for generated CLI tools
 */

import { existsSync, mkdirSync, symlinkSync, lstatSync, readlinkSync, unlinkSync } from "fs";
import { join } from "path";
import { homedir } from "os";

const DEFAULT_SYMLINK_DIR = "~/agent-tools/bin";

/**
 * Resolve path, expanding ~ to home directory
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
 * Check if platform supports symlinks
 * @returns {boolean}
 */
export function supportsSymlinks() {
  return process.platform !== "win32";
}

/**
 * Ensure symlink directory exists
 * @param {string} dir - Directory path
 * @returns {string} - Resolved directory path
 */
export function ensureSymlinkDir(dir) {
  const resolvedDir = resolvePath(dir);
  if (!existsSync(resolvedDir)) {
    mkdirSync(resolvedDir, { recursive: true });
  }
  return resolvedDir;
}

/**
 * Get symlink name (strips .js extension)
 * @param {string} filename - Original filename (e.g., "chrome-snapshot.js")
 * @returns {string} - Symlink name (e.g., "chrome-snapshot")
 */
export function getSymlinkName(filename) {
  if (filename.endsWith(".js")) {
    return filename.slice(0, -3);
  }
  return filename;
}

/**
 * Create a single symlink with collision handling
 * @param {string} targetPath - Path to the actual file
 * @param {string} linkPath - Path where symlink should be created
 * @param {object} options - Options
 * @param {boolean} options.force - Force overwrite existing files
 * @returns {object} - Result object with success, path, action/error
 */
export function createSymlink(targetPath, linkPath, options = {}) {
  const { force = false } = options;

  try {
    if (existsSync(linkPath)) {
      const stats = lstatSync(linkPath);

      if (stats.isSymbolicLink()) {
        const currentTarget = readlinkSync(linkPath);
        if (currentTarget === targetPath) {
          return { success: true, path: linkPath, action: "unchanged" };
        }
        unlinkSync(linkPath);
      } else {
        if (!force) {
          return {
            success: false,
            path: linkPath,
            error: "Existing file (not symlink). Use --force-symlink to override.",
          };
        }
        unlinkSync(linkPath);
      }
    }

    symlinkSync(targetPath, linkPath);
    return { success: true, path: linkPath, action: "created" };
  } catch (error) {
    return { success: false, path: linkPath, error: error.message };
  }
}

/**
 * Create symlinks for all generated .js files
 * @param {string} outputDir - Directory containing generated files
 * @param {object} files - Map of filename to content
 * @param {string} symlinkDir - Directory for symlinks
 * @param {object} options - Options
 * @param {boolean} options.force - Force overwrite existing files
 * @param {boolean} options.quiet - Suppress output
 * @returns {Array} - Array of result objects
 */
export function createSymlinks(outputDir, files, symlinkDir, options = {}) {
  const { force = false, quiet = false } = options;

  if (!supportsSymlinks()) {
    if (!quiet) {
      console.log("      Symlinks not supported on Windows");
    }
    return [];
  }

  const resolvedOutputDir = resolvePath(outputDir);
  const resolvedSymlinkDir = ensureSymlinkDir(symlinkDir || DEFAULT_SYMLINK_DIR);
  const results = [];

  const jsFiles = Object.keys(files).filter((f) => f.endsWith(".js"));

  for (const filename of jsFiles) {
    const targetPath = join(resolvedOutputDir, filename);
    const symlinkName = getSymlinkName(filename);
    const linkPath = join(resolvedSymlinkDir, symlinkName);

    const result = createSymlink(targetPath, linkPath, { force });
    results.push({ ...result, filename, symlinkName });

    if (!quiet) {
      if (result.success) {
        const action = result.action === "unchanged" ? "exists" : "linked";
        console.log(`      ${action}: ${symlinkName} -> ${filename}`);
      } else {
        console.warn(`      failed: ${symlinkName} - ${result.error}`);
      }
    }
  }

  return results;
}

/**
 * Get default symlink directory path
 * @returns {string}
 */
export function getDefaultSymlinkDir() {
  return DEFAULT_SYMLINK_DIR;
}

/**
 * Get successful symlink paths
 * @param {Array} results - Array of result objects
 * @returns {Array} - Array of successful symlink paths
 */
export function getSuccessfulSymlinks(results) {
  return results.filter((r) => r.success).map((r) => r.path);
}
