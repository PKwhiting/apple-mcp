import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { getRegisteredToolNames, requiresDestructiveConfirmation } from "../build/notes/src/index.js";
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
      ]
    );
  });

  test("read-only mode keeps only read tools", () => {
    assert.deepStrictEqual(
      getRegisteredToolNames({ readOnly: true, confirmDestructive: false }, SAFE_TOOLS_DISABLED),
      [
        "list_folders",
        "list_notes",
        "get_note",
        "search_notes",
      ]
    );
  });

  test("confirm-destructive only affects destructive tools", () => {
    assert.deepStrictEqual(
      getRegisteredToolNames({ readOnly: false, confirmDestructive: true }, SAFE_TOOLS_DISABLED),
      [
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
      ]
    );
    assert.equal(requiresDestructiveConfirmation({ readOnly: false, confirmDestructive: true }), true);
  });

  test("safe tools register when explicitly enabled", () => {
    assert.deepStrictEqual(
      getRegisteredToolNames({ readOnly: false, confirmDestructive: false }, SAFE_TOOLS_ENABLED),
      [
        "list_folders",
        "list_notes",
        "get_note",
        "search_notes",
        "list_notes_safe",
        "get_note_safe",
        "search_notes_safe",
        "create_folder",
        "create_note",
        "update_note",
        "move_note",
        "append_to_note",
        "delete_note",
        "delete_folder",
      ]
    );
  });
});
