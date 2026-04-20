import { createFolder, listNotes, deleteNote, runAppleScript, sanitize } from "../build/notes/src/applescript.js";

export const TEST_FOLDER = "Test-Claude-Notes";

export function testNoteTitle(label: string): string {
  return `test-${label}-${Date.now()}`;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Create the dedicated test folder in Apple Notes.
 * Safe to call if the folder already exists — Apple Notes silently ignores duplicates.
 */
export async function setupTestFolder(): Promise<void> {
  await createFolder(TEST_FOLDER);
  // Small delay to let Apple Notes settle
  await sleep(500);
}

/**
 * Delete every note in the test folder, then delete the folder itself.
 */
export async function cleanupTestFolder(): Promise<void> {
  try {
    const notes = await listNotes(TEST_FOLDER);
    for (const note of notes) {
      try {
        await deleteNote(note.title, TEST_FOLDER);
      } catch {
        // note may already be gone
      }
    }
  } catch {
    // folder may not exist or be empty
  }

  // Delete the folder via AppleScript
  try {
    const safeName = sanitize(TEST_FOLDER);
    await runAppleScript(`
tell application "Notes"
  delete folder "${safeName}"
end tell`);
  } catch {
    // folder may already be gone
  }
}
