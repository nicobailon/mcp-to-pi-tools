# mcp-to-pi-tools

Convert any MCP (Model Context Protocol) server into standalone CLI tools for AI agents.

**Powered by [mcporter](https://github.com/steipete/mcporter). Optimized for [Pi coding agent](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent).**

## What It Does

```
npx mcp-to-pi-tools chrome-devtools-mcp
```

This command:
1. **Discovers** all tools from the MCP server via mcporter
2. **Groups** tools intelligently using Pi (or fallback 1:1 mapping)
3. **Generates** executable wrapper scripts with proper arg parsing
4. **Creates** a complete installable directory with README and install script

Output: `~/agent-tools/chrome-devtools/` with ready-to-use CLI tools.

## Installation

```bash
# Use directly with npx (recommended)
npx mcp-to-pi-tools <mcp-package>

# Or install globally
npm install -g mcp-to-pi-tools
```

### Prerequisites

- **Node.js 18+**
- **mcporter** - Installed automatically via npx, or `npm install -g mcporter`
- **Pi coding agent** (optional) - For intelligent tool grouping. Falls back to 1:1 mapping if not available.

## Usage

```bash
# Basic usage - discovers and generates tools
mcp-to-pi-tools chrome-devtools-mcp

# With scoped package
mcp-to-pi-tools @anthropic-ai/some-mcp

# With specific version
mcp-to-pi-tools @org/mcp@1.2.3

# Custom output name
mcp-to-pi-tools chrome-devtools-mcp --name browser-tools

# Custom output path
mcp-to-pi-tools chrome-devtools-mcp --output ./my-tools

# Preview without writing (dry run)
mcp-to-pi-tools chrome-devtools-mcp --dry-run

# Overwrite existing directory
mcp-to-pi-tools chrome-devtools-mcp --force

# Quiet mode (minimal output)
mcp-to-pi-tools chrome-devtools-mcp --quiet

# Register to Claude Code instead of Pi
mcp-to-pi-tools chrome-devtools-mcp --preset claude

# Register to multiple agents
mcp-to-pi-tools chrome-devtools-mcp --preset claude --preset gemini

# Register to local codebase
mcp-to-pi-tools chrome-devtools-mcp --local

# Register to custom path
mcp-to-pi-tools chrome-devtools-mcp --register-path ~/.custom/AGENTS.md

# Skip auto-registration
mcp-to-pi-tools chrome-devtools-mcp --no-register
```

## Options

| Option | Description |
|--------|-------------|
| `--name <name>` | Output directory name (default: derived from package) |
| `--output <path>` | Output directory path (default: `~/agent-tools/<name>`) |
| `--dry-run` | Preview generated files without writing |
| `--quiet, -q` | Suppress progress output |
| `--force, -f` | Overwrite existing directory |
| `--help, -h` | Show help message |

### Registration Options

| Option | Description |
|--------|-------------|
| `--register` | Auto-register in config files (default: on) |
| `--no-register` | Skip auto-registration |
| `--register-path <path>` | Add registration target path (can repeat) |
| `--preset <name>` | Use preset: `pi`, `claude`, `gemini`, `codex` (can repeat) |
| `--local` | Register in cwd (auto-detect CLAUDE.md/AGENTS.md) |

**Presets:**
- `pi` → `~/.pi/agent/AGENTS.md` (default)
- `claude` → `~/.claude/CLAUDE.md`
- `gemini` → `~/.gemini/AGENTS.md`
- `codex` → `~/.codex/AGENTS.md`

## Output Structure

```
~/agent-tools/<name>/
├── package.json       # Dependencies (none required at runtime)
├── install.sh         # Symlinks tools to ~/.local/bin
├── README.md          # Agent-optimized documentation
├── .gitignore
├── AGENTS-ENTRY.md    # Copy-paste snippet for AGENTS.md
├── <prefix>-tool1.js  # Executable wrapper
├── <prefix>-tool2.js
└── ...
```

## Generated Tools

Each generated wrapper script:
- Has proper shebang (`#!/usr/bin/env node`)
- Uses ES modules (import syntax)
- Implements `--help` flag
- Uses manual arg parsing (no CLI libraries)
- Calls MCP tools via `npx mcporter`
- Outputs errors to stderr

Example generated tool:
```bash
# After running install.sh
chrome-snapshot.js
chrome-click.js "submit-btn"
chrome-navigate.js "https://example.com"
```

## Agent Integration

By default, mcp-to-pi-tools auto-registers generated tools to `~/.pi/agent/AGENTS.md`.

After generation:

1. Run the install script:
   ```bash
   cd ~/agent-tools/<name>
   ./install.sh
   ```

2. Tools are auto-registered! If you skipped registration (`--no-register`), manually add to your agent's config file:
   ```markdown
   ### Your MCP Tools
   `~/agent-tools/<name>/README.md`

   Brief description. X executable tools.
   ```

   (See generated `AGENTS-ENTRY.md` for copy-paste snippet)

### Configuration File

Create `~/agent-tools/mcp2cli.settings.json` to set default registration behavior:

```json
{
  "register": true,
  "registerPaths": [
    "~/.pi/agent/AGENTS.md",
    "~/.claude/CLAUDE.md"
  ]
}
```

## How It Works

```
MCP Package → mcporter (discover) → Pi (group & generate) → Output Files → Auto-register
```

1. **Discover** - mcporter lists all tools and schemas from the MCP server
2. **Group** - Pi intelligently groups related tools (or fallback 1:1 mapping)
3. **Generate** - Pi creates wrapper scripts with proper CLI handling
4. **Output** - Writes package to `~/agent-tools/<name>/`
5. **Register** - Appends tool entry to agent config files

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | General error |
| 2 | Invalid arguments |
| 3 | Discovery failed |
| 4 | Generation failed |
| 5 | Output write failed |

## Examples

### Chrome DevTools MCP

```bash
npx mcp-to-pi-tools @anthropic-ai/chrome-devtools-mcp

# Generates 15+ tools:
# - chrome-snapshot.js
# - chrome-screenshot.js
# - chrome-click.js
# - chrome-fill.js
# - chrome-navigate.js
# - ...
```

### Custom MCP Server

```bash
npx mcp-to-pi-tools my-custom-mcp --name my-tools --output ./tools
```

## Troubleshooting

### mcporter not found
```bash
npm install -g mcporter
```

### Discovery timeout
The tool times out after 60 seconds. If your MCP server is slow to start:
```bash
MCPORTER_CALL_TIMEOUT=120000 npx mcp-to-pi-tools <package>
```

### No AI agent available
mcp-to-pi-tools works without Pi or Claude but produces simpler 1:1 tool mappings. For intelligent grouping, install [Pi](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent) or [Claude Code](https://docs.anthropic.com/en/docs/claude-code).

## Contributing

Contributions welcome! Please open an issue or PR on GitHub.

## License

MIT

## Credits

- **[mcporter](https://github.com/steipete/mcporter)** - Core MCP-to-CLI bridge
- **[Pi coding agent](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent)** - Intelligent code generation
- **[MCP](https://modelcontextprotocol.io/)** - Model Context Protocol standard

