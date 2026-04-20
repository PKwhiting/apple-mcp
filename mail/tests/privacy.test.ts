import assert from "node:assert/strict";
import { afterEach, describe, test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createSafeJsonResponse,
  parsePrivacyFlags,
  runPrivacyRedaction,
} from "../build/mail/src/privacy.js";
import type { PrivacyFlags, PrivacyPolicy } from "../src/privacy.ts";

const DEFAULT_POLICY: PrivacyPolicy = {
  text_fields: ["subject", "sender", "content"],
  list_alias_fields: {
    toRecipients: "EMAIL_ADDRESS",
    ccRecipients: "EMAIL_ADDRESS",
  },
  strip_quoted_mail: true,
  strip_signature_blocks: true,
  strip_unsubscribe_blocks: true,
};

describe("parsePrivacyFlags", () => {
  test("parses safe-tool flags", () => {
    assert.deepStrictEqual(
      parsePrivacyFlags([
        "node",
        "index.js",
        "--enable-safe-tools",
      ]),
      {
        enableSafeTools: true,
        privacyPolicy: undefined,
      }
    );
  });
});

describe("createSafeJsonResponse", () => {
  test("wraps sanitized message payloads with metadata", async () => {
    const response = await createSafeJsonResponse(
      "message",
      {
        id: 12,
        subject: "Meet Alice",
        sender: "alice@example.com",
        content: "Call me at 555-111-2222",
        toRecipients: ["bob@example.com"],
      },
      {
        namespace: "mail.get_message_safe",
        aliasSessionId: "mail-thread",
        defaultPolicy: DEFAULT_POLICY,
        flags: {
          enableSafeTools: true,
        } satisfies PrivacyFlags,
        runner: async (request) => ({
          payload: {
            ...request.payload,
            subject: "Meet <PERSON_1>",
            sender: "<EMAIL_1>",
            content: "Call me at <PHONE_1>",
            toRecipients: ["<EMAIL_2>"],
          },
          alias_session_id: request.alias_session_id,
          redaction_summary: {
            total_replacements: 4,
            replacements_by_entity: {
              EMAIL: 2,
              PERSON: 1,
              PHONE: 1,
            },
          },
        }),
      }
    );

    assert.deepStrictEqual(JSON.parse(response.content[0].text), {
      sanitized: true,
      alias_session_id: "mail-thread",
      redaction_summary: {
        total_replacements: 4,
        replacements_by_entity: {
          EMAIL: 2,
          PERSON: 1,
          PHONE: 1,
        },
      },
      message: {
        id: 12,
        subject: "Meet <PERSON_1>",
        sender: "<EMAIL_1>",
        content: "Call me at <PHONE_1>",
        toRecipients: ["<EMAIL_2>"],
      },
    });
  });
});

const tempPaths: string[] = [];

afterEach(async () => {
  while (tempPaths.length > 0) {
    const path = tempPaths.pop();
    if (path) {
      await rm(path, { recursive: true, force: true });
    }
  }
});

describe("runPrivacyRedaction", () => {
  test("sanitizes message bodies, recipients, and quoted history", async () => {
    const directory = await mkdtemp(join(tmpdir(), "apple-mail-privacy-"));
    tempPaths.push(directory);

    const result = await runPrivacyRedaction(
      {
        namespace: "mail.get_message_safe",
        alias_session_id: "mail-1",
        db_path: join(directory, "aliases.sqlite3"),
        policy: DEFAULT_POLICY,
        payload: {
          message_id: 12,
          subject: "Dinner with Alex",
          sender: "alex+vip@example.com",
          toRecipients: ["friend@example.com", "friend@example.com"],
          ccRecipients: ["other@example.com"],
          content:
            "Meet at 10 Rue de Rivoli with Alex\r\n\r\nOn Tue, someone wrote:\r\nprevious quoted text",
        },
      },
      { enableSafeTools: true }
    );

    assert.deepStrictEqual(result.payload, {
      message_id: 12,
      subject: "Dinner with <PERSON_1>",
      sender: "<EMAIL_3>",
      toRecipients: ["<EMAIL_1>", "<EMAIL_1>"],
      ccRecipients: ["<EMAIL_2>"],
      content: "Meet at <LOCATION_1> with <PERSON_1>",
    });
    assert.deepStrictEqual(result.redaction_summary, {
      total_replacements: 7,
      replacements_by_entity: {
        EMAIL: 4,
        LOCATION: 1,
        PERSON: 2,
      },
    });
  });

  test("preserves stable aliases across repeated mail reads", async () => {
    const directory = await mkdtemp(join(tmpdir(), "apple-mail-privacy-"));
    tempPaths.push(directory);
    const dbPath = join(directory, "aliases.sqlite3");

    const first = await runPrivacyRedaction(
      {
        namespace: "mail.get_message_safe",
        alias_session_id: "mail-2",
        db_path: dbPath,
        policy: DEFAULT_POLICY,
        payload: {
          message_id: 1,
          subject: "Dinner with Alex",
          sender: "alex+vip@example.com",
          toRecipients: [],
          ccRecipients: [],
          content: "Email alex+vip@example.com before dinner with Alex",
        },
      },
      { enableSafeTools: true }
    );

    const second = await runPrivacyRedaction(
      {
        namespace: "mail.get_message_safe",
        alias_session_id: "mail-2",
        db_path: dbPath,
        policy: DEFAULT_POLICY,
        payload: {
          message_id: 2,
          subject: "Reminder for Alex",
          sender: "alex+vip@example.com",
          toRecipients: [],
          ccRecipients: [],
          content: "Reply to alex+vip@example.com",
        },
      },
      { enableSafeTools: true }
    );

    assert.deepStrictEqual(first.payload, {
      message_id: 1,
      subject: "Dinner with <PERSON_1>",
      sender: "<EMAIL_1>",
      toRecipients: [],
      ccRecipients: [],
      content: "Email <EMAIL_1> before dinner with <PERSON_1>",
    });
    assert.deepStrictEqual(second.payload, {
      message_id: 2,
      subject: "Reminder for <PERSON_1>",
      sender: "<EMAIL_1>",
      toRecipients: [],
      ccRecipients: [],
      content: "Reply to <EMAIL_1>",
    });
  });
});
