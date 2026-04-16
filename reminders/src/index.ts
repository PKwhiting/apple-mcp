#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import * as eventkit from "./eventkit.js";

export interface SafetyFlags {
  readOnly: boolean;
  confirmDestructive: boolean;
}

const READ_TOOL_NAMES = [
  "list_lists",
  "list_reminders",
  "get_reminder",
  "search_reminders",
] as const;

const WRITE_TOOL_NAMES = [
  "create_list",
  "create_reminder",
  "update_reminder",
  "complete_reminder",
  "uncomplete_reminder",
] as const;

const DESTRUCTIVE_TOOL_NAMES = [
  "delete_reminder",
  "delete_list",
] as const;

export function parseSafetyFlags(argv: string[] = process.argv): SafetyFlags {
  return {
    readOnly: argv.includes("--read-only"),
    confirmDestructive: argv.includes("--confirm-destructive"),
  };
}

export function getRegisteredToolNames(flags: SafetyFlags = parseSafetyFlags()): string[] {
  return [
    ...READ_TOOL_NAMES,
    ...(flags.readOnly ? [] : WRITE_TOOL_NAMES),
    ...(flags.readOnly ? [] : DESTRUCTIVE_TOOL_NAMES),
  ];
}

export function requiresDestructiveConfirmation(flags: SafetyFlags = parseSafetyFlags()): boolean {
  return !flags.readOnly && flags.confirmDestructive;
}

