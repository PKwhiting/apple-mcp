import { execFile } from "node:child_process";

export function sanitize(input: string): string {
  return input
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\r\n/g, "\\n")
    .replace(/\r/g, "\\n")
    .replace(/\n/g, "\\n");
}

export function runAppleScript(script: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile("osascript", ["-e", script], { maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`AppleScript error: ${stderr || error.message}`));
        return;
      }
      resolve(stdout.trimEnd());
    });
  });
}

const FIELD_DELIM = "|||";
const RECORD_DELIM = "<<<>>>";

export async function listCalendars(): Promise<{ name: string; description: string }[]> {
  const script = `
tell application "Calendar"
  set calList to {}
  repeat with c in calendars
    set calName to name of c
    set calDesc to ""
    try
      set calDesc to description of c
    end try
    set end of calList to calName & "${FIELD_DELIM}" & calDesc
  end repeat
  set AppleScript's text item delimiters to "${RECORD_DELIM}"
  return calList as text
end tell`;
  const raw = await runAppleScript(script);
  if (!raw) return [];
  return raw.split(RECORD_DELIM).map((record) => {
    const [name, description] = record.split(FIELD_DELIM).map((s) => s.trim());
    return { name, description: description || "" };
  });
}

export async function listEvents(
  calendarName: string,
  fromDate: string,
  toDate: string
): Promise<{ summary: string; startDate: string; endDate: string; location: string | null; uid: string }[]> {
  const safeCal = sanitize(calendarName);
  const safeFrom = sanitize(fromDate);
  const safeTo = sanitize(toDate);
  const script = `
tell application "Calendar"
  set theCal to calendar "${safeCal}"
  set startDate to date "${safeFrom}"
  set endDate to date "${safeTo}"
  set eventList to {}
  set matchedEvents to (every event of theCal whose start date >= startDate and start date <= endDate)
  repeat with e in matchedEvents
    set eSummary to summary of e
    set eStart to start date of e as text
    set eEnd to end date of e as text
    set eUid to uid of e
    set eLoc to ""
    try
      set eLoc to location of e
    end try
    set end of eventList to eSummary & "${FIELD_DELIM}" & eStart & "${FIELD_DELIM}" & eEnd & "${FIELD_DELIM}" & eLoc & "${FIELD_DELIM}" & eUid
  end repeat
  set AppleScript's text item delimiters to "${RECORD_DELIM}"
  return eventList as text
end tell`;
  const raw = await runAppleScript(script);
  if (!raw) return [];
  return raw.split(RECORD_DELIM).map((record) => {
    const [summary, startDate, endDate, location, uid] = record.split(FIELD_DELIM).map((s) => s.trim());
    return { summary, startDate, endDate, location: location || null, uid };
  });
}

export async function getEvent(summary: string, calendarName?: string): Promise<{
  summary: string;
  startDate: string;
  endDate: string;
  location: string | null;
  description: string | null;
  url: string | null;
  uid: string;
  allDay: boolean;
}> {
  const safeSummary = sanitize(summary);
  let scope: string;
  if (calendarName) {
    const safeCal = sanitize(calendarName);
    scope = `events of calendar "${safeCal}"`;
  } else {
    scope = `every event of every calendar`;
  }
  // When searching all calendars, AppleScript returns a list of lists; flatten it
  const flattenBlock = calendarName
    ? `set matchedEvents to (${scope} whose summary is "${safeSummary}")`
    : `
  set allEvents to {}
  repeat with c in calendars
    set matchedInCal to (every event of c whose summary is "${safeSummary}")
    repeat with e in matchedInCal
      set end of allEvents to e
    end repeat
  end repeat
  set matchedEvents to allEvents`;

  const script = `
tell application "Calendar"
  ${flattenBlock}
  if (count of matchedEvents) is 0 then
    error "Event not found: ${safeSummary}"
  end if
  set e to item 1 of matchedEvents
  set eSummary to summary of e
  set eStart to start date of e as text
  set eEnd to end date of e as text
  set eUid to uid of e
  set eAllDay to allday event of e
  set eLoc to ""
  try
    set eLoc to location of e
  end try
  set eDesc to ""
  try
    set eDesc to description of e
  end try
  set eUrl to ""
  try
    set eUrl to url of e
  end try
  return eSummary & "${RECORD_DELIM}" & eStart & "${RECORD_DELIM}" & eEnd & "${RECORD_DELIM}" & eLoc & "${RECORD_DELIM}" & eDesc & "${RECORD_DELIM}" & eUrl & "${RECORD_DELIM}" & eUid & "${RECORD_DELIM}" & (eAllDay as text)
end tell`;
  const raw = await runAppleScript(script);
  const parts = raw.split(RECORD_DELIM);
  return {
    summary: parts[0]?.trim() || "",
    startDate: parts[1]?.trim() || "",
    endDate: parts[2]?.trim() || "",
    location: parts[3]?.trim() || null,
    description: parts[4]?.trim() || null,
    url: parts[5]?.trim() || null,
    uid: parts[6]?.trim() || "",
    allDay: parts[7]?.trim() === "true",
  };
}

