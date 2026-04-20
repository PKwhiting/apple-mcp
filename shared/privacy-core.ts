import { mkdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { OpenRedaction, type PIIDetection } from "openredaction";

export interface PrivacyFlags {
  enableSafeTools: boolean;
  privacyPolicy?: string;
}

export interface RedactionSummary {
  total_replacements: number;
  replacements_by_entity: Record<string, number>;
}

export interface PrivacyPolicy {
  structured_alias_fields?: Record<string, string>;
  list_alias_fields?: Record<string, string>;
  text_fields?: string[];
  strip_quoted_mail?: boolean;
  strip_signature_blocks?: boolean;
  strip_unsubscribe_blocks?: boolean;
}

export interface PrivacyRequest<TPayload> {
  namespace: string;
  alias_session_id: string;
  db_path: string;
  policy: PrivacyPolicy;
  payload: TPayload;
}

export interface PrivacyResponse<TPayload> {
  payload: TPayload;
  alias_session_id: string;
  redaction_summary: RedactionSummary;
}

export type PrivacyRunner = <TPayload>(
  request: PrivacyRequest<TPayload>,
  flags: PrivacyFlags
) => Promise<PrivacyResponse<TPayload>>;

const DEFAULT_PRIVACY_DB_PATH = join(
  homedir(),
  "Library",
  "Application Support",
  "apple-mcp",
  "privacy_aliases.sqlite3"
);

const redactor = new OpenRedaction({
  deterministic: false,
  redactionMode: "placeholder",
  enableContextAnalysis: true,
  confidenceThreshold: 0.5,
  enableCache: true,
  cacheSize: 256,
});

const PERSON_STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "at",
  "de",
  "du",
  "for",
  "from",
  "hello",
  "hi",
  "in",
  "meet",
  "my",
  "of",
  "on",
  "or",
  "please",
  "reply",
  "re",
  "regards",
  "sent",
  "the",
  "to",
  "with",
  "wrote",
]);

const EMAIL_FALLBACK_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const PHONE_FALLBACK_PATTERN =
  /(?:\+\d{1,3}[\s.-]*)?(?:\(?\d{2,4}\)?[\s.-]*){2,4}\d{2,4}\b/g;
const PERSON_CONTEXT_PATTERN =
  /\b(?:[Ww]ith|[Ff]or|[Tt]o|[Ff]rom|[Dd]ear)\s+([A-Z][\p{L}'’-]+(?:\s+[A-Z][\p{L}'’-]+){0,2})\b/gu;
