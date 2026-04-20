# @griches/apple-messages-mcp

An [MCP](https://modelcontextprotocol.io) server that gives AI assistants access to Apple Messages on macOS. Reads messages from the Messages database (SQLite) and sends messages via AppleScript.

## Quick Start

```bash
npx @griches/apple-messages-mcp
```

## Tools

| Tool | Description |
|------|-------------|
| `list_chats` | List recent chats with last message preview |
| `get_chat_messages` | Get message history for a specific chat (with optional date range filtering) |
| `search_messages` | Search messages by text content |
| `send_message` | Send an iMessage or SMS |
| `get_chat_participants` | Get participants of a chat |
| `list_chats_safe` | List recent chats with sanitized previews and privacy metadata (`--enable-safe-tools`) |
| `get_chat_messages_safe` | Get sanitized message history for a specific chat (`--enable-safe-tools`) |
| `search_messages_safe` | Search messages by text content with sanitized results (`--enable-safe-tools`) |
| `get_chat_participants_safe` | Get chat participants with sanitized handle values (`--enable-safe-tools`) |

## Configuration

### Claude Code

```bash
claude mcp add apple-messages -- npx @griches/apple-messages-mcp
```

To enable the privacy-safe tool variants:

```bash
claude mcp add apple-messages-safe -- npx @griches/apple-messages-mcp --enable-safe-tools
```

### Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "apple-messages": {
      "command": "npx",
      "args": ["@griches/apple-messages-mcp"]
    }
  }
}
```

## Requirements

- **macOS** (uses AppleScript and macOS Messages database)
- **Node.js** 22+ (uses built-in `node:sqlite`)
- **Full Disk Access** granted to your terminal app (System Settings > Privacy & Security > Full Disk Access) — required for reading the Messages database
- `openredaction` is bundled as the local safe-tool redaction engine; no separate Python runtime is required

## Permissions

- **Reading messages**: Requires Full Disk Access for your terminal app to read `~/Library/Messages/chat.db`
- **Sending messages**: macOS will prompt you to allow your terminal app to control the Messages app via AppleScript
- **Privacy-safe reads**: `--enable-safe-tools` registers parallel `*_safe` tools, and `--privacy-policy` lets you override the built-in privacy policy

## License

MIT — see the [main repository](https://github.com/griches/apple-mcp) for full details.
