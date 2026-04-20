import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import {
  listFolders,
  listNotes,
  getNote,
  createNote,
  updateNote,
  deleteNote,
  searchNotes,
} from "../build/notes/src/applescript.js";
import { TEST_FOLDER, testNoteTitle, setupTestFolder, cleanupTestFolder, sleep } from "./setup.ts";

describe("Apple Notes integration", () => {
  before(
    async () => {
      await cleanupTestFolder();
      await setupTestFolder();
    },
    { timeout: 15_000 }
  );

  after(
    async () => {
      await cleanupTestFolder();
    },
    { timeout: 15_000 }
  );

  describe("folders", () => {
    test(
      "listFolders includes the test folder",
      { timeout: 10_000 },
      async () => {
        const folders = await listFolders();
        const names = folders.map((f) => f.name);
        assert.ok(names.includes(TEST_FOLDER));
      }
    );
  });

  describe("create and list notes", () => {
    const title = testNoteTitle("create");
    const body = "<h1>Hello</h1><p>Test note body</p>";

    test(
      "createNote returns success message",
      { timeout: 10_000 },
      async () => {
        const result = await createNote(title, body, TEST_FOLDER);
        assert.match(result, /Note created/);
        assert.match(result, new RegExp(title));
      }
    );

    test(
      "listNotes returns the created note with expected fields",
      { timeout: 10_000 },
      async () => {
        await sleep(500);
        const notes = await listNotes(TEST_FOLDER);
        const match = notes.find((n) => n.title === title);
        assert.ok(match);
        assert.ok(match.id);
        assert.ok(match.creationDate);
        assert.ok(match.modificationDate);
      }
    );
  });

  describe("getNote", () => {
    const title = testNoteTitle("get");
    const body = "<p>Retrievable note</p>";

    before(
      async () => {
        await createNote(title, body, TEST_FOLDER);
        await sleep(500);
      },
      { timeout: 10_000 }
    );

    test(
      "getNote with folder returns correct note",
      { timeout: 10_000 },
      async () => {
        const note = await getNote(title, TEST_FOLDER);
        assert.equal(note.title, title);
        assert.match(note.body, /Retrievable note/);
        assert.ok(note.id);
        assert.ok(note.creationDate);
        assert.ok(note.modificationDate);
      }
    );

    test(
      "getNote without folder finds the note",
      { timeout: 10_000 },
      async () => {
        const note = await getNote(title);
        assert.equal(note.title, title);
        assert.match(note.body, /Retrievable note/);
      }
    );

    test(
      "getNote throws for non-existent note",
      { timeout: 10_000 },
      async () => {
        await assert.rejects(getNote("nonexistent-note-999999", TEST_FOLDER));
      }
    );
  });

  describe("updateNote", () => {
    const title = testNoteTitle("update");
    const originalBody = `<h1>${title}</h1><p>Original content</p>`;
    const updatedBody = `<h1>${title}</h1><p>Updated content</p>`;

    before(
      async () => {
        await createNote(title, originalBody, TEST_FOLDER);
        await sleep(500);
      },
      { timeout: 10_000 }
    );

    test(
      "updateNote returns success message",
      { timeout: 10_000 },
      async () => {
        const result = await updateNote(title, updatedBody, TEST_FOLDER);
        assert.match(result, /Note updated/);
      }
    );

    test(
      "getNote reflects the updated body",
      { timeout: 10_000 },
      async () => {
        await sleep(500);
        const note = await getNote(title, TEST_FOLDER);
        assert.match(note.body, /Updated content/);
        assert.doesNotMatch(note.body, /Original content/);
      }
    );
  });

  describe("searchNotes", () => {
    const uniqueTag = `srch${Date.now()}`;
    const title = testNoteTitle(uniqueTag);

    before(
      async () => {
        await createNote(title, "<p>Searchable</p>", TEST_FOLDER);
        await sleep(500);
      },
      { timeout: 10_000 }
    );

    test(
      "searchNotes within folder finds the note",
      { timeout: 10_000 },
      async () => {
        const results = await searchNotes(uniqueTag, TEST_FOLDER);
        const match = results.find((r) => r.title === title);
        assert.ok(match);
        assert.equal(match.folder, TEST_FOLDER);
        assert.ok(match.id);
      }
    );

    test(
      "searchNotes across all folders finds the note",
      { timeout: 10_000 },
      async () => {
        const results = await searchNotes(uniqueTag);
        const match = results.find((r) => r.title === title);
        assert.ok(match);
      }
    );
  });

  describe("deleteNote", () => {
    const title = testNoteTitle("delete");

    before(
      async () => {
        await createNote(title, "<p>To be deleted</p>", TEST_FOLDER);
        await sleep(500);
      },
      { timeout: 10_000 }
    );

    test(
      "deleteNote returns success message",
      { timeout: 10_000 },
      async () => {
        const result = await deleteNote(title, TEST_FOLDER);
        assert.match(result, /Note deleted/);
      }
    );

    test(
      "deleted note no longer appears in listing",
      { timeout: 10_000 },
      async () => {
        await sleep(500);
        const notes = await listNotes(TEST_FOLDER);
        const match = notes.find((n) => n.title === title);
        assert.equal(match, undefined);
      }
    );

    test(
      "deleteNote throws for non-existent note",
      { timeout: 10_000 },
      async () => {
        await assert.rejects(deleteNote("nonexistent-note-999999", TEST_FOLDER));
      }
    );
  });

  describe("error cases", () => {
    test(
      "listNotes throws for non-existent folder",
      { timeout: 10_000 },
      async () => {
        await assert.rejects(listNotes("NonExistentFolder-999999"));
      }
    );
  });
});
