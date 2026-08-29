# tests/support/setup.ts

## Purpose

Jest's `setupFiles` global bootstrap: runs once per worker **before** any test module or its dependencies are imported. Its sole reason to exist is that several application modules (`security.ts` rate limiters, `@infrastructure/i18n`, Zod message thunks) capture their configuration at **import time**, so the values must be in place before those modules are ever evaluated.

## Key elements

- **Rate-limit env vars** (`NODE_RATE_LIMIT_MAX`, `NODE_AUTH_RATE_LIMIT_MAX`, `NODE_AUTH_RATE_LIMIT_ADDRESS_MAX`) — raised well above the live defaults so test suites (which fire many requests from one address) don't trip 429s. Written as literals, *not* imported from `security.ts`, to avoid evaluating `rateLimit()` before the variable is set.
- **`NODE_RATE_LIMIT_REDIS_ENABLED ??= '0'`** — forces the limiters into in-memory mode; a Redis-backed counter would depend on the compose hostname in `.env` (unresolvable in CI) and on shared external state.
- **`NODE_METRICS_TOKEN`** — set so `/observability/metrics` stops denying by default.
- **`NODE_TOKEN_ACCESS` / `NODE_TOKEN_REFRESH`** — JWT signing secrets; `jsonwebtoken.sign()` throws on an empty string, so CI (no `.env`) needs these.
- **Mongod binary shortcut** — if `MONGOMS_SYSTEM_BINARY` (default `/tmp/mongod`) exists on disk, points `mongodb-memory-server` at it and skips version/MD5 checks; otherwise the library downloads the binary at first run.
- **`registerLocaleDirectories(…)`** — globs `src/modules/*/locales` off disk (deliberately *not* via the module registry) and registers each directory with i18next.
- **`i18next.init(…)`** (fire-and-forget `void`) — initialises i18next with `en`, the fallback locale, supported locales, and loaded resources.
- **`registerValidationMessages()`** — wires Zod's error-message thunks to the i18next catalogue, matching what `app.ts` does at boot.

## Relationships

- **`src/infrastructure/i18n/index.ts`** — provides `getFallbackLocale`, `listSupportedLocales`, `loadLocaleResources`, `registerLocaleDirectories`, all imported and called here.
- **`src/infrastructure/i18n/catalog.ts`** — the resource catalogue that `loadLocaleResources()` populates before `i18next.init` runs.
- **`src/infrastructure/http/validation-messages.ts`** — exports `registerValidationMessages`, called at the end of this file so Zod resolves translated strings.
- **`tests/integration/concurrency/auth-races.test.ts`** / **`cart-races.test.ts`** — concurrent suites that would otherwise trip the credential and per-IP limiters raised here.
- **`docs/tools/concurrency-testing.md`** / **`docs/tools/cluster-testing.md`** — operator docs that describe running these suites; the env-var defaults set here are the values those runs depend on.

## Notes

- Every assignment uses `??=` (nullish-assign), so a local `.env` loaded by `dotenv/config` in `src/app.ts` can still override any of these values.
- `i18next.init` is **async and unawaited**. A test that asserts on a translated message must not rely on this completing; instead it should bootstrap its own i18next instance (see `@tests/i18n-boot`).
- Locale directories are read from the filesystem via `readdirSync`, **not** by importing the module registry. Importing modules here would defeat any `jest.mock` call in the test file that has not yet run.
- No database is started here. Mongo is per-suite via `setupTestDb()`; pure-function suites never pay for a `mongod` process.
- The rate-limit numbers are intentionally **above** what any current suite needs, not tuned to it. If a new endpoint or a longer fuzz run causes a 429, the fix is to raise the literal here.
