# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Native pi extension generation** (`mcp2ext`) - Generate TypeScript extensions with `pi.registerTool()` instead of CLI wrappers
- **JSON Schema to TypeBox converter** (`lib/schema-converter.js`) - Converts MCP tool schemas to TypeBox code
- **Extension generator** (`lib/extension-generator.js`) - Generates complete pi extension files (index.ts, package.json, README.md)
- **Migration tooling** (`mcp2ext migrate`) - Migrate existing CLI tools from `~/agent-tools/` to pi extensions
- **Dual-mode CLI** - `mcp2ext` for extensions (default), `mcp2cli` for legacy CLI wrappers
- Extension management commands: `mcp2ext list`, `mcp2ext remove`
- New config file location: `~/.pi/agent/mcp2ext.settings.json`
- MIGRATION.md guide for migrating from CLI to extension format

### Changed
- Default command is now `mcp2ext` (extension generation)
- Extensions output to `~/.pi/agent/extensions/<name>/` (auto-discovered by pi)
- AI grouping prompt updated for extension format (snake_case tool names, TypeBox schemas)
- Discovery error messages are now generic (not hardcoded to mcp2cli)

### Fixed
- Escape special characters in generated TypeScript string literals
- Escape `*/` in block comments to prevent comment injection
- Handle hyphenated property names with bracket notation
- Handle server names starting with numbers (prefix with `_`)
- Handle spaces and special characters in server names
- Sanitize tool names in fallback grouping to valid snake_case
- Consistent escaping in schema options (tabs, carriage returns)

## [1.7.0] - 2025-01-03

### Added
- `refresh` command to fix missing symlinks and registrations
- `--fix` flag for `list` command to auto-repair issues

## [1.6.0] - 2025-01-02

### Added
- Idempotent re-run support with manifest-based tracking
- Preserves user-added files when regenerating with `--force`
- Tracks generated files in `.mcp2cli-manifest.json`

### Changed
- `--force` now only removes generated files, preserving customizations

## [1.5.1] - 2025-01-01

### Added
- Auto-configure PATH in shell config (~/.zshrc, ~/.bashrc)
- Detects existing PATH configuration to avoid duplicates

## [1.5.0] - 2024-12-31

### Added
- Codex CLI headless mode support (`--agent codex`)
- Agent auto-detection order: Pi → Claude → Codex

## [1.4.0] - 2024-12-30

### Added
- Auto-symlink generated tools to `~/agent-tools/bin/`
- `--no-symlink` flag to disable symlinking
- `--symlink-dir` to customize symlink location

## [1.3.0] - 2024-12-29

### Added
- `remove` command to uninstall generated tools
- Removes symlinks, registrations, and tool directory

## [1.2.0] - 2024-12-28

### Added
- `list` command to show installed tools
- Shows registration status and symlink counts

## [1.1.0] - 2024-12-27

### Added
- Multi-preset support (`--preset pi,claude,gemini`)
- `--all-presets` flag to register in all known files
- Local registration with `--local` flag

## [1.0.0] - 2024-12-26

### Added
- Initial release
- MCP tool discovery via mcporter
- AI-powered tool grouping (Pi, Claude)
- CLI wrapper generation with action parameter
- AGENTS.md registration
- Support for npm (npx), Python (uvx), and pip runners
- `--dry-run` preview mode
- Fallback 1:1 tool mapping when no AI agent available

[Unreleased]: https://github.com/nicobailon/mcp-to-pi-tools/compare/v1.7.0...HEAD
[1.7.0]: https://github.com/nicobailon/mcp-to-pi-tools/compare/v1.6.0...v1.7.0
[1.6.0]: https://github.com/nicobailon/mcp-to-pi-tools/compare/v1.5.1...v1.6.0
[1.5.1]: https://github.com/nicobailon/mcp-to-pi-tools/compare/v1.5.0...v1.5.1
[1.5.0]: https://github.com/nicobailon/mcp-to-pi-tools/compare/v1.4.0...v1.5.0
[1.4.0]: https://github.com/nicobailon/mcp-to-pi-tools/compare/v1.3.0...v1.4.0
[1.3.0]: https://github.com/nicobailon/mcp-to-pi-tools/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/nicobailon/mcp-to-pi-tools/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/nicobailon/mcp-to-pi-tools/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/nicobailon/mcp-to-pi-tools/releases/tag/v1.0.0
