# @griches/apple-notes-mcp

An [MCP](https://modelcontextprotocol.io) server that gives AI assistants access to Apple Notes on macOS via AppleScript.

## Quick Start

```bash
npx @griches/apple-notes-mcp
```

## Tools

| Tool | Description |
|------|-------------|
| `list_folders` | List all folders in Apple Notes |
| `create_folder` | Create a new folder |
| `list_notes` | List all notes in a folder |
| `get_note` | Get the full content of a note by title |
| `create_note` | Create a new note (HTML body) in a folder |
| `update_note` | Update the body of an existing note |
| `move_note` | Move a note from one folder to another |
| `append_to_note` | Append HTML content to an existing note |
| `delete_note` | Delete a note |
| `delete_folder` | Delete a folder and all its notes |
| `search_notes` | Search notes by keyword in titles and body content |
| `list_notes_safe` | List notes with sanitized titles (`--enable-safe-tools`) |
| `get_note_safe` | Get sanitized note content by title (`--enable-safe-tools`) |
| `search_notes_safe` | Search notes with sanitized titles in the result set (`--enable-safe-tools`) |

## Configuration

### Claude Code

```bash
claude mcp add apple-notes -- npx @griches/apple-notes-mcp
```

To enable the privacy-safe tool variants:

```bash
claude mcp add apple-notes-safe -- npx @griches/apple-notes-mcp --enable-safe-tools
```

### Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "apple-notes": {
      "command": "npx",
      "args": ["@griches/apple-notes-mcp"]
    }
  }
}
```

## Requirements

- **macOS** (uses AppleScript)
- **Node.js** 22+
- `openredaction` is bundled as the local safe-tool redaction engine; no separate Python runtime is required

## Privacy Flags

- `--enable-safe-tools` registers the privacy-safe read tools alongside the raw tools
- `--privacy-policy <path>` loads a JSON privacy policy override

## License

MIT — see the [main repository](https://github.com/griches/apple-mcp) for full details.
