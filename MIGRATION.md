# Migration Guide: mcp2cli → mcp2ext

This guide helps you migrate from the old CLI wrapper format (`~/agent-tools/`) to the new native pi extension format (`~/.pi/agent/extensions/`).

## Why Migrate?

The new `mcp2ext` generates **native pi extensions** instead of CLI wrapper scripts:

| Feature | mcp2cli (Legacy) | mcp2ext (New) |
|---------|------------------|---------------|
| Integration | Bash tool layer | Direct pi registerTool() |
| Type safety | Runtime validation | TypeBox schemas |
| Discovery | AGENTS.md required | Auto-discovered |
| Invocation | Shell execution | Native tool calls |
| Maintenance | Symlinks, PATH config | None needed |

## Quick Migration

### Automatic Migration

```bash
# Scan for migrateable tools
mcp2ext migrate

# Migrate all tools at once
mcp2ext migrate --all

# Migrate with cleanup (removes old CLI scripts)
mcp2ext migrate --all --cleanup

# Preview what would happen
mcp2ext migrate --all --dry-run
```

### Single Tool Migration

```bash
# Migrate one tool
mcp2ext migrate chrome-dev-tools

# Migrate and cleanup old tool
mcp2ext migrate chrome-dev-tools --cleanup

# Preview
mcp2ext migrate chrome-dev-tools --dry-run
```

## What Happens During Migration

1. **Scan** - Finds CLI scripts in `~/agent-tools/<name>/`
2. **Extract** - Reads MCP command from existing scripts
3. **Discover** - Runs mcporter to get current tool schema
4. **Group** - Uses AI (or fallback) to group related tools
5. **Generate** - Creates TypeScript extension in `~/.pi/agent/extensions/<name>/`
6. **Cleanup** (optional) - Removes old CLI tool directory

### Files Created

```
~/.pi/agent/extensions/<name>/
├── index.ts          # Pi extension with registerTool() calls
├── package.json      # Manifest with MCP source info
└── README.md         # Generated documentation
```

## Manual Migration

If automatic migration fails, you can manually migrate:

### 1. Find the MCP Command

Look in any script in `~/agent-tools/<name>/` for:

```javascript
const MCP_CMD = "npx -y @anthropic-ai/chrome-devtools-mcp@latest";
```

or:

```javascript
const MCP_CMD = "uvx mcp-server-time";
```

### 2. Generate Extension

```bash
# Using the extracted command
mcp2ext chrome-devtools-mcp              # npm package
mcp2ext mcp-server-time --uvx            # Python package
mcp2ext --command "uvx mcp-server-time"  # Explicit command
```

### 3. Remove Old CLI Tool

```bash
mcp2cli remove chrome-dev-tools
```

### 4. Update AGENTS.md

Remove the old tool entry from `~/.pi/agent/AGENTS.md` (extensions are auto-discovered, so no new entry needed).

## Post-Migration Cleanup

After migrating all tools:

```bash
# Remove the old CLI tools directory (if empty)
rmdir ~/agent-tools/bin 2>/dev/null
rmdir ~/agent-tools 2>/dev/null

# Remove PATH configuration from shell config (optional)
# The ~/agent-tools/bin PATH entry is no longer needed
```

## Rollback

If you need to go back to CLI format:

```bash
# Remove extension
mcp2ext remove chrome-devtools

# Regenerate CLI tool
mcp2cli chrome-devtools-mcp
```

## Troubleshooting

### "Could not extract MCP command"

The migration couldn't find the MCP command in your scripts. This can happen if:
- Scripts were manually created (not by mcp2cli)
- Scripts use a non-standard format

**Solution:** Use manual migration with the `--command` flag:

```bash
mcp2ext --command "npx -y your-mcp-package" --name your-tool
```

### "Extension already exists"

An extension with the same name exists.

**Solution:** Use `--force` to overwrite:

```bash
mcp2ext migrate chrome-dev-tools --force
```

### "Discovery failed"

The MCP server couldn't be contacted or mcporter failed.

**Solution:**
1. Check if mcporter is installed: `npx mcporter --version`
2. Try running the MCP command directly
3. Check network connectivity for npm/uvx packages

### Agent doesn't see new tools

Extensions are auto-discovered on pi startup.

**Solution:** Restart pi to pick up new extensions.

## Keeping Both Formats

You can keep both CLI and extension versions during transition:

```bash
# Generate extension without cleanup
mcp2ext migrate chrome-dev-tools

# Now you have both:
# ~/agent-tools/chrome-dev-tools/   (CLI)
# ~/.pi/agent/extensions/chrome-dev-tools/  (Extension)
```

The extension takes precedence in pi, but CLI scripts remain available for other uses.

## Command Reference

```bash
# Migration commands
mcp2ext migrate                    # List migrateable tools
mcp2ext migrate <name>             # Migrate specific tool
mcp2ext migrate --all              # Migrate all tools
mcp2ext migrate --cleanup          # Remove CLI after migration
mcp2ext migrate --dry-run          # Preview without changes
mcp2ext migrate --force            # Overwrite existing extension

# Extension management
mcp2ext list                       # List installed extensions
mcp2ext remove <name>              # Remove an extension
mcp2ext <package>                  # Generate new extension

# CLI management (legacy)
mcp2cli list                       # List CLI tools
mcp2cli remove <name>              # Remove CLI tool
```
