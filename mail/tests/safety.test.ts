import { describe, expect, test } from "bun:test";
import { getRegisteredToolNames, requiresDestructiveConfirmation } from "../src/index.js";

describe("safety flags", () => {
  test("default mode registers all tools", () => {
    expect(getRegisteredToolNames({ readOnly: false, confirmDestructive: false })).toEqual([
      "list_mailboxes",
      "list_messages",
      "get_message",
      "search_messages",
      "get_unread_count",
      "send_email",
      "move_message",
      "mark_read",
      "flag_message",
      "delete_message",
    ]);
  });

  test("read-only mode removes write and destructive tools", () => {
    expect(getRegisteredToolNames({ readOnly: true, confirmDestructive: false })).toEqual([
      "list_mailboxes",
      "list_messages",
      "get_message",
      "search_messages",
      "get_unread_count",
    ]);
  });

  test("confirm-destructive keeps delete_message registered and enables confirmation", () => {
    expect(getRegisteredToolNames({ readOnly: false, confirmDestructive: true })).toEqual([
      "list_mailboxes",
      "list_messages",
      "get_message",
      "search_messages",
      "get_unread_count",
      "send_email",
      "move_message",
      "mark_read",
      "flag_message",
      "delete_message",
    ]);
    expect(requiresDestructiveConfirmation({ readOnly: false, confirmDestructive: true })).toBe(true);
  });

  test("read-only wins when both flags are set", () => {
    expect(getRegisteredToolNames({ readOnly: true, confirmDestructive: true })).toEqual([
      "list_mailboxes",
      "list_messages",
      "get_message",
      "search_messages",
      "get_unread_count",
    ]);
    expect(requiresDestructiveConfirmation({ readOnly: true, confirmDestructive: true })).toBe(false);
  });
});
