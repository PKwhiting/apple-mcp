#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import * as applescript from "./applescript.js";

const server = new McpServer({
  name: "apple-calendar",
  version: "1.0.0",
});

// ---- list_calendars ----
server.registerTool(
  "list_calendars",
  {
    description: "List all calendars in Apple Calendar",
    inputSchema: z.object({}),
  },
  async () => {
    try {
      const calendars = await applescript.listCalendars();
      return { content: [{ type: "text", text: JSON.stringify(calendars, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

// ---- list_events ----
server.registerTool(
  "list_events",
  {
    description: "List events in a calendar within a date range",
    inputSchema: z.object({
      calendar: z.string().describe("Name of the calendar"),
      from_date: z.string().describe("Start date (e.g. 'January 1, 2025')"),
      to_date: z.string().describe("End date (e.g. 'January 31, 2025')"),
    }),
  },
  async ({ calendar, from_date, to_date }) => {
    try {
      const events = await applescript.listEvents(calendar, from_date, to_date);
      return { content: [{ type: "text", text: JSON.stringify(events, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

// ---- get_event ----
server.registerTool(
  "get_event",
  {
    description: "Get full details of an event by its summary/title",
    inputSchema: z.object({
      summary: z.string().describe("Summary/title of the event"),
      calendar: z.string().optional().describe("Calendar to search in (searches all calendars if omitted)"),
    }),
  },
  async ({ summary, calendar }) => {
    try {
      const event = await applescript.getEvent(summary, calendar);
      return { content: [{ type: "text", text: JSON.stringify(event, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

// ---- create_event ----
server.registerTool(
  "create_event",
  {
    description: "Create a new event in a calendar",
    inputSchema: z.object({
      calendar: z.string().describe("Name of the calendar to add the event to"),
      summary: z.string().describe("Title/summary of the event"),
      start_date: z.string().describe("Start date and time (e.g. 'March 15, 2025 at 2:00 PM')"),
      end_date: z.string().describe("End date and time (e.g. 'March 15, 2025 at 3:00 PM')"),
      location: z.string().optional().describe("Location of the event"),
      description: z.string().optional().describe("Description or notes for the event"),
      all_day: z.boolean().optional().describe("Whether this is an all-day event"),
    }),
  },
  async ({ calendar, summary, start_date, end_date, location, description, all_day }) => {
    try {
      const result = await applescript.createEvent(calendar, summary, start_date, end_date, {
        location,
        description,
        allDay: all_day,
      });
      return { content: [{ type: "text", text: result }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

// ---- delete_event ----
server.registerTool(
  "delete_event",
  {
    description: "Delete an event by its summary/title",
    inputSchema: z.object({
      summary: z.string().describe("Summary/title of the event to delete"),
      calendar: z.string().optional().describe("Calendar the event is in (searches all calendars if omitted)"),
    }),
  },
  async ({ summary, calendar }) => {
    try {
      const result = await applescript.deleteEvent(summary, calendar);
      return { content: [{ type: "text", text: result }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

// ---- search_events ----
server.registerTool(
  "search_events",
  {
    description: "Search events by summary/title across calendars",
    inputSchema: z.object({
      query: z.string().describe("Text to search for in event summaries"),
      calendar: z.string().optional().describe("Calendar to search in (searches all calendars if omitted)"),
    }),
  },
  async ({ query, calendar }) => {
    try {
      const results = await applescript.searchEvents(query, calendar);
      return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

// ---- Start server ----
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Apple Calendar MCP server running on stdio");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
