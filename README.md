# mcp-to-pi-tools

**One command to turn any MCP server into persistent, agent-ready CLI tools.**

```bash
npx mcp-to-pi-tools chrome-devtools-mcp
```

Done. Your agent now has 15+ browser automation tools registered and ready to use.

## Why Not Just Use mcporter Directly?

You can! [mcporter](https://github.com/steipete/mcporter) is excellent for ad-hoc MCP calls and has its own `generate-cli` command. But for AI agent workflows, there's friction:

**The command complexity problem:**
```bash
# mcporter direct call (80+ characters)
npx mcporter call --stdio npx --stdio-arg -y --stdio-arg @anthropic-ai/chrome-devtools-mcp@latest take_snapshot

# mcp-to-pi-tools (one-time setup)
~/agent-tools/chrome-devtools/chrome-snapshot.js
```

| mcporter alone | mcp-to-pi-tools |
|----------------|-----------------|
| 100+ char commands | ~50 char commands |
| Re-discover tools each session | One-time setup, always available |
| No `--help` per tool | Every tool has `--help` with examples |
| Tools not in agent config | Auto-registered in AGENTS.md/CLAUDE.md |

*Could you chat with an agent for a few minutes to set this up manually? Sure. But this makes it consistent, fast, and zero mental energy.*

## What It Does

1. **Discovers** all tools from the MCP server via mcporter
2. **Groups** related tools intelligently (using Pi/Claude, or 1:1 fallback)
3. **Generates** executable wrappers with `--help` and proper arg parsing
4. **Outputs** to `~/agent-tools/<name>/`
5. **Registers** tools in your agent's config file (AGENTS.md, CLAUDE.md, etc.)

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

### Python MCP Servers

Many MCP servers are Python packages (from PyPI). mcp-to-pi-tools supports these via:

```bash
# Explicit uvx (recommended - no install needed)
mcp-to-pi-tools mcp-server-fetch --uvx

# Pip-installed packages
pip install mcp-server-fetch
mcp-to-pi-tools mcp-server-fetch --pip

# Custom command (docker, etc.)
mcp-to-pi-tools --command "docker run -i --rm mcp/fetch" fetch

# Auto-detection: tries npm first, then uvx
mcp-to-pi-tools mcp-server-fetch  # auto-falls back to uvx if npm fails
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

### Python/Runner Options

| Option | Description |
|--------|-------------|
| `--uvx` | Use uvx runner (Python packages, no install needed) |
| `--pip` | Use pip runner (requires `pip install <package>` first) |
| `--command <cmd>` | Use explicit command (docker, custom paths, etc.) |

**Note:** Without `--uvx` or `--pip`, the tool tries npm first then auto-falls back to uvx.

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
~/agent-tools/chrome-devtools/chrome-snapshot.js
~/agent-tools/chrome-devtools/chrome-click.js "submit-btn"
~/agent-tools/chrome-devtools/chrome-navigate.js "https://example.com"
```

## Agent Integration

By default, mcp-to-pi-tools auto-registers generated tools to `~/.pi/agent/AGENTS.md`.

Tools are ready to use immediately via full path (e.g., `~/agent-tools/<name>/tool.js`).

If you skipped registration (`--no-register`), manually add to your agent's config file:
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

### Python MCP Server (Fetch)

```bash
# Using uvx (no install needed)
npx mcp-to-pi-tools mcp-server-fetch --uvx

# Generates:
# - server-fetch.js (wraps the fetch tool)
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

