---
source: src/infrastructure/adapters/logger.ts
sha256: 3d4b569d78b22d10e86e25c545d77492a4efbb347668f4cd0b678f128a9ef3dc
generated_at: 2026-11-14T17:54:09.169103+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/adapters/logger.ts

## Purpose

Structured-logging adapter that wraps Winston behind a narrow `Logger` port, applying credential redaction and personal-data pseudonymisation to every log record before it reaches a transport. It exists so the rest of the codebase depends on a small, swappable interface rather than Winston's full `Logger`, and so the redaction policy (sourced from a shared YAML file the PHP twin also reads) is enforced in exactly one place.

## Key elements

- **`Logger` (interface)** — the port every other tier imports. Four level methods (`debug`, `info`, `warn`, `error`) plus a generic `log(level, message, meta)`. Deliberately narrower than Winston's own type.
- **`LogFields`** — `Record<string, unknown>` shape accepted as the first argument to level methods.
- **`SENSITIVE_FIELDS` (exported `Set`)** — credential field names (from `log-redaction.yaml` + secret cookies from `cookies.generated`). Matched after `normalizeKey` so `Authorization`, `new_password`, `x-api-key`, etc. are all caught.
- **`SENSITIVE_KEY_FRAGMENTS` (exported)** — substring fragments (e.g. `token`, `secret`) that make *any* key containing them sensitive.
- **`normalizeKey`** — lowercases a key and strips `_` / `-` so one list entry covers camelCase, kebab-case, and snake_case spellings.
- **`PERSONAL_FIELDS` (exported `Set`)** — personal-data field names (e.g. `email`, `ip`). Treated under a *different* policy than credentials: hashed by default rather than dropped, so logs stay correlatable.
- **`resolvePersonalFieldMode`** — reads `NODE_LOG_PERSONAL_FIELDS` from runtime config; returns `hash` (default), `redact`, or `plain`.
- **`applyPersonalFieldMode`** — in `hash` mode produces a keyed, truncated (`hmac:`-prefixed, 12-hex-char) digest via `correlationDigest`; in `redact` mode returns `[REDACTED]`; in `plain` mode returns the value unchanged.
- **`redactSensitiveFields` (exported)** — recursive copy that replaces credential keys with `[REDACTED]` and applies the personal-field mode. Returns copies; never mutates.
- **`redactCredentials` (exported)** — same walk but *skips* personal fields. Intended for stored audit rows that must keep `ip`/`email` readable yet never expose a password.
- **`redactWalk` / `redactEntries`** — the shared recursive walker. Handles `Error` instances (non-enumerable props), circular references (`[Circular]`), arrays, and nested objects.

## Relationships

- **`scenarios/support/ephemeral-mongo.ts`** — sits on this file's import chain when loaded as a jest `globalSetup` module. This is why the imports below are *relative* rather than using the `@infrastructure` alias (the alias resolves at `tsc`/`eslint` time but fails at jest's `globalSetup` runtime).
- **`scenarios/apply.ts`, `scenarios/run-server.ts`, `scenarios/support/demo.ts`** — scenario entry points that consume the `Logger` port for run/apply lifecycle logging.
- **`scenarios/support/doubles/payments/fake.ts`, `scenarios/support/doubles/payments/levers.ts`** — test doubles that log through the same port.
- **`scenarios/support/ephemeral-mongod.ts`** — part of the same `globalSetup` import chain as `ephemeral-mongo.ts`; inherits the relative-import constraint.
- **`scripts/db/*` (`bootstrap-access.ts`, `cache-clear.ts`, `index-sync.ts`, `sync-indexes.ts`)** — DB maintenance scripts that log through the `Logger` port.
- **`scripts/contracts/*` (`openapi-bundle.ts`, `run-with-timeout.ts`)** — contract-checking scripts that log progress/errors via the port.
- **`scripts/ops/prepare-job.ts`** — ops script consuming the port.
- **`scripts/audit/compliance-rules.yaml`** — the audit-tier rule set; the `redactCredentials` path exists specifically so audit rows preserve personal fields while still scrubbing credentials, keeping the stored data consistent with what the audit rules expect.

## Notes

- **Relative imports are intentional.** The `@infrastructure` alias would resolve at build time but breaks under jest's `globalSetup` loader (see `ephemeral-mongo.ts` comment). Do not "fix" these to aliases.
- **Two distinct redaction policies.** `SENSITIVE_FIELDS` → always `[REDACTED]`. `PERSONAL_FIELDS` → mode-dependent (hash/redact/plain). They are separate `Set`s on purpose; merging them would let a credential be hashed-and-kept, which is the wrong default.
- **Hashed values are keyed.** `correlationDigest` uses `pseudonymise('log', …)`, not a bare `sha256`. A bare hash of an IP or common email is brute-forceable; a keyed hash is not. The `hmac:` prefix distinguishes it from unkeyed digests in log parsers.
- **`redactSensitiveFields` and `redactCredentials` return copies.** The caller may pass live request or Mongoose documents; mutating them would corrupt the in-flight object.
- **`SENSITIVE_FIELDS` is a `Set`, not an array.** The recursive walk does O(1) key lookups; keeping it a `Set` is load-bearing.
- **Redaction lists load at import time from `log-redaction.yaml`.** A malformed file throws at boot — there is no graceful fallback.