const ADDRESS_FALLBACK_PATTERN =
  /\b\d{1,5}\s+(?:[Ss]treet|[Ss]t|[Rr]oad|[Rr]d|[Aa]venue|[Aa]ve|[Bb]oulevard|[Bb]lvd|[Ll]ane|[Ll]n|[Dd]rive|[Dd]r|[Ww]ay|[Pp]lace|[Pp]l|[Cc]ourt|[Cc]t|[Rr]ue|[Cc]hemin|[Rr]oute|[Ii]mpasse|[Aa]llee|[Aa]llée)\b(?:\s+(?:[A-Z][\p{L}'’-]*|de|du|des|la|le|les|d')){0,6}/gu;

class AliasStore {
  private static instances = new Map<string, AliasStore>();
  private readonly db: DatabaseSync;

  static forPath(dbPath: string): AliasStore {
    let instance = this.instances.get(dbPath);
    if (!instance) {
      instance = new AliasStore(dbPath);
      this.instances.set(dbPath, instance);
    }
    return instance;
  }

  private constructor(dbPath: string) {
    mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new DatabaseSync(dbPath);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS aliases (
        namespace TEXT NOT NULL,
        alias_session_id TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        original_value TEXT NOT NULL,
        placeholder TEXT NOT NULL,
        PRIMARY KEY (namespace, alias_session_id, entity_type, original_value)
      );

      CREATE TABLE IF NOT EXISTS counters (
        namespace TEXT NOT NULL,
        alias_session_id TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        next_value INTEGER NOT NULL,
        PRIMARY KEY (namespace, alias_session_id, entity_type)
      );
    `);
  }

  alias(
    namespace: string,
    aliasSessionId: string,
    entityType: string,
    originalValue: string
  ): string {
    const canonicalType = canonicalEntity(entityType);
    const existing = this.db
      .prepare(
        `SELECT placeholder
         FROM aliases
         WHERE namespace = ?
           AND alias_session_id = ?
           AND entity_type = ?
           AND original_value = ?`
      )
      .get(namespace, aliasSessionId, canonicalType, originalValue) as
      | { placeholder: string }
      | undefined;

    if (existing?.placeholder) {
      return existing.placeholder;
    }

    const nextValue = this.nextCounter(namespace, aliasSessionId, canonicalType);
    const placeholder = `<${canonicalType}_${nextValue}>`;

    this.db
      .prepare(
        `INSERT INTO aliases(namespace, alias_session_id, entity_type, original_value, placeholder)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(namespace, aliasSessionId, canonicalType, originalValue, placeholder);

    return placeholder;
  }

  private nextCounter(namespace: string, aliasSessionId: string, entityType: string): number {
    const row = this.db
      .prepare(
        `SELECT next_value
         FROM counters
         WHERE namespace = ?
           AND alias_session_id = ?
           AND entity_type = ?`
      )
      .get(namespace, aliasSessionId, entityType) as { next_value: number } | undefined;

    const nextValue = row?.next_value ?? 1;

    this.db
      .prepare(
        `INSERT INTO counters(namespace, alias_session_id, entity_type, next_value)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(namespace, alias_session_id, entity_type)
         DO UPDATE SET next_value = excluded.next_value`
      )
      .run(namespace, aliasSessionId, entityType, nextValue + 1);

    return nextValue;
  }
}

function getOptionalFlagValue(argv: string[], flagName: string): string | undefined {
  const exactIndex = argv.indexOf(flagName);
  if (exactIndex !== -1) {
    const nextValue = argv[exactIndex + 1];
    if (nextValue && !nextValue.startsWith("--")) {
      return nextValue;
    }
    return undefined;
  }

  const prefix = `${flagName}=`;
  const match = argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : undefined;
}

function canonicalEntity(entityType: string): string {
  const normalized = entityType.toUpperCase();

  if (normalized === "CONTACT") return "CONTACT";
  if (normalized === "EMAIL_ADDRESS" || normalized.startsWith("EMAIL")) return "EMAIL";
  if (normalized === "PHONE_NUMBER" || normalized.startsWith("PHONE")) return "PHONE";
  if (
    normalized === "NAME" ||
    normalized === "PERSON" ||
    normalized.startsWith("PERSON") ||
    normalized.startsWith("NER_PERSON")
  ) {
    return "PERSON";
  }
  if (
    normalized.includes("ADDRESS") ||
    normalized.includes("LOCATION") ||
    normalized.includes("POSTCODE") ||
    normalized.includes("ZIP")
  ) {
    return "LOCATION";
  }
  if (normalized.includes("URL") || normalized.includes("URI")) return "URL";
  if (normalized.includes("CREDIT_CARD") || normalized === "CARD") return "CARD";
  if (
    normalized.includes("BANK") ||
    normalized.includes("IBAN") ||
    normalized.includes("SWIFT") ||
    normalized.includes("ROUTING")
  ) {
    return "BANK";
  }
  if (
    normalized.includes("SSN") ||
    normalized.includes("PASSPORT") ||
    normalized.includes("LICENSE") ||
    normalized.includes("VAT") ||
    normalized.includes("TAX") ||
    normalized.includes("NHS") ||
    normalized.includes("NINO") ||
    normalized.includes("SIN") ||
    normalized.includes("ITIN")
  ) {
    return "ID";
  }

  return normalized.replace(/[^A-Z0-9]+/g, "_");
}

function incrementSummary(summary: RedactionSummary, entityType: string) {
  const canonicalType = canonicalEntity(entityType);
  summary.total_replacements += 1;
  summary.replacements_by_entity[canonicalType] =
    (summary.replacements_by_entity[canonicalType] ?? 0) + 1;
}

function looksLikePersonName(value: string): boolean {
  const trimmed = value.trim();
  if (
    !/^[A-Z][\p{L}'’-]+(?:\s+[A-Z][\p{L}'’-]+){0,2}$/u.test(trimmed)
  ) {
    return false;
  }

  return trimmed
    .split(/\s+/u)
    .every((segment) => !PERSON_STOP_WORDS.has(segment.toLowerCase()));
}

