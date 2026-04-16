import { describe, expect, test } from "bun:test";
import { getRegisteredToolNames, requiresDestructiveConfirmation } from "../src/index.js";

describe("safety flags", () => {
  test("default mode registers all tools", () => {
    expect(getRegisteredToolNames({ readOnly: false, confirmDestructive: false })).toEqual([
      "list_lists",
      "list_reminders",
      "get_reminder",
      "search_reminders",
      "create_list",
      "create_reminder",
      "update_reminder",
      "complete_reminder",
      "uncomplete_reminder",
      "delete_reminder",
      "delete_list",
    ]);
  });

  test("read-only mode removes all mutating tools", () => {
    expect(getRegisteredToolNames({ readOnly: true, confirmDestructive: false })).toEqual([
      "list_lists",
      "list_reminders",
      "get_reminder",
      "search_reminders",
    ]);
  });

  test("confirm-destructive still exposes non-destructive writes", () => {
    expect(getRegisteredToolNames({ readOnly: false, confirmDestructive: true })).toEqual([
      "list_lists",
      "list_reminders",
      "get_reminder",
      "search_reminders",
      "create_list",
      "create_reminder",
      "update_reminder",
      "complete_reminder",
      "uncomplete_reminder",
      "delete_reminder",
      "delete_list",
    ]);
    expect(requiresDestructiveConfirmation({ readOnly: false, confirmDestructive: true })).toBe(true);
  });
});
