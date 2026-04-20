import assert from "node:assert/strict";
import { afterEach, describe, test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createSafeJsonResponse,
  parsePrivacyFlags,
  runPrivacyRedaction,
} from "../build/notes/src/privacy.js";
import type { PrivacyFlags, PrivacyPolicy } from "../src/privacy.ts";

const DEFAULT_POLICY: PrivacyPolicy = {
  text_fields: ["title", "body"],
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
  test("wraps sanitized note payloads with metadata", async () => {
    const response = await createSafeJsonResponse(
      "note",
      {
        id: "x-note",
        title: "Leah Paris",
        body: "Meet at 12 Rue Example with Alex",
      },
      {
        namespace: "notes.get_note_safe",
        aliasSessionId: "note-ctx",
        defaultPolicy: DEFAULT_POLICY,
        flags: {
          enableSafeTools: true,
        } satisfies PrivacyFlags,
        runner: async (request) => ({
          payload: {
            ...request.payload,
            title: "<PERSON_1> Paris",
            body: "Meet at <LOCATION_1> with <PERSON_2>",
          },
          alias_session_id: request.alias_session_id,
          redaction_summary: {
            total_replacements: 3,
            replacements_by_entity: {
              PERSON: 2,
              LOCATION: 1,
            },
          },
        }),
      }
    );

    assert.deepStrictEqual(JSON.parse(response.content[0].text), {
      sanitized: true,
      alias_session_id: "note-ctx",
      redaction_summary: {
        total_replacements: 3,
        replacements_by_entity: {
          PERSON: 2,
          LOCATION: 1,
        },
      },
      note: {
        id: "x-note",
        title: "<PERSON_1> Paris",
        body: "Meet at <LOCATION_1> with <PERSON_2>",
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
  test("sanitizes note titles and body text without changing ids", async () => {
    const directory = await mkdtemp(join(tmpdir(), "apple-notes-privacy-"));
    tempPaths.push(directory);

    const result = await runPrivacyRedaction(
      {
        namespace: "notes.get_note_safe",
        alias_session_id: "note-1",
        db_path: join(directory, "aliases.sqlite3"),
        policy: DEFAULT_POLICY,
        payload: {
          id: "note-1",
          title: "Leah Paris",
          body: "Meet at 10 Rue de Rivoli with Alex",
        },
      },
      { enableSafeTools: true }
    );

    assert.deepStrictEqual(result.payload, {
      id: "note-1",
      title: "<PERSON_1>",
      body: "Meet at <LOCATION_1> with <PERSON_2>",
    });
    assert.deepStrictEqual(result.redaction_summary, {
      total_replacements: 3,
      replacements_by_entity: {
        LOCATION: 1,
        PERSON: 2,
      },
    });
  });
});