function shouldKeepDetection(detection: PIIDetection): boolean {
  if (canonicalEntity(detection.type) !== "PERSON") {
    return true;
  }

  return looksLikePersonName(detection.value);
}

function collectFallbackDetections(text: string): PIIDetection[] {
  const detections: PIIDetection[] = [];
  const patterns = [
    { type: "EMAIL", pattern: EMAIL_FALLBACK_PATTERN, captureGroup: 0 },
    { type: "PHONE", pattern: PHONE_FALLBACK_PATTERN, captureGroup: 0 },
    { type: "ADDRESS_HINT", pattern: ADDRESS_FALLBACK_PATTERN, captureGroup: 0 },
    { type: "PERSON_CONTEXT", pattern: PERSON_CONTEXT_PATTERN, captureGroup: 1 },
  ];

  for (const { type, pattern, captureGroup } of patterns) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(text)) !== null) {
      const value = match[captureGroup] ?? match[0];
      const start =
        captureGroup === 0
          ? match.index
          : match.index + match[0].indexOf(value);
      detections.push({
        type,
        value,
        placeholder: "",
        position: [start, start + value.length],
        severity: type === "EMAIL" ? "high" : "medium",
        confidence: 1,
      });
    }
  }

  return detections;
}

function stripMailNoise(text: string, policy: PrivacyPolicy): string {
  let result = text.replace(/\r\n?/g, "\n");

  if (policy.strip_quoted_mail) {
    const quotedMarkers = [
      /\nOn .+ wrote:\n/is,
      /\nFrom:.+\nSent:.+\nTo:.+\nSubject:.+\n/is,
    ];
    for (const marker of quotedMarkers) {
      const parts = result.split(marker);
      if (parts.length > 1) {
        result = parts[0].trimEnd();
        break;
      }
    }
  }

  if (policy.strip_signature_blocks) {
    const signatureMarkers = [/\n--\s*\n/im, /\nSent from my .+$/im];
    for (const marker of signatureMarkers) {
      const parts = result.split(marker);
      if (parts.length > 1) {
        result = parts[0].trimEnd();
        break;
      }
    }
  }

  if (policy.strip_unsubscribe_blocks) {
    result = result
      .split("\n")
      .filter((line) => {
        const lowercase = line.toLowerCase();
        return !lowercase.includes("unsubscribe") && !lowercase.includes("manage preferences");
      })
      .join("\n")
      .trim();
  }

  return result;
}

function selectNonOverlapping(detections: PIIDetection[]): PIIDetection[] {
  const ordered = [...detections].sort((left, right) => {
    const startDelta = left.position[0] - right.position[0];
    if (startDelta !== 0) return startDelta;

    const confidenceDelta = (right.confidence ?? 0) - (left.confidence ?? 0);
    if (confidenceDelta !== 0) return confidenceDelta;

    const leftLength = left.position[1] - left.position[0];
    const rightLength = right.position[1] - right.position[0];
    return rightLength - leftLength;
  });

  const filtered: PIIDetection[] = [];
  let currentEnd = -1;

  for (const detection of ordered) {
    if (detection.position[0] >= currentEnd) {
      filtered.push(detection);
      currentEnd = detection.position[1];
    }
  }

  return filtered;
}

async function sanitizeText(
  text: string,
  request: PrivacyRequest<unknown>,
  store: AliasStore,
  summary: RedactionSummary
): Promise<string> {
  const cleaned = stripMailNoise(text, request.policy);
  if (!cleaned.trim()) {
    return cleaned;
  }

  const result = await redactor.detect(cleaned);
  const detections = [
    ...result.detections.filter(shouldKeepDetection),
    ...collectFallbackDetections(cleaned),
  ];
  if (!detections.length) {
    return cleaned;
  }

  let transformed = cleaned;
  const filtered = selectNonOverlapping(detections).sort(
    (left, right) => right.position[0] - left.position[0]
  );

  for (const detection of filtered) {
    const [start, end] = detection.position;
    const originalValue = detection.value || transformed.slice(start, end);
    if (!originalValue.trim()) {
      continue;
    }

    const placeholder = store.alias(
      request.namespace,
      request.alias_session_id,
      detection.type,
      originalValue
    );
    transformed = `${transformed.slice(0, start)}${placeholder}${transformed.slice(end)}`;
    incrementSummary(summary, detection.type);
  }

  return transformed;
}

