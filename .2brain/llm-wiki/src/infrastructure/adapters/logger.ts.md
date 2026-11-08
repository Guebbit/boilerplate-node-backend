---
source: src/infrastructure/adapters/logger.ts
sha256: 283896d5fadf4ad2d8f29036d2a65b8b8c89f598ea64a0d293eb891a893de194
generated_at: 2026-11-08T03:20:52.654720+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/adapters/logger.ts

## Purpose

Adapter that wraps Winston behind a narrow `Logger` port so the rest of the codebase never imports Winston directly. It also owns the log-redaction policy: recursively scrubbing credential fields and applying a configurable mode (hash / redact / plain) to personal-data fields before any record reaches a transport.

## Key elements

- **`Logger`** (interface) — the port every other tier depends on. Exposes `debug`, `info`, `warn`, `error`, and a generic `log(level, message, meta?)`. Deliberately narrower than `winston.Logger` so a library swap only requires satisfying this.
- **`LogFields`** (type) — `Record<string, unknown>`; the structured-meta shape accepted by every `Logger` method.
- **`SENSITIVE_FIELDS`** (Set, exported) — exact field names that must never appear in clear text. Sourced from `shared/rules/log-redaction.yaml` plus every `secret: true` cookie in `cookies.generated.ts`. Compared after key normalisation.
- **`SENSITIVE_KEY_FRAGMENTS`** (exported) — substring fragments (e.g. `token`, `secret`) that mark a key sensitive wherever it appears. Sourced from the same YAML file.
- **`PERSONAL_FIELDS`** (Set, exported) — GDPR personal-data field names. Treated by `resolvePersonalFieldMode()` rather than blanket redaction.
- **`resolvePersonalFieldMode()`** (exported) — reads `NODE_LOG_PERSONAL_FIELDS` via `loggingConfig()`; defaults to `'hash'`.
- **`redactSensitiveFields()`** (exported) — recursively copies an object/array, replacing credential keys with `[REDACTED]`, applying the personal-field mode to matching string values, and guarding against circular references. Returns copies, never mutates.
- **`serializeError()`** (exported) — flattens a non-enumerable `Error` (including `.cause`) into a plain object; omits `.stack` outside relaxed (dev/CI) environments.
- **`redactEntries()`** (private) — per-object-entry loop that decides redact / hash / recurse for each key.
- **`normalizeKey()`** (private) — lowercases and strips `_`/`-` so one list entry covers `new_password`, `newPassword`, `new-password`.
- **`applyPersonalFieldMode()`** (private) — dispatches on the resolved mode; `hash` mode calls `correlationDigest()` (keyed HMAC) rather than a bare SHA-256.

## Relationships

- **`scenarios/support/ephemeral-mongo.ts`** — sits on `global-setup.ts`'s import chain. This file must import `../runtime/config` with a **relative** path (not the `@infrastructure` alias) because jest's `globalSetup` loads that chain outside normal module resolution.
- **`scenarios/apply.ts`, `scenarios/run-server.ts`, `scenarios/support/demo.ts`, `scenarios/support/doubles/payments/fake.ts`, `scenarios/support/doubles/payments/levers.ts`** — consume the `Logger` interface and/or `redactSensitiveFields` for structured logging in scenario runners and test doubles.
- **`scripts/db/*`, `scripts/ops/*`, `scripts/contracts/*`, `scripts/audit/*`** — operational and audit scripts that log through the same `Logger` port, inheriting the redaction policy automatically.
- **`scripts/audit/compliance-rules.yaml`** — the shared YAML that `loadSharedRules` reads at import time; a malformed file fails the entire boot.

## Notes

- The relative-path import of `../runtime/config` is **load-bearing**: replacing it with the `@infrastructure` alias will compile under `tsc`/`eslint` but crash at jest's `globalSetup` runtime.
- `SENSITIVE_FIELDS` and `PERSONAL_FIELDS` are intentionally **separate sets**. A credential must always be replaced, never hashed-and-kept. Merging them would blur that line.
- The `hash` mode uses `correlationDigest` (a keyed HMAC truncated to 12 hex chars, prefixed `hmac:`), not a bare `sha256`. This is GDPR pseudonymisation (Art. 4(5)), not a security boundary.
- `redactSensitiveFields` returns **copies**. Passing a live request object is safe; the original is never mutated.
- Circular-reference detection uses a `WeakSet` passed down the call stack; only the current path counts, so shared (but non-circular) objects are handled correctly.
- `Error` instances are serialised **before** the generic walk because their properties are non-enumerable and `JSON.stringify` would yield `{}`.
- `stack` traces are included only when `isRelaxedEnvironment()` is true (local dev / CI) to avoid leaking absolute paths into production logs.
