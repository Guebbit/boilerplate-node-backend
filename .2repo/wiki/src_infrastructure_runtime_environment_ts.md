# src/infrastructure/runtime/environment.ts

## Purpose

Centralises the two environment-variable coercions every reader shares (string → integer, string → boolean) and the fail-fast validation of mandatory variables. Only *hard* requirements are validated here; optional infrastructure (Redis, RabbitMQ, SMTP, PostHog, OTLP) is deliberately excluded so those adapters can degrade gracefully when unconfigured.

## Key elements

- **`environmentNumber(key, fallback, min?)`** — Reads a process-env value, trims it, and matches it against a strict integer regex (`/^[+-]?\d+$/`). Returns `fallback` if the value is absent, blank, non-integer, or below the optional `min`. Parses with base 10 explicitly to avoid octal surprises with zero-padded values.
- **`environmentFlag(key, fallback)`** — Reads a process-env value, lowercases it, and checks membership against two sets (`1/true/yes/on` and `0/false/no/off`). Returns `fallback` for any unrecognised or absent value. Accepts both vocabulary families for backward compatibility with pre-existing call-sites.
- **`validateRequiredEnvironment()`** — Checks that `NODE_TOKEN_ACCESS` and `NODE_TOKEN_REFRESH` are non-blank, and that at least one of `NODE_DB_URI` / `NODE_MONGODB_PORT` is set. Throws a single error listing *all* missing keys at once. Intended to be called at the very top of the boot sequence so the process crashes before the HTTP listener opens.
- **`REQUIRED_ENV_KEYS`** (internal, `as const`) — Readonly tuple of the two mandatory JWT secret variable names; gives `process.env[key]` type-safe indexing inside the validator.
- **`INTEGER`, `TRUTHY`, `FALSY`** (internal) — Regex and Sets used by the two coercion functions.

## Relationships

- **`src/app.ts`** — Calls `validateRequiredEnvironment()` at the top of the boot sequence, before the HTTP listener is created. A throw here results in a clean process exit visible to the container orchestrator.
- **`src/modules/account/session/config.ts`** — Consumes `environmentNumber` for token lifetimes (access/refresh) and `environmentFlag` for session-related switches.
- **`src/infrastructure/adapters/storage.ts`** — Uses `environmentNumber` for size limits (e.g. max upload bytes) where the `min` parameter guards against `0` or negative values.
- **`src/infrastructure/adapters/queue.ts`** — Uses `environmentFlag` for the RabbitMQ enable switch.
- **`src/infrastructure/adapters/cache.ts`** — Uses `environmentNumber` / `environmentFlag` for Redis TTL and enable settings.
- **`src/infrastructure/adapters/mailer.ts`** — Uses `environmentFlag` for SMTP enable; `environmentNumber` for port.
- **`src/infrastructure/adapters/demo-outbox.ts`** — Uses `environmentFlag` for the demo-mode toggle.
- **`src/infrastructure/http/middlewares/rate-limit-store.ts`** — Uses `environmentNumber` for rate-limit intervals/counts.
- **`src/infrastructure/http/middlewares/cache.ts`** — Uses `environmentNumber` for cache TTL values.
- **`src/infrastructure/http/middlewares/security.ts`** — Uses `environmentFlag` / `environmentNumber` for security-tuning knobs.
- **`src/app/security.ts`** — Reads security-relevant flags through `environmentFlag`.
- **`src/cluster.ts`** — Reads cluster-related numeric settings via `environmentNumber`.

## Notes

- Values are read **lazily** from `process.env` at call time, not captured at import time. This means a variable set after module load still applies, and tests can set variables without worrying about import-order freezing.
- The integer regex is a **whole-string** match, not a prefix parse. This intentionally rejects `5mb` (which `parseInt` would silently read as `5`) and `12abc` (which `Number()` would read as `NaN`-prone).
- Both `TRUTHY` and `FALSY` vocabularies are accepted because different call-sites historically used different conventions (`'1'` vs `'true'`, `'0'` vs `'false'`). An unrecognised string falls back rather than defaulting to `false`.
- `validateRequiredEnvironment` treats whitespace-only values as missing — a common accident in `.env` files and CI secret injection where an unset secret expands to `""`.
- Optional infrastructure variables are **not** validated here by design; adding them would break local development with no safety gain.
