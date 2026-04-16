import { describe, expect, test } from "bun:test";
import { getRegisteredToolNames, requiresDestructiveConfirmation } from "../src/index.js";

describe("safety flags", () => {
  test("default mode registers all tools", () => {
    expect(getRegisteredToolNames({ readOnly: false, confirmDestructive: false })).toEqual([
      "list_groups",
      "list_contacts",
      "get_contact",
      "search_contacts",
      "update_contact",
      "create_contact",
      "create_group",
      "add_contact_to_group",
      "remove_contact_from_group",
      "delete_contact",
      "delete_group",
    ]);
  });

  test("read-only mode removes all mutating tools", () => {
    expect(getRegisteredToolNames({ readOnly: true, confirmDestructive: false })).toEqual([
      "list_groups",
      "list_contacts",
      "get_contact",
      "search_contacts",
    ]);
  });

  test("confirm-destructive only applies to deletes", () => {
    expect(requiresDestructiveConfirmation({ readOnly: false, confirmDestructive: true })).toBe(true);
  });
});