export async function createEvent(
  calendarName: string,
  summary: string,
  startDate: string,
  endDate: string,
  options?: { location?: string; description?: string; allDay?: boolean }
): Promise<string> {
  const safeCal = sanitize(calendarName);
  const safeSummary = sanitize(summary);
  const safeStart = sanitize(startDate);
  const safeEnd = sanitize(endDate);

  let props = `{summary:"${safeSummary}", start date:date "${safeStart}", end date:date "${safeEnd}"`;
  if (options?.location) props += `, location:"${sanitize(options.location)}"`;
  if (options?.description) props += `, description:"${sanitize(options.description)}"`;
  if (options?.allDay !== undefined) props += `, allday event:${options.allDay}`;
  props += "}";

  const script = `
tell application "Calendar"
  set theCal to calendar "${safeCal}"
  make new event at end of events of theCal with properties ${props}
  return "Event created: ${safeSummary}"
end tell`;
  return runAppleScript(script);
}

export async function deleteEvent(summary: string, calendarName?: string): Promise<string> {
  const safeSummary = sanitize(summary);
  let scope: string;
  if (calendarName) {
    const safeCal = sanitize(calendarName);
    scope = `events of calendar "${safeCal}"`;
  } else {
    // Search across all calendars
    scope = "";
  }
  let script: string;
  if (calendarName) {
    script = `
tell application "Calendar"
  set matchedEvents to (${scope} whose summary is "${safeSummary}")
  if (count of matchedEvents) is 0 then
    error "Event not found: ${safeSummary}"
  end if
  delete item 1 of matchedEvents
  return "Event deleted: ${safeSummary}"
end tell`;
  } else {
    script = `
tell application "Calendar"
  repeat with c in calendars
    set matchedEvents to (every event of c whose summary is "${safeSummary}")
    if (count of matchedEvents) > 0 then
      delete item 1 of matchedEvents
      return "Event deleted: ${safeSummary}"
    end if
  end repeat
  error "Event not found: ${safeSummary}"
end tell`;
  }
  return runAppleScript(script);
}

export async function searchEvents(
  query: string,
  calendarName?: string
): Promise<{ summary: string; startDate: string; endDate: string; calendar: string; uid: string }[]> {
  const safeQuery = sanitize(query);
  let script: string;
  if (calendarName) {
    const safeCal = sanitize(calendarName);
    script = `
tell application "Calendar"
  set results to {}
  set matchedEvents to (every event of calendar "${safeCal}" whose summary contains "${safeQuery}")
  repeat with e in matchedEvents
    set eSummary to summary of e
    set eStart to start date of e as text
    set eEnd to end date of e as text
    set eUid to uid of e
    set end of results to eSummary & "${FIELD_DELIM}" & eStart & "${FIELD_DELIM}" & eEnd & "${FIELD_DELIM}" & "${safeCal}" & "${FIELD_DELIM}" & eUid
  end repeat
  set AppleScript's text item delimiters to "${RECORD_DELIM}"
  return results as text
end tell`;
  } else {
    script = `
tell application "Calendar"
  set results to {}
  repeat with c in calendars
    set calName to name of c
    set matchedEvents to (every event of c whose summary contains "${safeQuery}")
    repeat with e in matchedEvents
      set eSummary to summary of e
      set eStart to start date of e as text
      set eEnd to end date of e as text
      set eUid to uid of e
      set end of results to eSummary & "${FIELD_DELIM}" & eStart & "${FIELD_DELIM}" & eEnd & "${FIELD_DELIM}" & calName & "${FIELD_DELIM}" & eUid
    end repeat
  end repeat
  set AppleScript's text item delimiters to "${RECORD_DELIM}"
  return results as text
end tell`;
  }
  const raw = await runAppleScript(script);
  if (!raw) return [];
  return raw.split(RECORD_DELIM).map((record) => {
    const [summary, startDate, endDate, calendar, uid] = record.split(FIELD_DELIM).map((s) => s.trim());
    return { summary, startDate, endDate, calendar, uid };
  });
}
