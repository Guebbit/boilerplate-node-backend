---
source: src/infrastructure/adapters/logger.ts
sha256: c68107d558d4748d7263be1c4bd1f7ed1de9d0612cdbce15c82c82e69ce87a28
generated_at: 2026-10-14T07:45:45.927506+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/adapters/logger.ts

## Purpose

Structured logging adapter that wraps Winston behind a narrow `Logger` port, applies two-layer data sanitisation (credential redaction + personal-data pseudonymisation) to every log record, and exposes a recursive `redactSensitiveFields` utility safe for arbitrary object graphs. It exists so that no other tier in the codebase imports Winston directly, and so log output is compliant with data-minimisation policy by default.

## Key elements

- **`Logger`** (interface) — the port every other tier depends on. Methods: `debug`, `info`, `warn`, `error` (each accept `string | LogFields` + optional meta), and `log(level, message, meta?)` for dynamic-level calls (used by `audit.ts`).
- **`LogFields`** (type) — `Record<string, unknown>`; the shape of a structured log's context object.
- **`SENSITIVE_FIELDS`** (Set, exported) — exact key names (normalised) that are always replaced with `[REDACTED]`. Includes passwords, tokens, API keys, cookies, IBAN, CVV, etc.
- **`SENSITIVE_KEY_FRAGMENTS`** (array, exported) — substrings (`password`, `secret`, `token`, `signature`, `otpauth`, `backupcode`) that flag any key containing them as sensitive.
- **`PERSONAL_FIELDS`** (Set, exported) — keys (`email`, `ip`, `phone`, `street`, etc.) treated per the configurable `PersonalFieldMode` rather than always redacted.
- **`resolvePersonalFieldMode()`** — reads `NODE_LOG_PERSONAL_FIELDS` via `loggingConfig()`; defaults to `hash`.
- **`redactSensitiveFields(input, ancestors?)`** (exported) — recursively walks objects/arrays, redacting sensitive keys, applying personal-field mode, and handling circular references via a `WeakSet`. Returns copies, never mutates.
- **`serializeError(error)`** (exported) — converts `Error` (and unknown thrown values) into plain objects; includes `stack` only in relaxed (dev/CI) environments.
- **`normalizeKey(key)`** (private) — lowercases and strips `_`/`-` so one entry catches `x-api-key`, `xApiKey`, `x_api_key`.
- **`applyPersonalFieldMode(value)`** (private) — in `hash` mode produces `hmac:<12-hex>` via `pseudonymise('log', …)`; in `redact` mode returns `[REDACTED]`; in `plain` mode returns the value unchanged.

## Relationships

- **`scenarios/support/ephemeral-mongo.ts`** — sits on this file's import chain via `global-setup.ts`; this is why the import of `../runtime/config` is relative rather than the `@infrastructure` alias (alias fails under jest's `globalSetup` runtime).
- **`scenarios/apply.ts`, `scenarios/run-server.ts`, `scenarios/support/demo.ts`, `scenarios/support/doubles/payments/fake.ts`, `scenarios/support/ephemeral-mongod.ts`** — consume the `Logger` port or call `redactSensitiveFields` during scenario/test execution.
- **`scripts/db/bootstrap-access.ts`, `scripts/db/cache-clear.ts`, `scripts/db/sync-indexes.ts`, `scripts/contracts/openapi-bundle.ts`** — import this module for structured logging in operational/DB scripts.
- **`scripts/ops/reap-account-exports.ts`, `scripts/ops/reap-inactive-accounts.ts`, `scripts/ops/reap-invoice-pdfs.ts`, `scripts/ops/reap-mail-spool.ts`, `scripts/ops/reap-orphaned-images.ts`** — import this module for structured logging in reaping/ops scripts.
- **`../runtime/config`** — source of `isRelaxedEnvironment`, `loggingConfig`, and `PERSONAL_FIELD_MODES` (drives personal-field mode and stack-trace visibility).
- **`../security/pseudonymise`** — provides the keyed-hash function used for GDPR pseudonymisation in `hash` mode.
- **`./semantic-names`** — provides `toSemanticNames` (used in this file's format pipeline).

## Notes

- **Relative import is intentional.** The `@infrastructure` alias resolves under `tsc`/`eslint` but breaks at jest `globalSetup` runtime. Do not "fix" it to the alias.
- **`SENSITIVE_FIELDS` uses exact matching; `SENSITIVE_KEY_FRAGMENTS` uses substring matching.** The split is deliberate: `key` as an exact entry won't eat `idempotencyKey`, but the fragment `token` will catch `refreshToken`, `resetToken`, etc.
- **Credential redaction always wins over personal-field handling.** If a key appears on both lists (unlikely), it is `[REDACTED]`, not hashed.
- **`hash` mode is a keyed HMAC, not a bare SHA-256.** Truncated to 12 hex chars (48 bits) for correlation only; prefixed `hmac:` so downstream parsers can distinguish it from an unkeyed digest.
- **`redactSensitiveFields` returns copies.** Passing live request/domain objects is safe; the original is never mutated.
- **`serializeError` omits `stack` in production.** Use `isRelaxedEnvironment()` to gate stack-trace leakage in aggregated logs.
- **`SENSITIVE_FIELDS`, `SENSITIVE_KEY_FRAGMENTS`, and `PERSONAL_FIELDS` are all exported** so the policy unit test (`logger.test.ts`) can assert every entry individually rather than sampling.
