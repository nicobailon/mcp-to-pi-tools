# mcp2cli

Convert any MCP (Model Context Protocol) server into standalone CLI tools for AI agents.

**Powered by [mcporter](https://github.com/steipete/mcporter). Optimized for [Pi coding agent](https://github.com/badlogic/pi-mono).**

## What It Does

```
npx mcp2cli chrome-devtools-mcp
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
npx mcp2cli <mcp-package>

# Or install globally
npm install -g mcp2cli
```

### Prerequisites

- **Node.js 18+**
- **mcporter** - Installed automatically via npx, or `npm install -g mcporter`
- **Pi coding agent** (optional) - For intelligent tool grouping. Falls back to 1:1 mapping if not available.

## Usage

```bash
# Basic usage - discovers and generates tools
mcp2cli chrome-devtools-mcp

# With scoped package
mcp2cli @anthropic-ai/some-mcp

# With specific version
mcp2cli @org/mcp@1.2.3

# Custom output name
mcp2cli chrome-devtools-mcp --name browser-tools

# Custom output path
mcp2cli chrome-devtools-mcp --output ./my-tools

# Preview without writing (dry run)
mcp2cli chrome-devtools-mcp --dry-run

# Overwrite existing directory
mcp2cli chrome-devtools-mcp --force

# Quiet mode (minimal output)
mcp2cli chrome-devtools-mcp --quiet
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

## Pi Agent Integration

After generation:

1. Run the install script:
   ```bash
   cd ~/agent-tools/<name>
   ./install.sh
   ```

2. Add to `~/.pi/agent/AGENTS.md`:
   ```markdown
   ### Your MCP Tools
   `~/agent-tools/<name>/README.md`
   
   Brief description. X executable tools.
   ```

   (See generated `AGENTS-ENTRY.md` for copy-paste snippet)

## How It Works

```
┌─────────────────────────────────────────────────────────────┐
│                         mcp2cli                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────┐    ┌─────────────┐    ┌────────────────────┐  │
│  │ mcporter │───>│   Schema    │───>│      pi -p         │  │
│  │   list   │    │   Parser    │    │  (Tool Generator)  │  │
│  └──────────┘    └─────────────┘    └────────────────────┘  │
│        │                                    │               │
│        v                                    v               │
│  ┌──────────────────────────────────────────────────────┐   │
│  │                   Output Generator                    │   │
│  │  ┌────────┐ ┌────────┐ ┌──────────┐ ┌────────────┐   │   │
│  │  │pkg.json│ │*.js    │ │README.md │ │install.sh  │   │   │
│  │  └────────┘ └────────┘ └──────────┘ └────────────┘   │   │
│  └──────────────────────────────────────────────────────┘   │
│                            │                                │
└────────────────────────────┼────────────────────────────────┘
                             v
                  ~/agent-tools/<name>/
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
npx mcp2cli @anthropic-ai/chrome-devtools-mcp

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
npx mcp2cli my-custom-mcp --name my-tools --output ./tools
```

## Troubleshooting

### mcporter not found
```bash
npm install -g mcporter
```

### Discovery timeout
The tool times out after 60 seconds. If your MCP server is slow to start:
```bash
MCPORTER_CALL_TIMEOUT=120000 npx mcp2cli <package>
```

### Pi not available
mcp2cli works without Pi but produces simpler 1:1 tool mappings. For intelligent grouping, install Pi:
```bash
npm install -g @anthropic-ai/pi
```

## Contributing

Contributions welcome! Please open an issue or PR on GitHub.

## License

MIT

## Credits

- **[mcporter](https://github.com/steipete/mcporter)** - Core MCP-to-CLI bridge
- **[Pi coding agent](https://github.com/badlogic/pi-mono)** - Intelligent code generation
- **[MCP](https://modelcontextprotocol.io/)** - Model Context Protocol standard
