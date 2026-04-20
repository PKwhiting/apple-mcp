# @griches/apple-mail-mcp

An [MCP](https://modelcontextprotocol.io) server that gives AI assistants access to Apple Mail on macOS via AppleScript.

## Quick Start

```bash
npx @griches/apple-mail-mcp
```

## Tools

| Tool | Description |
|------|-------------|
| `list_mailboxes` | List all mailboxes across accounts with unread counts |
| `list_messages` | List recent messages in a mailbox, optionally filtered to unread only |
| `get_message` | Get the full content of an email by ID |
| `search_messages` | Search emails by subject or sender across mailboxes |
| `send_email` | Send an email with optional CC/BCC (supports multiple recipients) |
| `get_unread_count` | Get unread count for a mailbox or all mailboxes |
| `move_message` | Move an email to a different mailbox |
| `mark_read` | Mark an email as read or unread |
| `delete_message` | Delete an email (moves to trash) |
| `flag_message` | Flag or unflag an email message |
| `list_messages_safe` | List recent messages with sanitized subject and sender fields (`--enable-safe-tools`) |
| `get_message_safe` | Get sanitized email content by ID (`--enable-safe-tools`) |
| `search_messages_safe` | Search emails with sanitized subject/sender results (`--enable-safe-tools`) |

## Configuration

### Claude Code

```bash
claude mcp add apple-mail -- npx @griches/apple-mail-mcp
```

To enable the privacy-safe tool variants:

```bash
claude mcp add apple-mail-safe -- npx @griches/apple-mail-mcp --enable-safe-tools
```

### Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "apple-mail": {
      "command": "npx",
      "args": ["@griches/apple-mail-mcp"]
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
