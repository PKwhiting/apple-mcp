#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import * as applescript from "./applescript.js";
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
  "list_folders",
  "list_notes",
  "get_note",
  "search_notes",
] as const;

const SAFE_READ_TOOL_NAMES = [
  "list_notes_safe",
  "get_note_safe",
  "search_notes_safe",
] as const;

const WRITE_TOOL_NAMES = [
  "create_folder",
  "create_note",
  "update_note",
  "move_note",
  "append_to_note",
] as const;

const DESTRUCTIVE_TOOL_NAMES = [
  "delete_note",
  "delete_folder",
] as const;

const LIST_NOTES_SAFE_POLICY: PrivacyPolicy = {
  text_fields: ["title"],
};

const GET_NOTE_SAFE_POLICY: PrivacyPolicy = {
  text_fields: ["title", "body"],
};

const SEARCH_NOTES_SAFE_POLICY: PrivacyPolicy = {
  text_fields: ["title"],
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
    ...(flags.readOnly ? [] : DESTRUCTIVE_TOOL_NAMES),
  ];
}

export function requiresDestructiveConfirmation(flags: SafetyFlags = parseSafetyFlags()): boolean {
  return !flags.readOnly && flags.confirmDestructive;
}

export function createServer(
  flags: SafetyFlags = parseSafetyFlags(),
  privacyFlags: PrivacyFlags = parsePrivacyFlags()
): McpServer {
  const { readOnly, confirmDestructive } = flags;
  const server = new McpServer({
    name: "apple-notes",
    version: "1.0.0",
  });

  // ---- list_folders ----
  server.registerTool(
    "list_folders",
    {
      description: "List all folders in Apple Notes",
      inputSchema: z.object({}),
    },
    async () => {
      try {
        const folders = await applescript.listFolders();
        return { content: [{ type: "text", text: JSON.stringify(folders, null, 2) }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Error: ${(err as Error).message}` }], isError: true };
      }
    }
  );

  if (!readOnly) {
    // ---- create_folder ----
    server.registerTool(
      "create_folder",
      {
        description: "Create a new folder in Apple Notes",
        inputSchema: z.object({
          name: z.string().describe("Name of the folder to create"),
        }),
      },
      async ({ name }) => {
        try {
          const result = await applescript.createFolder(name);
          return { content: [{ type: "text", text: result }] };
        } catch (err) {
          return { content: [{ type: "text", text: `Error: ${(err as Error).message}` }], isError: true };
        }
      }
    );
  }

  // ---- list_notes ----
  server.registerTool(
    "list_notes",
    {
      description: "List all notes in a specified Apple Notes folder",
      inputSchema: z.object({
        folder: z.string().describe("Name of the folder to list notes from"),
      }),
    },
    async ({ folder }) => {
      try {
        const notes = await applescript.listNotes(folder);
        return { content: [{ type: "text", text: JSON.stringify(notes, null, 2) }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Error: ${(err as Error).message}` }], isError: true };
      }
    }
  );

  if (privacyFlags.enableSafeTools) {
    // ---- list_notes_safe ----
    server.registerTool(
      "list_notes_safe",
      {
        description: "List notes in a folder with sanitized titles",
        inputSchema: z.object({
          folder: z.string().describe("Name of the folder to list notes from"),
          alias_session_id: z.string().optional().describe("Optional alias namespace for stable placeholders"),
        }),
      },
      async ({ folder, alias_session_id }) => {
        try {
          const notes = await applescript.listNotes(folder);
          return await createSafeJsonResponse("notes", notes, {
            namespace: "notes.list_notes_safe",
            aliasSessionId: alias_session_id,
            defaultPolicy: LIST_NOTES_SAFE_POLICY,
            flags: privacyFlags,
          });
        } catch (err) {
          return { content: [{ type: "text", text: `Error: ${(err as Error).message}` }], isError: true };
        }
      }
    );
  }

  // ---- get_note ----
  server.registerTool(
    "get_note",
    {
      description: "Get the full content of a specific note by title",
      inputSchema: z.object({
        title: z.string().describe("Title of the note to retrieve"),
        folder: z.string().optional().describe("Folder to search in (searches all folders if omitted)"),
      }),
    },
    async ({ title, folder }) => {
      try {
        const note = await applescript.getNote(title, folder);
        return { content: [{ type: "text", text: JSON.stringify(note, null, 2) }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Error: ${(err as Error).message}` }], isError: true };
      }
    }
  );

  if (privacyFlags.enableSafeTools) {
    // ---- get_note_safe ----
    server.registerTool(
      "get_note_safe",
      {
        description: "Get the sanitized content of a specific note by title",
        inputSchema: z.object({
          title: z.string().describe("Title of the note to retrieve"),
          folder: z.string().optional().describe("Folder to search in (searches all folders if omitted)"),
          alias_session_id: z.string().optional().describe("Optional alias namespace for stable placeholders"),
        }),
      },
      async ({ title, folder, alias_session_id }) => {
        try {
          const note = await applescript.getNote(title, folder);
          return await createSafeJsonResponse("note", note, {
            namespace: "notes.get_note_safe",
            aliasSessionId: alias_session_id,
            defaultPolicy: GET_NOTE_SAFE_POLICY,
            flags: privacyFlags,
          });
        } catch (err) {
          return { content: [{ type: "text", text: `Error: ${(err as Error).message}` }], isError: true };
        }
      }
    );
  }

  if (!readOnly) {
    // ---- create_note ----
    server.registerTool(
      "create_note",
      {
        description: "Create a new note in a specified Apple Notes folder",
        inputSchema: z.object({
          title: z.string().describe("Title of the new note"),
          body: z.string().describe("HTML body content of the note"),
          folder: z.string().describe("Folder to create the note in"),
        }),
      },
      async ({ title, body, folder }) => {
        try {
          const result = await applescript.createNote(title, body, folder);
          return { content: [{ type: "text", text: result }] };
        } catch (err) {
          return { content: [{ type: "text", text: `Error: ${(err as Error).message}` }], isError: true };
        }
      }
    );

    // ---- update_note ----
    server.registerTool(
      "update_note",
      {
        description: "Update the body of an existing note",
        inputSchema: z.object({
          title: z.string().describe("Title of the note to update"),
          body: z.string().describe("New HTML body content for the note"),
          folder: z.string().optional().describe("Folder the note is in (searches all folders if omitted)"),
        }),
      },
      async ({ title, body, folder }) => {
        try {
          const result = await applescript.updateNote(title, body, folder);
          return { content: [{ type: "text", text: result }] };
        } catch (err) {
          return { content: [{ type: "text", text: `Error: ${(err as Error).message}` }], isError: true };
        }
      }
    );

    // ---- delete_note ----
    server.registerTool(
      "delete_note",
      {
        description: "Delete a note from Apple Notes",
        inputSchema: z.object({
          title: z.string().describe("Title of the note to delete"),
          folder: z.string().optional().describe("Folder the note is in (searches all folders if omitted)"),
          ...(confirmDestructive ? { confirm: z.boolean().optional().describe("Set to true to confirm this destructive action") } : {}),
        }),
      },
      async ({ title, folder, confirm }: { title: string; folder?: string; confirm?: unknown }) => {
        if (confirmDestructive && !confirm) {
          return { content: [{ type: "text", text: "This will permanently delete the note. Please confirm with the user, then call again with confirm: true." }] };
        }
        try {
          const result = await applescript.deleteNote(title, folder);
          return { content: [{ type: "text", text: result }] };
        } catch (err) {
          return { content: [{ type: "text", text: `Error: ${(err as Error).message}` }], isError: true };
        }
      }
    );

    // ---- delete_folder ----
    server.registerTool(
      "delete_folder",
      {
        description: "Delete a folder and all its notes from Apple Notes",
        inputSchema: z.object({
          name: z.string().describe("Name of the folder to delete"),
          ...(confirmDestructive ? { confirm: z.boolean().optional().describe("Set to true to confirm this destructive action") } : {}),
        }),
      },
      async ({ name, confirm }: { name: string; confirm?: unknown }) => {
        if (confirmDestructive && !confirm) {
          return { content: [{ type: "text", text: "This will permanently delete the folder and all notes inside it. Please confirm with the user, then call again with confirm: true." }] };
        }
        try {
          const result = await applescript.deleteFolder(name);
          return { content: [{ type: "text", text: result }] };
        } catch (err) {
          return { content: [{ type: "text", text: `Error: ${(err as Error).message}` }], isError: true };
        }
      }
    );

    // ---- move_note ----
    server.registerTool(
      "move_note",
      {
        description: "Move a note from one folder to another",
        inputSchema: z.object({
          title: z.string().describe("Title of the note to move"),
          from_folder: z.string().describe("Source folder name"),
          to_folder: z.string().describe("Destination folder name"),
        }),
      },
      async ({ title, from_folder, to_folder }) => {
        try {
          const result = await applescript.moveNote(title, from_folder, to_folder);
          return { content: [{ type: "text", text: result }] };
        } catch (err) {
          return { content: [{ type: "text", text: `Error: ${(err as Error).message}` }], isError: true };
        }
      }
    );

    // ---- append_to_note ----
    server.registerTool(
      "append_to_note",
      {
        description: "Append HTML content to an existing note without replacing its body",
        inputSchema: z.object({
          title: z.string().describe("Title of the note to append to"),
          content: z.string().describe("HTML content to append to the note"),
          folder: z.string().optional().describe("Folder the note is in (searches all folders if omitted)"),
        }),
      },
      async ({ title, content, folder }) => {
        try {
          const result = await applescript.appendToNote(title, content, folder);
          return { content: [{ type: "text", text: result }] };
        } catch (err) {
          return { content: [{ type: "text", text: `Error: ${(err as Error).message}` }], isError: true };
        }
      }
    );
  }

  // ---- search_notes ----
  server.registerTool(
    "search_notes",
    {
      description: "Search notes by keyword across all folders or within a specific folder. Searches both titles and body content.",
      inputSchema: z.object({
        query: z.string().describe("Search keyword to match against note titles and body content"),
        folder: z.string().optional().describe("Folder to search in (searches all folders if omitted)"),
      }),
    },
    async ({ query, folder }) => {
      try {
        const results = await applescript.searchNotes(query, folder);
        return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Error: ${(err as Error).message}` }], isError: true };
      }
    }
  );

  if (privacyFlags.enableSafeTools) {
    // ---- search_notes_safe ----
    server.registerTool(
      "search_notes_safe",
      {
        description: "Search notes with sanitized titles in the result set",
        inputSchema: z.object({
          query: z.string().describe("Search keyword to match against note titles and body content"),
          folder: z.string().optional().describe("Folder to search in (searches all folders if omitted)"),
          alias_session_id: z.string().optional().describe("Optional alias namespace for stable placeholders"),
        }),
      },
      async ({ query, folder, alias_session_id }) => {
        try {
          const results = await applescript.searchNotes(query, folder);
          return await createSafeJsonResponse("results", results, {
            namespace: "notes.search_notes_safe",
            aliasSessionId: alias_session_id,
            defaultPolicy: SEARCH_NOTES_SAFE_POLICY,
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
  console.error("Apple Notes MCP server running on stdio");
}

if (require.main === module) {
  main().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
}