export function createServer(flags: SafetyFlags = parseSafetyFlags()): McpServer {
  const { readOnly, confirmDestructive } = flags;
  const server = new McpServer({
    name: "apple-reminders",
    version: "1.0.0",
  });

  // ---- list_lists ----
  server.registerTool(
    "list_lists",
    {
      description: "List all reminder lists in Apple Reminders",
      inputSchema: z.object({}),
    },
    async () => {
      try {
        const lists = await eventkit.listLists();
        return { content: [{ type: "text", text: JSON.stringify(lists, null, 2) }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Error: ${(err as Error).message}` }], isError: true };
      }
    }
  );

  if (!readOnly) {
    // ---- create_list ----
    server.registerTool(
      "create_list",
      {
        description: "Create a new reminder list",
        inputSchema: z.object({
          name: z.string().describe("Name of the list to create"),
        }),
      },
      async ({ name }) => {
        try {
          const result = await eventkit.createList(name);
          return { content: [{ type: "text", text: result }] };
        } catch (err) {
          return { content: [{ type: "text", text: `Error: ${(err as Error).message}` }], isError: true };
        }
      }
    );
  }

  // ---- list_reminders ----
  server.registerTool(
    "list_reminders",
    {
      description: "List reminders in a specific list",
      inputSchema: z.object({
        list: z.string().describe("Name of the reminder list"),
        include_completed: z.boolean().optional().describe("Include completed reminders (default false)"),
      }),
    },
    async ({ list, include_completed }) => {
      try {
        const reminders = await eventkit.listReminders(list, include_completed);
        return { content: [{ type: "text", text: JSON.stringify(reminders, null, 2) }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Error: ${(err as Error).message}` }], isError: true };
      }
    }
  );

  // ---- get_reminder ----
  server.registerTool(
    "get_reminder",
    {
      description: "Get full details of a reminder by name",
      inputSchema: z.object({
        name: z.string().describe("Name of the reminder to retrieve"),
        list: z.string().optional().describe("List to search in (searches all lists if omitted)"),
      }),
    },
    async ({ name, list }) => {
      try {
        const reminder = await eventkit.getReminder(name, list);
        return { content: [{ type: "text", text: JSON.stringify(reminder, null, 2) }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Error: ${(err as Error).message}` }], isError: true };
      }
    }
  );

  if (!readOnly) {
    // ---- create_reminder ----
    server.registerTool(
      "create_reminder",
      {
        description: "Create a new reminder in a list",
        inputSchema: z.object({
          name: z.string().describe("Name of the reminder"),
          list: z.string().describe("List to add the reminder to"),
          body: z.string().optional().describe("Notes/body text for the reminder"),
          due_date: z.string().optional().describe("Due date (e.g. 'March 15, 2025 at 2:00 PM')"),
          priority: z.number().optional().describe("Priority: 0 (none), 1 (high), 5 (medium), 9 (low)"),
        }),
      },
      async ({ name, list, body, due_date, priority }) => {
        try {
          const result = await eventkit.createReminder(name, list, { body, dueDate: due_date, priority });
          return { content: [{ type: "text", text: result }] };
        } catch (err) {
          return { content: [{ type: "text", text: `Error: ${(err as Error).message}` }], isError: true };
        }
      }
    );

    // ---- update_reminder ----
    server.registerTool(
      "update_reminder",
      {
        description: "Update an existing reminder's details",
        inputSchema: z.object({
          name: z.string().describe("Name of the reminder to update"),
          list: z.string().optional().describe("List the reminder is in (searches all lists if omitted)"),
          new_name: z.string().optional().describe("New name for the reminder"),
          body: z.string().optional().describe("New notes/body text"),
          due_date: z.string().optional().describe("New due date (e.g. 'March 15, 2025 at 2:00 PM')"),
          priority: z.number().optional().describe("New priority: 0 (none), 1 (high), 5 (medium), 9 (low)"),
        }),
      },
      async ({ name, list, new_name, body, due_date, priority }) => {
        try {
          const result = await eventkit.updateReminder(name, list, {
            newName: new_name,
            body,
            dueDate: due_date,
            priority,
          });
          return { content: [{ type: "text", text: result }] };
        } catch (err) {
          return { content: [{ type: "text", text: `Error: ${(err as Error).message}` }], isError: true };
        }
      }
    );

    // ---- complete_reminder ----
    server.registerTool(
      "complete_reminder",
      {
        description: "Mark a reminder as completed",
        inputSchema: z.object({
          name: z.string().describe("Name of the reminder to complete"),
          list: z.string().optional().describe("List the reminder is in (searches all lists if omitted)"),
        }),
      },
      async ({ name, list }) => {
        try {
          const result = await eventkit.completeReminder(name, list);
          return { content: [{ type: "text", text: result }] };
        } catch (err) {
          return { content: [{ type: "text", text: `Error: ${(err as Error).message}` }], isError: true };
        }
      }
    );

    // ---- uncomplete_reminder ----
    server.registerTool(
      "uncomplete_reminder",
      {
        description: "Mark a completed reminder as incomplete",
        inputSchema: z.object({
          name: z.string().describe("Name of the reminder to uncomplete"),
          list: z.string().optional().describe("List the reminder is in (searches all lists if omitted)"),
        }),
      },
      async ({ name, list }) => {
        try {
          const result = await eventkit.uncompleteReminder(name, list);
          return { content: [{ type: "text", text: result }] };
        } catch (err) {
          return { content: [{ type: "text", text: `Error: ${(err as Error).message}` }], isError: true };
        }
      }
    );

    // ---- delete_reminder ----
    server.registerTool(
      "delete_reminder",
      {
        description: "Delete a reminder",
        inputSchema: z.object({
          name: z.string().describe("Name of the reminder to delete"),
          list: z.string().optional().describe("List the reminder is in (searches all lists if omitted)"),
          ...(confirmDestructive ? { confirm: z.boolean().optional().describe("Set to true to confirm this destructive action") } : {}),
        }),
      },
      async ({ name, list, confirm }: { name: string; list?: string; confirm?: unknown }) => {
        if (confirmDestructive && !confirm) {
          return { content: [{ type: "text", text: "This will permanently delete the reminder. Please confirm with the user, then call again with confirm: true." }] };
        }
        try {
          const result = await eventkit.deleteReminder(name, list);
          return { content: [{ type: "text", text: result }] };
        } catch (err) {
          return { content: [{ type: "text", text: `Error: ${(err as Error).message}` }], isError: true };
        }
      }
    );

    // ---- delete_list ----
    server.registerTool(
      "delete_list",
      {
        description: "Delete a reminder list and all its reminders",
        inputSchema: z.object({
          name: z.string().describe("Name of the list to delete"),
          ...(confirmDestructive ? { confirm: z.boolean().optional().describe("Set to true to confirm this destructive action") } : {}),
        }),
      },
      async ({ name, confirm }: { name: string; confirm?: unknown }) => {
        if (confirmDestructive && !confirm) {
          return { content: [{ type: "text", text: "This will permanently delete the reminder list and all its reminders. Please confirm with the user, then call again with confirm: true." }] };
        }
        try {
          const result = await eventkit.deleteList(name);
          return { content: [{ type: "text", text: result }] };
        } catch (err) {
          return { content: [{ type: "text", text: `Error: ${(err as Error).message}` }], isError: true };
        }
      }
    );
  }

  // ---- search_reminders ----
  server.registerTool(
    "search_reminders",
    {
      description: "Search reminders by name across all lists or within a specific list",
      inputSchema: z.object({
        query: z.string().describe("Text to search for in reminder names"),
        list: z.string().optional().describe("List to search in (searches all lists if omitted)"),
      }),
    },
    async ({ query, list }) => {
      try {
        const results = await eventkit.searchReminders(query, list);
        return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Error: ${(err as Error).message}` }], isError: true };
      }
    }
  );

  return server;
}

// ---- Start server ----
async function main() {
  const transport = new StdioServerTransport();
  await createServer().connect(transport);
  console.error("Apple Reminders MCP server running on stdio");
}

if (require.main === module) {
  main().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
}
