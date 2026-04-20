import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { getRegisteredToolNames } from "../build/messages/src/index.js";
import type { PrivacyFlags } from "../src/privacy.ts";

const SAFE_TOOLS_ENABLED: PrivacyFlags = {
  enableSafeTools: true,
};

describe("safety flags", () => {
  test("default mode registers read and write tools", () => {
    assert.deepStrictEqual(
      getRegisteredToolNames({ readOnly: false, confirmDestructive: false }, { enableSafeTools: false }),
      [
        "list_chats",
        "get_chat_messages",
        "search_messages",
        "get_chat_participants",
        "send_message",
      ]
    );
  });

  test("read-only mode removes send_message", () => {
    assert.deepStrictEqual(
      getRegisteredToolNames({ readOnly: true, confirmDestructive: false }, { enableSafeTools: false }),
      [
        "list_chats",
        "get_chat_messages",
        "search_messages",
        "get_chat_participants",
      ]
    );
  });

  test("safe tools register only when explicitly enabled", () => {
    assert.deepStrictEqual(
      getRegisteredToolNames({ readOnly: false, confirmDestructive: false }, SAFE_TOOLS_ENABLED),
      [
        "list_chats",
        "get_chat_messages",
        "search_messages",
        "get_chat_participants",
        "list_chats_safe",
        "get_chat_messages_safe",
        "search_messages_safe",
        "get_chat_participants_safe",
        "send_message",
      ]
    );
  });
});
