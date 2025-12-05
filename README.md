# mcp-to-pi-tools

**One command turns any MCP server into persistent, agent-ready CLI tools.**

```bash
npx mcp-to-pi-tools chrome-devtools-mcp
```

## The Problem

MCP servers provide powerful tools, but using them through mcporter creates friction for coding agents:

- **Complex syntax** - Agents must construct 100+ character commands correctly
- **Unreliable execution** - Even when documented, agents frequently fumble the CLI syntax, requiring multiple loops to execute correctly
- **Poor ergonomics** - Abstract commands feel clunky vs. purpose-built scripts
- **No self-documentation** - Agents can't explore tools via `--help`

**Result:** Agents underutilize MCP tools. A Chrome DevTools MCP might sit unused or cause repeated errors, because the activation energy is too high.

## The Solution

Generate simple, self-documenting CLI tools that mirror the MCP schema:

```bash
# Before: Complex command agents fumble with
npx mcporter call --stdio npx --stdio-arg -y ... take_snapshot
# Result: "Command failed: unknown flag..."

# After: Intuitive script agents execute reliably
~/agent-tools/chrome-devtools/chrome-snapshot.js --help
```

| Complex mcporter calls | Dedicated CLI tools |
|------------------------|---------------------|
| 100+ chars, agents fumble & loop | ~50 chars, agents use reliably |
| Abstract entry point, hard to infer | One tool per script, schema-aligned |

## Quick Start

```bash
# Generate tools (Node 18+ required)
npx mcp-to-pi-tools chrome-devtools-mcp

# Use immediately
~/agent-tools/chrome-devtools/chrome-snapshot.js --help
```

## How It Works

1. **Discovers** all tools from any MCP server
2. **Generates** executable wrappers with `--help` and argument parsing
3. **Registers** them in your agent's config (Pi, Claude, Gemini, etc.)
4. **Outputs** to `~/agent-tools/<name>/`

## Usage

### Basic
```bash
# NPM packages (default)
npx mcp-to-pi-tools chrome-devtools-mcp

# Scoped packages
npx mcp-to-pi-tools @org/mcp@1.2.3

# Custom name/location
npx mcp-to-pi-tools chrome-devtools-mcp --name browser-tools --output ./tools
```

### Python Servers
```bash
# Auto-detects uvx (no install needed)
npx mcp-to-pi-tools mcp-server-fetch

# Or be explicit
npx mcp-to-pi-tools mcp-server-fetch --uvx   # via uvx
npx mcp-to-pi-tools mcp-server-fetch --pip   # via pip
```

### Custom Runners
```bash
npx mcp-to-pi-tools --command "docker run -i mcp/fetch" fetch
```

### Options

| Option | Description |
|--------|-------------|
| `--dry-run` | Preview without writing |
| `--force, -f` | Overwrite existing directory |
| `--quiet, -q` | Minimal output |
| `--no-register` | Skip auto-registration |

### Registration (Auto-config for agents)
```bash
# Default: Pi (~/.pi/agent/AGENTS.md)
npx mcp-to-pi-tools chrome-devtools-mcp

# Multiple agents
npx mcp-to-pi-tools chrome-devtools-mcp --preset claude --preset gemini

# Custom paths
npx mcp-to-pi-tools chrome-devtools-mcp --register-path ~/.config/AGENTS.md
```

**Presets:** `pi`, `claude`, `gemini`, `codex` (maps to default paths)

## Generated Output

```
~/agent-tools/<name>/
├── package.json        # ES module config (required for imports)
├── README.md           # Human docs
├── AGENTS-ENTRY.md     # Copy-paste config snippet
├── <prefix>-tool1.js   # Executable wrapper
└── <prefix>-tool2.js
```

Each wrapper:
- Has `#!/usr/bin/env node` shebang
- Supports `--help` with examples
- Outputs errors to stderr
- Uses ES modules

## Configuration

Create `~/agent-tools/mcp2cli.settings.json` for defaults:

```json
{
  "register": true,
  "registerPaths": ["~/.pi/agent/AGENTS.md", "~/.claude/CLAUDE.md"]
}
```

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `mcporter not found` | `npm install -g mcporter` |
| Discovery timeout | `MCPORTER_CALL_TIMEOUT=120000 npx mcp-to-pi-tools <pkg>` |
| No AI agent | Works without Pi/Claude (1:1 mapping) |

## Contributing

PRs and issues welcome on GitHub.

## License

MIT

## Credits

- **[mcporter](https://github.com/steipete/mcporter)** - Core MCP bridge
- **[Pi](https://github.com/badlogic/pi-mono)** / **Claude Code** - Intelligent grouping
- **[MCP](https://modelcontextprotocol.io)** - The protocol
