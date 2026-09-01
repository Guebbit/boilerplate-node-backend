# tests/support/setup.ts

## Purpose

Global Jest bootstrap (wired via `setupFiles`) that runs once per worker **before** any test module is imported. It sets the environment variables and initialises the i18next / validation-message machinery at a point where downstream modules are about to read them at import time. Setting these later (e.g. in `beforeAll`) would be too late because rate limiters, Zod message thunks, and JWT config are captured on first import.

## Key elements

- **`process.env.NODE_RATE_LIMIT_MAX`** — Set to `'2000'` (10× the live default of 100). Written as a literal to avoid importing `security.ts`, which would evaluate `rateLimit()` before the variable is set. Sized to the FUZZ suite's request volume.
- **`process.env.NODE_AUTH_RATE_LIMIT_MAX` / `NODE_AUTH_RATE_LIMIT_ADDRESS_MAX`** — Both set to `'1000'`. Must be raised together; raising only one just shifts which limiter trips.
- **`process.env.NODE_RATE_LIMIT_REDIS_ENABLED`** — Forced to `'0'` so limiters count in-memory. The compose Redis hostname in `.env` does not resolve in the test runner, and `passOnStoreError` would make every 429-assertion fail.
- **`process.env.NODE_METRICS_TOKEN`** — Set so `/observability/metrics` is reachable (it denies by default when unset).
- **`process.env.NODE_TOKEN_ACCESS` / `NODE_TOKEN_REFRESH`** — JWT signing secrets. `jsonwebtoken.sign()` throws on an empty secret, so any real-login suite needs these before first import.
- **Mongod binary resolution** — If `MONGOMS_SYSTEM_BINARY` (default `/tmp/mongod`) exists on disk, it is pinned and version/MD5 checks are skipped to avoid a 100 MB download.
- **`registerLocaleDirectories(…)`** — Globs `src/modules/*/locales` on disk (not via the module registry) and registers them so `loadLocaleResources()` finds the copies. Reading from disk avoids importing the module registry, which would defeat `jest.mock` in unrelated suites.
- **`i18next.init(…)`** — Initialises i18next with the fallback locale, supported locales, and loaded resources. Fire-and-forget (`void`); runs synchronously enough for the import-time `t()` calls that follow.
- **`registerValidationMessages()`** — Wires the registered locale strings into Zod's message pipeline so schemas resolve translated copy instead of raw keys.

## Relationships

- **`@infrastructure/i18n`** (`src/infrastructure/i18n/index.ts`) — Barrel import providing `getFallbackLocale`, `listSupportedLocales`, `loadLocaleResources`, `registerLocaleDirectories`. These functions encapsulate the i18n resource discovery and loading logic (including `catalog.ts`) that this file drives at bootstrap.
- **`@infrastructure/http/validation-messages`** (`src/infrastructure/http/validation-messages.ts`) — Provides `registerValidationMessages()`, called last in the bootstrap so that Zod schemas see the translated copy before any test module evaluates a schema.

## Notes

- **i18next is async but called with `void`**: under Jest's `setupFiles` the init completes before the test file's imports run, so module-scope `t()` calls work. However, this is fragile — tests that assert on translated messages should use their own i18n instance (see each module's `validation-messages` spec and `@tests/i18n-boot`) rather than relying on this global init.
- **No database is set up here.** MongoDB is per-suite via `setupTestDb()` because not every suite needs it.
- **All env writes use `??=`** so a developer's local `.env` (loaded via `dotenv/config` in `src/app.ts`) can override these values; the defaults are a safety net for CI where no `.env` exists.
- **Rate-limit values are deliberately raised, not disabled**, so a runaway test loop still terminates and the limiters' own unit tests can exercise the 429 path by setting a lower value.
