import assert from "node:assert/strict";
import { afterEach, describe, test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createSafeJsonResponse,
  parsePrivacyFlags,
  runPrivacyRedaction,
} from "../build/messages/src/privacy.js";
import type { PrivacyFlags, PrivacyPolicy } from "../src/privacy.ts";

const DEFAULT_POLICY: PrivacyPolicy = {
  structured_alias_fields: { sender: "CONTACT" },
  text_fields: ["text"],
};

describe("parsePrivacyFlags", () => {
  test("parses safe-tool and policy flags", () => {
    assert.deepStrictEqual(
      parsePrivacyFlags([
        "node",
        "index.js",
        "--enable-safe-tools",
        "--privacy-policy=/tmp/policy.json",
      ]),
      {
        enableSafeTools: true,
        privacyPolicy: "/tmp/policy.json",
      }
    );
  });
});

describe("createSafeJsonResponse", () => {
  test("wraps sanitized payloads with metadata", async () => {
    const response = await createSafeJsonResponse(
      "messages",
      [{ rowid: 1, text: "hello", sender: "me@example.com" }],
      {
        namespace: "messages.get_chat_messages_safe",
        aliasSessionId: "thread-1",
        defaultPolicy: DEFAULT_POLICY,
        flags: {
          enableSafeTools: true,
        } satisfies PrivacyFlags,
        runner: async (request) => ({
          payload: [{ ...request.payload[0], text: "hello <PERSON_1>", sender: "<CONTACT_1>" }],
          alias_session_id: request.alias_session_id,
          redaction_summary: {
            total_replacements: 2,
            replacements_by_entity: {
              CONTACT: 1,
              PERSON: 1,
            },
          },
        }),
      }
    );

    const body = JSON.parse(response.content[0].text);
    assert.deepStrictEqual(body, {
      sanitized: true,
      alias_session_id: "thread-1",
      redaction_summary: {
        total_replacements: 2,
        replacements_by_entity: {
          CONTACT: 1,
          PERSON: 1,
        },
      },
      messages: [{ rowid: 1, text: "hello <PERSON_1>", sender: "<CONTACT_1>" }],
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
  test("keeps structured aliases stable across repeated values", async () => {
    const directory = await mkdtemp(join(tmpdir(), "apple-messages-privacy-"));
    tempPaths.push(directory);

    const result = await runPrivacyRedaction(
      {
        namespace: "messages.get_chat_messages_safe",
        alias_session_id: "thread-1",
        db_path: join(directory, "aliases.sqlite3"),
        policy: {
          structured_alias_fields: {
            sender: "CONTACT",
          },
        },
        payload: [
          { rowid: 1, sender: "Leah" },
          { rowid: 2, sender: "Leah" },
        ],
      },
      { enableSafeTools: true }
    );

    assert.deepStrictEqual(result.payload, [
      { rowid: 1, sender: "<CONTACT_1>" },
      { rowid: 2, sender: "<CONTACT_1>" },
    ]);
    assert.deepStrictEqual(result.redaction_summary, {
      total_replacements: 2,
      replacements_by_entity: {
        CONTACT: 2,
      },
    });
  });

  test("persists aliases across runs in the same alias session", async () => {
    const directory = await mkdtemp(join(tmpdir(), "apple-messages-privacy-"));
    tempPaths.push(directory);
    const dbPath = join(directory, "aliases.sqlite3");

    const first = await runPrivacyRedaction(
      {
        namespace: "messages.get_chat_messages_safe",
        alias_session_id: "thread-2",
        db_path: dbPath,
        policy: {
          text_fields: ["text"],
        },
        payload: [{ rowid: 1, text: "Email me at john@openai.com" }],
      },
      { enableSafeTools: true }
    );

    const second = await runPrivacyRedaction(
      {
        namespace: "messages.get_chat_messages_safe",
        alias_session_id: "thread-2",
        db_path: dbPath,
        policy: {
          text_fields: ["text"],
        },
        payload: [{ rowid: 2, text: "Reply to john@openai.com soon" }],
      },
      { enableSafeTools: true }
    );

    assert.deepStrictEqual(first.payload, [{ rowid: 1, text: "Email me at <EMAIL_1>" }]);
    assert.deepStrictEqual(second.payload, [{ rowid: 2, text: "Reply to <EMAIL_1> soon" }]);
  });

  test("redacts realistic chat content without mangling normal prose", async () => {
    const directory = await mkdtemp(join(tmpdir(), "apple-messages-privacy-"));
    tempPaths.push(directory);

    const result = await runPrivacyRedaction(
      {
        namespace: "messages.get_chat_messages_safe",
        alias_session_id: "thread-3",
        db_path: join(directory, "aliases.sqlite3"),
        policy: {
          text_fields: ["text"],
        },
        payload: [
          {
            rowid: 1,
            text: "Meet at 10 Rue de Rivoli with Alex. Email john@example.com and call +1 202-555-0110.",
          },
          {
            rowid: 2,
            text: "Meet at the cafe tomorrow morning.",
          },
        ],
      },
      { enableSafeTools: true }
    );

    assert.deepStrictEqual(result.payload, [
      {
        rowid: 1,
        text: "Meet at <LOCATION_1> with <PERSON_1>. Email <EMAIL_1> and call <PHONE_1>.",
      },
      {
        rowid: 2,
        text: "Meet at the cafe tomorrow morning.",
      },
    ]);
    assert.deepStrictEqual(result.redaction_summary, {
      total_replacements: 4,
      replacements_by_entity: {
        EMAIL: 1,
        LOCATION: 1,
        PERSON: 1,
        PHONE: 1,
      },
    });
  });
});
