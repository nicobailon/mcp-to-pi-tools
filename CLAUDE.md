# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm test              # Run all tests (node --test)
npm run check         # Syntax check all JS files
node --test test/discovery.test.js  # Run single test file
```

## Architecture

mcp-to-pi-tools converts MCP servers into standalone CLI tools for AI agents. It uses mcporter as the underlying MCP-to-CLI bridge, then generates wrapper scripts that are easier for agents to invoke.

**Execution Pipeline** (in `bin/mcp-to-pi-tools.js`):
1. Check dependencies (mcporter, pi/claude/codex)
2. Discover MCP tools via `mcporter tools`
3. Group related tools using AI (Pi, Claude, or Codex headless)
4. Generate wrapper scripts using AI
5. Write output to `~/agent-tools/<name>/`
6. Create symlinks in `~/agent-tools/bin/`
7. Register in AGENTS.md/CLAUDE.md files

**Key Modules** (`lib/`):
- `discovery.js` - MCP tool discovery via mcporter, server name derivation
- `grouping.js` - AI-powered tool grouping (combines related MCP tools into single scripts)
- `generator.js` - AI-powered wrapper script generation, README generation
- `runner.js` - Multi-runner support (npx, uvx, pip, custom commands)
- `registration.js` - Auto-registration to agent config files (Pi, Claude, Gemini, Codex)
- `symlink.js` - Auto-symlink creation for PATH-accessible tools
- `config.js` - Settings file loading and CLI option merging
- `output.js` - File writing with path resolution

**AI Agent Usage**: The tool uses `pi -p`, `claude -p`, or `codex exec --full-auto` in headless mode to generate code. Detection order: Pi -> Claude -> Codex. Use `--agent <name>` to force a specific agent. If none available, falls back to basic grouping/templates.

## Testing

Tests use Node.js built-in test runner. Test fixtures in `test/fixtures.js` contain validated MCP packages:
- `mcp-server-time` (Python/uvx)
- `chrome-devtools-mcp` (npm)
- `@upstash/context7-mcp` (scoped npm)

## Code Style

- ES modules only (`import`/`export`, no `require`)
- Manual argument parsing (no yargs/commander)
- Errors to stderr with `console.error()`, exit codes defined in main file
