import { describe, expect, test } from "bun:test";
import { getRegisteredToolNames } from "../src/index.js";

describe("safety flags", () => {
  test("default mode registers read and write tools", () => {
    expect(getRegisteredToolNames({ readOnly: false, confirmDestructive: false })).toEqual([
      "list_chats",
      "get_chat_messages",
      "search_messages",
      "get_chat_participants",
      "send_message",
    ]);
  });

  test("read-only mode removes send_message", () => {
    expect(getRegisteredToolNames({ readOnly: true, confirmDestructive: false })).toEqual([
      "list_chats",
      "get_chat_messages",
      "search_messages",
      "get_chat_participants",
    ]);
  });
});
