import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { sanitize } from "../build/messages/src/applescript.js";

describe("sanitize", () => {
  test("returns empty string unchanged", () => {
    assert.equal(sanitize(""), "");
  });

  test("escapes backslashes", () => {
    assert.equal(sanitize("path\\to\\file"), "path\\\\to\\\\file");
  });

  test("escapes double quotes", () => {
    assert.equal(sanitize('say "hello"'), 'say \\"hello\\"');
  });

  test("converts newlines to AppleScript \\n", () => {
    assert.equal(sanitize("line1\nline2"), "line1\\nline2");
  });

  test("converts carriage returns to AppleScript \\n", () => {
    assert.equal(sanitize("line1\rline2"), "line1\\nline2");
  });

  test("converts CRLF to single AppleScript \\n", () => {
    assert.equal(sanitize("line1\r\nline2"), "line1\\nline2");
  });

  test("handles combined special characters", () => {
    assert.equal(
      sanitize('He said "hello\\world"\nGoodbye'),
      'He said \\"hello\\\\world\\"\\nGoodbye'
    );
  });

  test("leaves plain text unchanged", () => {
    assert.equal(sanitize("Hello world 123"), "Hello world 123");
  });
});