async function sanitizeField(
  key: string,
  value: unknown,
  request: PrivacyRequest<unknown>,
  store: AliasStore,
  summary: RedactionSummary
): Promise<unknown> {
  if (value === null || value === undefined) {
    return value;
  }

  const listAliasType = request.policy.list_alias_fields?.[key];
  if (Array.isArray(value)) {
    if (listAliasType) {
      return value.map((item) => {
        if (typeof item !== "string") {
          return item;
        }

        const placeholder = store.alias(
          request.namespace,
          request.alias_session_id,
          listAliasType,
          item
        );
        incrementSummary(summary, listAliasType);
        return placeholder;
      });
    }

    return await Promise.all(
      value.map((item) => sanitizeField(key, item, request, store, summary))
    );
  }

  if (typeof value === "object") {
    return await sanitizePayload(value, request, store, summary);
  }

  if (typeof value !== "string") {
    return value;
  }

  const structuredAliasType = request.policy.structured_alias_fields?.[key];
  if (structuredAliasType) {
    const placeholder = store.alias(
      request.namespace,
      request.alias_session_id,
      structuredAliasType,
      value
    );
    incrementSummary(summary, structuredAliasType);
    return placeholder;
  }

  if (request.policy.text_fields?.includes(key)) {
    return await sanitizeText(value, request, store, summary);
  }

  return value;
}

async function sanitizePayload(
  payload: unknown,
  request: PrivacyRequest<unknown>,
  store: AliasStore,
  summary: RedactionSummary
): Promise<unknown> {
  if (Array.isArray(payload)) {
    return await Promise.all(
      payload.map((item) => sanitizeField("", item, request, store, summary))
    );
  }

  if (!payload || typeof payload !== "object") {
    return await sanitizeField("", payload, request, store, summary);
  }

  const entries = await Promise.all(
    Object.entries(payload).map(async ([key, value]) => [
      key,
      await sanitizeField(key, value, request, store, summary),
    ])
  );

  return Object.fromEntries(entries);
}

export function parsePrivacyFlags(argv: string[] = process.argv): PrivacyFlags {
  return {
    enableSafeTools: argv.includes("--enable-safe-tools"),
    privacyPolicy: getOptionalFlagValue(argv, "--privacy-policy"),
  };
}

export async function resolvePrivacyPolicy(
  defaultPolicy: PrivacyPolicy,
  flags: PrivacyFlags
): Promise<PrivacyPolicy> {
  if (!flags.privacyPolicy) {
    return defaultPolicy;
  }

  const policyText = await readFile(flags.privacyPolicy, "utf-8");
  return JSON.parse(policyText) as PrivacyPolicy;
}

export async function runPrivacyRedaction<TPayload>(
  request: PrivacyRequest<TPayload>,
  _flags: PrivacyFlags
): Promise<PrivacyResponse<TPayload>> {
  const summary: RedactionSummary = {
    total_replacements: 0,
    replacements_by_entity: {},
  };
  const store = AliasStore.forPath(request.db_path);
  const payload = (await sanitizePayload(
    request.payload,
    request as PrivacyRequest<unknown>,
    store,
    summary
  )) as TPayload;

  return {
    payload,
    alias_session_id: request.alias_session_id,
    redaction_summary: summary,
  };
}

export async function createSafeJsonResponse<TPayload>(
  resultKey: string,
  payload: TPayload,
  options: {
    namespace: string;
    aliasSessionId?: string;
    defaultPolicy: PrivacyPolicy;
    flags?: PrivacyFlags;
    runner?: PrivacyRunner;
  }
) {
  const flags = options.flags ?? parsePrivacyFlags();
  const runner = options.runner ?? runPrivacyRedaction;
  const policy = await resolvePrivacyPolicy(options.defaultPolicy, flags);
  const aliasSessionId = options.aliasSessionId || "default";
  const result = await runner(
    {
      namespace: options.namespace,
      alias_session_id: aliasSessionId,
      db_path: DEFAULT_PRIVACY_DB_PATH,
      policy,
      payload,
    },
    flags
  );

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(
          {
            sanitized: true,
            alias_session_id: result.alias_session_id,
            redaction_summary: result.redaction_summary,
            [resultKey]: result.payload,
          },
          null,
          2
        ),
      },
    ],
  };
}
