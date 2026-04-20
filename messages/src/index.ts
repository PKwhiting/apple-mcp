#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import * as applescript from "./applescript.js";
import * as database from "./database.js";
import {
  createSafeJsonResponse,
  parsePrivacyFlags,
  type PrivacyFlags,
  type PrivacyPolicy,
} from "./privacy.js";

export interface SafetyFlags {
  readOnly: boolean;
  confirmDestructive: boolean;
}

const READ_TOOL_NAMES = [
  "list_chats",
  "get_chat_messages",
  "search_messages",
  "get_chat_participants",
] as const;

const SAFE_READ_TOOL_NAMES = [
  "list_chats_safe",
  "get_chat_messages_safe",
  "search_messages_safe",
  "get_chat_participants_safe",
] as const;

const WRITE_TOOL_NAMES = ["send_message"] as const;

const LIST_CHATS_SAFE_POLICY: PrivacyPolicy = {
  text_fields: ["display_name", "last_message_text"],
};

const CHAT_MESSAGES_SAFE_POLICY: PrivacyPolicy = {
  structured_alias_fields: {
    sender: "CONTACT",
  },
  text_fields: ["text"],
};

const SEARCH_MESSAGES_SAFE_POLICY: PrivacyPolicy = {
  structured_alias_fields: {
    sender: "CONTACT",
  },
  text_fields: ["text"],
};

const PARTICIPANTS_SAFE_POLICY: PrivacyPolicy = {
  structured_alias_fields: {
    handle_id: "CONTACT",
  },
};

export function parseSafetyFlags(argv: string[] = process.argv): SafetyFlags {
  return {
    readOnly: argv.includes("--read-only"),
    confirmDestructive: argv.includes("--confirm-destructive"),
  };
}

export function getRegisteredToolNames(
  flags: SafetyFlags = parseSafetyFlags(),
  privacyFlags: PrivacyFlags = parsePrivacyFlags()
): string[] {
  return [
    ...READ_TOOL_NAMES,
    ...(privacyFlags.enableSafeTools ? SAFE_READ_TOOL_NAMES : []),
    ...(flags.readOnly ? [] : WRITE_TOOL_NAMES),
  ];
}

