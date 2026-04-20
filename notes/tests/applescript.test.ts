import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { sanitize } from "../build/notes/src/applescript.js";

// ---------------------------------------------------------------------------
// Unit tests — no Apple Notes interaction
// ---------------------------------------------------------------------------

describe("sanitize", () => {
  test("escapes backslashes", () => {
    assert.equal(sanitize("a\\b"), "a\\\\b");
  });

  test("escapes double quotes", () => {
    assert.equal(sanitize('say "hello"'), 'say \\"hello\\"');
  });

  test("converts newlines to \\n", () => {
    assert.equal(sanitize("line1\nline2"), "line1\\nline2");
  });

  test("converts carriage returns to \\n", () => {
    assert.equal(sanitize("line1\rline2"), "line1\\nline2");
  });

  test("converts CRLF to \\n", () => {
    assert.equal(sanitize("line1\r\nline2"), "line1\\nline2");
  });

  test("handles combined special characters", () => {
    assert.equal(sanitize('path\\to\n"file"'), 'path\\\\to\\n\\"file\\"');
  });
});
