---
source: src/infrastructure/adapters/logger.ts
sha256: e5f73296187dff124929a81990db1ba421e7a9fdd1a703c3102a141fb8ac99de
generated_at: 2026-09-23T17:40:18.628782+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/adapters/logger.ts

## Purpose

Central structured-logging module built on Winston. It defines the redaction policy (sensitive credentials are dropped, personal data is hashed or redacted per config), error serialization, and environment-aware output formatting (JSON for pipes/prod, ANSI-pretty for interactive terminals). Every application module, script, and scenario gets its logger from here.

## Key elements

- **`SENSITIVE_FIELDS`** – `Set<string>` of field names (lowercased) that must never appear in clear text (passwords, tokens, API keys, card numbers, SSN, etc.). Redacted to `[REDACTED]`.
- **`PERSONAL_FIELDS`** – Separate `Set<string>` of PII fields (email, ip, phone, etc.) governed by a *different* policy: hashed (default), redacted, or left plain via `NODE_LOG_PERSONAL_FIELDS`.
- **`resolvePersonalFieldMode()`** – Reads the env var, returns `'hash' | 'redact' | 'plain'`. Throws on unrecognised values (vs. falling back on unset).
- **`redactSensitiveFields(input)`** – Recursively walks objects/arrays; replaces sensitive keys with `[REDACTED]`, applies the personal-field mode to string values, returns copies (no mutation).
- **`serializeError(error)`** – Flattens an `Error` (or any thrown value) into a plain object; omits `stack` in production.
- **`redactFormat`** – Winston format *factory* (call it: `redactFormat()`) that serialises errors then redacts all metadata before a transport sees it.
- **`resolveLogLevel()`** – Returns the active Winston level: `NODE_LOG_LEVEL` if set, else `debug` (non-prod) / `info` (prod).
- **`resolveConsoleFormat()`** – Chooses `prettyFormat` (ANSI + human layout) when `stdout.isTTY` and non-prod; `baseFormat` (ISO timestamp → redact → JSON) otherwise.
- **`logger`** – The shared `winston.Logger` instance. Call as `logger.info('msg', { meta })` or `logger.error('msg', { error })`.

## Relationships

- **`scenarios/support/ephemeral-mongo.ts`** – Appears in this file's import chain (via `global-setup.ts`). The relative import of `environmentChoice` (rather than the `@infrastructure` alias) exists specifically because jest's `globalSetup` loads this path outside normal module resolution.
- **`src/app.ts`, `src/app/demo.ts`, `scenarios/apply.ts`** – Application/scenario entry points that import `logger` for request-lifecycle and scenario logging.
- **`scripts/db/*`, `scripts/ops/*`** – Operational and database scripts that import `logger` for structured output when run standalone (outside an HTTP request).

## Notes

- **Import path is deliberately relative.** `environmentChoice` is imported from `../runtime/environment`, not the `@infrastructure` alias, because this file sits on jest's `globalSetup` chain where alias resolution fails at runtime (see the inline comment).
- **Two redaction policies, kept separate on purpose.** Credentials → always `[REDACTED]`. Personal data → configurable (hash/redact/plain). Merging the sets would blur "must destroy" vs. "must minimise" and risks a credential being merely hashed.
- **`redactFormat` is a factory.** You must call `redactFormat()` to obtain a format instance for `winston.format.combine`. Forgetting the call is a silent no-op.
- **Hash truncation is a correlation aid, not a security boundary.** 12 hex chars (48 bits) of SHA-256, prefixed `sha256:` so parsers can distinguish it from a raw value.
- **`resolveConsoleFormat` keys off `stdout.isTTY`, not `NODE_ENV`.** A piped or container log is JSON even in dev; a local terminal gets ANSI. This prevents breaking downstream log shippers when output is redirected.
- **Error stacks are omitted in production** to avoid leaking absolute paths and dependency internals into aggregated logs.
