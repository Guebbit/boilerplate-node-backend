---
source: src/infrastructure/adapters/logger.ts
sha256: 7eaca06b558233602532033db63f3e45fa4757ec522c74624df0ff498261f2be
generated_at: 2026-10-29T01:55:39.298966+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/adapters/logger.ts

## Purpose

Structured logging adapter built on Winston. Defines a narrow `Logger` interface (port) that the rest of the codebase depends on instead of Winston directly, so swapping the underlying library only requires satisfying this small contract. Also implements the redaction and pseudonymisation pipeline that transforms every log record before it reaches a transport.

## Key elements

- **`Logger`** (interface) — The port exposed to all other tiers. Four level methods (`debug`, `info`, `warn`, `error`) plus a generic `log(level, …)` for `audit.ts`. Each accepts a string or `LogFields` object and an optional `meta` argument.
- **`LogFields`** (type) — `Record<string, unknown>`; the shape of structured log context objects.
- **`SENSITIVE_FIELDS`** (exported `Set`) — Field names that must never appear in clear text. Loaded from `shared/rules/log-redaction.yaml` at import time. Compared after `normalizeKey` so one entry covers camelCase, kebab-case, and snake_case spellings.
- **`SENSITIVE_KEY_FRAGMENTS`** (exported array) — Substrings that flag a key as sensitive wherever they appear (e.g. `token`, `secret`). Deliberately excludes broad terms like `code`.
- **`PERSONAL_FIELDS`** (exported `Set`) — Personal-data fields subject to the `hash` / `redact` / `plain` mode. Kept separate from `SENSITIVE_FIELDS` on purpose: a credential is always replaced, never hashed-and-kept.
- **`resolvePersonalFieldMode`** — Reads `NODE_LOG_PERSONAL_FIELDS` (defaults to `hash`). An unrecognised value is rejected at boot by `runtime/config.ts`.
- **`redactSensitiveFields`** (exported) — Recursively walks an object/array, replacing sensitive keys with `[REDACTED]`, applying the personal-field mode to matching string values, and guarding against circular references via a `WeakSet` ancestor path. Returns copies; does not mutate the input.
- **`serializeError`** (exported) — Converts an `Error` (or any thrown value) into a plain object with `name`, `message`, optional `stack` (only in relaxed environments), and `cause`.
- **`redactForm…`** (truncated in source) — Winston format factory that applies `serializeError` + `redactSensitiveFields` before transport output.
- **`normalizeKey`** (private) — Lowercases and strips `_` / `-` so all naming conventions map to one canonical form.

## Relationships

- **`scenarios/support/ephemeral-mongo.ts`** — Explicitly referenced in the import comment: this file sits on `global-setup.ts`'s import chain via that module, which runs outside Jest's normal resolver. This is why `../runtime/config` is imported with a relative path instead of the `@infrastructure` alias.
- **`scenarios/apply.ts`, `scenarios/run-server.ts`, `scenarios/support/demo.ts`, `scenarios/support/doubles/payments/fake.ts`, `scenarios/support/doubles/payments/levers.ts`** — Consumers of the `Logger` port; they call `logger.info/error/…` rather than importing Winston.
- **`scripts/db/bootstrap-access.ts`, `scripts/db/cache-clear.ts`, `scripts/db/index-sync.ts`, `scripts/db/sync-indexes.ts`, `scripts/ops/reencrypt.ts`, `scripts/ops/run-job.ts`, `scripts/run-script.ts`, `scripts/contracts/openapi-bundle.ts`** — CLI/script consumers of the `Logger` port.
- **`../config/shared-rules/log-redaction`** (sibling) — Provides `logRedactionSchema`; the YAML it validates is shared with the PHP twin.
- **`../security/pseudonymise`** (sibling) — Provides `correlationDigest`, the keyed-hash used for the `hash` personal-field mode.

## Notes

- **Import-path constraint:** The relative import of `../runtime/config` is intentional, not a style choice. The `@infrastructure` alias resolves at `tsc`/`eslint` time but fails at Jest's `globalSetup` runtime. Changing it to the alias will break `ephemeral-mongo.ts`'s chain.
- **Boot-time failure:** `loadSharedRules('log-redaction', …)` runs at module import. A malformed YAML file crashes the process immediately rather than degrading to "no redaction".
- **Priority rule:** If a key name ever appears in both `SENSITIVE_FIELDS` and `PERSONAL_FIELDS`, the sensitive (redact) policy wins unconditionally.
- **`redactSensitiveFields` returns copies.** Passing a live request or Mongoose document is safe; the caller's object is not mutated.
- **Stack traces are production-gated.** `serializeError` only includes `stack` when `isRelaxedEnvironment()` is true, preventing absolute paths from leaking into aggregated logs.
- **Personal-field hashing is keyed** (`correlationDigest`, i.e. HMAC), not a bare SHA-256. The `hmac:` prefix in the output distinguishes it from an unkeyed digest for downstream parsers. Truncated to 12 hex chars (48 bits) — a correlation aid, not a security boundary.
- **`REDACTED` marker** is a fixed string (not deletion) to keep log-line shape stable for downstream log parsers.
