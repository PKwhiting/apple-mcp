import { describe, expect, test } from "bun:test";
import { getRegisteredToolNames, requiresDestructiveConfirmation } from "../src/index.js";

describe("safety flags", () => {
  test("default mode registers all tools", () => {
    expect(getRegisteredToolNames({ readOnly: false, confirmDestructive: false })).toEqual([
      "list_calendars",
      "list_all_events",
      "list_events",
      "get_event",
      "search_events",
      "create_event",
      "update_event",
      "delete_event",
    ]);
  });

  test("read-only mode removes mutating tools", () => {
    expect(getRegisteredToolNames({ readOnly: true, confirmDestructive: false })).toEqual([
      "list_calendars",
      "list_all_events",
      "list_events",
      "get_event",
      "search_events",
    ]);
  });

  test("confirm-destructive only gates delete_event", () => {
    expect(requiresDestructiveConfirmation({ readOnly: false, confirmDestructive: true })).toBe(true);
  });
});
