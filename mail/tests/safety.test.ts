import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { getRegisteredToolNames, requiresDestructiveConfirmation } from "../build/mail/src/index.js";
import type { PrivacyFlags } from "../src/privacy.ts";

const SAFE_TOOLS_DISABLED: PrivacyFlags = {
  enableSafeTools: false,
};

const SAFE_TOOLS_ENABLED: PrivacyFlags = {
  enableSafeTools: true,
};

describe("safety flags", () => {
  test("default mode registers all tools", () => {
    assert.deepStrictEqual(
      getRegisteredToolNames({ readOnly: false, confirmDestructive: false }, SAFE_TOOLS_DISABLED),
      [
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
      ]
    );
  });

  test("read-only mode removes write and destructive tools", () => {
    assert.deepStrictEqual(
      getRegisteredToolNames({ readOnly: true, confirmDestructive: false }, SAFE_TOOLS_DISABLED),
      [
        "list_mailboxes",
        "list_messages",
        "get_message",
        "search_messages",
        "get_unread_count",
      ]
    );
  });

  test("confirm-destructive keeps delete_message registered and enables confirmation", () => {
    assert.deepStrictEqual(
      getRegisteredToolNames({ readOnly: false, confirmDestructive: true }, SAFE_TOOLS_DISABLED),
      [
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
      ]
    );
    assert.equal(requiresDestructiveConfirmation({ readOnly: false, confirmDestructive: true }), true);
  });

  test("read-only wins when both flags are set", () => {
    assert.deepStrictEqual(
      getRegisteredToolNames({ readOnly: true, confirmDestructive: true }, SAFE_TOOLS_DISABLED),
      [
        "list_mailboxes",
        "list_messages",
        "get_message",
        "search_messages",
        "get_unread_count",
      ]
    );
    assert.equal(requiresDestructiveConfirmation({ readOnly: true, confirmDestructive: true }), false);
  });

  test("safe tools register when explicitly enabled", () => {
    assert.deepStrictEqual(
      getRegisteredToolNames({ readOnly: false, confirmDestructive: false }, SAFE_TOOLS_ENABLED),
      [
        "list_mailboxes",
        "list_messages",
        "get_message",
        "search_messages",
        "get_unread_count",
        "list_messages_safe",
        "get_message_safe",
        "search_messages_safe",
        "send_email",
        "move_message",
        "mark_read",
        "flag_message",
        "delete_message",
      ]
    );
  });
});