export function createServer(
  flags: SafetyFlags = parseSafetyFlags(),
  privacyFlags: PrivacyFlags = parsePrivacyFlags()
): McpServer {
  const { readOnly } = flags;
  const server = new McpServer({
    name: "apple-messages",
    version: "1.0.0",
  });

  // ---- list_chats ----
  server.registerTool(
    "list_chats",
    {
      description: "List recent chats with last message preview and participant info",
      inputSchema: z.object({
        limit: z.number().optional().describe("Maximum number of chats to return (default 50)"),
      }),
    },
    async ({ limit }) => {
      try {
        const chats = database.listChats(limit);
        return { content: [{ type: "text", text: JSON.stringify(chats, null, 2) }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Error: ${(err as Error).message}` }], isError: true };
      }
    }
  );

  if (privacyFlags.enableSafeTools) {
    // ---- list_chats_safe ----
    server.registerTool(
      "list_chats_safe",
      {
        description: "List recent chats with sanitized previews and privacy metadata",
        inputSchema: z.object({
          limit: z.number().optional().describe("Maximum number of chats to return (default 50)"),
          alias_session_id: z.string().optional().describe("Optional alias namespace for stable placeholders"),
        }),
      },
      async ({ limit, alias_session_id }) => {
        try {
          const chats = database.listChats(limit);
          return await createSafeJsonResponse("chats", chats, {
            namespace: "messages.list_chats_safe",
            aliasSessionId: alias_session_id,
            defaultPolicy: LIST_CHATS_SAFE_POLICY,
            flags: privacyFlags,
          });
        } catch (err) {
          return { content: [{ type: "text", text: `Error: ${(err as Error).message}` }], isError: true };
        }
      }
    );
  }

  // ---- get_chat_messages ----
  server.registerTool(
    "get_chat_messages",
    {
      description: "Get message history for a specific chat",
      inputSchema: z.object({
        chat_id: z.string().describe("Chat identifier (e.g. iMessage;-;+1234567890)"),
        limit: z.number().optional().describe("Maximum number of messages to return (default 100)"),
        from_date: z.string().optional().describe("Filter messages from this date (e.g. '2025-01-01' or '2025-03-15T14:00:00')"),
        to_date: z.string().optional().describe("Filter messages up to this date (e.g. '2025-12-31')"),
      }),
    },
    async ({ chat_id, limit, from_date, to_date }) => {
      try {
        const messages = database.getChatMessages(chat_id, limit, from_date, to_date);
        return { content: [{ type: "text", text: JSON.stringify(messages, null, 2) }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Error: ${(err as Error).message}` }], isError: true };
      }
    }
  );

  if (privacyFlags.enableSafeTools) {
    // ---- get_chat_messages_safe ----
    server.registerTool(
      "get_chat_messages_safe",
      {
        description: "Get sanitized message history for a specific chat",
        inputSchema: z.object({
          chat_id: z.string().describe("Chat identifier (e.g. iMessage;-;+1234567890)"),
          limit: z.number().optional().describe("Maximum number of messages to return (default 100)"),
          from_date: z.string().optional().describe("Filter messages from this date (e.g. '2025-01-01' or '2025-03-15T14:00:00')"),
          to_date: z.string().optional().describe("Filter messages up to this date (e.g. '2025-12-31')"),
          alias_session_id: z.string().optional().describe("Optional alias namespace for stable placeholders"),
        }),
      },
      async ({ chat_id, limit, from_date, to_date, alias_session_id }) => {
        try {
          const messages = database.getChatMessages(chat_id, limit, from_date, to_date);
          return await createSafeJsonResponse("messages", messages, {
            namespace: "messages.get_chat_messages_safe",
            aliasSessionId: alias_session_id,
            defaultPolicy: CHAT_MESSAGES_SAFE_POLICY,
            flags: privacyFlags,
          });
        } catch (err) {
          return { content: [{ type: "text", text: `Error: ${(err as Error).message}` }], isError: true };
        }
      }
    );
  }

  // ---- search_messages ----
  server.registerTool(
    "search_messages",
    {
      description: "Search messages by text content",
      inputSchema: z.object({
        query: z.string().describe("Text to search for in messages"),
        chat_id: z.string().optional().describe("Limit search to a specific chat"),
        limit: z.number().optional().describe("Maximum number of results (default 50)"),
      }),
    },
    async ({ query, chat_id, limit }) => {
      try {
        const results = database.searchMessages(query, chat_id, limit);
        return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Error: ${(err as Error).message}` }], isError: true };
      }
    }
  );

  if (privacyFlags.enableSafeTools) {
    // ---- search_messages_safe ----
    server.registerTool(
      "search_messages_safe",
      {
        description: "Search messages by text content with sanitized results",
        inputSchema: z.object({
          query: z.string().describe("Text to search for in messages"),
          chat_id: z.string().optional().describe("Limit search to a specific chat"),
          limit: z.number().optional().describe("Maximum number of results (default 50)"),
          alias_session_id: z.string().optional().describe("Optional alias namespace for stable placeholders"),
        }),
      },
      async ({ query, chat_id, limit, alias_session_id }) => {
        try {
          const results = database.searchMessages(query, chat_id, limit);
          return await createSafeJsonResponse("results", results, {
            namespace: "messages.search_messages_safe",
            aliasSessionId: alias_session_id,
            defaultPolicy: SEARCH_MESSAGES_SAFE_POLICY,
            flags: privacyFlags,
          });
        } catch (err) {
          return { content: [{ type: "text", text: `Error: ${(err as Error).message}` }], isError: true };
        }
      }
    );
  }

  if (!readOnly) {
    // ---- send_message ----
    server.registerTool(
      "send_message",
      {
        description: "Send an iMessage or SMS to a phone number or email address",
        inputSchema: z.object({
          to: z.string().describe("Phone number or email address of the recipient"),
          text: z.string().describe("Message text to send"),
          service: z.enum(["iMessage", "SMS"]).optional().describe("Service to use (default iMessage)"),
        }),
      },
      async ({ to, text, service }) => {
        try {
          const result = await applescript.sendMessage(to, text, service);
          return { content: [{ type: "text", text: result }] };
        } catch (err) {
          return { content: [{ type: "text", text: `Error: ${(err as Error).message}` }], isError: true };
        }
      }
    );
  }

  // ---- get_chat_participants ----
  server.registerTool(
    "get_chat_participants",
    {
      description: "Get participants of a chat",
      inputSchema: z.object({
        chat_id: z.string().describe("Chat identifier (e.g. iMessage;-;+1234567890)"),
      }),
    },
    async ({ chat_id }) => {
      try {
        const participants = database.getChatParticipants(chat_id);
        return { content: [{ type: "text", text: JSON.stringify(participants, null, 2) }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Error: ${(err as Error).message}` }], isError: true };
      }
    }
  );

  if (privacyFlags.enableSafeTools) {
    // ---- get_chat_participants_safe ----
    server.registerTool(
      "get_chat_participants_safe",
      {
        description: "Get participants of a chat with sanitized handle values",
        inputSchema: z.object({
          chat_id: z.string().describe("Chat identifier (e.g. iMessage;-;+1234567890)"),
          alias_session_id: z.string().optional().describe("Optional alias namespace for stable placeholders"),
        }),
      },
      async ({ chat_id, alias_session_id }) => {
        try {
          const participants = database.getChatParticipants(chat_id);
          return await createSafeJsonResponse("participants", participants, {
            namespace: "messages.get_chat_participants_safe",
            aliasSessionId: alias_session_id,
            defaultPolicy: PARTICIPANTS_SAFE_POLICY,
            flags: privacyFlags,
          });
        } catch (err) {
          return { content: [{ type: "text", text: `Error: ${(err as Error).message}` }], isError: true };
        }
      }
    );
  }

  return server;
}

// ---- Start server ----
async function main() {
  const transport = new StdioServerTransport();
  await createServer().connect(transport);
  console.error("Apple Messages MCP server running on stdio");
}

if (require.main === module) {
  main().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
}
