import { readdirSync, statSync, existsSync, rmSync, readFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { readManifest } from "./output.js";
import { loadRegistry, findSectionByHeading, resolvePath, unregisterEntry, removeFromRegistry, registerToAll, resolveAllPaths, registerEntry } from "./registration.js";
import { removeSymlinksForTool, getDefaultSymlinkDir, createSymlinksForTool } from "./symlink.js";
import { PRESETS } from "./config.js";

const AGENT_TOOLS_DIR = join(homedir(), "agent-tools");

export function deriveHeading(name) {
  const displayName = name.split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  return `### ${displayName} Tools`;
}

export function getToolHeading(name) {
  return deriveHeading(name);
}

export function listInstalledTools() {
  if (!existsSync(AGENT_TOOLS_DIR)) return [];

  const entries = readdirSync(AGENT_TOOLS_DIR);
  const tools = [];

  for (const entry of entries) {
    if (entry === "bin") continue;
    const toolPath = join(AGENT_TOOLS_DIR, entry);
    try {
      if (statSync(toolPath).isDirectory()) {
        tools.push(getToolInfo(entry, toolPath));
      }
    } catch {
      continue;
    }
  }

  return tools;
}

export function getToolInfo(name, toolPath) {
  const manifest = readManifest(toolPath);
  const heading = getToolHeading(name);
  const registeredIn = checkRegistrationStatus(heading);

  let scripts = [];
  if (manifest?.files) {
    scripts = manifest.files.filter(f => f.endsWith(".js"));
  } else {
    try {
      scripts = readdirSync(toolPath).filter(f => f.endsWith(".js"));
    } catch {
      scripts = [];
    }
  }

  const symlinkDir = resolvePath(getDefaultSymlinkDir());
  let symlinkCount = 0;
  if (existsSync(symlinkDir)) {
    for (const script of scripts) {
      const symlinkName = script.replace(/\.js$/, "");
      const linkPath = join(symlinkDir, symlinkName);
      if (existsSync(linkPath)) {
        symlinkCount++;
      }
    }
  }

  return {
    name,
    path: toolPath,
    scripts: scripts.length,
    scriptNames: scripts,
    registeredIn,
    symlinks: `${symlinkCount}/${scripts.length}`,
    hasManifest: !!manifest,
    heading
  };
}

export function checkRegistrationStatus(heading) {
  const registered = [];

  for (const [presetName, presetPath] of Object.entries(PRESETS)) {
    const resolvedPath = resolvePath(presetPath);
    if (!existsSync(resolvedPath)) continue;

    try {
      const content = readFileSync(resolvedPath, "utf-8");
      if (findSectionByHeading(content, heading)) {
        registered.push(presetName);
      }
    } catch {
      continue;
    }
  }

  return registered;
}

export function formatToolList(tools) {
  if (tools.length === 0) {
    return `No tools installed in ~/agent-tools/`;
  }

  const lines = [];
  lines.push(`Installed Tools (${tools.length})`);
  lines.push("-".repeat(67));
  lines.push(`${"NAME".padEnd(18)}${"SCRIPTS".padEnd(9)}${"REGISTERED".padEnd(14)}SYMLINKS`);

  for (const tool of tools) {
    const registered = tool.registeredIn.length > 0 ? tool.registeredIn.join(", ") : "(none)";
    lines.push(
      `${tool.name.padEnd(18)}${String(tool.scripts).padEnd(9)}${registered.padEnd(14)}${tool.symlinks}`
    );
  }

  lines.push("");
  lines.push(`Symlink directory: ~/agent-tools/bin`);

  return lines.join("\n");
}

export function removeTool(name, options = {}) {
  const { dryRun = false, quiet = false } = options;

  if (!name || name === "bin") {
    return { success: false, error: `Tool "${name}" not found in ~/agent-tools/` };
  }

  const toolPath = join(AGENT_TOOLS_DIR, name);

  if (!toolPath.startsWith(AGENT_TOOLS_DIR + "/")) {
    return { success: false, error: `Tool "${name}" not found in ~/agent-tools/` };
  }

  if (!existsSync(toolPath) || !statSync(toolPath).isDirectory()) {
    return { success: false, error: `Tool "${name}" not found in ~/agent-tools/` };
  }

  const heading = getToolHeading(name);
  const registry = loadRegistry();

  if (dryRun) {
    const symlinkDir = resolvePath(getDefaultSymlinkDir());
    const symlinks = [];
    if (existsSync(symlinkDir)) {
      const scripts = readdirSync(toolPath).filter(f => f.endsWith(".js"));
      for (const script of scripts) {
        const symlinkName = script.replace(/\.js$/, "");
        const linkPath = join(symlinkDir, symlinkName);
        if (existsSync(linkPath)) {
          symlinks.push(`~/agent-tools/bin/${symlinkName}`);
        }
      }
    }

    const registrations = [];
    for (const presetPath of Object.values(PRESETS)) {
      const resolvedPath = resolvePath(presetPath);
      if (existsSync(resolvedPath)) {
        try {
          const content = readFileSync(resolvedPath, "utf-8");
          if (findSectionByHeading(content, heading)) {
            registrations.push(presetPath);
          }
        } catch {
          continue;
        }
      }
    }

    const regEntry = registry.registrations[name];
    const customPaths = regEntry?.customPaths || regEntry?.paths || [];
    for (const p of customPaths) {
      if (!registrations.includes(p)) {
        registrations.push(p);
      }
    }

    console.log(`DRY RUN: Would remove tool "${name}"\n`);
    console.log("Would remove:");
    if (symlinks.length > 0) {
      console.log(`  - Symlinks: ${symlinks.join(", ")}`);
    }
    if (registrations.length > 0) {
      console.log(`  - Registrations: ${registrations.join(", ")}`);
    }
    console.log(`  - Directory: ~/agent-tools/${name}`);
    console.log("\nNo changes made.");

    return { success: true, dryRun: true };
  }

  if (!quiet) console.log(`Removing tool: ${name}\n`);

  if (!quiet) process.stdout.write("  [1/4] Removing symlinks... ");
  const symlinkResults = removeSymlinksForTool(toolPath);
  const removedSymlinks = symlinkResults.filter(r => r.success).length;
  if (!quiet) console.log(`done (${removedSymlinks} removed)`);

  if (!quiet) process.stdout.write("  [2/4] Removing registrations... ");
  let removedRegistrations = 0;

  for (const presetPath of Object.values(PRESETS)) {
    const result = unregisterEntry(presetPath, heading);
    if (result.action === "removed") removedRegistrations++;
  }

  const regEntry = registry.registrations[name];
  const customPaths = regEntry?.customPaths || regEntry?.paths || [];
  for (const p of customPaths) {
    const result = unregisterEntry(p, heading);
    if (result.action === "removed") removedRegistrations++;
  }
  if (!quiet) console.log(`done (${removedRegistrations} removed)`);

  if (!quiet) process.stdout.write("  [3/4] Updating registry... ");
  removeFromRegistry(name);
  if (!quiet) console.log("done");

  if (!quiet) process.stdout.write("  [4/4] Removing directory... ");
  rmSync(toolPath, { recursive: true });
  if (!quiet) console.log("done");

  if (!quiet) console.log(`\nTool "${name}" removed successfully.`);

  return { success: true };
}

export function generateBasicEntry(name, scripts) {
  const heading = deriveHeading(name);
  const toolList = scripts
    .map(s => s.replace(/\.js$/, ""))
    .map(s => `**${s}** - ${name} tool`)
    .join("\n");
  return `${heading}\n\n${toolList}`;
}

export function refreshTool(name, options = {}) {
  const { dryRun = false, quiet = false } = options;
  const toolPath = join(AGENT_TOOLS_DIR, name);
  const results = { symlinks: { created: 0, unchanged: 0 }, registrationAction: "none", registrationTargets: [] };

  if (!existsSync(toolPath)) {
    return { success: false, error: `Tool "${name}" not found` };
  }

  const scripts = readdirSync(toolPath).filter(f => f.endsWith(".js"));

  if (!dryRun) {
    const symlinkResults = createSymlinksForTool(toolPath, { quiet });
    results.symlinks.created = symlinkResults.filter(r => r.action === "created").length;
    results.symlinks.unchanged = symlinkResults.filter(r => r.action === "unchanged").length;
  } else {
    const symlinkDir = resolvePath(getDefaultSymlinkDir());
    let existingCount = 0;
    if (existsSync(symlinkDir)) {
      for (const script of scripts) {
        const symlinkName = script.replace(/\.js$/, "");
        if (existsSync(join(symlinkDir, symlinkName))) {
          existingCount++;
        }
      }
    }
    results.symlinks.created = scripts.length - existingCount;
    results.symlinks.unchanged = existingCount;
  }

  const heading = getToolHeading(name);
  const registered = checkRegistrationStatus(heading);
  const entry = generateBasicEntry(name, scripts);

  if (registered.length === 0) {
    const paths = resolveAllPaths({ registerPaths: [], allPresets: false });
    if (paths.length > 0) {
      results.registrationAction = "added";
      results.registrationTargets = paths;
      if (!dryRun) {
        registerToAll(paths, entry, name, { quiet });
      }
    }
  } else {
    results.registrationAction = "updated";
    results.registrationTargets = registered;
    if (!dryRun) {
      for (const preset of registered) {
        const path = PRESETS[preset];
        registerEntry(resolvePath(path), entry, name);
      }
    }
  }

  return { success: true, ...results };
}

export function refreshAllTools(options = {}) {
  const tools = listInstalledTools();
  return tools.map(t => ({ name: t.name, ...refreshTool(t.name, options) }));
}
