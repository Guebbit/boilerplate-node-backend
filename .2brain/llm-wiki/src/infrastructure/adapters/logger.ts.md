---
source: src/infrastructure/adapters/logger.ts
sha256: 515d9f24e0a500db1d88cf1c601d5978f29cfa0940a1e9abe027510699c2e619
generated_at: 2026-09-27T14:06:37.796661+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/adapters/logger.ts

## Purpose

Structured logging built on Winston, with a redaction/pseudonymisation layer that sanitises every log record **before** it reaches any transport. It enforces two distinct data policies—credential redaction (irreversible `[REDACTED]` replacement) and personal-data handling (keyed HMAC, full redaction, or passthrough, configurable via `NODE_LOG_PERSONAL_FIELDS`)—so that no secret or PII leaves the process in plaintext.

## Key elements

- **`SENSITIVE_FIELDS`** (exported `Set`) — Canonical list of credential/secret key names (passwords, tokens, API keys, card numbers, etc.). Exported so unit tests can assert every entry individually.
- **`PERSONAL_FIELDS`** (exported `Set`) — PII field names (email, ip, phone, …) treated with a *separate* policy (hash/redact/plain) rather than credential redaction.
- **`resolvePersonalFieldMode()`** — Reads `NODE_LOG_PERSONAL_FIELDS` (default `hash`); throws on unrecognised values. Exported for the boot-time gate in `required-config.ts`.
- **`applyPersonalFieldMode(value)`** — Applies the resolved mode to one PII string: HMAC-SHA256 (truncated to 12 hex chars, `hmac:`-prefixed), `[REDACTED]`, or passthrough.
- **`redactSensitiveFields(input)`** — Recursive, copy-producing walker that redacts sensitive keys, applies the personal-field mode, and guards against circular references (via a `WeakSet` ancestor path) and `Error` instances.
- **`serializeError(error)`** — Converts an `Error` (or thrown non-object) into a plain serialisable object; omits `stack` in production.
- **`redactFormat`** (exported Winston format factory) — The pipeline wiring: serialises `Error` values, runs the redaction walk over all metadata, and returns the same `info` object with reserved fields (`level`, `message`) restored.
- **`normalizeKey`** — Lowercases and strips `_`/`-` so one entry in the redaction set covers every spelling variant (camelCase, kebab-case, snake_case).
- **`resolveLogLevel`** *(truncated in source)* — Resolves the Winston log level per environment (`debug` locally, `info` in production).

## Relationships

- **`../runtime/environment`** (sibling import) — Provides `environmentChoice`, used by `resolvePersonalFieldMode`. Imported via a *relative* path (not the `@infrastructure` alias) because this file sits on jest's `globalSetup` import chain through `scenarios/support/ephemeral-mongo.ts`, where alias resolution is unavailable.
- **`scenarios/support/ephemeral-mongo.ts`** — Loads this module indirectly via the `globalSetup` chain; the relative-import decision in this file is driven by that path.
- **`src/app.ts`, `src/app/demo.ts`** — Application entry points that configure the Winston logger with `redactFormat` and the resolved log level.
- **`scripts/run-script.ts`, `scripts/db/*`, `scripts/ops/*`** — Operational and database scripts that import the logger for structured, redacted output during runs.
- **`scenarios/apply.ts`** — Scenario runner that logs through this module.

## Notes

- **Import style matters here.** The `environmentChoice` import must remain relative (`../runtime/environment`). Switching it to the `@infrastructure` alias will compile fine under `tsc`/`eslint` but **crash at jest's `globalSetup` runtime**, because that phase runs outside jest's normal module-resolver.
- **`redactFormat` returns `Object.assign(info, …)`.** Winston requires the transform to return the *same* object identity; returning a new object silently drops the record.
- **`SENSITIVE_FIELDS` always wins.** If a key name ever appeared on both lists, the credential path (hard redact) takes precedence over the personal-data path (hash/passthrough). This is intentional and should stay that way.
- **HMAC key fallback.** Outside production, `NODE_LOG_HASH_KEY` is optional; the code falls back to the fixed string `'dev-log-hash-key'` so dev logs remain correlatable without requiring a secret.
- **Stack traces are suppressed in production** (`NODE_ENV === 'production'`) to avoid leaking absolute file paths and dependency internals into aggregated logs.
- **`applyPersonalFieldMode` calls `resolvePersonalFieldMode()` on every invocation**, which re-reads `process.env` each time. This is correct (env can change at boot) but means the mode is not cached—relevant if profiling hot logging paths.
