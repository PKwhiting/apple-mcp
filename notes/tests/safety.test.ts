import { describe, expect, test } from "bun:test";
import { getRegisteredToolNames, requiresDestructiveConfirmation } from "../src/index.js";

describe("safety flags", () => {
  test("default mode registers all tools", () => {
    expect(getRegisteredToolNames({ readOnly: false, confirmDestructive: false })).toEqual([
      "list_folders",
      "list_notes",
      "get_note",
      "search_notes",
      "create_folder",
      "create_note",
      "update_note",
      "move_note",
      "append_to_note",
      "delete_note",
      "delete_folder",
    ]);
  });

  test("read-only mode keeps only read tools", () => {
    expect(getRegisteredToolNames({ readOnly: true, confirmDestructive: false })).toEqual([
      "list_folders",
      "list_notes",
      "get_note",
      "search_notes",
    ]);
  });

  test("confirm-destructive only affects destructive tools", () => {
    expect(getRegisteredToolNames({ readOnly: false, confirmDestructive: true })).toEqual([
      "list_folders",
      "list_notes",
      "get_note",
      "search_notes",
      "create_folder",
      "create_note",
      "update_note",
      "move_note",
      "append_to_note",
      "delete_note",
      "delete_folder",
    ]);
    expect(requiresDestructiveConfirmation({ readOnly: false, confirmDestructive: true })).toBe(true);
  });
});
