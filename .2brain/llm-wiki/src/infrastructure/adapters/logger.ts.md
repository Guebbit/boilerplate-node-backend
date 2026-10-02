---
source: src/infrastructure/adapters/logger.ts
sha256: 2bff8131f8148ad0cfc4d1a26e2ae3353f196ffbbbb6d7fc28cce7f0a4f1ae8d
generated_at: 2026-10-01T12:49:12.094440+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/adapters/logger.ts

## Purpose

Structured logging adapter built on Winston. Exposes a narrow `Logger` port so the rest of the codebase never imports Winston directly, and bakes in two redaction policies (credential replacement and personal-data pseudonymisation) plus error serialisation before any record reaches a transport.

## Key elements

- **`LogFields`** — `Record<string, unknown>`; the shape of a structured log call's context object.
- **`Logger` interface** — the port (SK-04). Five methods (`debug`, `info`, `warn`, `error`, `log`) with a uniform `(input, meta?)` signature. Swapping the underlying library only requires satisfying this, not Winston's full `Logger`.
- **`SENSITIVE_FIELDS`** (`Set`) — field names that are always replaced with `[REDACTED]`. Exported for exhaustive unit testing.
- **`normalizeKey` / `SENSITIVE_KEYS`** — lowercase + strip `_-` so one entry catches camelCase, kebab-case, and snake_case spellings.
- **`PERSONAL_FIELDS`** (`Set`) — email, ip, phone, etc. Handled by a *separate* policy (hash / redact / plain) rather than blanket redaction, preserving trace correlation.
- **`resolvePersonalFieldMode`** — reads `NODE_LOG_PERSONAL_FIELDS`; defaults to `hash`.
- **`applyPersonalFieldMode`** — produces `hmac:<12-hex>` (keyed via `pseudonymise('log', …)`), `[REDACTED]`, or the raw value depending on mode.
- **`redactSensitiveFields`** — recursively walks objects/arrays, applies both policies, handles `Error` instances, cycles (`[Circular]`), and returns *copies*. Exported for testing.
- **`serializeError`** — converts a thrown `Error` (non-enumerable fields) into a plain object; omits `stack` outside relaxed environments.
- **`redactFormat`** — Winston `format` factory that runs serialisation + redaction on every record before transport. Exported so wiring itself is testable.

## Relationships

- **`scenarios/support/ephemeral-mongo.ts`** — sits on this file's import chain via `global-setup.ts`; the file deliberately uses a relative import (not the `@infrastructure` alias) so Jest's `globalSetup` runtime can resolve it.
- **`../runtime/config`** — supplies `isRelaxedEnvironment` (stack-trace gating) and `loggingConfig` (personal-field mode).
- **`../security/pseudonymise`** — provides the keyed hash used for personal-data pseudonymisation.
- **`scenarios/apply.ts`, `scenarios/run-server.ts`, `scripts/*`** — depend on the `Logger` port (or a concrete instance satisfying it) for their log calls; they never import Winston directly.

## Notes

- The relative import of `../runtime/config` is **intentional**, not an oversight: the `@infrastructure` alias resolves under `tsc`/`eslint` but fails under Jest's `globalSetup` module loader.
- `redactSensitiveFields` returns new objects; it never mutates the caller's request/domain objects.
- `SENSITIVE_FIELDS` takes priority over `PERSONAL_FIELDS` if a key appeared in both — a credential is always replaced, never hashed-and-kept.
- `serializeError` omits `stack` in production to avoid leaking absolute paths into aggregated logs.
- The `hmac:` prefix on hashed personal data signals to log parsers that the digest is keyed (reversible only with the key), distinguishing it from a bare `sha256:` digest.
